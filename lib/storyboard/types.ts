export interface ShotData {
  shotNumber: number;
  /** 景别：全景/中景/近景/特写/大远景 */
  shotType: string;
  /** 运镜：固定/推镜/拉镜/摇镜/移镜/跟镜/升镜/降镜 */
  cameraMove: string;
  /** 画面核心描述（用于 AI 生图，20-60字） */
  description: string;
  /** 场景地点 */
  location: string;
  /** 时间/光线：如"日景-正午强光"、"夜景-蜡烛暖光" */
  lighting: string;
  /** 画面中出现的角色名列表 */
  characters: string[];
  /** 情绪/氛围：如"紧张"、"温馨"、"肃杀" */
  mood: string;
  /** 该镜头对应的台词或旁白（无则空字符串） */
  dialogue: string;
  /** 时长（秒） */
  duration: number;
  /** 导演备注/特效说明 */
  notes: string;
}

export interface StoryboardData {
  episodeNumber: number;
  shots: ShotData[];
}
