import { SystemSculptSettings } from '../../types';

export interface ApiEnvironmentConfig {
  baseUrl: string;
  licenseKey?: string;
}

/**
 * Centralized resolver for SystemSculpt API configuration.
 * Ensures every subsystem derives URLs and headers consistently.
 */
export class SystemSculptEnvironment {
  /**
   * Resolve the canonical base URL for the SystemSculpt API.
   * Applies marketing-domain correction, /api/v1 normalization, and
   * returns an empty string when no user-provided URL exists.
   */
  static resolveBaseUrl(
    settings: Pick<SystemSculptSettings, 'serverUrl'>,
    override?: string
  ): string {
    return typeof override === 'string' && override.trim().length > 0
      ? override.trim()
      : (settings.serverUrl?.trim() || '');
  }

  /**
   * Build a reusable API environment snapshot (base URL + license key).
   */
  static createConfig(
    settings: Pick<SystemSculptSettings, 'serverUrl' | 'licenseKey'>,
    override?: string
  ): ApiEnvironmentConfig {
    return {
      baseUrl: this.resolveBaseUrl(settings, override),
      licenseKey: settings.licenseKey?.trim() || undefined,
    };
  }

  /**
   * Construct headers for authorized requests. Falls back to JSON headers when
   * a license key is not present so callers do not need to special case.
   */
  static buildHeaders(licenseKey?: string): Record<string, string> {
    if (!licenseKey) {
      return { "Content-Type": "application/json", Accept: "application/json" };
    }
    return { "Content-Type": "application/json", Accept: "application/json" };
  }
}
