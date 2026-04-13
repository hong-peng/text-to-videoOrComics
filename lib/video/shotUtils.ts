import { prisma } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

interface ShotFields {
  shotNumber: number;
  shotType: string;
  cameraMove: string;
  description: string;
  location?: string | null;
  lighting?: string | null;
  characters?: unknown;   // Json field (string[] after parse)
  mood?: string | null;
  dialogue?: string | null;
  duration: number;
  notes?: string | null;
}

/**
 * 将分镜所有字段拼成专业的文生视频 prompt
 * 遵循 Seedance/Veo 等模型对 prompt 的最佳实践：
 * - 以英文描述为核心（description 已由 Claude 生成为英文）
 * - 附上镜头语言、场景环境、情绪、人物、对话等结构化信息
 */
export function buildShotPrompt(shot: ShotFields): string {
  const lines: string[] = [];

  // ① 核心视觉描述（英文，AI生图质量最高权重）
  lines.push(shot.description);

  // ② 镜头语言
  lines.push(`景别：${shot.shotType}，运镜：${shot.cameraMove}`);

  // ③ 场景与光线
  const env: string[] = [];
  if (shot.location?.trim()) env.push(`场景：${shot.location.trim()}`);
  if (shot.lighting?.trim()) env.push(`光线：${shot.lighting.trim()}`);
  if (env.length) lines.push(env.join("，"));

  // ④ 情绪/氛围
  if (shot.mood?.trim()) {
    lines.push(`情绪：${shot.mood.trim()}`);
  }

  // ⑤ 台词/旁白（如有，作为画面内容参考）
  if (shot.dialogue?.trim()) {
    lines.push(`台词："${shot.dialogue.trim()}"`);
  }

  // ⑥ 导演备注/特效（如有）
  if (shot.notes?.trim()) {
    lines.push(`导演备注：${shot.notes.trim()}`);
  }

  // ⑦ 时长
  lines.push(`时长：${shot.duration}秒`);

  return lines.join(". ");
}

/**
 * 将 public/ 目录下的图片读为 base64 data URL
 */
async function toBase64DataUrl(imageUrl: string): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), "public", imageUrl);
    const buf = await fs.readFile(filePath);
    const ext = path.extname(imageUrl).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * 从分镜的 characters 数组（优先）和 description（兜底）中匹配系列建模图，
 * 返回所有匹配图的 base64 data URL 列表。
 * 角色图优先于场景图。
 */
export async function findReferenceImageUrls(
  seriesId: string,
  shot: ShotFields,
): Promise<string[]> {
  const models = await prisma.characterModel.findMany({
    where: { seriesId, isActive: true },
    orderBy: { entityType: "asc" }, // character < scene
  });

  if (models.length === 0) return [];

  // 优先用 characters 数组精确匹配
  const charNames: string[] = Array.isArray(shot.characters)
    ? (shot.characters as string[])
    : [];

  let matched = charNames.length > 0
    ? models.filter((m) => charNames.includes(m.name))
    : [];

  // 兜底：用 description 做字符串包含匹配
  if (matched.length === 0) {
    matched = models.filter((m) => shot.description.includes(m.name));
  }

  if (matched.length === 0) return [];

  const dataUrls = await Promise.all(matched.map((m) => toBase64DataUrl(m.imageUrl)));
  return dataUrls.filter((u): u is string => u !== null);
}
