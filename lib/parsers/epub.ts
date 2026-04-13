import Epub from "epub2";
import type { ParsedContent } from "./txt";

export async function parseEpub(buffer: Buffer): Promise<ParsedContent> {
  return new Promise((resolve, reject) => {
    const tmpPath = `/tmp/epub_${Date.now()}.epub`;
    const fs = require("fs") as typeof import("fs");
    fs.writeFileSync(tmpPath, buffer);

    const epub = new Epub(tmpPath);
    epub.on("end", () => {
      const chapters: { title: string; content: string }[] = [];
      let fullText = "";

      const flow = epub.flow as { id: string; title?: string }[];
      let pending = flow.length;

      if (pending === 0) {
        fs.unlinkSync(tmpPath);
        resolve({ text: "", chapters: [] });
        return;
      }

      flow.forEach((chapter) => {
        epub.getChapter(chapter.id, (err: Error, text?: string) => {
          if (!err && text) {
            const cleaned = text.replace(/<[^>]*>/g, "").trim();
            chapters.push({ title: chapter.title ?? "", content: cleaned });
            fullText += cleaned + "\n\n";
          }
          pending--;
          if (pending === 0) {
            fs.unlinkSync(tmpPath);
            resolve({ text: fullText, chapters });
          }
        });
      });
    });
    epub.on("error", reject);
    epub.parse();
  });
}
