/**
 * Bash policy for pipeline agents.
 *
 * Agents genuinely need a shell to inspect their own output, but a shell can
 * also write anywhere. So: a fixed set of read-only binaries is always allowed,
 * each stage adds the pipeline commands it needs, and anything that could write
 * or reach the network is rejected. The parser is quote-aware, so a `|` inside
 * a grep pattern or a `;` inside a jq filter is not mistaken for shell syntax.
 */

/** Read-only inspection tools every stage may use. */
export const READ_ONLY_COMMANDS = [
  "ls", "cat", "head", "tail", "wc", "file", "stat", "du", "find", "tree",
  "grep", "rg", "sort", "uniq", "cut", "tr", "echo", "printf", "basename", "dirname",
  "jq", "sed", "awk", "diff", "realpath", "pwd", "date", "env", "which", "column", "nl",
  "xxd", "strings", "base64", "md5", "shasum", "cd", "true",
  // media and document inspection
  "sips", "pdfinfo", "pdffonts", "pdftotext", "identify", "exiftool",
];

/** Binaries that are never acceptable, even as a pipeline segment. */
const FORBIDDEN_BINARIES = new Set([
  "rm", "mv", "cp", "chmod", "chown", "curl", "wget", "ssh", "scp", "git", "npm", "npx", "yarn",
  "sudo", "kill", "pkill", "eval", "source", "export", "tee", "dd", "mkfs", "python", "python3",
  "node", "ruby", "perl", "bash", "sh", "zsh", "open", "osascript",
]);

/** sed/awk can write with these flags or commands. */
const SED_WRITE = /(^|\s)-i\b|(^|\s)w\s|\bs\/.*\/w\b/;
const AWK_WRITE = /\bsystem\s*\(|>\s*"/;

export type BashVerdict = { allowed: true } | { allowed: false; reason: string };

type Segment = { text: string; tokens: string[] };

/**
 * Split a command line on unquoted control operators (| || && ;), returning
 * each segment's text and its whitespace-split unquoted tokens. Rejects
 * unquoted output redirection, backticks and command substitution.
 */
function parse(command: string): { segments: Segment[]; error?: string } {
  const segments: Segment[] = [];
  let cur = "";
  let tokens: string[] = [];
  let tok = "";
  let quote: "'" | '"' | null = null;

  const pushTok = () => {
    if (tok) tokens.push(tok);
    tok = "";
  };
  const pushSeg = () => {
    pushTok();
    if (cur.trim()) segments.push({ text: cur.trim(), tokens });
    cur = "";
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (quote) {
      cur += ch;
      tok += ch;
      if (ch === quote) quote = null;
      else if (quote === '"' && (ch === "`" || (ch === "$" && next === "("))) {
        return { segments, error: "החלפת פקודות ($(...) או backticks) חסומה" };
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      tok += ch;
      continue;
    }
    if (ch === "\\") {
      cur += ch + (next ?? "");
      tok += next ?? "";
      i++;
      continue;
    }
    if (ch === "`" || (ch === "$" && next === "(")) {
      return { segments, error: "החלפת פקודות ($(...) או backticks) חסומה" };
    }
    if (ch === "|" || ch === ";" || (ch === "&" && next === "&")) {
      pushSeg();
      if ((ch === "|" && next === "|") || ch === "&") i++;
      continue;
    }
    if (ch === "&") {
      return { segments, error: "הרצה ברקע (&) חסומה" };
    }
    if (ch === ">") {
      // Only stderr merging and discarding are allowed; every other > writes a file.
      const before = cur.slice(-1);
      const rest = command.slice(i + 1).replace(/^>?/, "").trimStart();
      const isStderrMerge = before === "2" && rest.startsWith("&1");
      const isDiscard = rest.startsWith("/dev/null");
      if (!isStderrMerge && !isDiscard) {
        return { segments, error: "הפניית פלט לקובץ (>) חסומה. הפניה מותרת רק ל-/dev/null או 2>&1" };
      }
      // Consume the redirection so it does not become a token.
      const consumed = isStderrMerge ? command.indexOf("&1", i) + 2 : command.indexOf("/dev/null", i) + 9;
      cur = cur.replace(/[12]$/, "");
      tok = tok.replace(/[12]$/, "");
      pushTok();
      i = consumed - 1;
      continue;
    }
    if (ch === "<") {
      // Input redirection reads a file; skip the operator itself, keep the path as a token.
      pushTok();
      continue;
    }
    if (/\s/.test(ch)) {
      cur += ch;
      pushTok();
      continue;
    }
    cur += ch;
    tok += ch;
  }
  if (quote) return { segments, error: "מרכאות לא סגורות" };
  pushSeg();
  return { segments };
}

export function checkBashCommand(raw: string, stageCommands: string[]): BashVerdict {
  const command = raw.trim();
  if (!command) return { allowed: false, reason: "פקודה ריקה" };

  const parsed = parse(command);
  if (parsed.error) return { allowed: false, reason: parsed.error };
  if (!parsed.segments.length) return { allowed: false, reason: "פקודה ריקה" };

  for (const seg of parsed.segments) {
    const isStage = stageCommands.some((c) => seg.text === c || seg.text.startsWith(c + " "));
    if (isStage) continue;

    // Leading NAME=value assignments are harmless and common: `P=…; ls "$P"`.
    let tokens = seg.tokens;
    while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
    if (!tokens.length && seg.tokens.length) continue;
    const binary = tokens[0];
    if (!binary) return { allowed: false, reason: "מקטע ריק בפקודה" };
    if (FORBIDDEN_BINARIES.has(binary)) {
      return { allowed: false, reason: `הפקודה ${binary} חסומה בשלב הזה` };
    }
    if (!READ_ONLY_COMMANDS.includes(binary)) {
      return {
        allowed: false,
        reason: `הפקודה ${binary} אינה ברשימת הפקודות המותרות. מותרות: ${READ_ONLY_COMMANDS.join(", ")}${
          stageCommands.length ? `, וכן: ${stageCommands.join(", ")}` : ""
        }`,
      };
    }
    if (binary === "sed" && SED_WRITE.test(seg.text)) {
      return { allowed: false, reason: "sed מותר לקריאה בלבד (בלי -i ובלי פקודת w)" };
    }
    if (binary === "awk" && AWK_WRITE.test(seg.text)) {
      return { allowed: false, reason: "awk מותר לקריאה בלבד (בלי system ובלי כתיבה לקובץ)" };
    }
    if (binary === "find" && /\s-(exec|delete|ok)\b/.test(seg.text)) {
      return { allowed: false, reason: "find מותר בלי -exec, -ok ו--delete" };
    }
  }
  return { allowed: true };
}

/** The line handed to the agent so it does not have to guess. */
export function bashPolicyText(stageCommands: string[]): string {
  return [
    "Bash is available but restricted to read-only inspection.",
    `Allowed commands: ${READ_ONLY_COMMANDS.join(", ")}.`,
    stageCommands.length ? `Pipeline commands allowed: ${stageCommands.join(", ")}.` : "",
    "Pipes, && and ; between allowed commands are fine, as are 2>&1 and >/dev/null.",
    "Writing to files with >, command substitution, background jobs, scripting languages (python, node) and anything that reaches the network are blocked.",
    "Prefer Read, Write, Edit, Glob and Grep for files; they are never blocked inside the project. Read can open PNG files, so look at images with Read.",
  ].filter(Boolean).join(" ");
}
