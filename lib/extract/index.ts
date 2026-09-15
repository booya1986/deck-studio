import { promises as fs } from "node:fs";
import path from "node:path";
import { BrandCandidates } from "@/lib/schema/candidates";
import { TextBlocks, type SourceBlock } from "@/lib/schema/common";
import { extractDocx } from "./docx";
import { extractPptx } from "./pptx";
import { extractPdf } from "./pdf";
import { cleanText, detectLanguage, guessOrgName, guessTitle } from "./text-common";

export type SourceKind = "pdf" | "docx" | "pptx";

export function kindOf(filename: string): SourceKind | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  return null;
}

export type ExtractResult = { textBlocks: TextBlocks; candidates: BrandCandidates };

/**
 * Deterministic pass over the source document.
 * Writes `text-blocks.json`, `candidates.json`, `pages/`, `media/` into `outDir`.
 */
export async function extractSource(args: {
  sourcePath: string;
  outDir: string;
  maxRenderPages?: number;
}): Promise<ExtractResult> {
  const filename = path.basename(args.sourcePath);
  const kind = kindOf(filename);
  if (!kind) throw new Error(`unsupported file type: ${filename}`);

  await fs.mkdir(args.outDir, { recursive: true });
  const buf = await fs.readFile(args.sourcePath);

  const { blocks, candidates } =
    kind === "docx"
      ? await extractDocx({ buf, filename, outDir: args.outDir })
      : kind === "pptx"
        ? await extractPptx({ buf, filename, outDir: args.outDir })
        : await extractPdf({
            buf, filename, outDir: args.outDir,
            sourcePath: args.sourcePath, maxRenderPages: args.maxRenderPages,
          });

  const allText = blocks.map((b) => b.text).join("\n");
  const headings = blocks
    .filter((b) => b.kind === "heading" || b.kind === "title")
    .map((b) => cleanText(b.text))
    .slice(0, 40);

  candidates.text = {
    title: guessTitle(blocks),
    headings,
    orgNameGuess: guessOrgName(blocks),
  };

  const textBlocks: TextBlocks = {
    filename,
    kind,
    language: detectLanguage(allText),
    title: guessTitle(blocks),
    pageCount: pageCountOf(blocks),
    blocks,
  };

  await fs.writeFile(
    path.join(args.outDir, "text-blocks.json"),
    JSON.stringify(TextBlocks.parse(textBlocks), null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(args.outDir, "candidates.json"),
    JSON.stringify(BrandCandidates.parse(candidates), null, 2) + "\n",
    "utf8",
  );
  return { textBlocks, candidates };
}

function pageCountOf(blocks: SourceBlock[]): number | undefined {
  const nums = blocks.map((b) => b.page ?? b.slide ?? 0).filter((n) => n > 0);
  return nums.length ? Math.max(...nums) : undefined;
}
