export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface GenerateOptions {
  /** Duration in seconds (provider-dependent, typically 4-16) */
  duration?: number;
  /** Aspect ratio, e.g. "16:9", "9:16", "1:1" */
  aspectRatio?: string;
  /** Optional seed for reproducibility */
  seed?: number;
  /** Reference image URL for image-to-video generation (single) */
  referenceImageUrl?: string;
  /** Multiple reference image URLs (takes precedence over referenceImageUrl) */
  referenceImageUrls?: string[];
}

export interface VideoJob {
  /** Provider-assigned job/task ID */
  id: string;
  /** Current status */
  status: JobStatus;
  /** URL to the generated video (available when status is "completed") */
  videoUrl?: string;
  /** Error message (available when status is "failed") */
  error?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface VideoProvider {
  readonly name: string;

  /** Submit a text-to-video generation job. Returns the initial job state. */
  submitJob(prompt: string, options?: GenerateOptions): Promise<VideoJob>;

  /** Check the current status of a previously submitted job. */
  checkStatus(jobId: string): Promise<VideoJob>;

  /** Submit and poll until completion or timeout. Convenience wrapper. */
  generateVideo(prompt: string, options?: GenerateOptions): Promise<VideoJob>;
}
