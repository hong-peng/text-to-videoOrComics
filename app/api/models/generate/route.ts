import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sdGenerate, sdImg2Img, sdHealth } from "@/lib/sd";
import { seedreamGenerate } from "@/lib/providers/seedream";
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function toImagePrompt(
  name: string,
  description: string,
  traits: string[],
  appearance?: string,
  age?: string,
  gender?: string,
  style?: string,
  temperament?: string,
  isManga?: boolean,
  imageProvider?: string,
): Promise<string> {
  const appearancePart = appearance ? `\n外貌五官：${appearance}` : "";
  const agePart = age ? `\n年龄：${age}` : "";
  const genderPart = gender ? `\n性别：${gender}` : "";
  const stylePart = style ? `\n穿搭：${style}` : "";
  const temperamentPart = temperament ? `\n气质：${temperament}` : "";

  const isSeedream = imageProvider !== "sd";

  // SD 需要 1girl/1boy 前缀；Seedream 直接描述性别
  const genderPrefix = (!isSeedream && gender?.includes("女")) ? "1girl, "
    : (!isSeedream && gender?.includes("男")) ? "1boy, "
    : "";

  let styleInstructions: string;
  if (isSeedream) {
    styleInstructions = isManga
      ? `3. 风格：动漫插画风格，清晰线稿，平涂配色，白底角色参考图，不要写实感
4. 输出中文提示词即可，描述要精准具体`
      : `3. 风格：电影级真实感人物肖像，摄影质感，专业布光
4. 输出中文提示词即可，描述要精准具体`;
  } else {
    styleInstructions = isManga
      ? `3. 风格：anime style, manga character sheet, clean anime linework, simple flat colors, white background, character reference sheet
4. 必须是动漫插画风格，不要写实，不要摄影感，人物需清晰居中，白底
5. 负面词放在末尾用 || 分隔：|| realistic photo, 3d render, blurry, low quality, extra limbs, wrong gender`
      : `3. 加上通用质量词：masterpiece, best quality, highly detailed, 8k
4. 风格词：cinematic, photorealistic
5. 负面词放在末尾用 || 分隔：|| blurry, low quality, extra limbs, wrong gender`;
  }

  const langHint = isSeedream
    ? "请输出中文提示词"
    : `请输出英文 prompt，prompt 必须以 "${genderPrefix}" 开头`;

  const msg = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `将以下角色描述转为图像生成提示词，要求：
1. ${langHint}，不要解释
2. 必须忠实还原年龄感、五官样貌（脸型/眼型/鼻梁/嘴唇）、发型发色、服装、气质等所有视觉细节
${styleInstructions}

角色名：${name}
描述：${description}${genderPart}${agePart}${appearancePart}${stylePart}${temperamentPart}
特征：${traits.join("、")}`,
    }],
  });

  const raw = (msg.content[0].type === "text" ? msg.content[0].text : "").trim();
  if (!isSeedream && genderPrefix && !raw.startsWith(genderPrefix.trim())) {
    return genderPrefix + raw;
  }
  return raw;
}

