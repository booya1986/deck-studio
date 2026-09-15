#!/usr/bin/env tsx
import path from "node:path";
import { extractSource } from "@/lib/extract";

async function main() {
  const [src, out] = process.argv.slice(2);
  if (!src) {
    console.error("usage: pnpm extract <source-file> [out-dir]");
    process.exit(2);
  }
  const sourcePath = path.resolve(src);
  const outDir = path.resolve(out ?? path.join(path.dirname(sourcePath), "extraction"));
  const { textBlocks, candidates } = await extractSource({ sourcePath, outDir });
  console.log(`blocks: ${textBlocks.blocks.length}  language: ${textBlocks.language}  pages: ${textBlocks.pageCount ?? "-"}`);
  console.log(`title: ${textBlocks.title ?? "-"}`);
  console.log(`org guess: ${candidates.text.orgNameGuess ?? "-"}`);
  console.log(`colors: ${candidates.colors.slice(0, 6).map((c) => `${c.hex}(${c.count})`).join(" ")}`);
  console.log(`fonts: ${candidates.fonts.slice(0, 5).map((f) => `${f.family}[${f.script}${f.embedded ? ",emb" : ""}](${f.count})`).join(" ")}`);
  console.log(`images: ${candidates.images.slice(0, 5).map((i) => `${i.path} ${i.w}x${i.h} score=${i.logoScore}`).join("  ")}`);
  console.log(`pages rendered: ${candidates.pages.length}`);
  console.log(`→ ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
