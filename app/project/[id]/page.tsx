"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileUploader } from "@/components/upload/FileUploader";
import { ScriptPreview } from "@/components/script/ScriptPreview";
import { StoryboardGrid } from "@/components/storyboard/StoryboardGrid";

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

interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  scriptContent: Record<string, unknown>;
  mergedVideoUrl?: string;
  shots: Shot[];
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
  name: string;
  status: string;
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
  { key: "video", label: "生成视频", desc: "分镜 · 合成 · 导出", icon: "④" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<Step>("upload");

  // loading states
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [mergingVideo, setMergingVideo] = useState(false);

  // stream buffers
  const [scriptStream, setScriptStream] = useState("");
  const [storyboardStream, setStoryboardStream] = useState("");

  // 人物建模
  const [characterModels, setCharacterModels] = useState<CharacterModel[]>([]);
  const [generatingModels, setGeneratingModels] = useState(false);

  async function loadCharacterModels() {
    const res = await fetch(`/api/models?projectId=${projectId}`);
    if (res.ok) setCharacterModels(await res.json() as CharacterModel[]);
  }

  async function generateModels(names?: string[]) {
    if (!projectId || !project?.analyses[0]) return;
    setGeneratingModels(true);
    try {
      await fetch("/api/models/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, analysisId: project.analyses[0].id, names }),
      });
      await loadCharacterModels();
    } finally {
      setGeneratingModels(false);
    }
  }

  // video progress
  const [videoProgress, setVideoProgress] = useState<{ current: number; total: number } | null>(null);

  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      loadProject(id);
      fetch(`/api/models?projectId=${id}`).then(r => r.ok ? r.json() : []).then(setCharacterModels);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function loadProject(id: string) {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) return;
    const data: Project = await res.json();
    setProject(data);
    if (data.episodes.length > 0) setSelectedEpisode(data.episodes[0]);
  }

  // ── Step 2: analyze ──────────────────────────────────────────────────────

  async function runAnalysis() {
    if (!projectId) return;
    setAnalyzing(true);
    try {
      await fetch("/api/script/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      await loadProject(projectId);
      setStep("script");
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Step 3: script ───────────────────────────────────────────────────────

  async function generateScript(episodeNum: number) {
    if (!projectId) return;
    setGeneratingScript(true);
    setScriptStream("");
    try {
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, episodeNumber: episodeNum }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setScriptStream((prev) => prev + decoder.decode(value));
      }
      await loadProject(projectId);
    } finally {
      setGeneratingScript(false);
    }
  }

  // ── Step 4: video (storyboard + video) ───────────────────────────────────

  async function generateStoryboard() {
    if (!projectId || !selectedEpisode) return;
    setGeneratingStoryboard(true);
    setStoryboardStream("");
    setStep("video");
    try {
      const res = await fetch("/api/storyboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, episodeId: selectedEpisode.id }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setStoryboardStream((prev) => prev + decoder.decode(value));
      }
      await loadProject(projectId);
    } finally {
      setGeneratingStoryboard(false);
      setStoryboardStream("");
    }
  }

  async function generateVideo() {
    if (!projectId || !selectedEpisode) return;
    setGeneratingVideo(true);
    setVideoProgress({ current: 0, total: selectedEpisode.shots.length });
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, episodeId: selectedEpisode.id }),
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
              index?: number;
              total?: number;
            };
            if ((evt.type === "shot_start" || evt.type === "shot_done") && evt.index != null && evt.total != null) {
              setVideoProgress({ current: evt.index, total: evt.total });
            }
          } catch { /* skip */ }
        }
      }
      await loadProject(projectId);
    } finally {
      setGeneratingVideo(false);
      setVideoProgress(null);
    }
  }

  async function mergeVideo() {
    if (!projectId || !selectedEpisode) return;
    setMergingVideo(true);
    try {
      const res = await fetch("/api/video/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: selectedEpisode.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "合并失败");
      await loadProject(projectId);
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

  const analysis = project.analyses[0];
  const shots = selectedEpisode?.shots ?? [];

  // step 完成状态
  const stepDone: Record<Step, boolean> = {
    upload: project.uploads.length > 0,
    analyze: project.analyses.length > 0,
    script: project.episodes.length > 0,
    video: shots.length > 0,
  };

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* ── 分析 Loading Overlay ── */}
      {analyzing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/92 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-purple-400 animate-spin [animation-duration:1.5s] [animation-direction:reverse]" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-white mb-1">正在分析小说内容</p>
              <p className="text-sm text-zinc-400">Claude 正在提取人物、场景与情节要点...</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 border-r border-zinc-800 flex flex-col sticky top-0 h-screen">
        {/* 项目标题 */}
        <div className="px-5 py-4 border-b border-zinc-800">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            返回项目列表
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
                projectId={projectId}
                onSuccess={() => {
                  loadProject(projectId);
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
                          loadProject(projectId);
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
                <div className="flex flex-col items-center py-20 gap-4">
                  <p className="text-zinc-500 text-sm">
                    {project.uploads.length === 0 ? "请先上传小说文件" : "准备就绪，点击开始分析"}
                  </p>
                  <button
                    onClick={runAnalysis}
                    disabled={project.uploads.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-8 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    开始分析
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 人物 */}
                  <AnalysisSection title="人物" count={(analysis.characters as unknown[]).length} color="indigo">
                    <div className="grid grid-cols-2 gap-3">
                      {(analysis.characters as { name: string; description: string; traits: string[] }[]).map((c, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                          <div className="font-medium text-sm text-white">{c.name}</div>
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
                      className="border border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 px-5 py-2.5 rounded-lg text-sm transition-colors"
                    >
                      重新分析
                    </button>
                  </div>

                  {/* 人物建模面板 */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 bg-zinc-900 border-b border-zinc-800">
                      <div>
                        <span className="text-sm font-medium text-white">人物 & 场景建模</span>
                        <span className="ml-2 text-xs text-zinc-500">由 Stable Diffusion 生成，用于视频人物一致性</span>
                      </div>
                      <button
                        onClick={() => generateModels()}
                        disabled={generatingModels}
                        className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {generatingModels && <Spinner />}
                        {generatingModels ? "生成中..." : characterModels.length > 0 ? "重新生成全部" : "生成建模"}
                      </button>
                    </div>

                    {characterModels.length === 0 ? (
                      <div className="px-5 py-8 text-center text-zinc-600 text-sm">
                        {generatingModels ? "正在调用 SD 生成建模，请稍候..." : "点击「生成建模」为角色和场景创建参考图"}
                      </div>
                    ) : (
                      <div className="p-4">
                        {/* 按名称分组，显示所有版本 */}
                        {Array.from(new Set(characterModels.map((m) => m.name))).map((name) => {
                          const versions = characterModels.filter((m) => m.name === name).sort((a, b) => a.version - b.version);
                          const active = versions.find((v) => v.isActive) ?? versions[versions.length - 1];
                          return (
                            <div key={name} className="mb-5">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded border ${active.entityType === "character" ? "text-indigo-400 bg-indigo-900/20 border-indigo-800/30" : "text-purple-400 bg-purple-900/20 border-purple-800/30"}`}>
                                  {active.entityType === "character" ? "角色" : "场景"}
                                </span>
                                <span className="text-sm font-medium text-white">{name}</span>
                                <button
                                  onClick={() => generateModels([name])}
                                  disabled={generatingModels}
                                  className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                  title="重新生成此建模（外貌变化时使用）"
                                >
                                  + 新版本
                                </button>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {versions.map((v) => (
                                  <div key={v.id} className={`relative rounded-lg overflow-hidden border-2 transition-colors ${v.isActive ? "border-indigo-500" : "border-zinc-700 opacity-50"}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={v.imageUrl} alt={`${name} v${v.version}`} className="w-24 h-32 object-cover" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center py-0.5">
                                      <span className="text-xs text-zinc-300">v{v.version}</span>
                                      {v.isActive && <span className="ml-1 text-xs text-indigo-400">●</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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

                  {selectedEpisode && !generatingScript && scriptStream === "" && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <p className="text-sm text-zinc-400 mb-4">
                        第 {selectedEpisode.episodeNumber} 集剧本已生成，可进入下一步生成视频。
                      </p>
                      <button
                        onClick={generateStoryboard}
                        className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        下一步：生成视频 →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: 视频 ── */}
          {step === "video" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <StepHeader
                  step={4}
                  title="生成视频"
                  desc="分镜脚本生成 · 逐镜合成 · 最终输出"
                  compact
                />
                {!generatingStoryboard && shots.length > 0 && (
                  <button
                    onClick={generateStoryboard}
                    className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    重新生成
                  </button>
                )}
              </div>

              {/* 分镜生成中 */}
              {generatingStoryboard && (
                <div className="mt-6">
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

              {/* 分镜完成，展示视频生成区 */}
              {!generatingStoryboard && shots.length > 0 && (
                <div className="mt-6 space-y-6">
                  {/* 分镜总览 */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white">分镜脚本</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {shots.length} 个镜头 · 总时长约 {shots.reduce((s, sh) => s + sh.duration, 0).toFixed(0)} 秒
                        </p>
                      </div>
                    </div>
                    <StoryboardGrid shots={shots} />
                  </div>

                  {/* 视频生成面板 */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-violet-900/30 border border-violet-800/30 flex items-center justify-center shrink-0">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-violet-400">
                          <path d="M3 3.5L15 9L3 14.5V3.5Z" fill="currentColor"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-white mb-1">视频合成</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                          逐镜调用 Flow2API 生成每个镜头的视频片段（串行，约 3-5 分钟/镜头）。
                        </p>

                        {/* 进度条（生成中） */}
                        {generatingVideo && videoProgress && (
                          <div className="mb-4 space-y-2">
                            <div className="flex justify-between text-xs text-zinc-400">
                              <span>正在生成第 {videoProgress.current} / {videoProgress.total} 个镜头</span>
                              <span>{Math.round((videoProgress.current / videoProgress.total) * 100)}%</span>
                            </div>
                            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                                style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 已有视频的统计 */}
                        {!generatingVideo && shots.some((s) => s.videoUrl) && (
                          <div className="mb-4 text-xs text-zinc-400">
                            已完成 {shots.filter((s) => s.videoStatus === "completed").length} / {shots.length} 个镜头
                            {shots.some((s) => s.videoStatus === "failed") && (
                              <span className="ml-2 text-red-400">
                                ({shots.filter((s) => s.videoStatus === "failed").length} 个失败)
                              </span>
                            )}
                          </div>
                        )}

                        <button
                          onClick={generateVideo}
                          disabled={generatingVideo}
                          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {generatingVideo && <Spinner />}
                          {generatingVideo
                            ? "生成中..."
                            : shots.some((s) => s.videoUrl)
                            ? "重新生成视频"
                            : "开始生成视频"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 合并视频面板 */}
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
                              <p className="text-xs text-zinc-600 mt-1.5">
                                {selectedEpisode.mergedVideoUrl}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={mergeVideo}
                            disabled={mergingVideo || generatingVideo}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            {mergingVideo && <Spinner />}
                            {mergingVideo
                              ? "合并中..."
                              : selectedEpisode?.mergedVideoUrl
                              ? "重新合并"
                              : "合并视频"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 未生成 */}
              {!generatingStoryboard && shots.length === 0 && (
                <EmptyHint
                  text={project.episodes.length === 0 ? "请先生成剧本" : "点击开始生成分镜和视频"}
                  action={project.episodes.length === 0 ? "前往生成剧本" : "开始生成"}
                  onAction={project.episodes.length === 0 ? () => setStep("script") : generateStoryboard}
                />
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
