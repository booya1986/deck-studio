#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import { emitDesignSystem } from "@/lib/design-system/emit";

/**
 * pnpm runs scripts from the package root, so the directory the agent invoked
 * from arrives in INIT_CWD. That is the project folder.
 */
function invocationDir(): string {
  return process.env.INIT_CWD || process.cwd();
}

async function sourceFileName(projectDir: string): Promise<string> {
  try {
    const project = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
    return project?.source?.filename ?? "source";
  } catch {
    return "source";
  }
}

async function main() {
  const [dsArg, exArg, srcArg] = process.argv.slice(2);
  const base = invocationDir();
  const ds = path.resolve(dsArg ?? path.join(base, "design-system"));
  const ex = path.resolve(exArg ?? path.join(ds, "..", "extraction"));
  const src = srcArg ?? (await sourceFileName(path.dirname(ds)));

  const manifest = await emitDesignSystem({ dsDir: ds, extractionDir: ex, sourceFile: src });
  console.log(`${manifest.brand.name} · ${manifest.tokens.length} tokens · mode ${manifest.mode}`);
  console.log(`fonts: ${manifest.brandFonts.map((f) => `${f.role}=${f.family}(${f.status})`).join(" ")}`);
  console.log(`logo: ${manifest.assets.logo ?? "none"}  images: ${manifest.assets.images.length}`);
  console.log(`brand board: ${path.relative(base, path.join(ds, "brand-board.html")) || "brand-board.html"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
