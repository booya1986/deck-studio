import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { FIXTURES_DIR } from "@/lib/store/paths";

export const DOCX = path.join(FIXTURES_DIR, "ofek-procedure.docx");
export const PDF = path.join(FIXTURES_DIR, "ofek-procedure.pdf");

export async function ensureFixtures() {
  const missing: string[] = [];
  for (const [file, target] of [[DOCX, "docx"], [PDF, "pdf"]] as const) {
    try {
      await fs.access(file);
    } catch {
      missing.push(target);
    }
  }
  if (!missing.length) return;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("pnpm", ["fixture", ...missing], { cwd: path.dirname(FIXTURES_DIR) });
}

export async function tmpDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `deck-studio-${prefix}-`));
}
