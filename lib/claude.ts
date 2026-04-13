import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import type { NovelAnalysis, ScriptContent } from "./script/types";
import type { StoryboardData } from "./storyboard/types";
import type { MangaStoryboard } from "./script/mangaTypes";
import {
  buildAnalysisSkills,
  buildScriptSkills,
  buildStoryboardSkills,
  buildCharacterProfiles,
  buildAnchorSceneHint,
} from "./skills/shortDrama";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

/** 从 LLM 输出中提取并解析 JSON，自动修复常见问题 */
function parseJSON<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  const raw = text.slice(start, end + 1);
  return JSON.parse(jsonrepair(raw)) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt 构建函数
// ─────────────────────────────────────────────────────────────────────────────

function buildAnalysisSystemPrompt(): string {
  return `你是一名专业的短剧改编编剧助手，专门将小说改编为"极致短平快"的短视频爽剧。
你拥有深厚的爆款短剧创作经验，熟悉所有主流短剧套路和爽点设计。

${buildAnalysisSkills()}

请严格以 JSON 格式输出，不要有任何其他文字。`;
}

function buildAnalysisUserPrompt(truncated: string): string {
  return `将以下小说改编为短视频爽剧，用短剧视角提取人物、场景和情节要素。

【提取要求】
- 人物：识别主角隐藏设定（金手指/真实身份），反派嚣张行为，配角工具人职能，为每人设计标志性道具/动作
- 场景：优先选择"自带冲突基因"的场景（权力不对等、众目睽睽、时间压迫），标注固定/流动类型
- 情节：聚焦"惨→逆袭"反转节点，每个要点标注冲突类型（羞辱/陷害/打脸/觉醒）和爽感级别
- 外貌（重要）：这是 AI 建模的唯一依据，必须极其详细，包含以下所有维度：
  · 性别（必填，明确写"男"或"女"）
  · 年龄或年龄段（如：18岁、20岁出头、30多岁中年）
  · 脸型（如：瓜子脸、方正脸、圆脸）
  · 眼睛（形状、颜色、神态，如：丹凤眼、眼神锐利、眼角微挑）
  · 鼻梁（如：高挺、秀气小巧）
  · 嘴唇（如：薄唇冷峻、嘴角带笑）
  · 肤色（如：冷白肌、麦色肌肤）
  · 身材（如：高挑纤细、宽肩窄腰、魁梧）
  · 发型发色（如：黑色长直发、棕色短发、白发）
  · 标志性特征（如：眉间朱砂痣、左脸疤痕）

小说内容：
${truncated}

请按以下 JSON 格式输出：
{
  "characters": [
    {
      "name": "人物名称",
      "description": "人物简介（身份背景+隐藏设定，如：表面赘婿，实为北境战神）",
      "traits": ["性格标签，如：隐忍、腹黑、嚣张跋扈、无脑自大"],
      "relationships": ["与其他人物的关系（重点标注：对立/利用/误解/真心）"],
      "gender": "性别（必填：男 / 女）",
      "age": "具体年龄或年龄段，如：22岁、30多岁",
      "appearance": "外貌五官极详细描述（必填）：脸型 + 眼睛形状与神态 + 鼻梁 + 嘴唇 + 肤色 + 身材 + 任何标志性特征，每项都要写",
      "style": "穿搭描述：服装款式、颜色、配饰、发型发色（尽可能具体）",
      "temperament": "气质神韵，如：冷峻霸道、卑微隐忍、嚣张跋扈"
    }
  ],
  "scenes": [
    {
      "location": "场景地点名称",
      "description": "场景视觉描述（空间格局、陈设、光线、权力属性）",
      "mood": "场景核心情绪（单词：压抑/解气/紧张/热血/羞辱/震惊）",
      "sceneType": "anchor（核心固定场景）或 flow（流动场景）",
      "narrativeFunction": "叙事功能，如：'主角被当众羞辱的发源地'、'逆袭打脸的主战场'",
      "landmarkElement": "标志性视觉元素（固定场景必填），如：'落地窗前的老板椅'",
      "dramaticTension": "场景自带冲突张力，如：'众目睽睽下羞辱感翻倍'、'密闭空间让对峙无处逃'"
    }
  ],
  "plotPoints": [
    {
      "summary": "情节摘要（格式：谁+对谁+做了什么+产生了什么冲突/爽感）",
      "characters_involved": ["相关人物"],
      "tension_level": 8
    }
  ]
}`;
}

function buildScriptSystemPrompt(): string {
  return `你是一名专业的短剧编剧，专门创作"极致短平快、强爽点、高密度反转"的短视频剧集（单集1.5分钟）。
你的剧本直接决定观众是否继续刷下一集。

${buildScriptSkills()}

请严格以 JSON 格式输出，不要有任何其他文字。`;
}

