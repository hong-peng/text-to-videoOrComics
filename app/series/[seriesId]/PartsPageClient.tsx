"use client";

import { useState } from "react";
import Link from "next/link";

interface Part {
  id: string;
  name: string;
  status: string;
  createdAt: Date | string;
  _count: { episodes: number };
}

interface Series {
  id: string;
  name: string;
  createdAt: Date | string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "text-zinc-400" },
  analyzing: { label: "分析中", color: "text-yellow-400" },
  scripting: { label: "生成剧本", color: "text-blue-400" },
  storyboarding: { label: "生成分镜", color: "text-purple-400" },
  generating: { label: "生成视频", color: "text-orange-400" },
  done: { label: "已完成", color: "text-green-400" },
};

interface Props {
  series: Series;
  initialParts: Part[];
  seriesId: string;
}

export default function PartsPageClient({ series, initialParts, seriesId }: Props) {
  const [parts, setParts] = useState<Part[]>(initialParts);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function refreshParts() {
    const data = await fetch(`/api/series/${seriesId}/parts`).then((r) => r.json());
    setParts(data);
  }

  async function createPart() {
    if (!newName.trim()) return;
    await fetch(`/api/series/${seriesId}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    setCreating(false);
    await refreshParts();
  }

  async function deletePart(id: string) {
    if (!confirm("确认删除该子项目？")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setParts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-8 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Link href="/" className="hover:text-zinc-300 transition-colors">
              首页
            </Link>
            <span>/</span>
            <span className="text-zinc-300">{series.name}</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{series.name}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">系列项目 · 建模数据共享</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 新建子项目
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {creating && (
          <div className="mb-8 bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <h2 className="text-base font-medium mb-4">新建子项目</h2>
            <div className="flex gap-3">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPart()}
                placeholder="子项目名称（如：第一季 Part 1）"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                onClick={createPart}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                创建
              </button>
              <button
                onClick={() => setCreating(false)}
                className="border border-zinc-700 hover:bg-zinc-800 text-zinc-300 px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {parts.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-zinc-500 mb-3">还没有子项目</div>
            <button
              onClick={() => setCreating(true)}
              className="text-indigo-400 hover:text-indigo-300 text-sm"
            >
              创建第一个子项目 →
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {parts.map((part) => {
              const status = STATUS_MAP[part.status] ?? {
                label: part.status,
                color: "text-zinc-400",
              };
              return (
                <div
                  key={part.id}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 flex items-center justify-between transition-colors group"
                >
                  <Link
                    href={`/series/${seriesId}/part/${part.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="font-medium truncate">{part.name}</div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className={`text-xs ${status.color}`}>
                        {status.label}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {part._count.episodes} 集
                      </span>
                      <span className="text-xs text-zinc-600">
                        {new Date(part.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/series/${seriesId}/part/${part.id}`}
                      className="text-sm text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      进入工作台 →
                    </Link>
                    <button
                      onClick={() => deletePart(part.id)}
                      className="text-zinc-600 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
