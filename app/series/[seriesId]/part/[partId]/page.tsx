"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileUploader } from "@/components/upload/FileUploader";
import { ScriptPreview } from "@/components/script/ScriptPreview";
import { StoryboardGrid } from "@/components/storyboard/StoryboardGrid";
import { SEEDANCE_MODELS, DEFAULT_SEEDANCE_MODEL } from "@/lib/providers/seedance";
import { SEEDREAM_MODELS } from "@/lib/providers/seedream";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Shot {
  id: string;
  shotNumber: number;
  shotType: string;
  cameraMove: string;
  description: string;
  dialogue: string;
  duration: number;
  notes: string;
  videoUrl?: string;
  videoStatus?: string;
  videoTaskId?: string;
}

interface MangaPanel {
  id: string;
  panelNumber: number;
  description: string;
  prompt: string;
  characters: string[];
  mood: string;
  dialogue?: string;
  innerMonologue?: string;
  sfx?: string;
  expressionType?: string;
  panelSize?: string;
  imageStatus: string;
  imageUrl?: string;
}

interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  scriptContent: Record<string, unknown>;
  mergedVideoUrl?: string;
  shots: Shot[];
  mangaPanels: MangaPanel[];
}

interface Analysis {
  id: string;
  characters: unknown[];
  scenes: unknown[];
  plotPoints: unknown[];
}

interface CharacterModel {
  id: string;
  entityType: string;
  name: string;
  version: number;
  prompt: string;
  imageUrl: string;
  isActive: boolean;
  sourcePartId: string | null;
  createdAt: string;
}

interface Upload {
  id: string;
  filename: string;
  fileType: string;
  rawText: string;
}

interface Project {
  id: string;
  seriesId: string;
  name: string;
  status: string;
  series: { type: string };
  uploads: Upload[];
  analyses: Analysis[];
  episodes: Episode[];
}

type Step = "upload" | "analyze" | "script" | "video";

