import { config } from "../config";
import type { GenerateOptions, VideoJob, VideoProvider } from "./types";

const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export const SEEDANCE_MODELS: { id: string; label: string }[] = [
  { id: "doubao-seedance-1-0-pro-fast-251015", label: "Seedance 1.0 Pro Fast（默认）" },
  { id: "doubao-seedance-1-5-pro-251215", label: "Seedance 1.5 Pro" },
];

export const DEFAULT_SEEDANCE_MODEL = SEEDANCE_MODELS[0].id;

interface SeedanceTaskResponse {
  id: string;
  status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  content?: {
    video_url?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export class SeedanceProvider implements VideoProvider {
  readonly name = "seedance";
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? config.SEEDANCE_API_KEY ?? "";
    if (!this.apiKey) {
      throw new Error(
        "SEEDANCE_API_KEY is required. Set it in .env or pass it to the constructor."
      );
    }
    this.model = model ?? config.SEEDANCE_MODEL ?? DEFAULT_SEEDANCE_MODEL;
  }

  async submitJob(prompt: string, options?: GenerateOptions): Promise<VideoJob> {
    const content: unknown[] = [{ type: "text", text: prompt }];

    // 支持多张参考图（referenceImageUrls 优先，其次 referenceImageUrl）
    const imageUrls = options?.referenceImageUrls?.length
      ? options.referenceImageUrls
      : options?.referenceImageUrl
      ? [options.referenceImageUrl]
      : [];

    for (const url of imageUrls) {
      content.push({
        type: "image_url",
        image_url: { url },
      });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      content,
      generate_audio: true,
      ratio: options?.aspectRatio ?? "16:9",
      duration: options?.duration ?? 5,
      watermark: false,
    };
    if (options?.seed !== undefined) {
      body.seed = options.seed;
    }

    const res = await fetch(`${BASE_URL}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Seedance API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as SeedanceTaskResponse;
    return this.toVideoJob(data);
  }

  async checkStatus(jobId: string): Promise<VideoJob> {
    const res = await fetch(
      `${BASE_URL}/contents/generations/tasks/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Seedance API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as SeedanceTaskResponse;
    return this.toVideoJob(data);
  }

  async generateVideo(prompt: string, options?: GenerateOptions): Promise<VideoJob> {
    let job = await this.submitJob(prompt, options);
    const deadline = Date.now() + config.POLL_TIMEOUT_MS;

    while (job.status !== "completed" && job.status !== "failed") {
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for Seedance job ${job.id} after ${config.POLL_TIMEOUT_MS}ms`
        );
      }
      await sleep(config.POLL_INTERVAL_MS);
      job = await this.checkStatus(job.id);
    }

    return job;
  }

  private toVideoJob(data: SeedanceTaskResponse): VideoJob {
    const statusMap: Record<string, VideoJob["status"]> = {
      queued: "pending",
      running: "processing",
      succeeded: "completed",
      failed: "failed",
      cancelled: "failed",
    };

    const videoUrl = data.content?.video_url;

    return {
      id: data.id,
      status: statusMap[data.status ?? ""] ?? "pending",
      videoUrl,
      error: data.error?.message,
      metadata: { raw: data },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
