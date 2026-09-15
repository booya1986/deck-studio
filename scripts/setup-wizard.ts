#!/usr/bin/env tsx
/**
 * Deck Studio setup wizard.
 *
 *   ./setup.sh           first time: installs dependencies, then runs this wizard
 *   pnpm wizard          checks the machine, fixes what it can, connects Claude, picks a port
 *   pnpm checkup         the same checks with no questions; exits 1 when something required is missing
 *   pnpm checkup --test  also sends one tiny request to Claude to prove the connection works
 */
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DATA_DIR, REPO_ROOT } from "@/lib/store/paths";
import { applyEnv, parseEnv, readEnvFile, upsertEnv, writeEnvFile } from "@/lib/setup/env-file";
import { firstFreePort, portIsFree } from "@/lib/setup/port";

const ENV_FILE = path.join(REPO_ROOT, ".env.local");
const BIN = (name: string) =>
  path.join(REPO_ROOT, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const CHECK_ONLY = process.argv.includes("--check") || !process.stdin.isTTY;
const TEST_IN_CHECK = process.argv.includes("--test");

const paint = (code: number) => (s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const bold = paint(1);
const dim = paint(2);

type Result = { name: string; ok: boolean; required: boolean; note?: string };
const results: Result[] = [];

function line(ok: boolean | "warn", label: string, note = "") {
  const mark = ok === true ? green("✓") : ok === "warn" ? yellow("!") : red("✗");
  console.log(`  ${mark} ${label}${note ? dim(`  ${note}`) : ""}`);
}

function has(cmd: string): boolean {
  const probe =
    process.platform === "win32"
      ? spawnSync("where", [cmd], { stdio: "ignore" })
      : spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
  return probe.status === 0;
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: REPO_ROOT, shell: process.platform === "win32" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function ask(question: string, fallback = ""): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback);
    }),
  );
}

