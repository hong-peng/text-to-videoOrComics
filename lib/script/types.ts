export interface Character {
  name: string;
  description: string;
  traits: string[];
  relationships: string[];
  /** 五官样貌：具体外貌描述，如脸型、眼睛、鼻子、嘴巴、肤色等 */
  appearance?: string;
  /** 年龄或年龄段，如"25岁"、"中年"、"花甲之年" */
  age?: string;
  /** 性别 */
  gender?: string;
  /** 穿搭风格：服装、配饰、发型等 */
  style?: string;
  /** 气质：整体气场与神韵，如"冷峻儒雅"、"英气勃发" */
  temperament?: string;
}

export interface Scene {
  location: string;
  description: string;
  mood: string;
  /** "anchor"（核心固定场景）或 "flow"（流动场景） */
  sceneType?: "anchor" | "flow";
  /** 叙事功能：该场景在故事中的核心作用，如"展现主角内心独白"、"主反派正面冲突" */
  narrativeFunction?: string;
  /** 标志性元素：让观众形成记忆锚点的视觉符号，如"窗台上的多肉植物"（固定场景必填） */
  landmarkElement?: string;
  /** 场景自带的情绪/冲突张力描述，如"闭馆铃声带来时间压迫感" */
  dramaticTension?: string;
}

export interface PlotPoint {
  summary: string;
  characters_involved: string[];
  tension_level: number;
}

export interface NovelAnalysis {
  characters: Character[];
  scenes: Scene[];
  plotPoints: PlotPoint[];
}

export interface ScriptScene {
  sceneNumber: number;
  location: string;
  time: string;
  action: string;
  dialogue: { character: string; line: string }[];
}

export interface ScriptContent {
  hook: string;
  scenes: ScriptScene[];
  climax: string;
  cliffhanger: string;
}

export interface Episode {
  episodeNumber: number;
  title: string;
  scriptContent: ScriptContent;
}
