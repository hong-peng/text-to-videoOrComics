export interface MangaPanelData {
  panelNumber: number;
  /** 中文画面描述，用于展示 */
  description: string;
  /** 英文 SD 提示词，直接用于图片生成 */
  prompt: string;
  characters: string[];
  mood: string;
  /** 对话气泡内容（中文），如 "就凭你？" */
  dialogue?: string;
  /** 心理活动/内心独白（中文），用于思想云朵，如 "他终于来了..." */
  innerMonologue?: string;
  /** 音效/拟声词（中文），如 "咚！" "哐！" "嘶..." */
  sfx?: string;
  /** 人物表情类型，如 "震惊" "愤怒" "得意" "崩溃" "冷笑" */
  expressionType?: string;
  /** 格子尺寸权重：big（关键爽点/震撼场面）/ medium（普通推进）/ small（快节奏多格）*/
  panelSize?: "big" | "medium" | "small";
}

export interface MangaStoryboard {
  episodeNumber: number;
  panels: MangaPanelData[];
}
