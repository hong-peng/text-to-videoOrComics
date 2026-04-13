"use client";

import { useState, useCallback } from "react";

interface FileUploaderProps {
  projectId: string;
  onSuccess: () => void;
}

const ACCEPTED = ["txt", "pdf", "epub", "md"];

export function FileUploader({ projectId, onSuccess }: FileUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ name: string; done: boolean; error?: string }[]>([]);
  const [error, setError] = useState("");

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && ACCEPTED.includes(ext);
      });

      if (valid.length === 0) {
        setError("仅支持 TXT、MD、PDF、EPUB 格式");
        return;
      }
      if (valid.length < files.length) {
        setError(`已忽略 ${files.length - valid.length} 个不支持的文件`);
      } else {
        setError("");
      }

      setUploading(true);
      setProgress(valid.map((f) => ({ name: f.name, done: false })));

      for (let i = 0; i < valid.length; i++) {
        const file = valid[i];
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("projectId", projectId);
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          const msg = res.ok ? undefined : ((await res.json()) as { error?: string }).error ?? "上传失败";
          setProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, done: true, error: msg } : p))
          );
        } catch {
          setProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, done: true, error: "网络错误" } : p))
          );
        }
      }

      setUploading(false);
      onSuccess();
    },
    [projectId, onSuccess]
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-900/10" : "border-zinc-700 hover:border-zinc-600"
        }`}
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="text-sm text-zinc-400 mb-3">正在上传...</div>
            {progress.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  p.error ? "bg-red-400" : p.done ? "bg-emerald-400" : "bg-zinc-500 animate-pulse"
                }`} />
                <span className="flex-1 truncate text-left text-zinc-400">{p.name}</span>
                <span className={p.error ? "text-red-400" : p.done ? "text-emerald-400" : "text-zinc-600"}>
                  {p.error ?? (p.done ? "完成" : "等待")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="text-3xl mb-3">📄</div>
            <div className="text-sm text-zinc-300 mb-1">拖拽文件到此处，或点击选择文件</div>
            <div className="text-xs text-zinc-600 mb-4">支持 TXT、MD、PDF、EPUB，可多选</div>
            <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-5 py-2 rounded-lg text-sm transition-colors inline-block">
              选择文件
              <input
                type="file"
                accept=".txt,.md,.pdf,.epub"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </label>
          </>
        )}
        {error && <div className="mt-3 text-yellow-500 text-xs">{error}</div>}
      </div>
    </div>
  );
}