async function toScenePrompt(
  location: string,
  description: string,
  mood: string,
  landmarkElement?: string,
  dramaticTension?: string,
  narrativeFunction?: string,
  isManga?: boolean,
  imageProvider?: string,
): Promise<string> {
  const landmarkPart = landmarkElement ? `\n标志性元素：${landmarkElement}` : "";
  const tensionPart = dramaticTension ? `\n戏剧张力：${dramaticTension}` : "";
  const funcPart = narrativeFunction ? `\n叙事功能：${narrativeFunction}` : "";

  const isSeedream = imageProvider !== "sd";

  let styleInstructions: string;
  if (isSeedream) {
    styleInstructions = isManga
      ? `3. 风格：动漫背景插画，清晰线稿，平涂配色，无人物，空场景参考图
4. 输出中文提示词`
      : `3. 风格：电影级场景概念图，摄影质感，专业打光
4. 输出中文提示词`;
  } else {
    styleInstructions = isManga
      ? `3. 风格：anime background art, manga scene, clean linework, simple flat colors, no characters, empty scene reference
4. 动漫背景插画风格，不要写实，场景需清晰`
      : `3. 加上通用质量词：masterpiece, best quality, highly detailed, 8k
4. 风格词：cinematic, concept art, environment design`;
  }

  const langHint = isSeedream ? "请输出中文提示词" : "请输出英文 prompt";

  const msg = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `将以下场景描述转为图像生成提示词，要求：
1. ${langHint}，不要解释
2. 必须包含标志性元素、光线色调、空间感等具体视觉细节
${styleInstructions}

地点：${location}
描述：${description}
氛围：${mood}${landmarkPart}${tensionPart}${funcPart}`,
    }],
  });
  return (msg.content[0].type === "text" ? msg.content[0].text : "").trim();
}

