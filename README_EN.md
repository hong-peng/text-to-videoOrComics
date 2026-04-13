<div align="center">

# 📖➡️🎬 Novel to Video / Comics

**Turn novel chapters into short videos or manga — fully AI-automated, no editing experience needed**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![Claude](https://img.shields.io/badge/AI-Claude%20Opus%204-orange?logo=anthropic)](https://www.anthropic.com/)
[![Stars](https://img.shields.io/github/stars/hong-peng/text-to-videoOrComics?style=social)](https://github.com/hong-peng/text-to-videoOrComics)

**[中文](./README.md) · [English](./README_EN.md)**

</div>

---

> Upload a passage of novel text — Claude automatically analyzes character appearances, scene atmosphere, and plot pacing, generates a screenplay and storyboard, then AI image/video models produce content frame by frame, finally compositing a complete short-video episode or manga page.

## ✨ Features

### Two Creation Modes

| | Short Video Mode | Manga Mode |
|---|---|---|
| Input | Novel text (TXT / PDF / EPUB) | Novel text (TXT / PDF / EPUB) |
| AI Analysis | Claude extracts characters, scenes, plot | Claude extracts characters, scenes, plot |
| Screenplay | Hook–Climax–Cliffhanger structure | Hook–Climax–Cliffhanger structure |
| Storyboard | 12–24 shots (5 s each) | 10–16 manga panels (dialogue / monologue / SFX) |
| Generation | Seedance / Runway / Kling / Flow2API | SD local / Doubao Seedream 4.0 / 4.5 |
| Output | Full MP4 | Individual PNGs per panel |

### Core Highlights

- **Character & Scene Modeling** — series-level shared reference images for visual consistency across episodes
- **True Manga Language** — speech bubbles, thought clouds, onomatopoeia SFX, expression types, panel sizes (large / medium / small)
- **Style Lock** — fixed seed / steps / cfg ensures batch-generated images look consistent
- **Multi-provider Switching** — swap image and video providers from the UI, no code changes needed
- **Streaming Output** — all long tasks stream via SSE, UI stays responsive

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14

### One-command Setup

```bash
git clone https://github.com/hong-peng/text-to-videoOrComics.git
cd text-to-videoOrComics
npm install
cp .env.example .env   # fill in your API keys
createdb drama_platform
npx prisma db push && npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and you're good to go.

### Minimum Config (only 3 keys required)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/drama_platform"
ANTHROPIC_API_KEY="sk-ant-..."      # Claude analysis & screenplay generation
SEEDANCE_API_KEY="..."              # Doubao image + video (register at Volcengine)
```

> See [`.env.example`](.env.example) for the full variable reference.

## 🎯 Workflow

### Short Video Mode

```
New Series (select "Short Video") → Upload novel
  ↓
Step 2: Content Analysis  →  Optional: Character & Scene Modeling
  ↓
Step 3: Generate Screenplay
  ↓
Step 4: Generate Storyboard  →  Generate videos (per-shot or batch)  →  Composite MP4
```

### Manga Mode

```
New Series (select "Manga") → Upload novel
  ↓
Step 2: Content Analysis  →  Optional: Character & Scene Modeling
  ↓
Step 3: Generate Screenplay
  ↓
Step 4: Generate Manga Storyboard  →  Generate all images / per-panel
```

> Character/scene modeling results are shared across all episodes within the same series.

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 + React 19 (App Router + Turbopack) |
| Database | PostgreSQL + Prisma ORM |
| AI Analysis/Generation | Anthropic Claude (claude-opus-4-6 / claude-haiku-4-5) |
| Image Generation | Stable Diffusion (local) / Doubao Seedream 4.0 / 4.5 (cloud) |
| Video Generation | Seedance / Runway / Kling / Flow2API |
| Video Compositing | ffmpeg (fluent-ffmpeg, bundled — no manual install) |
| Styling | TailwindCSS v4 |

## 🖼 Image Providers

| Provider | Notes | Required Config |
|----------|-------|----------------|
| SD (local) | Runs a local Python service — fast, no quota limits | `SD_BASE_URL` (default `http://127.0.0.1:5000`) |
| Doubao Seedream 4.0 | Cloud API, no local setup needed | `SEEDANCE_API_KEY` |
| Doubao Seedream 4.5 | Cloud API, higher image quality | `SEEDANCE_API_KEY` |

> Doubao model API keys (Seedream image / Seedance video) are obtained by registering at [Volcengine](https://www.volcengine.com/).

### Starting Stable Diffusion (optional)

Only required when using SD local mode. Installation guide: [https://github.com/hong-peng/generate-images](https://github.com/hong-peng/generate-images)

## 🎬 Video Providers

Set the default provider via the `DEFAULT_PROVIDER` environment variable:

| Provider | `DEFAULT_PROVIDER` value | Required Variables |
|----------|--------------------------|--------------------|
| Seedance | `seedance` (default) | `SEEDANCE_API_KEY`, `SEEDANCE_MODEL` |
| Runway | `runway` | `RUNWAY_API_KEY` |
| Kling | `kling` | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` |
| Flow2API | `flow2api` | `FLOW2API_BASE_URL`, `FLOW2API_API_KEY` |

## ❓ FAQ

**Q: Request timeout?**  
All long tasks use SSE streaming with `export const maxDuration = 300`. When deploying to Vercel, make sure your plan supports this timeout duration.

**Q: Prisma `Unknown argument` error?**  
Run `npx prisma generate`, then stop and restart the dev server (clear the cache first: `rm -rf .next`).

**Q: SD modeling says "service not started"?**  
Visit `${SD_BASE_URL}/health` to confirm the service is running, or switch to Doubao Seedream cloud mode.

**Q: Video compositing failed?**  
Make sure all storyboard shots have finished generating (status `completed`). The composite button will warn you if any shots are incomplete.

**Q: Manga image styles are inconsistent?**  
All panels share fixed style prefix, negative prompts, and sampling parameters (seed/steps/cfg). If inconsistency persists, check that the SD model version is the same, or switch to Seedream cloud API.

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   ├── script/           # Content analysis, screenplay generation
│   │   ├── storyboard/       # Video storyboard generation & saving
│   │   ├── manga/            # Manga storyboard generation, image generation (single/batch)
│   │   ├── models/           # Character/scene modeling (SD / Seedream)
│   │   └── video/            # Video generation & compositing
│   └── series/[seriesId]/
│       └── part/[partId]/    # Core 4-step work page
├── lib/
│   ├── claude.ts             # Claude analysis / screenplay / storyboard / manga generation
│   ├── sd.ts                 # Stable Diffusion interface
│   ├── providers/
│   │   ├── seedance.ts       # Video: Doubao Seedance
│   │   ├── seedream.ts       # Image: Doubao Seedream 4.0 / 4.5
│   │   ├── runway.ts
│   │   └── kling.ts
│   └── script/
│       ├── types.ts          # Screenplay / analysis core types
│       └── mangaTypes.ts     # Manga panel data types
├── prisma/schema.prisma      # Database schema
└── .env.example              # Environment variable template
```

## License

MIT

---

<div align="center">

If this project helps you, welcome to star ⭐️

</div>