// ─── Step config ─────────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string; desc: string; icon: string }[] = [
  { key: "upload", label: "上传小说", desc: "TXT / PDF / EPUB / MD", icon: "①" },
  { key: "analyze", label: "内容分析", desc: "人物 · 场景 · 情节", icon: "②" },
  { key: "script", label: "生成剧本", desc: "钩子 · 高潮 · 悬念", icon: "③" },
  { key: "video", label: "生成输出", desc: "分镜 · 合成 · 导出", icon: "④" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PartPage() {
  const params = useParams();
  const seriesId = params.seriesId as string;
  const partId = params.partId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const stepInitialized = useRef(false);

  // loading states
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStream, setAnalyzeStream] = useState("");
  // 重新分析时临时隐藏旧结果，null = 隐藏旧结果，undefined = 未覆盖（使用 project 数据）
  const [analysisCleared, setAnalysisCleared] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [mergingVideo, setMergingVideo] = useState(false);

  // 漫画模式
  const [generatingMangaStoryboard, setGeneratingMangaStoryboard] = useState(false);
  const [mangaStoryboardStream, setMangaStoryboardStream] = useState("");
  const [generatingMangaImages, setGeneratingMangaImages] = useState(false);
  const [mangaImageDoneCount, setMangaImageDoneCount] = useState(0);
  const [generatingMangaPanelIds, setGeneratingMangaPanelIds] = useState<Set<string>>(new Set());

  // stream buffers
  const [scriptStream, setScriptStream] = useState("");
  const [storyboardStream, setStoryboardStream] = useState("");

  // 人物建模（系列级别共享）
  const [characterModels, setCharacterModels] = useState<CharacterModel[]>([]);
  const [generatingModels, setGeneratingModels] = useState(false);
  const [generatingModelName, setGeneratingModelName] = useState("");
  const [modelImageProvider, setModelImageProvider] = useState<string>("sd");
  const [mangaImageProvider, setMangaImageProvider] = useState<string>("sd");

  async function loadCharacterModels() {
    const res = await fetch(`/api/models?seriesId=${seriesId}`);
    if (res.ok) setCharacterModels(await res.json() as CharacterModel[]);
  }

  async function generateModels(names?: string[]) {
    if (!partId || !project?.analyses[0]) return;
    setGeneratingModels(true);
    setGeneratingModelName("");
    try {
      const res = await fetch("/api/models/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, analysisId: project.analyses[0].id, names, partId, imageProvider: modelImageProvider }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value);
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string;
              name?: string;
              model?: CharacterModel;
            };
            if (evt.type === "model_start" && evt.name) {
              setGeneratingModelName(evt.name);
            } else if (evt.type === "model_done" && evt.model) {
              setGeneratingModelName("");
              setCharacterModels((prev) => {
                const updated = prev.map((m) =>
                  m.name === evt.model!.name ? { ...m, isActive: false } : m
                );
                return [...updated, evt.model!];
              });
            } else if (evt.type === "all_done") {
              setGeneratingModelName("");
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setGeneratingModels(false);
      setGeneratingModelName("");
    }
  }

  // 并发全部生成时：已完成镜头数
  const [batchDoneCount, setBatchDoneCount] = useState(0);
  const [generatingAllVideo, setGeneratingAllVideo] = useState(false);

  async function deleteModel(modelId: string) {
    await fetch(`/api/models/${modelId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partId }),
    });
    await loadCharacterModels();
  }

  // 选择的视频大模型
  const [selectedModel, setSelectedModel] = useState(DEFAULT_SEEDANCE_MODEL);

  // 单镜头生成：正在生成的 shotId 集合
  const [generatingShotIds, setGeneratingShotIds] = useState<Set<string>>(new Set());

  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  useEffect(() => {
    loadProject();
    loadCharacterModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId, seriesId]);

  async function loadProject() {
    const res = await fetch(`/api/projects/${partId}`);
    if (!res.ok) return;
    const data: Project = await res.json();
    setProject(data);
    if (data.episodes.length > 0) setSelectedEpisode(data.episodes[0]);

    // 首次加载时，根据已完成状态自动定位到最深的 step
    if (!stepInitialized.current) {
      stepInitialized.current = true;
      const hasShots = data.episodes.some((e) => e.shots.length > 0);
      const hasMangaPanels = data.episodes.some((e) => e.mangaPanels.length > 0);
      if (hasShots || hasMangaPanels) {
        setStep("video");
      } else if (data.episodes.length > 0) {
        setStep("script");
      } else if (data.analyses.length > 0) {
        setStep("script");
      } else if (data.uploads.length > 0) {
        setStep("analyze");
      } else {
        setStep("upload");
      }
    }
  }

  // ── Step 2: analyze ──────────────────────────────────────────────────────

  async function runAnalysis() {
    if (!partId) return;
    setAnalyzing(true);
    setAnalyzeStream("");
    setAnalysisCleared(true);
    try {
      const res = await fetch("/api/script/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: partId }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; text?: string; analysis?: unknown; error?: string };
            if (event.type === "chunk" && event.text) {
              setAnalyzeStream((prev) => prev + event.text);
            } else if (event.type === "done") {
              await loadProject();
              setAnalysisCleared(false);
            } else if (event.type === "error") {
              console.error("分析失败:", event.error);
              setAnalysisCleared(false);
            }
          } catch { /* skip malformed */ }
        }
      }
    } finally {
      setAnalyzing(false);
      setAnalyzeStream("");
      setAnalysisCleared(false);
    }
  }

  // ── Step 3: script ───────────────────────────────────────────────────────

  async function generateScript(episodeNum: number) {
    if (!partId) return;
    setGeneratingScript(true);
    setScriptStream("");
    try {
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: partId, episodeNumber: episodeNum }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setScriptStream((prev) => prev + decoder.decode(value));
      }
      await loadProject();
    } finally {
      setGeneratingScript(false);
    }
  }

  // ── Step 4: video (storyboard + video) ───────────────────────────────────

  async function generateStoryboard() {
    if (!partId || !selectedEpisode) return;
    setGeneratingStoryboard(true);
    setStoryboardStream("");
    setStep("video");
    try {
      const res = await fetch("/api/storyboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: partId, episodeId: selectedEpisode.id }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setStoryboardStream((prev) => prev + chunk);
      }

      // 客户端解析 JSON 并存库（避免在 ReadableStream 内超时）
      const start = fullText.indexOf("{");
      const end = fullText.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        try {
          let raw = fullText.slice(start, end + 1);
          raw = raw.replace(/,(\s*[}\]])/g, "$1");
          const storyboard = JSON.parse(raw);
          await fetch("/api/storyboard/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: partId, episodeId: selectedEpisode.id, storyboard }),
          });
        } catch {
          // JSON 解析失败静默处理
        }
      }

      await loadProject();
    } finally {
      setGeneratingStoryboard(false);
      setStoryboardStream("");
    }
  }

  async function generateVideo() {
    if (!partId || !selectedEpisode) return;
    setGeneratingAllVideo(true);
    setBatchDoneCount(0);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: partId, episodeId: selectedEpisode.id, seriesId, model: selectedModel }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value);
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; shotId?: string; status?: string; videoUrl?: string };
            if (evt.type === "shot_done") {
              setBatchDoneCount((n) => n + 1);
              // 实时更新单镜头状态（乐观更新）
              if (evt.shotId) {
                setSelectedEpisode((ep) => {
                  if (!ep) return ep;
                  return {
                    ...ep,
                    shots: ep.shots.map((s) =>
                      s.id === evt.shotId
                        ? { ...s, videoStatus: evt.status ?? s.videoStatus, videoUrl: evt.videoUrl ?? s.videoUrl }
                        : s
                    ),
                  };
                });
              }
            }
          } catch { /* skip */ }
        }
      }
      await loadProject();
    } finally {
      setGeneratingAllVideo(false);
      setBatchDoneCount(0);
    }
  }

  /** 单镜头生成 */
  async function generateSingleShot(shotId: string) {
    setGeneratingShotIds((s) => new Set(s).add(shotId));
    try {
      const res = await fetch("/api/video/generate/shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, seriesId, model: selectedModel }),
      });
      const data = await res.json() as { status?: string; videoUrl?: string };
      // 实时更新该镜头状态
      setSelectedEpisode((ep) => {
        if (!ep) return ep;
        return {
          ...ep,
          shots: ep.shots.map((s) =>
            s.id === shotId
              ? { ...s, videoStatus: data.status ?? s.videoStatus, videoUrl: data.videoUrl ?? s.videoUrl }
              : s
          ),
        };
      });
    } finally {
      setGeneratingShotIds((s) => {
        const next = new Set(s);
        next.delete(shotId);
        return next;
      });
    }
  }

  // ── 漫画分镜 ─────────────────────────────────────────────────────────────

  async function generateMangaStoryboard() {
    if (!partId || !selectedEpisode) return;
    setGeneratingMangaStoryboard(true);
    setMangaStoryboardStream("");
    setStep("video");
    try {
      const res = await fetch("/api/manga/storyboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: partId, episodeId: selectedEpisode.id }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setMangaStoryboardStream((prev) => prev + chunk);
      }
      // 解析并保存
      try {
        const jsonStart = fullText.indexOf("{");
        if (jsonStart !== -1) {
          let raw = fullText.slice(jsonStart);
          const jsonEnd = raw.lastIndexOf("}");
          if (jsonEnd !== -1) raw = raw.slice(0, jsonEnd + 1);
          raw = raw.replace(/,(\s*[}\]])/g, "$1");
          const storyboard = JSON.parse(raw);
          await fetch("/api/manga/storyboard/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ episodeId: selectedEpisode.id, panels: storyboard.panels }),
          });
        }
      } catch { /* 静默 */ }
      await loadProject();
    } finally {
      setGeneratingMangaStoryboard(false);
      setMangaStoryboardStream("");
    }
  }

  async function generateAllMangaImages() {
    if (!selectedEpisode) return;
    setGeneratingMangaImages(true);
    setMangaImageDoneCount(0);
    try {
      const res = await fetch("/api/manga/image/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: selectedEpisode.id, imageProvider: mangaImageProvider }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value);
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; panelId?: string; imageUrl?: string };
            if (evt.type === "done" && evt.panelId) {
              setMangaImageDoneCount((n) => n + 1);
              setSelectedEpisode((ep) => {
                if (!ep) return ep;
                return {
                  ...ep,
                  mangaPanels: ep.mangaPanels.map((p) =>
                    p.id === evt.panelId
                      ? { ...p, imageStatus: "completed", imageUrl: evt.imageUrl }
                      : p
                  ),
                };
              });
            }
          } catch { /* skip */ }
        }
      }
      await loadProject();
    } finally {
      setGeneratingMangaImages(false);
      setMangaImageDoneCount(0);
    }
  }

  async function generateSingleMangaImage(panelId: string) {
    setGeneratingMangaPanelIds((s) => new Set(s).add(panelId));
    try {
      const res = await fetch("/api/manga/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelId, imageProvider: mangaImageProvider }),
      });
      const data = await res.json() as { imageStatus?: string; imageUrl?: string };
      setSelectedEpisode((ep) => {
        if (!ep) return ep;
        return {
          ...ep,
          mangaPanels: ep.mangaPanels.map((p) =>
            p.id === panelId
              ? { ...p, imageStatus: data.imageStatus ?? p.imageStatus, imageUrl: data.imageUrl ?? p.imageUrl }
              : p
          ),
        };
      });
    } finally {
      setGeneratingMangaPanelIds((s) => {
        const next = new Set(s);
        next.delete(panelId);
        return next;
      });
    }
  }

  async function mergeVideo() {
    if (!partId || !selectedEpisode) return;
    setMergingVideo(true);
    try {
      const res = await fetch("/api/video/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: selectedEpisode.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "合并失败");
      await loadProject();
    } finally {
      setMergingVideo(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  const analysis = analysisCleared ? undefined : project.analyses[0];
  const shots = selectedEpisode?.shots ?? [];
  const mangaPanels = selectedEpisode?.mangaPanels ?? [];
  const isManga = project.series?.type === "manga";

  // step 完成状态
  const stepDone: Record<Step, boolean> = {
    upload: project.uploads.length > 0,
    analyze: project.analyses.length > 0,
    script: project.episodes.length > 0,
    video: isManga ? mangaPanels.length > 0 : shots.length > 0,
  };

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 border-r border-zinc-800 flex flex-col sticky top-0 h-screen">
        {/* 项目标题 */}
        <div className="px-5 py-4 border-b border-zinc-800">
          <Link
            href={`/series/${seriesId}`}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            返回系列
          </Link>
          <h2 className="text-sm font-semibold text-white truncate leading-snug">{project.name}</h2>
          <p className="text-xs text-zinc-600 mt-0.5">{project.episodes.length} 集 · {project.uploads.length} 个文件</p>
        </div>

        {/* 步骤导航 */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {STEPS.map((s) => {
            const active = step === s.key;
            const done = stepDone[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setStep(s.key)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-all group ${
                  active
                    ? "bg-zinc-800 shadow-sm"
                    : "hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    done
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                      : active
                      ? "bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30"
                      : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {done ? "✓" : s.icon}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium leading-tight ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                      {s.label}
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5 truncate">{s.desc}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* 进度指示 */}
        <div className="px-5 py-4 border-t border-zinc-800">
          <div className="flex justify-between text-xs text-zinc-600 mb-2">
            <span>进度</span>
            <span>{Object.values(stepDone).filter(Boolean).length} / 4</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <div key={s.key} className={`flex-1 h-1 rounded-full transition-colors ${stepDone[s.key] ? "bg-emerald-500" : step === s.key ? "bg-indigo-500" : "bg-zinc-800"}`} />
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">

          {/* ── Step 1: 上传 ── */}
          {step === "upload" && (
            <div>
              <StepHeader
                step={1}
                title="上传小说文件"
                desc="支持 TXT、PDF、EPUB、Markdown 格式"
              />
              <FileUploader
                projectId={partId}
                onSuccess={() => {
                  loadProject();
                  setStep("analyze");
                }}
              />
              {project.uploads.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">已上传文件</p>
                  {project.uploads.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                      <span className="text-xs font-mono uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                        {u.fileType}
                      </span>
                      <span className="text-sm flex-1 truncate">{u.filename}</span>
                      <span className="text-xs text-zinc-600 shrink-0">
                        {u.rawText?.length.toLocaleString()} 字
                      </span>
                      <button
                        onClick={async () => {
                          await fetch(`/api/upload/${u.id}`, { method: "DELETE" });
                          loadProject();
                        }}
                        className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors p-1 rounded"
                        title="删除"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 3.5h10M5.5 3.5V2.5h3v1M6 6v4M8 6v4M3.5 3.5l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                  <div className="pt-2">
                    <button
                      onClick={() => setStep("analyze")}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      下一步：分析内容 →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: 分析 ── */}
          {step === "analyze" && (
            <div>
              <StepHeader
                step={2}
                title="内容分析"
                desc="Claude 自动提取人物关系、场景信息与情节脉络"
              />

              {!analysis ? (
                analyzing ? (
                  /* ── 流式输出进度区域 ── */
                  (() => {
                    // 从不完整 JSON 中尝试提取已识别的人物和场景
                    const streamChars: { name: string; gender?: string; age?: string; description?: string; traits?: string[] }[] = [];
                    const streamScenes: { location: string; description?: string; mood?: string }[] = [];
                    try {
                      // 提取每个角色对象中的字段
                      const charMatches = analyzeStream.matchAll(/\{[^{}]*?"name"\s*:\s*"([^"]+)"[^{}]*?\}/g);
                      for (const m of charMatches) {
                        const obj = m[0];
                        const desc = obj.match(/"description"\s*:\s*"([^"]*)"/)?.[1];
                        const gender = obj.match(/"gender"\s*:\s*"([^"]*)"/)?.[1];
                        const age = obj.match(/"age"\s*:\s*"([^"]*)"/)?.[1];
                        const traitsRaw = obj.match(/"traits"\s*:\s*\[([^\]]*)\]/)?.[1];
                        const traits = traitsRaw ? traitsRaw.match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [] : [];
                        streamChars.push({ name: m[1], description: desc, gender, age, traits });
                      }
                      // 提取 scenes
                      const sceneMatches = analyzeStream.matchAll(/"location"\s*:\s*"([^"]+)"[^}]*?"description"\s*:\s*"([^"]*)"[^}]*?"mood"\s*:\s*"([^"]*)"/g);
                      for (const m of sceneMatches) {
                        streamScenes.push({ location: m[1], description: m[2], mood: m[3] });
                      }
                    } catch { /* 忽略解析错误 */ }

                    return (
                      <div className="flex flex-col gap-5 py-4">
                        <div className="flex items-center gap-2.5 text-sm text-zinc-400">
                          <div className="relative w-4 h-4 shrink-0">
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
                          </div>
                          <span>Claude 正在分析小说内容</span>
                          <div className="flex gap-1">
                            {[0, 150, 300].map((d) => (
                              <span key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                            ))}
                          </div>
                        </div>
                        {streamChars.length > 0 && (
                          <div>
                            <p className="text-xs text-zinc-500 mb-2">已识别人物 {streamChars.length} 个</p>
                            <div className="grid grid-cols-2 gap-3">
                              {streamChars.map((c, i) => (
                                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 opacity-80">
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-white">{c.name}</span>
                                    {(c.gender || c.age) && (
                                      <span className="text-xs text-zinc-500">{[c.gender, c.age].filter(Boolean).join(" · ")}</span>
                                    )}
                                  </div>
                                  {c.description && <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{c.description}</div>}
                                  {c.traits && c.traits.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {c.traits.map((t, j) => (
                                        <span key={j} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{t}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {streamScenes.length > 0 && (
                          <div>
                            <p className="text-xs text-zinc-500 mb-2">已识别场景 {streamScenes.length} 个</p>
                            <div className="space-y-2">
                              {streamScenes.map((s, i) => (
                                <div key={i} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 opacity-80">
                                  <span className="text-xs text-purple-400 bg-purple-900/20 border border-purple-800/30 px-2 py-0.5 rounded-full mt-0.5 shrink-0">{s.location}</span>
                                  <div>
                                    {s.description && <p className="text-sm text-zinc-300">{s.description}</p>}
                                    {s.mood && <p className="text-xs text-zinc-600 mt-0.5">氛围：{s.mood}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {streamChars.length === 0 && streamScenes.length === 0 && (
                          <p className="text-xs text-zinc-600">正在读取内容...</p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center py-20 gap-4">
                    <p className="text-zinc-500 text-sm">
                      {project.uploads.length === 0 ? "请先上传小说文件" : "准备就绪，点击开始分析"}
                    </p>
                    <button
                      onClick={runAnalysis}
                      disabled={project.uploads.length === 0 || analyzing}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {analyzing && (
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      )}
                      {analyzing ? "分析中..." : "开始分析"}
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  {/* 人物 */}
                  <AnalysisSection title="人物" count={(analysis.characters as unknown[]).length} color="indigo">
                    <div className="grid grid-cols-2 gap-3">
                      {(analysis.characters as { name: string; description: string; traits: string[]; gender?: string; age?: string }[]).map((c, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-medium text-sm text-white">{c.name}</span>
                            {(c.gender || c.age) && (
                              <span className="text-xs text-zinc-500">{[c.gender, c.age].filter(Boolean).join(" · ")}</span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{c.description}</div>
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {c.traits?.map((t, j) => (
                              <span key={j} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{t}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AnalysisSection>

                  {/* 场景 */}
                  <AnalysisSection title="场景" count={(analysis.scenes as unknown[]).length} color="purple">
                    <div className="space-y-2">
                      {(analysis.scenes as { location: string; description: string; mood: string }[]).map((s, i) => (
                        <div key={i} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                          <span className="text-xs text-purple-400 bg-purple-900/20 border border-purple-800/30 px-2 py-0.5 rounded-full mt-0.5 shrink-0">
                            {s.location}
                          </span>
                          <div>
                            <p className="text-sm text-zinc-300">{s.description}</p>
                            <p className="text-xs text-zinc-600 mt-0.5">氛围：{s.mood}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AnalysisSection>

                  {/* 操作 */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setStep("script")}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      下一步：生成剧本 →
                    </button>
                    <button
                      onClick={runAnalysis}
                      disabled={analyzing}
                      className="border border-zinc-700 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 px-5 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      {analyzing && (
                        <span className="w-3 h-3 rounded-full border-2 border-zinc-500/30 border-t-zinc-400 animate-spin" />
                      )}
                      {analyzing ? "分析中..." : "重新分析"}
                    </button>
                  </div>

                  {/* 人物建模面板（系列级别共享） */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 bg-zinc-900 border-b border-zinc-800">
                      <div>
                        <span className="text-sm font-medium text-white">人物 & 场景建模</span>
                        <span className="ml-2 text-xs text-zinc-500">系列共享建模 · 各子项目一致性</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* 图片服务选择 */}
                        <select
                          value={modelImageProvider}
                          onChange={(e) => setModelImageProvider(e.target.value)}
                          disabled={generatingModels}
                          className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
                        >
                          <option value="sd">SD（本地）</option>
                          {SEEDREAM_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                        {(() => {
                        const modeledNames = new Set(characterModels.map((m) => m.name));
                        const allCharNames = (analysis.characters as { name: string }[]).map((c) => c.name);
                        const allSceneNames = (analysis.scenes as { location: string }[]).map((s) => s.location);
                        const unmodeled = [
                          ...allCharNames.filter((n) => !modeledNames.has(n)),
                          ...allSceneNames.filter((n) => !modeledNames.has(n)),
                        ];
                        if (unmodeled.length === 0) return null;
                        return (
                          <button
                            onClick={() => generateModels(unmodeled)}
                            disabled={generatingModels}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            {generatingModels && <Spinner />}
                            {generatingModels
                              ? generatingModelName
                                ? `生成中：${generatingModelName}`
                                : "生成中..."
                              : `一键建模（${unmodeled.length} 个）`}
                          </button>
                        );
                      })()}
                      </div>
                    </div>

                    {/* SD 安装提示 */}
                    {modelImageProvider === "sd" && (
                      <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-950/30 border-b border-amber-900/30">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-amber-400 shrink-0">
                          <path d="M7 1.5L12.5 11H1.5L7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        <span className="text-xs text-amber-400/80">
                          SD 模式需本地安装 Stable Diffusion 服务 ·{" "}
                          <a
                            href="https://github.com/hong-peng/generate-images"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-300 transition-colors"
                          >
                            安装说明 →
                          </a>
                        </span>
                      </div>
                    )}

                    {/* 正在生成的骨架提示 */}
                    {generatingModels && generatingModelName && (
                      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-900/50 border-b border-zinc-800">
                        <div className="w-10 h-14 rounded-lg bg-zinc-800 animate-pulse shrink-0" />
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Spinner />
                            <span className="text-sm text-zinc-400">正在生成「{generatingModelName}」...</span>
                          </div>
                          <p className="text-xs text-zinc-600">
                            {modelImageProvider === "sd"
                              ? "Stable Diffusion 生图中，请稍候"
                              : `豆包 ${SEEDREAM_MODELS.find((m) => m.id === modelImageProvider)?.label ?? "Seedream"} 生图中，请稍候`}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="divide-y divide-zinc-800/60">
                      {/* ── 角色区 ── */}
                      <ModelSection
                        title="角色"
                        color="indigo"
                        items={(analysis.characters as { name: string; description: string; traits: string[] }[]).map(
                          (c) => ({ name: c.name, entityType: "character" as const })
                        )}
                        characterModels={characterModels}
                        generatingModels={generatingModels}
                        generatingModelName={generatingModelName}
                        currentPartId={partId}
                        onGenerateNew={(name) => generateModels([name])}
                        onNewVersion={(name) => generateModels([name])}
                        onDelete={deleteModel}
                      />
                      {/* ── 场景区 ── */}
                      <ModelSection
                        title="场景"
                        color="purple"
                        items={(analysis.scenes as { location: string; description: string; mood: string }[]).map(
                          (s) => ({ name: s.location, entityType: "scene" as const })
                        )}
                        characterModels={characterModels}
                        generatingModels={generatingModels}
                        generatingModelName={generatingModelName}
                        currentPartId={partId}
                        onGenerateNew={(name) => generateModels([name])}
                        onNewVersion={(name) => generateModels([name])}
                        onDelete={deleteModel}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: 剧本 ── */}
          {step === "script" && (
            <div>
              <StepHeader
                step={3}
                title="生成剧本"
                desc="每集约 3 分钟，钩子 · 高潮 · 悬念结构"
              />

              {!analysis ? (
                <EmptyHint text="请先完成内容分析" action="前往分析" onAction={() => setStep("analyze")} />
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => generateScript(1)}
                      disabled={generatingScript}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {generatingScript && <Spinner />}
                      {generatingScript ? "生成中..." : project.episodes.length > 0 ? "重新生成剧本" : "生成第 1 集剧本"}
                    </button>
                    {project.episodes.length > 0 && !generatingScript && (
                      <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full">
                        已生成 {project.episodes.length} 集
                      </span>
                    )}
                  </div>

                  {(generatingScript || scriptStream) && (
                    <ScriptPreview streamText={scriptStream} streaming={generatingScript} />
                  )}

                  {selectedEpisode && !generatingScript && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <p className="text-sm text-zinc-400 mb-4">
                        第 {selectedEpisode.episodeNumber} 集剧本已生成，可进入下一步生成{isManga ? "漫画" : "视频"}。
                      </p>
                      <button
                        onClick={isManga ? generateMangaStoryboard : generateStoryboard}
                        className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        下一步：生成{isManga ? "漫画分镜" : "视频"} →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: 视频 / 漫画 ── */}
          {step === "video" && (
            <div>
              {isManga ? (
                /* ═══════════════ 漫画模式 ═══════════════ */
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <StepHeader step={4} title="生成漫画" desc="先生成分镜，再逐格生成图片" compact />
                    {!generatingMangaStoryboard && mangaPanels.length > 0 && (
                      <button
                        onClick={generateMangaStoryboard}
                        className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        重新生成分镜
                      </button>
                    )}
                  </div>

                  {/* 分镜生成中 */}
                  {generatingMangaStoryboard && (
                    <div className="mt-2">
                      <div className="flex items-center gap-3 mb-5 px-1">
                        <div className="flex gap-1">
                          {[0, 150, 300].map((d) => (
                            <span key={d} className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                        <span className="text-sm text-zinc-400">正在生成漫画分镜...</span>
                      </div>
                      {/* 流式预览：提取已出现的格数 */}
                      {(() => {
                        const countMatch = mangaStoryboardStream.match(/"panelNumber"\s*:\s*(\d+)/g);
                        const count = countMatch?.length ?? 0;
                        return count > 0 ? (
                          <p className="text-xs text-zinc-600 px-1">已生成 {count} 格...</p>
                        ) : null;
                      })()}
                    </div>
                  )}

                  {/* 分镜完成：Panel 网格 */}
                  {!generatingMangaStoryboard && mangaPanels.length > 0 && (
                    <div className="space-y-6">
                      {/* 操作栏 */}
                      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {mangaPanels.length} 格分镜
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            已完成 {mangaPanels.filter((p) => p.imageStatus === "completed").length} / {mangaPanels.length}
                            {mangaPanels.some((p) => p.imageStatus === "failed") && (
                              <span className="ml-2 text-red-400">
                                · {mangaPanels.filter((p) => p.imageStatus === "failed").length} 个失败
                              </span>
                            )}
                            {generatingMangaImages && (
                              <span className="ml-2 text-pink-400">
                                · 生成中 ({mangaImageDoneCount}/{mangaPanels.length})
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={mangaImageProvider}
                            onChange={(e) => setMangaImageProvider(e.target.value)}
                            disabled={generatingMangaImages}
                            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1.5 outline-none focus:border-pink-500 disabled:opacity-50 transition-colors"
                          >
                            <option value="sd">SD（本地）</option>
                            {SEEDREAM_MODELS.map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={generateAllMangaImages}
                            disabled={generatingMangaImages}
                            className="flex items-center gap-2 bg-pink-700 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            {generatingMangaImages ? (
                              <><Spinner /> 生成中 ({mangaImageDoneCount}/{mangaPanels.length})</>
                            ) : (
                              <>{mangaPanels.some((p) => p.imageUrl) ? "全部重新生成" : "全部生成图片"}</>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 进度条 */}
                      {generatingMangaImages && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-zinc-500">
                            <span>生成进度</span>
                            <span>{Math.round((mangaImageDoneCount / mangaPanels.length) * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-pink-500 rounded-full transition-all duration-500"
                              style={{ width: `${(mangaImageDoneCount / mangaPanels.length) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Panel 网格 */}
                      <div className="grid grid-cols-2 gap-4">
                        {mangaPanels.map((panel) => {
                          const isGenerating = generatingMangaPanelIds.has(panel.id);
                          const isBig = panel.panelSize === "big";
                          return (
                            <div
                              key={panel.id}
                              className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden ${isBig ? "col-span-2" : ""}`}
                            >
                              {/* 图片区 */}
                              <div className={`relative bg-zinc-800 ${isBig ? "aspect-[16/9]" : "aspect-[2/3]"}`}>
                                {panel.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={panel.imageUrl}
                                    alt={`格 ${panel.panelNumber}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    {isGenerating || (generatingMangaImages && panel.imageStatus === "processing") ? (
                                      <Spinner />
                                    ) : (
                                      <span className="text-zinc-600 text-xs">未生成</span>
                                    )}
                                  </div>
                                )}
                                {/* 格编号 + 大小标签 */}
                                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                                  <span className="text-xs bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
                                    #{panel.panelNumber}
                                  </span>
                                  {isBig && (
                                    <span className="text-xs bg-pink-700/70 text-pink-200 px-1.5 py-0.5 rounded font-medium">大格</span>
                                  )}
                                </div>
                                {/* 状态标签 */}
                                <span className={`absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                                  panel.imageStatus === "completed" ? "bg-emerald-900/80 text-emerald-400" :
                                  panel.imageStatus === "failed" ? "bg-red-900/80 text-red-400" :
                                  panel.imageStatus === "processing" ? "bg-yellow-900/80 text-yellow-400" :
                                  "bg-zinc-800/80 text-zinc-500"
                                }`}>
                                  {panel.imageStatus === "completed" ? "完成" :
                                   panel.imageStatus === "failed" ? "失败" :
                                   panel.imageStatus === "processing" ? "生成中" : "待生成"}
                                </span>
                              </div>
                              {/* 信息区 */}
                              <div className="p-3 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {panel.mood && (
                                    <span className="text-xs bg-pink-900/30 text-pink-400 border border-pink-800/30 px-2 py-0.5 rounded-full">
                                      {panel.mood}
                                    </span>
                                  )}
                                  {panel.expressionType && (
                                    <span className="text-xs bg-amber-900/20 text-amber-400 border border-amber-800/30 px-2 py-0.5 rounded-full">
                                      {panel.expressionType}
                                    </span>
                                  )}
                                  {panel.characters?.map((c, i) => (
                                    <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{c}</span>
                                  ))}
                                </div>
                                <p className="text-xs text-zinc-400 leading-relaxed">{panel.description}</p>
                                {/* 对话气泡 */}
                                {panel.dialogue && (
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-xs text-zinc-600 shrink-0 mt-0.5">💬</span>
                                    <p className="text-xs text-zinc-200 bg-zinc-800 rounded-lg px-2.5 py-1.5 flex-1">
                                      {panel.dialogue}
                                    </p>
                                  </div>
                                )}
                                {/* 内心独白 */}
                                {panel.innerMonologue && (
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-xs text-zinc-600 shrink-0 mt-0.5">💭</span>
                                    <p className="text-xs text-zinc-400 italic bg-zinc-900 border border-dashed border-zinc-700 rounded-lg px-2.5 py-1.5 flex-1">
                                      {panel.innerMonologue}
                                    </p>
                                  </div>
                                )}
                                {/* 音效 */}
                                {panel.sfx && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-zinc-600">SFX</span>
                                    <span className="text-xs font-bold text-yellow-400 tracking-wider">{panel.sfx}</span>
                                  </div>
                                )}
                                <button
                                  onClick={() => generateSingleMangaImage(panel.id)}
                                  disabled={isGenerating || generatingMangaImages}
                                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                >
                                  {isGenerating && <Spinner />}
                                  {isGenerating ? "生成中..." : panel.imageUrl ? "重新生成" : "生成图片"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 未生成分镜 */}
                  {!generatingMangaStoryboard && mangaPanels.length === 0 && (
                    <EmptyHint
                      text={project.episodes.length === 0 ? "请先生成剧本" : "点击开始生成漫画分镜"}
                      action={project.episodes.length === 0 ? "前往生成剧本" : "生成漫画分镜"}
                      onAction={project.episodes.length === 0 ? () => setStep("script") : generateMangaStoryboard}
                    />
                  )}
                </div>
              ) : (
                /* ═══════════════ 短视频模式（原有逻辑不变）═══════════════ */
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <StepHeader
                      step={4}
                      title="生成视频"
                      desc="先生成分镜脚本，再逐镜或批量合成视频"
                      compact
                    />
                    {!generatingStoryboard && shots.length > 0 && (
                      <button
                        onClick={generateStoryboard}
                        className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        重新生成分镜
                      </button>
                    )}
                  </div>

                  {/* ── 分镜生成中 ── */}
                  {generatingStoryboard && (
                    <div className="mt-2">
                      <div className="flex items-center gap-3 mb-5 px-1">
                        <div className="flex gap-1">
                          {[0, 150, 300].map((d) => (
                            <span key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                        <span className="text-sm text-zinc-400">正在生成分镜脚本...</span>
                      </div>
                      <StreamingStoryboard text={storyboardStream} />
                    </div>
                  )}

                  {/* ── 分镜完成后的主界面 ── */}
                  {!generatingStoryboard && shots.length > 0 && (
                    <div className="space-y-6">
                      {/* 批量操作栏 */}
                      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {shots.length} 个分镜
                            <span className="ml-2 text-zinc-500 font-normal text-xs">
                              · 总时长约 {shots.reduce((s, sh) => s + sh.duration, 0).toFixed(0)} 秒
                            </span>
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            已完成 {shots.filter((s) => s.videoStatus === "completed").length} / {shots.length}
                            {shots.some((s) => s.videoStatus === "failed") && (
                              <span className="ml-2 text-red-400">
                                · {shots.filter((s) => s.videoStatus === "failed").length} 个失败
                              </span>
                            )}
                            {generatingAllVideo && (
                              <span className="ml-2 text-violet-400">
                                · 并发生成中 ({batchDoneCount}/{shots.length})
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* 模型选择下拉框 */}
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={generatingAllVideo || generatingShotIds.size > 0}
                            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {SEEDANCE_MODELS.map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={generateVideo}
                            disabled={generatingAllVideo || generatingShotIds.size > 0}
                            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            {generatingAllVideo ? (
                              <>
                                <Spinner />
                                并发生成中 ({batchDoneCount}/{shots.length})
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M2 2.5L12 7L2 11.5V2.5Z" fill="currentColor"/>
                                </svg>
                                {shots.some((s) => s.videoUrl) ? "全部重新生成" : "全部并发生成"}
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 并发进度条 */}
                      {generatingAllVideo && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-zinc-500">
                            <span>并发生成进度</span>
                            <span>{Math.round((batchDoneCount / shots.length) * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full transition-all duration-500"
                              style={{ width: `${(batchDoneCount / shots.length) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 分镜列表（带建模图、单独生成按钮） */}
                      <StoryboardGrid
                        shots={shots}
                        characterModels={characterModels.filter((m) => m.isActive)}
                        generatingShotIds={generatingShotIds}
                        onGenerateSingleShot={
                          generatingAllVideo ? undefined : (shotId) => generateSingleShot(shotId)
                        }
                      />

                      {/* 合并视频 */}
                      {shots.some((s) => s.videoStatus === "completed") && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-900/30 border border-emerald-800/30 flex items-center justify-center shrink-0">
                              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-emerald-400">
                                <path d="M2 9h14M9 2l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-semibold text-white mb-1">合并视频</h4>
                              <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                                将所有已完成的镜头拼接为完整视频，保存到本地 public/videos/。
                              </p>
                              {selectedEpisode?.mergedVideoUrl && !mergingVideo && (
                                <div className="mb-4">
                                  <video
                                    src={selectedEpisode.mergedVideoUrl}
                                    controls
                                    className="w-full rounded-lg border border-zinc-700 max-h-64"
                                  />
                                  <p className="text-xs text-zinc-600 mt-1.5">{selectedEpisode.mergedVideoUrl}</p>
                                </div>
                              )}
                              {(() => {
                                const notDone = shots.filter((s) => s.videoStatus !== "completed");
                                const allDone = notDone.length === 0;
                                const disabled = mergingVideo || generatingAllVideo || !allDone;
                                return (
                                  <>
                                    {!allDone && !mergingVideo && (
                                      <p className="text-xs text-amber-500 mb-3">
                                        还有 {notDone.length} 个镜头未完成，合成后将跳过未生成的镜头
                                      </p>
                                    )}
                                    <button
                                      onClick={mergeVideo}
                                      disabled={disabled}
                                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                      {mergingVideo && <Spinner />}
                                      {mergingVideo ? "合并中..." : selectedEpisode?.mergedVideoUrl ? "重新合并" : "合并视频"}
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 未生成分镜 */}
                  {!generatingStoryboard && shots.length === 0 && (
                    <EmptyHint
                      text={project.episodes.length === 0 ? "请先生成剧本" : "点击开始生成分镜脚本"}
                      action={project.episodes.length === 0 ? "前往生成剧本" : "生成分镜"}
                      onAction={project.episodes.length === 0 ? () => setStep("script") : generateStoryboard}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({
  step,
  title,
  desc,
  compact,
}: {
  step: number;
  title: string;
  desc: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-2" : "mb-8"}>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-600 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
          STEP {step}
        </span>
        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
      </div>
      {!compact && <p className="text-sm text-zinc-500 mt-2">{desc}</p>}
    </div>
  );
}

function AnalysisSection({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: "indigo" | "purple";
  children: React.ReactNode;
}) {
  const badge =
    color === "indigo"
      ? "bg-indigo-900/20 text-indigo-400 border-indigo-800/30"
      : "bg-purple-900/20 text-purple-400 border-purple-800/30";
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-zinc-300">{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge}`}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({
  text,
  action,
  onAction,
}: {
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-24 gap-3">
      <p className="text-zinc-500 text-sm">{text}</p>
      <button
        onClick={onAction}
        className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
      >
        {action} →
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M7 1.5A5.5 5.5 0 0112.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 流式解析分镜 JSON，逐个渲染镜头卡片 */
function ModelSection({
  title,
  color,
  items,
  characterModels,
  generatingModels,
  generatingModelName,
  currentPartId,
  onGenerateNew,
  onNewVersion,
  onDelete,
}: {
  title: string;
  color: "indigo" | "purple";
  items: { name: string; entityType: "character" | "scene" }[];
  characterModels: { id: string; name: string; entityType: string; version: number; imageUrl: string; isActive: boolean; sourcePartId: string | null }[];
  generatingModels: boolean;
  generatingModelName: string;
  currentPartId: string;
  onGenerateNew: (name: string) => void;
  onNewVersion: (name: string) => void;
  onDelete: (modelId: string) => void;
}) {
  const [preview, setPreview] = useState<{ url: string; name: string; version: number } | null>(null);
  const entityType = color === "indigo" ? "character" : "scene";
  const badge = color === "indigo"
    ? "text-indigo-400 bg-indigo-900/20 border-indigo-800/30"
    : "text-purple-400 bg-purple-900/20 border-purple-800/30";
  const activeBorder = color === "indigo" ? "border-indigo-500" : "border-purple-500";
  const activeDot = color === "indigo" ? "text-indigo-400" : "text-purple-400";

  // 本 Part 分析中的名称
  const allNames = items.map((i) => i.name);
  // 已有建模（当前系列）
  const modeled = characterModels.filter((m) => m.entityType === entityType);
  const modeledNames = new Set(modeled.map((m) => m.name));
  // 新增：分析中有但尚未建模的条目
  const newNames = allNames.filter((n) => !modeledNames.has(n));

  if (allNames.length === 0) return null;

  return (
    <>
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge}`}>{title}</span>
        <span className="text-xs text-zinc-600">{allNames.length} 个</span>
        {newNames.length > 0 && (
          <span className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/30 px-2 py-0.5 rounded-full ml-1">
            {newNames.length} 个待建模
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {/* 已建模条目：所有版本并列 */}
        {allNames.filter((n) => modeledNames.has(n)).map((name) => {
          const versions = modeled
            .filter((m) => m.name === name)
            .sort((a, b) => a.version - b.version);
          const active = versions.find((v) => v.isActive) ?? versions[versions.length - 1];
          const isGeneratingThis = generatingModels && generatingModelName === name;
          const isChar = active.entityType === "character";
          return (
            <React.Fragment key={name}>
              {versions.map((v) => {
                const canDelete = v.sourcePartId === currentPartId;
                return (
                  <div
                    key={v.id}
                    className={`relative rounded-xl overflow-hidden border-2 transition-colors group shrink-0 ${
                      v.isActive ? activeBorder : "border-zinc-700 opacity-50"
                    }`}
                    style={{ width: isChar ? 96 : 128, height: isChar ? 128 : 80 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.imageUrl}
                      alt={`${name} v${v.version}`}
                      onClick={() => setPreview({ url: v.imageUrl, name, version: v.version })}
                      className="w-full h-full object-cover cursor-zoom-in"
                    />
                    {/* 底部遮罩：名称 + 版本 */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5">
                      <p className="text-xs font-medium text-white truncate leading-tight">{name}</p>
                      <p className={`text-xs ${v.isActive ? activeDot : "text-zinc-500"}`}>v{v.version}{v.isActive ? " ●" : ""}</p>
                    </div>
                    {/* hover：+新版本（左上角） */}
                    {v.isActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onNewVersion(name); }}
                        disabled={generatingModels}
                        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40 flex items-center justify-center"
                        title="生成新版本"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                    {/* 删除按钮 */}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(v.id)}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-900/80"
                        title="删除此版本"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
              {/* 生成中骨架（接在该角色最后一个版本后面） */}
              {isGeneratingThis && (
                <div
                  className="relative rounded-xl bg-zinc-800 animate-pulse border-2 border-dashed border-zinc-600 shrink-0 flex items-center justify-center"
                  style={{ width: isChar ? 96 : 128, height: isChar ? 128 : 80 }}
                >
                  <Spinner />
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* 待建模条目 */}
        {newNames.map((name) => {
          const isGeneratingThis = generatingModels && generatingModelName === name;
          const isChar = entityType === "character";
          return (
            <div
              key={name}
              className="relative rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/40 shrink-0 flex flex-col items-center justify-center gap-1.5 group overflow-hidden"
              style={{ width: isChar ? 96 : 128, height: isChar ? 128 : 80 }}
            >
              {isGeneratingThis ? (
                <>
                  <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
                  <Spinner />
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-zinc-600">
                    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <p className="text-xs text-zinc-600 text-center px-1 leading-tight">{name}</p>
                  {/* hover：新增建模按钮 */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={() => onGenerateNew(name)}
                      disabled={generatingModels}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                        color === "indigo"
                          ? "text-indigo-300 border-indigo-500/50 bg-indigo-900/40 hover:bg-indigo-900/70"
                          : "text-purple-300 border-purple-500/50 bg-purple-900/40 hover:bg-purple-900/70"
                      }`}
                    >
                      建模
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>

    {/* 预览 Modal */}
    {preview && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setPreview(null)}
      >
        <div
          className="relative max-w-2xl max-h-[90vh] flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={`${preview.name} v${preview.version}`}
            className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
          />
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-medium text-white">{preview.name}</span>
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">v{preview.version}</span>
          </div>
          <button
            onClick={() => setPreview(null)}
            className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    )}
    </>
  );
}
/** 流式解析分镜 JSON，逐个渲染镜头卡片 */
function StreamingStoryboard({ text }: { text: string }) {
  const shots: {
    shotNumber: number;
    shotType: string;
    cameraMove: string;
    description: string;
    dialogue: string;
    duration: number;
    notes: string;
  }[] = [];

  const shotsStart = text.indexOf('"shots"');
  if (shotsStart !== -1) {
    const arrStart = text.indexOf("[", shotsStart);
    if (arrStart !== -1) {
      const segment = text.slice(arrStart + 1);
      let depth = 0;
      let objStart = -1;
      for (let i = 0; i < segment.length; i++) {
        const c = segment[i];
        if (c === "{") {
          if (depth === 0) objStart = i;
          depth++;
        } else if (c === "}") {
          depth--;
          if (depth === 0 && objStart !== -1) {
            try {
              const raw = segment.slice(objStart, i + 1).replace(/,(\s*[}\]])/g, "$1");
              shots.push(JSON.parse(raw));
            } catch { /* skip */ }
            objStart = -1;
          }
        }
      }
    }
  }

  const COLORS: Record<string, string> = {
    全景: "text-blue-400 bg-blue-900/20 border-blue-800/40",
    大远景: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40",
    中景: "text-green-400 bg-green-900/20 border-green-800/40",
    近景: "text-yellow-400 bg-yellow-900/20 border-yellow-800/40",
    特写: "text-red-400 bg-red-900/20 border-red-800/40",
  };

  return (
    <div className="space-y-3">
      {shots.map((shot, i) => {
        const clr = COLORS[shot.shotType] ?? "text-zinc-400 bg-zinc-800/20 border-zinc-700";
        return (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
            <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center font-mono text-sm text-zinc-400 shrink-0">
              {shot.shotNumber}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${clr}`}>{shot.shotType}</span>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">{shot.cameraMove}</span>
                <span className="text-xs text-zinc-600 ml-auto">{shot.duration}s</span>
              </div>
              <p className="text-sm text-zinc-300">{shot.description}</p>
              {shot.dialogue && <p className="mt-1.5 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-400">{shot.dialogue}</p>}
            </div>
          </div>
        );
      })}
      {/* 骨架占位 */}
      <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-4 flex gap-3 items-center">
        <div className="w-9 h-9 rounded-lg bg-zinc-800/60 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 bg-zinc-800 rounded animate-pulse w-1/4" />
          <div className="h-2.5 bg-zinc-800 rounded animate-pulse w-3/5" />
        </div>
      </div>
    </div>
  );
}
