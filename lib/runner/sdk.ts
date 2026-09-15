import path from "node:path";
import { query, type AgentDefinition, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StageId } from "@/lib/schema/project";
import type { RunEvent } from "@/lib/store/runlog";
import { REPO_ROOT } from "@/lib/store/paths";
import { checkBashCommand } from "./bash-policy";

export const MODELS = {
  /** Visual and design work, where quality of the output matters most: design system, deck build, fix rounds. */
  main: "claude-opus-5",
  /**
   * Text structuring work over a long document: outline and research. Sonnet is
   * 2-3x faster per turn than Opus here, and these stages are gated and revisable,
   * so speed wins. Put back to `main` if outlines get shallow.
   */
  fast: "claude-sonnet-5",
  /** Verifiers, critics and mechanical checks. */
  cheap: "claude-sonnet-5",
} as const;

export type AgentRunArgs = {
  stage: StageId;
  iteration: number;
  /** the agent's working directory — always a project folder */
  cwd: string;
  prompt: string;
  systemPrompt?: string;
  agents?: Record<string, AgentDefinition>;
  allowedTools: string[];
  model?: string;
  effort?: Options["effort"];
  maxTurns?: number;
  maxBudgetUsd?: number;
  outputFormat?: Options["outputFormat"];
  /** absolute paths the agent may write to, beyond `cwd` */
  writableDirs?: string[];
  /** Bash commands the agent may run, matched against the start of the command */
  allowedCommands?: string[];
  signal?: AbortSignal;
  onEvent?: (e: Omit<RunEvent, "ts">) => void;
};

export type AgentRunResult = {
  sessionId: string | null;
  costUsd: number;
  numTurns: number;
  resultText: string;
  structuredOutput?: unknown;
  isError: boolean;
  errorSubtype?: string;
};

/** Tools every stage gets; stages add to this list. */
export const READ_TOOLS = ["Read", "Glob", "Grep"];
export const WRITE_TOOLS = ["Write", "Edit"];

/**
 * Tools the host machine offers that no stage of this pipeline should see.
 * The MCP wildcard matters most: without it every globally configured MCP
 * server lands in the agent's context, which costs more and invites drift.
 */
const NEVER_ALLOWED = [
  "mcp__*",
  "Artifact", "DesignSync", "CronCreate", "CronDelete", "CronList",
  "EnterWorktree", "ExitWorktree", "ListAgents", "SendMessage",
  "PushNotification", "RemoteTrigger", "Workflow", "SendUserFile",
  // Waiting and background-task tools. A headless stage has no one to wake it:
  // a lead that dispatches specialists in the background and then schedules a
  // wakeup ends its query with the files unwritten.
  "ScheduleWakeup", "Monitor", "TaskOutput", "TaskStop", "AskUserQuestion",
  "EnterPlanMode", "ExitPlanMode",
];

/**
 * Run one agent turn-loop to completion.
 * The agent is confined to its project folder by a PreToolUse hook; the
 * permission mode denies anything not explicitly allowed.
 */
export async function runAgent(args: AgentRunArgs): Promise<AgentRunResult> {
  const roots = [path.resolve(args.cwd), ...(args.writableDirs ?? []).map((d) => path.resolve(d))];
  const emit = (e: Omit<RunEvent, "ts">) => args.onEvent?.(e);

  let sessionId: string | null = null;
  let costUsd = 0;
  let numTurns = 0;
  let resultText = "";
  let structuredOutput: unknown;
  let isError = false;
  let errorSubtype: string | undefined;

  const options: Options = {
    cwd: args.cwd,
    // Only the repo's own .claude is loaded, so a run never inherits the
    // developer's global skills and agents.
    settingSources: ["project"],
    permissionMode: "dontAsk",
    allowedTools: args.allowedTools,
    disallowedTools: NEVER_ALLOWED,
    agents: args.agents,
    model: args.model ?? MODELS.main,
    effort: args.effort,
    maxTurns: args.maxTurns,
    maxBudgetUsd: args.maxBudgetUsd,
    outputFormat: args.outputFormat,
    abortController: toController(args.signal),
    // The Claude Code preset is a cached prefix; a fully custom prompt is a
    // cache miss and measured several times more expensive per run.
    systemPrompt: args.systemPrompt
      ? { type: "preset", preset: "claude_code", append: args.systemPrompt }
      : undefined,
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              const denial = checkTool(input, roots, args.allowedCommands ?? []);
              if (!denial) return {};
              emit({
                stage: args.stage,
                iteration: args.iteration,
                type: "error",
                payload: { blocked: (input as { tool_name?: string }).tool_name, reason: denial },
              });
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: "deny",
                  permissionDecisionReason: denial,
                },
              };
            },
          ],
        },
      ],
    },
  };

  for await (const message of query({ prompt: args.prompt, options })) {
    const event = toEvent(message, args.stage, args.iteration);
    if (event) emit(event);

    switch (message.type) {
      case "system":
        if (message.subtype === "init") sessionId = message.session_id;
        break;
      case "result":
        costUsd = message.total_cost_usd ?? 0;
        numTurns = message.num_turns ?? 0;
        if (message.subtype === "success") {
          resultText = message.result ?? "";
          structuredOutput = message.structured_output;
        } else {
          isError = true;
          errorSubtype = message.subtype;
        }
        break;
    }
  }

  return { sessionId, costUsd, numTurns, resultText, structuredOutput, isError, errorSubtype };
}

