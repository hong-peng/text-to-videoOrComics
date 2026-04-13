"use client";

interface ScriptPreviewProps {
  streamText: string;
  streaming: boolean;
}

export function ScriptPreview({ streamText, streaming }: ScriptPreviewProps) {
  let parsed: Record<string, unknown> | null = null;
  try {
    const jsonMatch = streamText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // still streaming
  }

  if (!parsed) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="text-xs text-zinc-500 mb-2 font-mono">
          {streaming ? "生成中..." : "原始输出"}
        </div>
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-auto">
          {streamText}
          {streaming && <span className="animate-pulse">▋</span>}
        </pre>
      </div>
    );
  }

  const script = parsed as {
    hook: string;
    scenes: {
      sceneNumber: number;
      location: string;
      time: string;
      action: string;
      dialogue: { character: string; line: string }[];
    }[];
    climax: string;
    cliffhanger: string;
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-5">
        <div className="text-xs text-amber-400 font-medium mb-2 uppercase tracking-wide">
          开场钩子
        </div>
        <div className="text-sm">{script.hook}</div>
      </div>

      {script.scenes?.map((scene, i) => (
        <div
          key={i}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
              场景 {scene.sceneNumber}
            </span>
            <span className="text-xs text-indigo-400">{scene.location}</span>
            <span className="text-xs text-zinc-600">{scene.time}</span>
          </div>
          <p className="text-sm text-zinc-300 mb-3">{scene.action}</p>
          {scene.dialogue?.length > 0 && (
            <div className="space-y-1.5 border-l-2 border-zinc-700 pl-4">
              {scene.dialogue.map((d, j) => (
                <div key={j} className="text-sm">
                  <span className="text-indigo-400 font-medium">
                    {d.character}：
                  </span>
                  <span className="text-zinc-300">{d.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-5">
        <div className="text-xs text-red-400 font-medium mb-2 uppercase tracking-wide">
          高潮
        </div>
        <div className="text-sm">{script.climax}</div>
      </div>

      <div className="bg-purple-900/20 border border-purple-800/40 rounded-xl p-5">
        <div className="text-xs text-purple-400 font-medium mb-2 uppercase tracking-wide">
          悬念结局
        </div>
        <div className="text-sm">{script.cliffhanger}</div>
      </div>
    </div>
  );
}
