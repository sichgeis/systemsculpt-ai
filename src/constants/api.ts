// Environment toggles retained for compatibility with local-only code paths.

export const DEVELOPMENT_MODE: "DEVELOPMENT" | "PRODUCTION" = "PRODUCTION";

export function getServerUrl(productionUrl: string, developmentUrl: string): string {
  return DEVELOPMENT_MODE === "DEVELOPMENT" ? developmentUrl : productionUrl;
}

export interface ApiErrorDetails {
  message: string;
  code: string;
  statusCode: number;
}

export interface ApiResponse<T> {
  status: "success" | "error";
  data: T | null;
  error?: ApiErrorDetails;
}

export interface LicenseValidationResponse {
  email: string;
  subscription_status: string;
  license_key: string;
  user_name?: string;
  display_name?: string;
  has_agents_pack_access?: boolean;
}

export const SYSTEMSCULPT_API_HEADERS = {
  DEFAULT: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-SystemSculpt-Client": "obsidian-plugin",
  },
  WITH_LICENSE: (licenseKey: string) => ({
    ...SYSTEMSCULPT_API_HEADERS.DEFAULT,
    "x-license-key": licenseKey,
  }),
} as const;
