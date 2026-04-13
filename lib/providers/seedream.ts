/**
 * 豆包 Seedream 文生图 / 图生图 Provider
 * 文档：https://ark.cn-beijing.volces.com/api/v3/images/generations
 */

const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

export const SEEDREAM_MODELS: { id: string; label: string }[] = [
  { id: "doubao-seedream-4-0-250828", label: "Seedream 4.0" },
  { id: "doubao-seedream-4-5-251128", label: "Seedream 4.5" },
];

export const DEFAULT_SEEDREAM_MODEL = SEEDREAM_MODELS[0].id;

export interface SeedreamGenerateOptions {
  /** 参考图 URL，有则走图生图，无则走文生图 */
  referenceImageUrl?: string;
  /** 分辨率，默认 "1024x1536"（竖版漫画格）*/
  size?: string;
  /** 指定模型，默认 doubao-seedream-4-0-250828 */
  model?: string;
}

export interface SeedreamResult {
  /** 生成图片的可访问 URL */
  url: string;
}

function getApiKey(): string {
  const key = process.env.SEEDREAM_API_KEY ?? process.env.SEEDANCE_API_KEY ?? "";
  if (!key) throw new Error("SEEDREAM_API_KEY 未配置，请在 .env 中添加");
  return key;
}

/** 文生图（referenceImageUrl 为空）或图生图（referenceImageUrl 有值） */
export async function seedreamGenerate(
  prompt: string,
  opts: SeedreamGenerateOptions = {}
): Promise<SeedreamResult> {
  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_SEEDREAM_MODEL,
    prompt,
    sequential_image_generation: "disabled",
    response_format: "url",
    size: opts.size ?? "1024x1536",
    stream: false,
    watermark: false,
  };

  // 有参考图自动走图生图
  if (opts.referenceImageUrl) {
    body.image = opts.referenceImageUrl;
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seedream API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { data?: { url: string }[] };
  const url = data.data?.[0]?.url;
  if (!url) throw new Error("Seedream 未返回图片 URL");
  return { url };
}
