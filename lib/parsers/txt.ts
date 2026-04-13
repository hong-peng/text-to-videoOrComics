export interface ParsedContent {
  text: string;
  chapters?: { title: string; content: string }[];
}

export async function parseTxt(buffer: Buffer): Promise<ParsedContent> {
  const text = buffer.toString("utf-8");
  return { text };
}
