export type CanvasFlowPrepareInputImageUploadsResponse = any;
export type CanvasFlowCreateGenerationJobRequest = any;
export type CanvasFlowCreateGenerationJobResponse = any;
export type CanvasFlowGenerationJobResponse = any;

export type CanvasFlowImageGenerationClient = {
  createGenerationJob: (
    request: CanvasFlowCreateGenerationJobRequest,
    options?: { idempotencyKey?: string }
  ) => Promise<CanvasFlowCreateGenerationJobResponse>;
  prepareInputImageUploads: (inputImages: Array<{
    mime_type: string;
    size_bytes: number;
    sha256: string;
  }>) => Promise<CanvasFlowPrepareInputImageUploadsResponse>;
  uploadPreparedInputImage: (options: {
    uploadUrl: string;
    mimeType: string;
    bytes: ArrayBuffer;
    extraHeaders?: Record<string, string>;
  }) => Promise<void>;
  waitForGenerationJob: (
    jobId: string,
    options?: {
      pollIntervalMs?: number;
      maxPollIntervalMs?: number;
      maxWaitMs?: number;
      pollUrl?: string;
      initialPollDelayMs?: number;
      signal?: AbortSignal;
      onUpdate?: (job: CanvasFlowGenerationJobResponse) => void;
    }
  ) => Promise<CanvasFlowGenerationJobResponse>;
  downloadImage: (url: string) => Promise<{ arrayBuffer: ArrayBuffer; contentType?: string }>;
};

export type CanvasFlowImageGenerationClientFactory = (options: {
  baseUrl: string;
  licenseKey: string;
  pluginVersion?: string;
}) => CanvasFlowImageGenerationClient;

export const createDefaultCanvasFlowImageGenerationClient: CanvasFlowImageGenerationClientFactory = (options) => {
  const unavailable = async (): Promise<never> => {
    throw new Error("Hosted image generation is unavailable in this fork.");
  };
  return {
    createGenerationJob: unavailable,
    prepareInputImageUploads: unavailable,
    uploadPreparedInputImage: unavailable,
    waitForGenerationJob: unavailable,
    downloadImage: unavailable,
  };
};
