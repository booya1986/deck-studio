#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import { FIXTURES_DIR } from "@/lib/store/paths";
import { buildDocx } from "./fixture/make-docx";
import { buildPdf } from "./fixture/make-pdf";
import { logoPng } from "./fixture/logo";

async function main() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const want = process.argv.slice(2);
  const all = want.length === 0;

  if (all || want.includes("logo")) {
    const f = path.join(FIXTURES_DIR, "ofek-logo.png");
    await fs.writeFile(f, await logoPng(420));
    console.log("wrote", f);
  }
  if (all || want.includes("docx")) {
    const f = path.join(FIXTURES_DIR, "ofek-procedure.docx");
    await fs.writeFile(f, await buildDocx());
    console.log("wrote", f);
  }
  if (all || want.includes("pdf")) {
    const f = path.join(FIXTURES_DIR, "ofek-procedure.pdf");
    await fs.writeFile(f, await buildPdf());
    console.log("wrote", f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