function toController(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const c = new AbortController();
  if (signal.aborted) c.abort();
  else signal.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}

const PATH_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

/** Returns a denial reason, or null when the call is allowed. */
function checkTool(
  input: unknown,
  roots: string[],
  allowedCommands: string[],
): string | null {
  const { tool_name: tool, tool_input: raw } = input as { tool_name?: string; tool_input?: unknown };
  const toolInput = (raw ?? {}) as Record<string, unknown>;

  if (tool && PATH_TOOLS.has(tool)) {
    const file = typeof toolInput.file_path === "string" ? toolInput.file_path : "";
    if (!file) return "כלי הכתיבה נקרא בלי נתיב קובץ";
    if (!isInside(file, roots)) {
      return `כתיבה מחוץ לתיקיית הפרויקט נחסמה: ${file}`;
    }
  }

  if (tool === "Bash") {
    const command = typeof toolInput.command === "string" ? toolInput.command : "";
    const verdict = checkBashCommand(command, allowedCommands);
    if (!verdict.allowed) return verdict.reason;
  }

  return null;
}

function isInside(file: string, roots: string[]): boolean {
  const abs = path.resolve(file);
  return roots.some((root) => abs === root || abs.startsWith(root + path.sep));
}

/** Map an SDK message to a UI event. Returns null for messages we do not surface. */
function toEvent(message: SDKMessage, stage: StageId, iteration: number): Omit<RunEvent, "ts"> | null {
  const base = { stage, iteration };
  switch (message.type) {
    case "system":
      if (message.subtype !== "init") return null;
      return {
        ...base,
        type: "init",
        payload: { sessionId: message.session_id, model: message.model, tools: message.tools.length },
      };

    case "assistant": {
      const agent = message.parent_tool_use_id ? "subagent" : undefined;
      const blocks = message.message.content as { type: string; text?: string; name?: string; input?: unknown }[];
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
      const tools = blocks.filter((b) => b.type === "tool_use");
      if (tools.length) {
        return {
          ...base,
          type: "tool",
          agent,
          payload: tools.map((t) => ({ name: t.name, summary: summariseToolInput(t.name, t.input) })),
        };
      }
      if (text) return { ...base, type: "text", agent, payload: { text: text.slice(0, 4000) } };
      return null;
    }

    case "result":
      return {
        ...base,
        type: message.subtype === "success" ? "result" : "error",
        payload: {
          subtype: message.subtype,
          costUsd: message.total_cost_usd,
          numTurns: message.num_turns,
          durationMs: message.duration_ms,
        },
      };

    default:
      return null;
  }
}

/** One readable line per tool call, for the run log. */
function summariseToolInput(name: string | undefined, input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>;
  const rel = (p: unknown) => (typeof p === "string" ? path.relative(REPO_ROOT, p) || p : "");
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
      return rel(o.file_path);
    case "Bash":
      return typeof o.command === "string" ? o.command.slice(0, 120) : "";
    case "Glob":
    case "Grep":
      return typeof o.pattern === "string" ? o.pattern : "";
    case "Agent":
    case "Task":
      return typeof o.subagent_type === "string" ? o.subagent_type : "";
    default:
      return "";
  }
}
