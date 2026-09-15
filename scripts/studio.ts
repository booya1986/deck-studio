#!/usr/bin/env tsx
/**
 * Start Deck Studio: load .env.local, pick a free port, run the Next.js server
 * and open the browser once it answers.
 *
 *   pnpm studio              port from PORT (default 3000), next free one if busy
 *   pnpm studio --no-open    do not open a browser
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { REPO_ROOT } from "@/lib/store/paths";
import { applyEnv, parseEnv, readEnvFile } from "@/lib/setup/env-file";
import { firstFreePort } from "@/lib/setup/port";

const isWin = process.platform === "win32";

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url: string) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : isWin ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    // no browser available; the URL is printed anyway
  }
}

async function main() {
  applyEnv(parseEnv(await readEnvFile(path.join(REPO_ROOT, ".env.local"))));

  const wanted = Number(process.env.PORT) || 3000;
  const port = await firstFreePort(wanted);
  if (port !== wanted) console.log(`Port ${wanted} is busy; using ${port}.`);
  // Localhost only. The app has no login: anyone who can reach it can read your
  // projects and spend your Claude usage. Set HOST=0.0.0.0 only on a network you trust.
  const host = process.env.HOST || "127.0.0.1";
  const url = `http://localhost:${port}`;
  const probe = `http://${host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host}:${port}`;

  const next = spawn(
    path.join(REPO_ROOT, "node_modules", ".bin", isWin ? "next.cmd" : "next"),
    ["dev", "-H", host, "-p", String(port)],
    { stdio: "inherit", cwd: REPO_ROOT, env: { ...process.env, PORT: String(port) }, shell: isWin },
  );
  next.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => next.kill(signal));

  if (await waitForHttp(probe, 120_000)) {
    console.log(`\n  Deck Studio is running at ${url}  (Ctrl+C to stop)\n`);
    if (!process.argv.includes("--no-open")) openBrowser(url);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
