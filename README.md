# 小说转短视频 / 漫画平台

将小说文本自动改编为短视频剧集或漫画的 AI 全流程平台。支持两种创作模式：

- **短视频模式**：上传小说 → AI 分析 → 生成剧本 → 生成分镜脚本 → AI 文生视频 → 合成导出
- **漫画模式**：上传小说 → AI 分析 → 生成剧本 → 生成漫画分镜 → 逐格生成图片

## 功能概览

### 通用（两种模式共享）

- **内容分析**：Claude 自动提取人物（外貌/性别/年龄/性格/气质）、场景（固定/流动/叙事功能）、情节要点
- **剧本生成**：基于人物-场景匹配，生成钩子-高潮-悬念结构的短剧剧本
- **角色 & 场景建模**：生成角色/场景参考图，系列级共享，保持跨集视觉一致性
  - 图像服务可选：本地 Stable Diffusion / 豆包 Seedream 4.0 / 豆包 Seedream 4.5

### 短视频模式

- **分镜脚本**：自动生成每集 12-24 个分镜（每镜 5 秒），含景别、运镜、光线、情绪
- **视频生成**：支持 Seedance / Runway / Kling / Flow2API 多个视频大模型，逐镜或批量并发
- **视频合成**：ffmpeg 将所有镜头拼接为完整集数视频

### 漫画模式

- **漫画分镜**：Claude 以真正的漫画语言生成 10-16 格分镜，每格含画面描述、对话气泡、心理独白、音效拟声词、表情类型、格子尺寸（大/中/小）
- **图片生成**：每格独立生成一张图片，风格参数统一锁定保证全集一致性
  - 图像服务可选：本地 Stable Diffusion / 豆包 Seedream 4.0 / 豆包 Seedream 4.5

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 (App Router + Turbopack) |
| 数据库 | PostgreSQL + Prisma ORM |
| AI 分析/生成 | Anthropic Claude (claude-opus-4-6 / claude-haiku-4-5) |
| 图像生成 | Stable Diffusion（本地）/ 豆包 Seedream 4.0 / 4.5（云端） |
| 视频生成 | Seedance / Runway / Kling / Flow2API |
| 视频合成 | ffmpeg (fluent-ffmpeg) |
| 样式 | TailwindCSS v4 |

## 环境要求

- Node.js >= 18
- PostgreSQL >= 14
- ffmpeg（已通过 `ffmpeg-static` 内置，无需手动安装）
- Python >= 3.9（仅使用 SD 本地图像生成时需要）

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/hong-peng/text-to-videoOrComics.git
cd text-to-videoOrComics
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入以下配置：

```env
# 数据库（必填）
DATABASE_URL="postgresql://user:password@localhost:5432/drama_platform"

# Anthropic Claude（必填）
ANTHROPIC_API_KEY="sk-ant-..."

# 图像生成（二选一，或均配置）
# 豆包 Seedream（推荐，无需本地安装）
SEEDANCE_API_KEY="..."         # 与 Seedance 视频 API 共用同一 Key

# 视频生成服务商（至少配置一个，短视频模式使用）
SEEDANCE_API_KEY="..."
RUNWAY_API_KEY="..."
KLING_ACCESS_KEY="..."
KLING_SECRET_KEY="..."
```

完整变量说明见 [`.env.example`](.env.example)。

### 4. 创建数据库

```bash
createdb drama_platform
npx prisma db push
npx prisma generate
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

### 6. 启动 Stable Diffusion 服务（可选）

仅在选择 SD 本地图像生成时需要。安装说明：[https://github.com/hong-peng/generate-images](https://github.com/hong-peng/generate-images)

接口规范：

| 路由 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/generate` | POST (JSON) | 文生图，返回 `{ images: [{ filename, data: base64 }] }` |
| `/generate/img2img` | POST (multipart) | 图生图，含 `image` 文件 + `denoise`，返回同上 |

默认地址 `http://127.0.0.1:5000`，可通过 `SD_BASE_URL` 修改。

## 使用流程

### 短视频模式

```
新建系列（选"生成短视频"）→ 创建子项目 → 上传小说
  ↓
Step 2：内容分析 → 可选：角色 & 场景建模（SD / Seedream）
  ↓
Step 3：生成剧本
  ↓
Step 4：生成分镜脚本 → 逐镜或批量生成视频 → 合成完整集数
```

### 漫画模式

