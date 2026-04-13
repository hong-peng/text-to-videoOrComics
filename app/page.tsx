"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Series {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  _count: { parts: number; characterModels: number };
}

export default function HomePage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"video" | "manga">("video");
  const [loading, setLoading] = useState(true);

  async function loadSeries() {
    const res = await fetch("/api/series");
    const data = await res.json();
    setSeries(data);
    setLoading(false);
  }

  useEffect(() => {
    loadSeries();
  }, []);

  async function createSeries() {
    if (!newName.trim()) return;
    await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    });
    setNewName("");
    setNewType("video");
    setCreating(false);
    await loadSeries();
  }

  async function deleteSeries(id: string) {
    if (!confirm("确认删除该系列？这将删除所有子项目和建模数据。")) return;
    await fetch(`/api/series/${id}`, { method: "DELETE" });
    setSeries((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI 短剧生成平台</h1>
          <p className="text-sm text-zinc-500 mt-0.5">小说 → 剧本 → 分镜 → 视频</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 新建系列
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {creating && (
          <div className="mb-8 bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <h2 className="text-base font-medium mb-4">新建系列</h2>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setNewType("video")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  newType === "video"
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                🎬 生成短视频
              </button>
              <button
                onClick={() => setNewType("manga")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  newType === "manga"
                    ? "bg-pink-700 border-pink-500 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                📖 生成漫画
              </button>
            </div>
            <div className="flex gap-3">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSeries()}
                placeholder="系列名称（如：斗罗大陆）"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                onClick={createSeries}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                创建
              </button>
              <button
                onClick={() => { setCreating(false); setNewType("video"); }}
                className="border border-zinc-700 hover:bg-zinc-800 text-zinc-300 px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-zinc-500 py-20">加载中...</div>
        ) : series.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-zinc-500 mb-3">还没有系列项目</div>
            <button
              onClick={() => setCreating(true)}
              className="text-indigo-400 hover:text-indigo-300 text-sm"
            >
              创建第一个系列 →
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {series.map((s) => (
              <div
                key={s.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 flex items-center justify-between transition-colors group"
              >
                <Link href={`/series/${s.id}`} className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      s.type === "manga"
                        ? "bg-pink-900/50 text-pink-400"
                        : "bg-indigo-900/50 text-indigo-400"
                    }`}>
                      {s.type === "manga" ? "漫画" : "短视频"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {s._count.parts} 个子项目
                    </span>
                    <span className="text-xs text-zinc-600">
                      {s._count.characterModels} 个建模
                    </span>
                    <span className="text-xs text-zinc-600">
                      {new Date(s.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/series/${s.id}`}
                    className="text-sm text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    进入 →
                  </Link>
                  <button
                    onClick={() => deleteSeries(s.id)}
                    className="text-zinc-600 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
