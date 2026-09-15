#!/usr/bin/env tsx
import path from "node:path";
import { assembleDeck } from "@/lib/deck/assemble";

/** pnpm runs scripts from the package root; INIT_CWD is where the agent invoked it. */
async function main() {
  const [arg] = process.argv.slice(2);
  const projectDir = path.resolve(arg ?? process.env.INIT_CWD ?? process.cwd());
  const { slides, out } = await assembleDeck({ projectDir });
  console.log(`${slides} slides → ${path.relative(projectDir, out)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