function buildScriptUserPrompt(analysis: NovelAnalysis, episodeNum: number, totalEpisodes: number): string {
  const anchorHint = buildAnchorSceneHint(analysis);

  const firstEpHint = episodeNum === 1
    ? `\n【第一集铁律】前10秒必须出现强冲突画面（退婚现场/当众羞辱/陷害打击），立刻建立"主角很惨→即将逆袭"的预期，零铺垫，直接开打。`
    : "";

  const lateEpHint = episodeNum >= Math.floor(totalEpisodes * 0.7)
    ? `\n【收尾阶段】本集进入决战节奏，隐藏身份可以更大范围曝光，清算动作要更彻底，钩子指向最终决战。`
    : "";

  return `根据以下小说分析，创作第 ${episodeNum}/${totalEpisodes} 集短剧剧本。${anchorHint}${firstEpHint}${lateEpHint}

小说分析：
${JSON.stringify(analysis, null, 2)}

【本集必须完成的任务（按顺序）】
1. CONFLICT（开场冲突）：前10秒直接上高强度冲突，反派台词必须具体刻薄，让观众立刻愤怒
2. ESCALATION（冲突升级）：反派变本加厉，主角承压到极限，观众为主角攥紧拳头
3. SPARK（爽点引爆）：主角反击/露出一角实力/关键信息揭示，给观众一个小解气
4. CLIFFHANGER（强制钩子）：刚到最爽处戛然而止，让观众不得不点开下一集

【创作禁令】
✗ 禁止平铺直叙开场（环境描写/自我介绍/日常对话）
✗ 禁止无冲突场景（每个场景必须有矛盾推进）
✗ 禁止超过15字的单句台词
✗ 禁止用旁白/内心独白表达情绪（用动作+道具代替）
✗ 禁止反派有合理的智商表现（他们的功能是送爽点）
✗ 禁止主角实力全部曝光（每集只露一角，留悬念给后集）

请按以下 JSON 格式输出（4-6个场景，节奏极快）：
{
  "hook": "开场钩子（前10秒具体冲突画面，描述动作+台词+情绪，如：婚宴上新娘当众摘下戒指砸在主角脸上）",
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "场景地点",
      "time": "时间（白天/夜晚/黄昏等）",
      "action": "动作描述（人物+场景元素绑定，直接是冲突/爽感动作，禁止铺垫）",
      "dialogue": [
        { "character": "人物名", "line": "台词（≤15字，短促有力，直接表达冲突/爽感）" }
      ]
    }
  ],
  "climax": "本集高潮（主角反击/逆袭/反转的具体行动，要有画面感）",
  "cliffhanger": "结尾钩子（一句话，描述戛然而止的悬念画面，让观众憋屈又期待）"
}`;
}

function buildStoryboardSystemPrompt(): string {
  return `你是一名专业的短剧分镜师，擅长将爽剧剧本转化为高张力的分镜脚本。
每个镜头都要服务于"爽感输出"，镜头语言要强化情绪而非仅记录动作。

${buildStoryboardSkills()}

请严格以 JSON 格式输出，不要有任何其他文字。`;
}