async function confirm(question: string, fallback = true): Promise<boolean> {
  const answer = (await ask(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `)).toLowerCase();
  return answer ? answer.startsWith("y") : fallback;
}

/** Typed characters are not echoed: the answer is an API key. */
function askSecret(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const writer = rl as unknown as { _writeToOutput: (s: string) => void };
  let shown = false;
  writer._writeToOutput = (s: string) => {
    if (!shown) {
      process.stdout.write(s);
      shown = true;
    }
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    }),
  );
}

/* ---------------------------------------------------------------- checks */

async function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  const ok = major >= 22;
  line(ok, "Node.js", `v${process.versions.node}${ok ? "" : " (needs 22 or newer: https://nodejs.org)"}`);
  results.push({ name: "Node.js 22+", ok, required: true });
}

const POPPLER = ["pdftoppm", "pdfimages", "pdffonts"];

async function checkPoppler() {
  const missing = () => POPPLER.filter((c) => !has(c));
  if (!missing().length) {
    line(true, "PDF tools (poppler)");
    results.push({ name: "PDF tools", ok: true, required: true });
    return;
  }
  line(false, "PDF tools (poppler)", `missing: ${missing().join(", ")}`);

  if (!CHECK_ONLY) {
    if (process.platform === "darwin" && has("brew")) {
      if (await confirm("    Install them with Homebrew now (brew install poppler)?")) await run("brew", ["install", "poppler"]);
    } else if (process.platform === "linux") {
      const cmd = has("apt-get")
        ? "sudo apt-get install -y poppler-utils"
        : has("dnf")
          ? "sudo dnf install -y poppler-utils"
          : "your package manager's poppler-utils package";
      console.log(`    Install them with: ${bold(cmd)}  then run ${bold("pnpm wizard")} again.`);
    } else if (process.platform === "darwin") {
      console.log(`    Install Homebrew (https://brew.sh), then run ${bold("brew install poppler")}.`);
    } else {
      console.log("    On Windows, run Deck Studio inside WSL (Ubuntu) and install poppler-utils there.");
    }
  }
  const ok = !missing().length;
  if (ok) line(true, "PDF tools (poppler)", "installed");
  results.push({ name: "PDF tools", ok, required: true, note: ok ? undefined : "brew install poppler / apt-get install poppler-utils" });
}

async function chromiumLaunches(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

async function checkChromium() {
  if (await chromiumLaunches()) {
    line(true, "Headless browser for quality checks");
    results.push({ name: "Headless browser", ok: true, required: true });
    return;
  }
  line(false, "Headless browser for quality checks", "not installed");
  let doInstall = !CHECK_ONLY && (await confirm("    Download it now (about 100 MB, one time)?"));
  if (doInstall) {
    const args = ["install", "chromium"];
    doInstall = (await run(BIN("playwright"), args)) === 0;
    if (!doInstall && process.platform === "linux") {
      console.log(`    If it still fails, install its system libraries: ${bold("sudo npx playwright install-deps chromium")}`);
    }
  }
  const ok = doInstall ? await chromiumLaunches() : false;
  if (ok) line(true, "Headless browser for quality checks", "installed");
  results.push({ name: "Headless browser", ok, required: true, note: ok ? undefined : "pnpm exec playwright install chromium" });
}

async function testClaude(): Promise<{ ok: boolean; detail: string }> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    let text = "";
    let cost = 0;
    for await (const message of query({
      prompt: "Reply with the single word OK.",
      options: {
        cwd: REPO_ROOT,
        model: "claude-haiku-4-5-20251001",
        maxTurns: 1,
        allowedTools: [],
        settingSources: [],
        permissionMode: "dontAsk",
        abortController: controller,
      },
    })) {
      if (message.type === "result") {
        cost = message.total_cost_usd ?? 0;
        if (message.subtype !== "success") return { ok: false, detail: message.subtype };
        text = message.result ?? "";
      }
    }
    const ok = /\bok\b/i.test(text);
    return { ok, detail: ok ? `Claude answered · $${cost.toFixed(4)}` : `unexpected answer: ${text.slice(0, 60)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkClaude() {
  let envText = await readEnvFile(ENV_FILE);
  let saved = parseEnv(envText);
  const keyFromShell = process.env.ANTHROPIC_API_KEY && !saved.ANTHROPIC_API_KEY;
  const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || saved.ANTHROPIC_API_KEY);
  const hasToken = () => Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || saved.CLAUDE_CODE_OAUTH_TOKEN);
  const hasClaudeCode = has("claude");

  const describe = () =>
    hasKey()
      ? keyFromShell ? "API key from your shell environment" : "API key saved in .env.local"
      : hasToken()
        ? "Claude Code token saved in .env.local"
        : hasClaudeCode
          ? "your Claude Code sign-in on this machine"
          : "not connected";

  let connected = hasKey() || hasToken() || hasClaudeCode;
  line(connected ? true : false, "Claude connection", describe());

  if (!CHECK_ONLY) {
    const change = connected ? await confirm("    Change how Deck Studio connects to Claude?", false) : true;
    if (change) {
      console.log(`
    How should Deck Studio reach Claude?
      ${bold("1")}  API key from https://console.anthropic.com   ${dim("pay per use; simplest for teams")}
      ${bold("2")}  My Claude subscription, through Claude Code   ${dim("needs Claude Code installed and signed in")}
      ${bold("3")}  Skip for now`);
      const choice = await ask("    Choose 1, 2 or 3 [1]: ", "1");
      if (choice === "1") {
        const key = await askSecret("    Paste the API key (it will not be shown): ");
        if (key) {
          if (!key.startsWith("sk-ant-")) console.log(yellow("    That does not look like an Anthropic key (they start with sk-ant-). Saved anyway."));
          envText = upsertEnv(envText, { ANTHROPIC_API_KEY: key });
          await writeEnvFile(ENV_FILE, envText);
          saved = parseEnv(envText);
          console.log(`    ${green("Saved")} to .env.local ${dim("(ignored by git, readable only by you)")}`);
        }
      } else if (choice === "2") {
        if (saved.ANTHROPIC_API_KEY) {
          envText = upsertEnv(envText, { ANTHROPIC_API_KEY: null });
          await writeEnvFile(ENV_FILE, envText);
          saved = parseEnv(envText);
          console.log("    Removed the saved API key so the subscription is used.");
        }
        if (!has("claude")) {
          console.log(`    Install Claude Code:  ${bold("npm install -g @anthropic-ai/claude-code")}
    then run ${bold("claude")} once and sign in, and run ${bold("pnpm wizard")} again.`);
        } else {
          console.log(`    Using your Claude Code sign-in. If you have never signed in, run ${bold("claude")} once first.`);
        }
      }
      connected = hasKey() || hasToken() || has("claude");
    }
  }

  let verified: boolean | null = null;
  const wantTest = connected && (CHECK_ONLY ? TEST_IN_CHECK : await confirm("    Test the connection now? One tiny request, well under one cent."));
  if (wantTest) {
    applyEnv(saved);
    process.stdout.write("    Testing… ");
    const t = await testClaude();
    verified = t.ok;
    console.log(t.ok ? green(t.detail) : red(t.detail));
    if (!t.ok) {
      console.log(`    ${dim("An API key: check it at console.anthropic.com. A subscription: run `claude` and sign in again.")}`);
    }
  }

  const ok = connected && verified !== false;
  results.push({
    name: "Claude connection",
    ok,
    required: true,
    note: ok ? (verified ? undefined : "not tested; run pnpm checkup --test") : "run pnpm wizard",
  });
}

async function checkPort() {
  const envText = await readEnvFile(ENV_FILE);
  const saved = parseEnv(envText);
  const wanted = Number(process.env.PORT || saved.PORT) || 3000;
  const free = await portIsFree(wanted);
  if (CHECK_ONLY) {
    line(free ? true : "warn", "Port", free ? `${wanted}` : `${wanted} is busy; pnpm studio will pick the next free port`);
    results.push({ name: "Port", ok: true, required: false });
    return;
  }
  const suggestion = free ? wanted : await firstFreePort(wanted);
  line(true, "Port", free ? `${wanted} is free` : `${wanted} is busy; ${suggestion} is free`);
  const answer = Number(await ask(`    Port for Deck Studio [${suggestion}]: `, String(suggestion)));
  const port = Number.isInteger(answer) && answer > 0 && answer < 65536 ? answer : suggestion;
  if (port !== 3000 || saved.PORT) {
    await writeEnvFile(ENV_FILE, upsertEnv(envText, { PORT: String(port) }));
  }
  results.push({ name: "Port", ok: true, required: false, note: String(port) });
}

/* ------------------------------------------------------------------ main */

async function main() {
  console.log(`\n${bold("Deck Studio setup")}${CHECK_ONLY ? dim("  (checks only)") : ""}\n`);
  await fs.mkdir(DATA_DIR, { recursive: true });

  await checkNode();
  await checkPoppler();
  await checkChromium();
  await checkClaude();
  await checkPort();

  const blocking = results.filter((r) => r.required && !r.ok);
  console.log("");
  if (blocking.length) {
    console.log(red(bold("Not ready yet:")));
    for (const r of blocking) console.log(`  ${red("✗")} ${r.name}${r.note ? dim(`  ${r.note}`) : ""}`);
    console.log(`\nFix the items above, then run ${bold("pnpm wizard")} again.\n`);
    process.exit(1);
  }

  console.log(green(bold("Ready.")) + ` Start Deck Studio any time with ${bold("pnpm studio")}.\n`);
  if (!CHECK_ONLY && (await confirm("Start it now?"))) {
    const code = await run(BIN("tsx"), [path.join("scripts", "studio.ts")]);
    process.exit(code);
  }
}

main().catch((e) => {
  console.error(red(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
