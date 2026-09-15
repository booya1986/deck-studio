import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { BrandCandidates } from "@/lib/schema/candidates";
import { TextBlocks } from "@/lib/schema/common";
import { REPO_ROOT } from "@/lib/store/paths";
import type { ExtractResult } from "./index";

const exec = promisify(execFile);

/**
 * Run extraction in a child process.
 *
 * pdf.js ships an ESM worker that the Next server bundle cannot load, and
 * keeping the heavy native work (pdf.js, sharp, poppler) out of the server
 * process also means a crash there cannot take the app down.
 */
export async function extractInChildProcess(args: {
  sourcePath: string;
  outDir: string;
}): Promise<ExtractResult> {
  await exec(
    "node",
    ["--import", "tsx", path.join(REPO_ROOT, "scripts", "extract.ts"), args.sourcePath, args.outDir],
    { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, DECK_STUDIO_ROOT: REPO_ROOT } },
  );
  const [textBlocks, candidates] = await Promise.all([
    fs.readFile(path.join(args.outDir, "text-blocks.json"), "utf8").then((t) => TextBlocks.parse(JSON.parse(t))),
    fs.readFile(path.join(args.outDir, "candidates.json"), "utf8").then((t) => BrandCandidates.parse(JSON.parse(t))),
  ]);
  return { textBlocks, candidates };
}
