import path from "path";
import { promises as fs } from "fs";

const SD_BASE = process.env.SD_BASE_URL ?? "http://127.0.0.1:5000";

export interface SdGenerateOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  checkpoint?: string;
}

export interface SdImg2ImgOptions extends SdGenerateOptions {
  /** 本地图片绝对路径（服务端读取后以 multipart 发送） */
  imagePath: string;
  /** 重绘幅度 0~1，越低越接近原图，默认 0.55 保持人脸一致性 */
  denoise?: number;
}

export interface SdImage {
  filename: string;
  data: string; // base64
}

export interface SdGenerateResult {
  success: boolean;
  prompt_id: string;
  images: SdImage[];
}

/** 文生图 */
export async function sdGenerate(opts: SdGenerateOptions): Promise<SdGenerateResult> {
  const res = await fetch(`${SD_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      negative_prompt: opts.negative_prompt ?? "ugly, blurry, low quality, deformed, bad anatomy",
      width: opts.width ?? 512,
      height: opts.height ?? 768,
      steps: opts.steps ?? 25,
      cfg: opts.cfg ?? 7.0,
      seed: opts.seed ?? -1,
      ...(opts.checkpoint ? { checkpoint: opts.checkpoint } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SD API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<SdGenerateResult>;
}

/** 图生图（用参考图保持人脸/场景一致性） */
export async function sdImg2Img(opts: SdImg2ImgOptions): Promise<SdGenerateResult> {
  const imgBuffer = await fs.readFile(opts.imagePath);
  const filename = path.basename(opts.imagePath);

  const form = new FormData();
  form.append("image", new Blob([imgBuffer]), filename);
  form.append("prompt", opts.prompt);
  form.append("negative_prompt", opts.negative_prompt ?? "ugly, blurry, low quality, deformed, bad anatomy");
  form.append("steps", String(opts.steps ?? 25));
  form.append("cfg", String(opts.cfg ?? 7.0));
  form.append("denoise", String(opts.denoise ?? 0.55));
  form.append("seed", String(opts.seed ?? -1));
  if (opts.checkpoint) form.append("checkpoint", opts.checkpoint);

  const res = await fetch(`${SD_BASE}/generate/img2img`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SD img2img API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<SdGenerateResult>;
}

export async function sdHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SD_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
