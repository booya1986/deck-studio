import { promises as fs } from "node:fs";

/**
 * Minimal `.env.local` handling for the setup wizard and the launcher. Next.js
 * loads the file for the server by itself; these scripts run before Next does.
 */

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const m = raw.match(LINE);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "").trim();
    out[m[1]] = value;
  }
  return out;
}

function formatValue(value: string): string {
  return /[\s#"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * Set or remove keys while keeping every other line, comment and order intact.
 * `null` removes the key. New keys are appended.
 */
export function upsertEnv(text: string, updates: Record<string, string | null>): string {
  const pending = new Map(Object.entries(updates));
  const lines = text ? text.replace(/\r?\n$/, "").split(/\r?\n/) : [];
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(LINE);
    if (m && pending.has(m[1])) {
      const value = pending.get(m[1]);
      pending.delete(m[1]);
      if (value !== null && value !== undefined) kept.push(`${m[1]}=${formatValue(value)}`);
      continue;
    }
    kept.push(line);
  }
  for (const [key, value] of pending) {
    if (value !== null && value !== undefined) kept.push(`${key}=${formatValue(value)}`);
  }
  return kept.length ? kept.join("\n") + "\n" : "";
}

export async function readEnvFile(file: string): Promise<string> {
  return fs.readFile(file, "utf8").catch(() => "");
}

/** The file may hold an API key: readable by the owner only. */
export async function writeEnvFile(file: string, text: string): Promise<void> {
  await fs.writeFile(file, text, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(file, 0o600).catch(() => undefined);
}

/** Copy values into process.env without overriding what the shell already set. */
export function applyEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
