import type { VideoProvider, VideoJob, GenerateOptions, JobStatus } from "./types";

const BASE_URL = process.env.FLOW2API_BASE_URL ?? "http://localhost:8080";
const API_KEY = process.env.FLOW2API_API_KEY ?? "han1234";
const MODEL = process.env.FLOW2API_MODEL ?? "veo_3_1_t2v_fast_landscape";

// Polling interval and timeout for async generation
const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 10 * 60 * 1000;

export class Flow2APIProvider implements VideoProvider {
  readonly name = "flow2api";

  async submitJob(prompt: string, _options?: GenerateOptions): Promise<VideoJob> {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Flow2API error ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      id?: string;
      choices?: { message?: { content?: string } }[];
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(data.error.message);
    }

    // Non-streaming: video URL may be in choices[0].message.content
    const content = data.choices?.[0]?.message?.content ?? "";
    const videoUrl = extractVideoUrl(content);

    return {
      id: data.id ?? crypto.randomUUID(),
      status: videoUrl ? "completed" : "processing",
      videoUrl: videoUrl ?? undefined,
      metadata: { raw: content },
    };
  }

  async checkStatus(jobId: string): Promise<VideoJob> {
    // This provider returns results synchronously in submitJob.
    // If we reach here it means we stored the job id and need to re-check.
    // Flow2API doesn't have a separate status endpoint, so treat as completed.
    return { id: jobId, status: "completed" };
  }

  async generateVideo(prompt: string, options?: GenerateOptions): Promise<VideoJob> {
    const job = await this.submitJob(prompt, options);
    if (job.status === "completed") return job;

    // Poll if still processing (some models are async)
    const deadline = Date.now() + POLL_TIMEOUT;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const result = await this.checkStatus(job.id);
      if (result.status === "completed" || result.status === "failed") return result;
    }
    return { id: job.id, status: "failed", error: "timeout" };
  }
}

/** Extract first HTTP(S) URL ending in a video extension from text */
function extractVideoUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mov|avi|mkv)(?:\?[^\s"'<>]*)?/i);
  return m ? m[0] : null;
}

export const flow2api = new Flow2APIProvider();
