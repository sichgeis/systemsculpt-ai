import { SystemSculptModel, CustomProvider } from "../../types/llm";
import { CustomProviderModelService } from "./CustomProviderModelService";
import { FavoritesService } from "../FavoritesService";
import { RuntimeIncompatibilityService } from "../RuntimeIncompatibilityService";
import {
  getCanonicalId,
  findModelById,
  filterChatModels,
  supportsTools,
  getToolCompatibilityInfo,
  parseCanonicalId,
} from "../../utils/modelUtils";
import { AGENT_CONFIG } from "../../constants/agent";
import SystemSculptPlugin from "../../main";

/**
 * Unified service that orchestrates multiple provider services
 * Provides a single interface while maintaining provider isolation
 */
export class UnifiedModelService {
  private static instance: UnifiedModelService | null = null;
  private customProviderService: CustomProviderModelService;
  private favoritesService: FavoritesService;
  private isInitialLoadDone = false;
  private customProvidersReady = false;
  private deferredCustomPrefetchStarted = false;

  private constructor(private plugin: SystemSculptPlugin) {
    this.customProviderService = CustomProviderModelService.getInstance(plugin);
    this.favoritesService = FavoritesService.getInstance(plugin);
  }

  public static getInstance(plugin: SystemSculptPlugin): UnifiedModelService {
    if (!this.instance) {
      this.instance = new UnifiedModelService(plugin);
    }
    return this.instance;
  }

  /**
   * Clear the singleton instance to allow proper cleanup
   */
  public static clearInstance(): void {
    if (this.instance) {
      CustomProviderModelService.clearInstance();
      this.instance = null;
    }
  }

  private shouldDeferCustomProviders(forceRefresh: boolean): boolean {
    if (forceRefresh || this.customProvidersReady) {
      return false;
    }

    const customProviders = this.plugin.settings.customProviders || [];
    const hasEnabledCustomProviders = customProviders.some((provider) => provider.isEnabled);
    if (!hasEnabledCustomProviders) {
      return false;
    }

    return !this.isCustomModelSelected();
  }

  private isCustomModelSelected(): boolean {
    const savedId = this.plugin.settings.selectedModelId;
    if (!savedId) {
      return false;
    }
    const parsed = parseCanonicalId(savedId);
    if (!parsed) {
      return false;
    }
    const customProviders = this.plugin.settings.customProviders || [];
    return customProviders.some(
      (provider) => provider.isEnabled && provider.name?.toLowerCase() === parsed.providerId.toLowerCase()
    );
  }

  private getEnabledCustomProviders(): CustomProvider[] {
    const list = this.plugin.settings.customProviders || [];
    return list.filter((provider) => provider.isEnabled);
  }

  private startDeferredCustomPrefetch(providers?: CustomProvider[]): void {
    if (this.deferredCustomPrefetchStarted) {
      return;
    }
    const targets = providers && providers.length > 0 ? providers : undefined;
    this.deferredCustomPrefetchStarted = true;
    const task = targets
      ? this.customProviderService.getModelsForProviders(targets)
      : this.customProviderService.getModels();
    void task
      .then((models) => {
        if (!targets) {
          this.customProvidersReady = true;
        }
        this.deferredCustomPrefetchStarted = false;
        return models;
      })
      .catch(() => {
        this.deferredCustomPrefetchStarted = false;
      });
  }

