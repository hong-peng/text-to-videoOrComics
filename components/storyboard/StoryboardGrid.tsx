"use client";

interface CharacterModel {
  id: string;
  name: string;
  entityType: string;
  imageUrl: string;
  isActive: boolean;
}

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

interface StoryboardGridProps {
  shots: Shot[];
  characterModels?: CharacterModel[];
  /** 正在单独生成视频的 shotId 集合 */
  generatingShotIds?: Set<string>;
  onGenerateSingleShot?: (shotId: string) => void;
}

const SHOT_TYPE_COLORS: Record<string, string> = {
  全景: "text-blue-400 bg-blue-900/20 border-blue-800/40",
  大远景: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40",
  中景: "text-green-400 bg-green-900/20 border-green-800/40",
  近景: "text-yellow-400 bg-yellow-900/20 border-yellow-800/40",
  特写: "text-red-400 bg-red-900/20 border-red-800/40",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  completed: { label: "已完成", cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
  processing: { label: "生成中…", cls: "text-yellow-400 bg-yellow-900/20 border-yellow-800/40" },
  failed: { label: "失败", cls: "text-red-400 bg-red-900/20 border-red-800/40" },
  pending: { label: "待生成", cls: "text-zinc-500 bg-zinc-800/20 border-zinc-700" },
};

/** 从分镜描述中找到匹配的建模 */
function findMatchedModels(description: string, models: CharacterModel[]): CharacterModel[] {
  return models.filter((m) => m.isActive && description.includes(m.name));
}

export function StoryboardGrid({
  shots,
  characterModels = [],
  generatingShotIds = new Set(),
  onGenerateSingleShot,
}: StoryboardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {shots.map((shot) => (
        <ShotCard
          key={shot.id}
          shot={shot}
          matchedModels={findMatchedModels(shot.description, characterModels)}
          isGenerating={generatingShotIds.has(shot.id)}
          onGenerate={onGenerateSingleShot ? () => onGenerateSingleShot(shot.id) : undefined}
        />
      ))}
    </div>
  );
}

function ShotCard({
  shot,
  matchedModels,
  isGenerating,
  onGenerate,
}: {
  shot: Shot;
  matchedModels: CharacterModel[];
  isGenerating: boolean;
  onGenerate?: () => void;
}) {
  const colorClass =
    SHOT_TYPE_COLORS[shot.shotType] ?? "text-zinc-400 bg-zinc-800/20 border-zinc-700";
  const statusInfo = STATUS_BADGE[shot.videoStatus ?? "pending"] ?? STATUS_BADGE.pending;
  const busy = isGenerating || shot.videoStatus === "processing";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
      {/* 镜号 */}
      <div className="flex-none">
        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center font-mono text-sm text-zinc-400">
          {shot.shotNumber}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-w-0">
        {/* 标签行 */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${colorClass}`}>
            {shot.shotType}
          </span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
            {shot.cameraMove}
          </span>
          <span className="text-xs text-zinc-600 ml-auto">{shot.duration}s</span>
          <span className={`text-xs px-2 py-0.5 rounded border ${statusInfo.cls}`}>
            {busy && isGenerating ? "生成中…" : statusInfo.label}
          </span>
        </div>

        {/* 描述 */}
        <p className="text-sm text-zinc-300 leading-relaxed">{shot.description}</p>

        {/* 台词 */}
        {shot.dialogue && (
          <div className="mt-2 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-400">
            {shot.dialogue}
          </div>
        )}

        {/* 备注 */}
        {shot.notes && (
          <div className="mt-1.5 text-xs text-zinc-600 italic">{shot.notes}</div>
        )}

        {/* 匹配的建模参考图 */}
        {matchedModels.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            {matchedModels.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.imageUrl}
                  alt={m.name}
                  className="w-7 h-9 object-cover rounded"
                />
                <div>
                  <p className="text-xs text-zinc-300 font-medium leading-tight">{m.name}</p>
                  <p className="text-xs text-zinc-600">{m.entityType === "character" ? "角色" : "场景"}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 已生成的视频 */}
        {shot.videoUrl && (
          <div className="mt-3">
            <video
              src={shot.videoUrl}
              controls
              className="rounded-lg w-full max-h-48 bg-black"
            />
          </div>
        )}

        {/* 单镜头生成按钮 */}
        {onGenerate && (
          <div className="mt-3">
            <button
              onClick={onGenerate}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
            >
              {busy ? (
                <>
                  <SpinnerSm />
                  生成中...
                </>
              ) : shot.videoUrl ? (
                "重新生成"
              ) : (
                "生成视频"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SpinnerSm() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
