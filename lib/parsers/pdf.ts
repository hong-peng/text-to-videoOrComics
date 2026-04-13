import { PDFParse } from "pdf-parse";
import type { ParsedContent } from "./txt";

export async function parsePdf(buffer: Buffer): Promise<ParsedContent> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return { text: result.text };
}
