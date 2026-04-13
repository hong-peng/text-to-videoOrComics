import { config } from "../config";
import type { GenerateOptions, VideoJob, VideoProvider } from "./types";

const BASE_URL = "https://api.dev.runwayml.com/v1";

interface RunwayTaskResponse {
  id: string;
  status: string;
  failure?: string;
  failReason?: string;
  output?: string[];
}

export class RunwayProvider implements VideoProvider {
  readonly name = "runway";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? config.RUNWAY_API_KEY ?? "";
    if (!this.apiKey) {
      throw new Error("RUNWAY_API_KEY is required. Set it in .env or pass it to the constructor.");
    }
  }

  async submitJob(prompt: string, options?: GenerateOptions): Promise<VideoJob> {
    const body: Record<string, unknown> = {
      promptText: prompt,
      model: "gen4_turbo",
      duration: options?.duration ?? 5,
      ratio: options?.aspectRatio ?? "16:9",
    };
    if (options?.seed !== undefined) {
      body.seed = options.seed;
    }

    const res = await fetch(`${BASE_URL}/image_to_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as RunwayTaskResponse;
    return this.toVideoJob(data);
  }

  async checkStatus(jobId: string): Promise<VideoJob> {
    const res = await fetch(`${BASE_URL}/tasks/${jobId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as RunwayTaskResponse;
    return this.toVideoJob(data);
  }

  async generateVideo(prompt: string, options?: GenerateOptions): Promise<VideoJob> {
    let job = await this.submitJob(prompt, options);
    const deadline = Date.now() + config.POLL_TIMEOUT_MS;

    while (job.status !== "completed" && job.status !== "failed") {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for job ${job.id} after ${config.POLL_TIMEOUT_MS}ms`);
      }
      await sleep(config.POLL_INTERVAL_MS);
      job = await this.checkStatus(job.id);
    }

    return job;
  }

  private toVideoJob(data: RunwayTaskResponse): VideoJob {
    const statusMap: Record<string, VideoJob["status"]> = {
      PENDING: "pending",
      RUNNING: "processing",
      SUCCEEDED: "completed",
      FAILED: "failed",
    };

    return {
      id: data.id,
      status: statusMap[data.status] ?? "pending",
      videoUrl: data.output?.[0],
      error: data.failure ?? data.failReason,
      metadata: { raw: data },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