  /**
   * Get models from all providers with isolated loading
   */
  public async getModels(forceRefresh: boolean = false): Promise<SystemSculptModel[]> {
    try {
      const enabledCustomProviders = this.getEnabledCustomProviders();
      const deferCustomProviders = forceRefresh ? false : this.shouldDeferCustomProviders(false);
      let customModelList: SystemSculptModel[] = [];
      let customModelsPromise: Promise<SystemSculptModel[]> | null = null;

      if (forceRefresh) {
        this.customProviderService.clearCache();
        customModelsPromise = this.customProviderService.getModels();
      } else if (deferCustomProviders) {
        customModelList = this.customProviderService.getModelsDeferred();
        if (enabledCustomProviders.length) {
          this.startDeferredCustomPrefetch(enabledCustomProviders);
        }
      } else {
        customModelsPromise = this.customProviderService.getModels();
      }

      const customModels = await Promise.resolve(customModelsPromise ?? Promise.resolve(customModelList))
        .then((value) => ({ status: "fulfilled" as const, value }))
        .catch((reason) => ({ status: "rejected" as const, reason }));
      if (!deferCustomProviders) {
        customModelList = customModels.status === 'fulfilled' ? customModels.value : [];
        this.customProvidersReady = true;
      }

      // Do not filter user-configured custom provider models based on
      // SystemSculpt server allowlists. Custom providers should display
      // exactly what they advertise.
      const filteredCustomList = customModelList;

      // Combine models from all providers
      const allModels = [...filteredCustomList];

      // Ensure all models have canonical IDs
      const canonicalModels = allModels.map(model => {
        model.id = getCanonicalId(model);
        return model;
      });

      // Use the FavoritesService to process favorites and ensure flags are accurate
      this.favoritesService.processFavorites(canonicalModels);

      // Apply runtime incompatibility flags to models
      const incompatService = RuntimeIncompatibilityService.getInstance(this.plugin);
      const modelsWithRuntimeFlags = canonicalModels.map(model =>
        incompatService.applyRuntimeFlags(model)
      );

      // Validate selected model if this is the initial load
      if (!this.isInitialLoadDone) {
        await this.validateSelectedModel(modelsWithRuntimeFlags);
        this.isInitialLoadDone = true;
      }

      return modelsWithRuntimeFlags;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a model by its ID from any provider
   */
  public async getModelById(modelId: string): Promise<SystemSculptModel | undefined> {
    const incompatService = RuntimeIncompatibilityService.getInstance(this.plugin);

    // First check cached models from both services
    const customModel = this.customProviderService.getCachedModelById(modelId);
    if (customModel) {
      return incompatService.applyRuntimeFlags(customModel);
    }

    // If not in cache, load all models and search (getModels already applies flags)
    const models = await this.getModels();
    return findModelById(models, modelId);
  }

  /**
   * Find the best alternative model from any provider
   */
  public findBestAlternativeModel(unavailableModelId: string, models: SystemSculptModel[]): SystemSculptModel | undefined {
    if (!models || models.length === 0) {
      return undefined;
    }

    try {
      // Filter out embedding models and the unavailable model
      const chatModels = filterChatModels(models).filter(m => m.id !== unavailableModelId);

      if (chatModels.length === 0) {
        return undefined;
      }

      // Do not prioritize a specific agent model by license; choose best available otherwise

      // Try to find alternative from the same provider first
      const customAlternative = this.customProviderService.findBestAlternativeModel(unavailableModelId);
      if (customAlternative) {
        return customAlternative;
      }

      // If no provider-specific alternative, return the first available chat model
      return chatModels[0];
    } catch (error) {
      // Default to first chat model as fallback
      const chatModels = filterChatModels(models);
      return chatModels[0];
    }
  }

  /**
   * Validate saved selectedModelId, fallback if invalid/missing
   */
  public async validateSelectedModel(models?: SystemSculptModel[]): Promise<{
    wasReplaced: boolean,
    oldModelId?: string,
    newModel?: SystemSculptModel,
    forDefault: boolean
  }> {
    const result = {
      wasReplaced: false,
      oldModelId: undefined as string | undefined,
      newModel: undefined as SystemSculptModel | undefined,
      forDefault: true
    };

    try {
      const modelList = models || await this.getModels();
      const savedId = this.plugin.settings.selectedModelId;
      const found = modelList?.find((m) => m.id === savedId);

      if (!found) {
        const parsed = parseCanonicalId(savedId);
        if (parsed && parsed.providerId === 'systemsculpt') {
          result.wasReplaced = true;
          result.oldModelId = savedId;
          await this.plugin.getSettingsManager().updateSettings({ selectedModelId: "" });
          return result;
        }

        if (modelList && modelList.length > 0 && savedId) {
          const fallbackModel = this.findBestAlternativeModel(savedId, modelList);
          if (fallbackModel) {
            result.wasReplaced = true;
            result.oldModelId = savedId;
            result.newModel = fallbackModel;
            await this.plugin.getSettingsManager().updateSettings({ selectedModelId: fallbackModel.id });
          }
        } else {
          await this.plugin.getSettingsManager().updateSettings({ selectedModelId: "" });
        }
      }
    } catch (error) {
    }

    return result;
  }

  /**
   * Validate a specific model ID and find an alternative if unavailable
   */
  public async validateSpecificModel(modelId: string, models?: SystemSculptModel[]): Promise<{
    isAvailable: boolean,
    alternativeModel?: SystemSculptModel
  }> {
    try {
      let modelList = models;
      if (!modelList) {
        modelList = this.getCachedModelSnapshot();
      }
      if (!modelList) {
        modelList = await this.getModels();
      }
      const found = modelList?.find((m) => m.id === modelId);

      if (!found && modelList && modelList.length > 0) {
        const alternativeModel = this.findBestAlternativeModel(modelId, modelList);
        return {
          isAvailable: false,
          alternativeModel
        };
      }

      return {
        isAvailable: !!found
      };
    } catch (error) {
      return { isAvailable: false };
    }
  }

  private getCachedModelSnapshot(): SystemSculptModel[] | undefined {
    const customModels = this.customProviderService.peekCachedModels() ?? [];
    if (customModels.length === 0) {
      return undefined;
    }
    return [...customModels];
  }

  /**
   * Toggle favorite status for a model
   */
  public async toggleFavorite(model: SystemSculptModel): Promise<void> {
    await this.favoritesService.toggleFavorite(model);
  }

  /**
   * Refresh models from all providers
   */
  public async refreshModels(): Promise<SystemSculptModel[]> {
    return this.getModels(true);
  }

  /**
   * Check if a model supports MCP tools
   */
  public async checkToolCompatibility(modelId: string): Promise<{
    isCompatible: boolean;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }> {
    try {
      const model = await this.getModelById(modelId);
      if (!model) {
        return {
          isCompatible: false,
          reason: 'Model not found',
          confidence: 'high'
        };
      }
      
      return getToolCompatibilityInfo(model);
    } catch (error) {
      return {
        isCompatible: false,
        reason: 'Error checking compatibility',
        confidence: 'low'
      };
    }
  }

  /**
   * Get all tool-compatible models from all providers
   */
  public async getToolCompatibleModels(): Promise<SystemSculptModel[]> {
    try {
      const models = await this.getModels();
      return models.filter(model => supportsTools(model));
    } catch (error) {
      return [];
    }
  }

  /**
   * Test connections to all providers independently
   */
  public async testAllConnections(): Promise<{
    customProviders: boolean;
  }> {
    const customResult = await Promise.resolve(this.customProviderService.testConnection())
      .then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason) => ({ status: "rejected" as const, reason }));

    return {
      customProviders: customResult.status === 'fulfilled' ? customResult.value : false
    };
  }

  /**
   * Get cached models without triggering a load (for quick access)
   */
  public getCachedModels(): SystemSculptModel[] {
    // This would require implementing a unified cache, but for now
    // we'll just return an empty array to maintain the interface
    return [];
  }

  /**
   * Clear all caches
   */
  public clearAllCaches(): void {
    this.customProviderService.clearCache();
  }
}