/** 根据 provider 生成图片，返回 { filename, data: base64 } 或 { url } */
async function runGenerate(opts: {
  prompt: string;
  width: number;
  height: number;
  imageProvider: string;
  /** SD 图生图用：本地已有激活版本路径 */
  latestImageUrl?: string;
  /** Seedream 图生图用：已有版本的可访问 URL */
  latestPublicUrl?: string;
  outputDir: string;
  filename: string;
}): Promise<string /* saved relative imageUrl */> {
  const { prompt, width, height, imageProvider, outputDir, filename } = opts;

  if (imageProvider !== "sd") {
    const result = await seedreamGenerate(prompt, {
      referenceImageUrl: opts.latestPublicUrl,
      size: width < height ? "1024x1536" : "1536x1024",
      model: imageProvider,
    });
    // Seedream 返回 URL，下载后保存到本地
    const imgRes = await fetch(result.url);
    if (!imgRes.ok) throw new Error(`下载 Seedream 图片失败: ${result.url}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await fs.writeFile(path.join(outputDir, filename), buffer);
  } else {
    // SD 路径
    if (opts.latestImageUrl) {
      const imagePath = path.join(process.cwd(), "public", opts.latestImageUrl);
      const result = await sdImg2Img({ prompt, imagePath, width, height, denoise: 0.55 });
      if (!result.success || !result.images[0]) throw new Error("SD img2img 生图失败");
      await fs.writeFile(path.join(outputDir, filename), Buffer.from(result.images[0].data, "base64"));
    } else {
      const result = await sdGenerate({ prompt, width, height });
      if (!result.success || !result.images[0]) throw new Error("SD 文生图失败");
      await fs.writeFile(path.join(outputDir, filename), Buffer.from(result.images[0].data, "base64"));
    }
  }

  return filename;
}

export async function POST(request: NextRequest) {
  const { seriesId, analysisId, names, partId, imageProvider = "sd" } = await request.json() as {
    seriesId: string;
    analysisId: string;
    names?: string[];
    partId?: string;
    imageProvider?: "sd" | "seedream";
  };

  if (!seriesId || !analysisId) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  // SD 健康检查仅在使用 SD 时执行
  if (imageProvider === "sd") {
    const healthy = await sdHealth();
    if (!healthy) {
      return Response.json({ error: "SD 服务未启动，请先运行 python server.py" }, { status: 503 });
    }
  }

  const [analysis, series] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId } }),
    prisma.series.findUnique({ where: { id: seriesId }, select: { type: true } }),
  ]);
  if (!analysis) {
    return Response.json({ error: "分析记录不存在" }, { status: 404 });
  }
  const isManga = series?.type === "manga";

  const characters = analysis.characters as { name: string; description: string; traits: string[]; appearance?: string; age?: string; gender?: string; style?: string; temperament?: string }[];
  const scenes = analysis.scenes as { location: string; description: string; mood: string; landmarkElement?: string; dramaticTension?: string; narrativeFunction?: string }[];

  const charTargets = names ? characters.filter((c) => names.includes(c.name)) : characters;
  const sceneTargets = names ? scenes.filter((s) => names.includes(s.location)) : scenes;
  const total = charTargets.length + sceneTargets.length;

  const outputDir = path.join(process.cwd(), "public", "models", seriesId);
  await fs.mkdir(outputDir, { recursive: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(data)));

      enqueue({ type: "start", total });

      // 角色建模
      for (const char of charTargets) {
        enqueue({ type: "model_start", name: char.name, entityType: "character" });
        try {
          const latestByVersion = await prisma.characterModel.findFirst({
            where: { seriesId, name: char.name, entityType: "character" },
            orderBy: { version: "desc" },
          });
          const activeModel = await prisma.characterModel.findFirst({
            where: { seriesId, name: char.name, entityType: "character", isActive: true },
          });
          const version = (latestByVersion?.version ?? 0) + 1;

          const prompt = latestByVersion?.prompt
            ?? await toImagePrompt(char.name, char.description, char.traits ?? [], char.appearance, char.age, char.gender, char.style, char.temperament, isManga, imageProvider);

          const safeName = char.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
          const filename = `${safeName}_v${version}.png`;

          await runGenerate({
            prompt,
            width: 512,
            height: 768,
            imageProvider,
            latestImageUrl: imageProvider === "sd" ? activeModel?.imageUrl : undefined,
            latestPublicUrl: imageProvider !== "sd" && activeModel?.imageUrl
              ? `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}${activeModel.imageUrl}`
              : undefined,
            outputDir,
            filename,
          });

          const imageUrl = `/models/${seriesId}/${filename}`;

          await prisma.characterModel.updateMany({
            where: { seriesId, name: char.name, entityType: "character", isActive: true },
            data: { isActive: false },
          });

          const record = await prisma.characterModel.create({
            data: { seriesId, sourcePartId: partId ?? null, entityType: "character", name: char.name, version, prompt, imageUrl, isActive: true },
          });

          enqueue({ type: "model_done", model: record });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          enqueue({ type: "model_error", name: char.name, error: msg });
        }
      }

      // 场景建模
      for (const scene of sceneTargets) {
        enqueue({ type: "model_start", name: scene.location, entityType: "scene" });
        try {
          const latestByVersion = await prisma.characterModel.findFirst({
            where: { seriesId, name: scene.location, entityType: "scene" },
            orderBy: { version: "desc" },
          });
          const activeModel = await prisma.characterModel.findFirst({
            where: { seriesId, name: scene.location, entityType: "scene", isActive: true },
          });
          const version = (latestByVersion?.version ?? 0) + 1;

          const prompt = latestByVersion?.prompt
            ?? await toScenePrompt(scene.location, scene.description, scene.mood, scene.landmarkElement, scene.dramaticTension, scene.narrativeFunction, isManga, imageProvider);

          const safeName = scene.location.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
          const filename = `scene_${safeName}_v${version}.png`;

          await runGenerate({
            prompt,
            width: 768,
            height: 512,
            imageProvider,
            latestImageUrl: imageProvider === "sd" ? activeModel?.imageUrl : undefined,
            latestPublicUrl: imageProvider !== "sd" && activeModel?.imageUrl
              ? `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}${activeModel.imageUrl}`
              : undefined,
            outputDir,
            filename,
          });

          const imageUrl = `/models/${seriesId}/${filename}`;

          await prisma.characterModel.updateMany({
            where: { seriesId, name: scene.location, entityType: "scene", isActive: true },
            data: { isActive: false },
          });

          const record = await prisma.characterModel.create({
            data: { seriesId, sourcePartId: partId ?? null, entityType: "scene", name: scene.location, version, prompt, imageUrl, isActive: true },
          });

          enqueue({ type: "model_done", model: record });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          enqueue({ type: "model_error", name: scene.location, error: msg });
        }
      }

      enqueue({ type: "all_done", total });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
