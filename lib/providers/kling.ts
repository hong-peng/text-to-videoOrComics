import type { GenerateOptions, VideoJob, VideoProvider } from "./types.js";

export class KlingProvider implements VideoProvider {
  readonly name = "kling";

  constructor(_apiKey?: string) {
    // Kling integration not yet implemented
  }

  async submitJob(_prompt: string, _options?: GenerateOptions): Promise<VideoJob> {
    throw new Error("Kling provider is not yet implemented. Contributions welcome!");
  }

  async checkStatus(_jobId: string): Promise<VideoJob> {
    throw new Error("Kling provider is not yet implemented. Contributions welcome!");
  }

  async generateVideo(_prompt: string, _options?: GenerateOptions): Promise<VideoJob> {
    throw new Error("Kling provider is not yet implemented. Contributions welcome!");
  }
}
