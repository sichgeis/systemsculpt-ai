import { SystemSculptModel, SystemSculptSettings } from "../types";
import { SystemSculptError, ERROR_CODES } from "../utils/errors";
import SystemSculptPlugin from "../main";

/**
 * Service responsible for model management and caching
 */
export class ModelManagementService {
  private plugin: SystemSculptPlugin;
  private baseUrl: string;
  
  constructor(plugin: SystemSculptPlugin, baseUrl: string) {
    this.plugin = plugin;
    this.baseUrl = baseUrl;
  }

  /**
   * Update the base URL
   */
  public updateBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Get current settings
   */
  private get settings(): SystemSculptSettings {
    return this.plugin.settings;
  }

  /**
   * Strip provider prefixes from model IDs
   */
  public stripProviderPrefixes(modelId: string): string {
    // No longer strip provider prefixes. We expect canonical, provider-prefixed IDs
    // like "openrouter/openai/gpt-4o" or "groq/llama-3-8b" to be passed to the server.
    return modelId;
  }

  /**
   * Get all available models
   */
  public async getModels(): Promise<SystemSculptModel[]> {
    return this.plugin.modelService.getModels();
  }

  /**
   * Get model information by ID
   */
  public async getModelInfo(modelId: string): Promise<{
    isCustom: boolean;
    provider?: any;
    actualModelId: string;
    upstreamModelId?: string;
  }> {
    // Use the UnifiedModelService to find the model
    const model = await this.plugin.modelService.getModelById(modelId);
    
    if (!model) {
      throw new SystemSculptError(
        `Model ${modelId} not found`,
        ERROR_CODES.MODEL_UNAVAILABLE,
        404
      );
    }

    // Parse canonical ID to get the actual model name for API calls
    const { parseCanonicalId } = await import('../utils/modelUtils');
    const parsed = parseCanonicalId(model.id);
    if (!parsed) {
      throw new SystemSculptError(
        `Invalid model ID format: ${model.id}`,
        ERROR_CODES.MODEL_UNAVAILABLE,
        400
      );
    }

    const { providerId, modelId: parsedModelId } = parsed;

    if (providerId === 'systemsculpt') {
      throw new SystemSculptError(
        "The hosted SystemSculpt provider has been removed. Choose a custom or local provider model.",
        ERROR_CODES.MODEL_UNAVAILABLE,
        400
      );
    }

    // This is a custom provider model - find the provider configuration
    const customProvider = this.settings.customProviders.find(p => 
      p.isEnabled && (p.id === providerId || p.name.toLowerCase() === providerId)
    );

    if (!customProvider) {
      throw new SystemSculptError(
        `Custom provider ${providerId} not found or disabled`,
        ERROR_CODES.MODEL_UNAVAILABLE,
        404
      );
    }

    return {
      isCustom: true,
      provider: customProvider,
      actualModelId: parsedModelId,
      upstreamModelId: parsedModelId,
    };
  }

  /**
   * Preload models (no-op since we're not caching)
   */
  public async preloadModels(): Promise<void> {
    // Remove preloading since we're not caching
    return Promise.resolve();
  }

}