```
新建系列（选"生成漫画"）→ 创建子项目 → 上传小说
  ↓
Step 2：内容分析 → 可选：角色 & 场景建模（SD / Seedream）
  ↓
Step 3：生成剧本
  ↓
Step 4：生成漫画分镜（含对话/独白/音效/表情/格子大小）
        → 全部生成图片 或 逐格生成
```

> 角色/场景建模在 Step 2 完成后进行，建模结果在同一系列的所有子项目之间共享。

## 目录结构

```
├── app/
│   ├── api/
│   │   ├── script/           # 内容分析、剧本生成
│   │   ├── storyboard/       # 视频分镜生成与保存
│   │   ├── manga/            # 漫画分镜生成、图片生成（单格/批量）
│   │   ├── models/           # 角色/场景建模（SD / Seedream）
│   │   └── video/            # 视频生成与合成
│   └── series/[seriesId]/
│       └── part/[partId]/    # 核心四步工作页面
├── lib/
│   ├── claude.ts             # Claude 分析/剧本/分镜/漫画分镜生成
│   ├── sd.ts                 # Stable Diffusion 接口封装
│   ├── config.ts             # 服务商配置
│   ├── parsers/              # PDF / EPUB / TXT 文件解析
│   ├── providers/            # 视频/图像服务商适配层
│   │   ├── seedance.ts       # 视频：豆包 Seedance
│   │   ├── seedream.ts       # 图像：豆包 Seedream 4.0 / 4.5
│   │   ├── runway.ts
│   │   └── kling.ts
│   └── script/
│       ├── types.ts          # 剧本/分析核心类型
│       └── mangaTypes.ts     # 漫画格数据类型
├── components/
│   ├── upload/FileUploader.tsx
│   ├── script/ScriptPreview.tsx
│   └── storyboard/StoryboardGrid.tsx
├── prisma/schema.prisma      # 数据库 Schema
└── .env.example              # 环境变量模板
```

## 图像生成服务商

建模和漫画图片生成均支持以下服务商，可在 UI 中按需切换：

| 服务商 | 说明 | 所需配置 |
|--------|------|---------|
| SD（本地） | 需本地运行 Python 服务，速度快，无额度限制 | `SD_BASE_URL`（默认 `http://127.0.0.1:5000`） |
| 豆包 Seedream 4.0 | 云端 API，无需本地安装 | `SEEDANCE_API_KEY` |
| 豆包 Seedream 4.5 | 云端 API，画质更优 | `SEEDANCE_API_KEY` |

> **注意**：豆包系列模型（Seedream 图像 / Seedance 视频）的 API Key 均通过[火山引擎](https://www.volcengine.com/)注册获取。

## 视频生成服务商（短视频模式）

通过 `DEFAULT_PROVIDER` 环境变量选择默认服务商：

| 服务商 | `DEFAULT_PROVIDER` 值 | 所需变量 |
|--------|----------------------|---------|
| Seedance | `seedance`（默认） | `SEEDANCE_API_KEY`, `SEEDANCE_MODEL` |
| Runway | `runway` | `RUNWAY_API_KEY` |
| 快手可灵 | `kling` | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` |
| Flow2API | `flow2api` | `FLOW2API_BASE_URL`, `FLOW2API_API_KEY` |

## 数据库操作

```bash
# 推送 schema 变更到数据库
npx prisma db push

# 修改 schema.prisma 后重新生成 Client
npx prisma generate

# 可视化查看数据
npx prisma studio
```

> **注意**：修改 `schema.prisma` 后，必须执行 `npx prisma generate` 并**重启开发服务器**，否则 Turbopack 会缓存旧版 Client 导致报错。

## 常见问题

**Q: 接口请求超时？**  
所有长任务均使用 SSE 流式输出，并配置 `export const maxDuration = 300`。Vercel 部署请确认 Plan 支持该超时时长。

**Q: Prisma 报 `Unknown argument` 错误？**  
执行 `npx prisma generate`，然后停止并重启开发服务器（需清除 `.next` 缓存：`rm -rf .next`）。

**Q: SD 建模报"服务未启动"？**  
访问 `${SD_BASE_URL}/health` 确认服务已运行，或切换到豆包 Seedream 云端模式。

**Q: 视频合成失败？**  
确认所有分镜视频均已生成完成（状态 `completed`）。合成按钮在有未完成镜头时会给出提示。

**Q: 漫画图片风格不一致？**  
所有格共享固定的风格前缀、负面词和采样参数（seed/steps/cfg），若仍有差异请检查 SD 模型版本是否一致，或改用 Seedream 云端 API。

## License

MIT
