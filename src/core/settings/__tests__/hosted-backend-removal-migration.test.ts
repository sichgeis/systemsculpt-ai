import { SettingsManager } from "../SettingsManager";
import { DEFAULT_SETTINGS } from "../../../types";

describe("hosted backend removal migration", () => {
  function migrate(input: Record<string, unknown>) {
    const plugin = {
      app: { vault: { adapter: {} } },
    } as any;
    const manager = new SettingsManager(plugin);
    return (manager as any).migrateSettings({ ...DEFAULT_SETTINGS, ...input });
  }

  it("clears saved native model selections and hosted flags", () => {
    const settings = migrate({
      selectedModelId: "systemsculpt@@systemsculpt/ai-agent",
      titleGenerationProviderId: "systemsculpt",
      titleGenerationModelId: "systemsculpt@@title",
      postProcessingProviderId: "systemsculpt",
      postProcessingModelId: "systemsculpt@@post",
      activeProvider: { id: "systemsculpt", name: "SystemSculpt", type: "native" },
      enableSystemSculptProvider: true,
      useSystemSculptAsFallback: true,
      showUpdateNotifications: true,
      licenseKey: "legacy",
      licenseValid: true,
    });

    expect(settings.selectedModelId).toBe("");
    expect(settings.titleGenerationProviderId).toBe("");
    expect(settings.titleGenerationModelId).toBe("");
    expect(settings.postProcessingProviderId).toBe("");
    expect(settings.postProcessingModelId).toBe("");
    expect(settings.activeProvider.type).toBe("custom");
    expect(settings.enableSystemSculptProvider).toBe(false);
    expect(settings.useSystemSculptAsFallback).toBe(false);
    expect(settings.showUpdateNotifications).toBe(false);
    expect(settings.licenseKey).toBe("");
    expect(settings.licenseValid).toBe(false);
  });

  it("migrates embeddings and transcription to custom-only defaults", () => {
    const settings = migrate({
      embeddingsProvider: "systemsculpt",
      transcriptionProvider: "systemsculpt",
      imageGenerationDefaultModelId: "openai/gpt-5-image-mini",
      imageGenerationModelCatalogCache: { fetchedAt: "old", models: [{ id: "hosted" }] },
    });

    expect(settings.embeddingsProvider).toBe("custom");
    expect(settings.transcriptionProvider).toBe("custom");
    expect(settings.imageGenerationDefaultModelId).toBe("");
    expect(settings.imageGenerationModelCatalogCache).toBeNull();
  });
});