function buildStoryboardPrompt(script: ScriptContent, episodeNumber: number, analysis?: NovelAnalysis | null): string {
  return `将以下短剧剧本转化为分镜脚本，输出的分镜将直接用于 AI 文生视频模型生成视频。
${buildCharacterProfiles(analysis)}
剧本内容：
${JSON.stringify(script, null, 2)}

【景别选项】全景 / 中景 / 近景 / 特写 / 大远景
【运镜选项】固定 / 推镜 / 拉镜 / 摇镜 / 移镜 / 跟镜 / 升镜 / 降镜

【分镜要求】
1. 所有镜头 duration 之和在 60~120 秒之间（目标 90 秒）。
2. 每个镜头时长固定 5 秒，镜头数量 12~24 个。
3. description：面向 AI 图像生成，40-80 字，包含：画面主体、构图、动作细节、光线质感、情绪氛围。
4. 冲突/爽点场景优先用特写+仰拍/俯拍强化情绪；逆袭时切迎光+平拍。
5. characters 填该镜头出现的角色名（与档案名称一致），无人物则填 []。
6. location 填场景地点名称（与剧本 location 对应）。
7. lighting：时间段+光线质感，如"正午-强对比侧光"、"室内-冷白顶光"、"黄昏-橙红逆光"。
8. mood：单个情绪词，如"压迫"、"解气"、"震惊"、"热血"、"窒息"。
9. notes：特效/转场/音效备注，如"慢动作处理"、"硬切入下一镜"，无则空字符串。

请按以下 JSON 格式输出：
{
  "episodeNumber": ${episodeNumber},
  "shots": [
    {
      "shotNumber": 1,
      "shotType": "近景",
      "cameraMove": "推镜",
      "description": "豪华宴会厅内，男主角低头站在人群边缘，西装廉价起皱，四周衣着光鲜的宾客侧目嘲讽，冷白顶光打在他面上，压抑感拉满",
      "location": "豪华宴会厅",
      "lighting": "室内-冷白顶光",
      "characters": ["主角名"],
      "mood": "压抑",
      "dialogue": "",
      "duration": 5.0,
      "notes": "慢速推进，强调人物孤立感"
    }
  ]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 导出函数
// ─────────────────────────────────────────────────────────────────────────────

export async function* analyzeNovelStream(text: string): AsyncGenerator<string> {
  const truncated = text.slice(0, 60000);

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    system: buildAnalysisSystemPrompt(),
    messages: [{ role: "user", content: buildAnalysisUserPrompt(truncated) }],
  });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  } catch (e) {
    // If stream terminated due to max_tokens, we still have all chunks — just stop
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("max_tokens") && !msg.includes("terminated")) throw e;
  }
}

export async function analyzeNovel(text: string): Promise<NovelAnalysis> {
  const truncated = text.slice(0, 60000);

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    system: buildAnalysisSystemPrompt(),
    messages: [{ role: "user", content: buildAnalysisUserPrompt(truncated) }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return parseJSON<NovelAnalysis>(content.text);
}

export async function generateScript(
  analysis: NovelAnalysis,
  episodeNum: number,
  totalEpisodes: number = 10
): Promise<ScriptContent> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 40960,
    system: buildScriptSystemPrompt(),
    messages: [{ role: "user", content: buildScriptUserPrompt(analysis, episodeNum, totalEpisodes) }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return parseJSON<ScriptContent>(content.text);
}

export async function* generateScriptStream(
  analysis: NovelAnalysis,
  episodeNum: number,
  totalEpisodes: number = 10
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 40960,
    system: buildScriptSystemPrompt(),
    messages: [{ role: "user", content: buildScriptUserPrompt(analysis, episodeNum, totalEpisodes) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export async function generateStoryboard(
  script: ScriptContent,
  episodeNumber: number,
  analysis?: NovelAnalysis | null,
): Promise<StoryboardData> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 81920,
    system: buildStoryboardSystemPrompt(),
    messages: [{ role: "user", content: buildStoryboardPrompt(script, episodeNumber, analysis) }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return parseJSON<StoryboardData>(content.text);
}

export async function* generateStoryboardStream(
  script: ScriptContent,
  episodeNumber: number,
  analysis?: NovelAnalysis | null,
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 81920,
    system: buildStoryboardSystemPrompt(),
    messages: [{ role: "user", content: buildStoryboardPrompt(script, episodeNumber, analysis) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 漫画分镜生成
// ─────────────────────────────────────────────────────────────────────────────

function buildMangaStoryboardPrompt(
  script: ScriptContent,
  episodeNumber: number,
  analysis?: NovelAnalysis | null,
): string {
  return `将以下短剧剧本转化为漫画分镜脚本。你必须以真正的漫画思维来创作，而不是简单地把视频分镜翻译成图片。

漫画的核心语言：
- 格子本身就是叙事单元：大格=震撼/高潮，中格=推进，小格=快节奏连击/反应
- 信息分层传递：画面+对话气泡+思想云+音效+表情符号同时存在同一格内
- 夸张表达：人物情绪靠动感线、汗水、惊叹号眼、爆裂纹等视觉化表达
- 节奏控制：数个小格连拍动作→一个大格爆发，形成视觉节拍感

${buildCharacterProfiles(analysis)}

剧本内容：
${JSON.stringify(script, null, 2)}

【分镜要求】
1. 每集生成 10-16 格，聚焦强情绪、强冲突画面，跳过过渡性叙述
2. panelSize：
   - "big"：逆袭爆发、震撼揭露、决定性打脸，全宽大格
   - "medium"：常规对话、动作推进
   - "small"：快速连击、连续反应、拟声强调，一行多格
3. description（中文）：50-80字，描述画面构图、人物位置、动作、表情夸张程度，是给 SD 的中文说明
4. prompt（英文）：直接给 Stable Diffusion 的提示词，必须包含：
   - 风格前缀：manga panel, anime style, cel shading, clean linework, flat colors,
   - 人物：角色外貌关键词+动作+表情
   - 场景：背景环境简洁描述
   - 构图：close-up / medium shot / wide shot / extreme close-up / bird-eye view
   - 情绪：如 intense expression, shock lines, sweat drops, dramatic shadow, speed lines
   - 以 || 分隔负面提示词：|| photorealistic, 3d render, blurry, low quality, watermark, extra limbs
5. dialogue：对话气泡台词（中文原文），多人对话用"|"分隔，如 "住手！|凭什么？"，无台词则省略
6. innerMonologue：人物内心独白（中文），用思想云框展示，如 "他居然来了..."，无则省略
7. sfx：画面音效/拟声词（中文），如 "咚！" "轰！" "嘶——" "啪！"，无则省略
8. expressionType：核心表情类型（中文），如 "震惊脸" "愤怒" "得意冷笑" "泪目" "崩溃" "死鱼眼"
9. mood：单个情绪词，如 "压迫" "解气" "震惊" "热血" "悲壮"
10. characters：该格出现的角色名列表，无人物则填 []

请按以下 JSON 格式输出：
{
  "episodeNumber": ${episodeNumber},
  "panels": [
    {
      "panelNumber": 1,
      "panelSize": "small",
      "description": "特写宴会厅入口，男主低头走进来，衣着寒酸，周围宾客侧目嘲讽，表情夸张轻蔑",
      "prompt": "manga panel, anime style, cel shading, clean linework, flat colors, young man in cheap suit entering luxurious banquet hall, head down, surrounded by mocking guests pointing at him, medium shot, dramatic lighting, oppressive atmosphere || photorealistic, 3d render, blurry, low quality, watermark",
      "characters": ["男主"],
      "mood": "压迫",
      "dialogue": "哈，他也配来这里？",
      "expressionType": "轻蔑嘲讽"
    },
    {
      "panelNumber": 2,
      "panelSize": "small",
      "description": "男主握紧拳头特写，眼睛低垂，汗水，忍耐情绪",
      "prompt": "manga panel, anime style, cel shading, clean linework, flat colors, extreme close-up clenched fist, sweat drops, tense knuckles, anger suppressed, speed lines, dark dramatic shadow || photorealistic, 3d render, blurry, low quality",
      "characters": ["男主"],
      "mood": "压抑",
      "sfx": "嘎——",
      "expressionType": "忍耐"
    },
    {
      "panelNumber": 3,
      "panelSize": "big",
      "description": "男主猛然抬头，眼神锐利如刀，放射状速度线从他眼睛爆发，对面反派脸色骤变，全场震惊",
      "prompt": "manga panel, anime style, cel shading, clean linework, flat colors, dramatic close-up male protagonist suddenly looking up, sharp intense eyes, radial speed lines exploding outward, villain pale with shock background, everyone frozen, extreme close-up, powerful energy burst, manga shock effect || photorealistic, 3d render, blurry, low quality, watermark",
      "characters": ["男主", "反派"],
      "mood": "解气",
      "dialogue": "说够了吗。",
      "innerMonologue": "忍够了。",
      "sfx": "轰！",
      "expressionType": "震惊脸",
      "panelSize": "big"
    }
  ]
}`;
}

export async function* generateMangaStoryboardStream(
  script: ScriptContent,
  episodeNumber: number,
  analysis?: NovelAnalysis | null,
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 32000,
    system: `你是一名专业漫画分镜师，精通日式漫画创作语言。你的任务是将剧本转化为真正意义上的漫画格脚本。
你深刻理解漫画的叙事语言：格子大小即叙事权重、气泡与思想云承载不同心理层次、音效拟声词强化节奏感、夸张表情符号是漫画的灵魂。
每一格都必须是一个完整的情绪单元，有构图、有情绪、有文字层次。
请严格以 JSON 格式输出，不要有任何其他文字。`,
    messages: [{ role: "user", content: buildMangaStoryboardPrompt(script, episodeNumber, analysis) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export async function generateMangaStoryboard(
  script: ScriptContent,
  episodeNumber: number,
  analysis?: NovelAnalysis | null,
): Promise<MangaStoryboard> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 32000,
    system: `你是一名专业漫画分镜师，精通日式漫画创作语言。你的任务是将剧本转化为真正意义上的漫画格脚本。
你深刻理解漫画的叙事语言：格子大小即叙事权重、气泡与思想云承载不同心理层次、音效拟声词强化节奏感、夸张表情符号是漫画的灵魂。
每一格都必须是一个完整的情绪单元，有构图、有情绪、有文字层次。
请严格以 JSON 格式输出，不要有任何其他文字。`,
    messages: [{ role: "user", content: buildMangaStoryboardPrompt(script, episodeNumber, analysis) }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return parseJSON<MangaStoryboard>(content.text);
}
