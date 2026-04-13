<div align="center">

# 📖➡️🎬 Novel to Video / Comics

**把小说章节一键转成短视频或漫画，全程 AI 自动化，无需剪辑经验**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![Claude](https://img.shields.io/badge/AI-Claude%20Opus%204-orange?logo=anthropic)](https://www.anthropic.com/)
[![Stars](https://img.shields.io/github/stars/hong-peng/text-to-videoOrComics?style=social)](https://github.com/hong-peng/text-to-videoOrComics)

**[中文](./README.md) · [English](./README_EN.md)**

</div>

---

> 上传一段小说文本，Claude 自动分析人物外貌、场景氛围、情节节奏，生成剧本和分镜，再由 AI 图像/视频模型逐帧生成内容，最终合成完整短视频集或漫画页。

## ✨ 功能概览

### 两种创作模式

| | 短视频模式 | 漫画模式 |
|---|---|---|
| 输入 | 小说文本（TXT / PDF / EPUB） | 小说文本（TXT / PDF / EPUB） |
| AI 分析 | Claude 提取人物、场景、情节 | Claude 提取人物、场景、情节 |
| 剧本 | 钩子-高潮-悬念结构 | 钩子-高潮-悬念结构 |
| 分镜 | 12–24 个镜头（每镜 5 秒） | 10–16 格漫画（含对话/独白/音效） |
| 生成 | Seedance / Runway / Kling / Flow2API | SD 本地 / 豆包 Seedream 4.0 / 4.5 |
| 输出 | 合成完整 MP4 | 每格独立 PNG |

### 核心特性

- **角色 & 场景建模**：系列级共享参考图，保持跨集视觉一致性
- **漫画深度语言**：对话气泡、心理独白云、音效拟声词、表情类型、格子大小（大/中/小）
- **风格锁定**：固定 seed / steps / cfg，批量生图风格统一
- **多服务商切换**：图像和视频提供商均可在 UI 中按需切换，无需改代码
- **流式输出**：所有长任务 SSE 实时进度，不卡界面

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- PostgreSQL >= 14

### 一键安装

```bash
git clone https://github.com/hong-peng/text-to-videoOrComics.git
cd text-to-videoOrComics
npm install
cp .env.example .env   # 填入 API Key
createdb drama_platform
npx prisma db push && npx prisma generate
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 即可使用。

### 最少配置（只需 3 个 Key）

```env
DATABASE_URL="postgresql://user:password@localhost:5432/drama_platform"
ANTHROPIC_API_KEY="sk-ant-..."      # Claude 分析与剧本生成
SEEDANCE_API_KEY="..."              # 豆包图像 + 视频（火山引擎注册获取）
```

> 完整变量说明见 [`.env.example`](.env.example)。

## 🎯 使用流程

### 短视频模式

```
新建系列（选"生成短视频"）→ 上传小说
  ↓
Step 2：内容分析  →  可选：角色 & 场景建模
  ↓
Step 3：生成剧本
  ↓
Step 4：生成分镜  →  逐镜 / 批量生成视频  →  合成 MP4
```

### 漫画模式

```
新建系列（选"生成漫画"）→ 上传小说
  ↓
Step 2：内容分析  →  可选：角色 & 场景建模
  ↓
Step 3：生成剧本
  ↓
Step 4：生成漫画分镜  →  全部生图 / 逐格生图
```

> 角色/场景建模结果在同一系列的所有子项目之间共享。

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 (App Router + Turbopack) |
| 数据库 | PostgreSQL + Prisma ORM |
| AI 分析/生成 | Anthropic Claude (claude-opus-4-6 / claude-haiku-4-5) |
| 图像生成 | Stable Diffusion（本地）/ 豆包 Seedream 4.0 / 4.5（云端） |
| 视频生成 | Seedance / Runway / Kling / Flow2API |
| 视频合成 | ffmpeg (fluent-ffmpeg，已内置无需手动安装) |
| 样式 | TailwindCSS v4 |

## 🖼 图像生成服务商

| 服务商 | 说明 | 所需配置 |
|--------|------|---------|
| SD（本地） | 需本地运行 Python 服务，速度快，无额度限制 | `SD_BASE_URL`（默认 `http://127.0.0.1:5000`） |
| 豆包 Seedream 4.0 | 云端 API，无需本地安装 | `SEEDANCE_API_KEY` |
| 豆包 Seedream 4.5 | 云端 API，画质更优 | `SEEDANCE_API_KEY` |

> 豆包系列模型（Seedream 图像 / Seedance 视频）的 API Key 均通过[火山引擎](https://www.volcengine.com/)注册获取。

### 启动 Stable Diffusion（可选）

仅在选择 SD 本地模式时需要。安装说明：[https://github.com/hong-peng/generate-images](https://github.com/hong-peng/generate-images)

## 🎬 视频生成服务商

通过 `DEFAULT_PROVIDER` 环境变量选择默认服务商：

| 服务商 | `DEFAULT_PROVIDER` 值 | 所需变量 |
|--------|----------------------|---------|
| Seedance | `seedance`（默认） | `SEEDANCE_API_KEY`, `SEEDANCE_MODEL` |
| Runway | `runway` | `RUNWAY_API_KEY` |
| 快手可灵 | `kling` | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` |
| Flow2API | `flow2api` | `FLOW2API_BASE_URL`, `FLOW2API_API_KEY` |

## ❓ 常见问题

**Q: 接口请求超时？**  
所有长任务均使用 SSE 流式输出，并配置 `export const maxDuration = 300`。Vercel 部署请确认 Plan 支持该超时时长。

**Q: Prisma 报 `Unknown argument` 错误？**  
执行 `npx prisma generate`，然后停止并重启开发服务器（需清除缓存：`rm -rf .next`）。

**Q: SD 建模报"服务未启动"？**  
访问 `${SD_BASE_URL}/health` 确认服务已运行，或切换到豆包 Seedream 云端模式。

**Q: 视频合成失败？**  
确认所有分镜视频均已生成完成（状态 `completed`）。合成按钮在有未完成镜头时会给出提示。

**Q: 漫画图片风格不一致？**  
所有格共享固定的风格前缀、负面词和采样参数（seed/steps/cfg），若仍有差异请检查 SD 模型版本是否一致，或改用 Seedream 云端 API。

## 📁 目录结构

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
│   ├── providers/
│   │   ├── seedance.ts       # 视频：豆包 Seedance
│   │   ├── seedream.ts       # 图像：豆包 Seedream 4.0 / 4.5
│   │   ├── runway.ts
│   │   └── kling.ts
│   └── script/
│       ├── types.ts          # 剧本/分析核心类型
│       └── mangaTypes.ts     # 漫画格数据类型
├── prisma/schema.prisma      # 数据库 Schema
└── .env.example              # 环境变量模板
```

## License

MIT

---

<div align="center">

如果这个项目对你有帮助，欢迎点个 Star ⭐️ 支持一下！

</div>
