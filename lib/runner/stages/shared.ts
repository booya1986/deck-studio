import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AGENT_DIR } from "@/lib/store/paths";
import { BrandDecision } from "@/lib/schema/design-system";
import { Outline } from "@/lib/schema/outline";
import { Breakdown } from "@/lib/schema/breakdown";
import { Facts } from "@/lib/schema/facts";
import { QaReport } from "@/lib/schema/qa";
import type { StageId } from "@/lib/schema/project";

const promptCache = new Map<string, string>();

/** Agent system prompts live as markdown so they can be edited without a rebuild. */
export async function loadPrompt(name: string): Promise<string> {
  const cached = promptCache.get(name);
  if (cached) return cached;
  const text = await fs.readFile(path.join(AGENT_DIR, "prompts", `${name}.md`), "utf8");
  promptCache.set(name, text);
  return text;
}

const SCHEMAS = {
  "brand-decision": BrandDecision,
  outline: Outline,
  breakdown: Breakdown,
  facts: Facts,
  "qa-report": QaReport,
} as const;

/** JSON Schema handed to an agent so it knows the exact shape to write. */
export async function schemaFor(name: keyof typeof SCHEMAS): Promise<string> {
  return JSON.stringify(z.toJSONSchema(SCHEMAS[name], { target: "draft-7" }), null, 2);
}

/** Per-stage spend ceiling in USD; a runaway loop stops instead of billing on. */
const BUDGETS: Record<StageId, number> = {
  design_system: 4,
  outline: 4,
  research: 8,
  build: 14,
  /** one judge pass plus up to two fix rounds on a 15-slide deck */
  qa: 24,
};
export function stageBudget(stage: StageId): number {
  return BUDGETS[stage];
}

import type { ProjectState } from "@/lib/schema/project";
import { unresolvedComments } from "@/lib/store/projects";
import { runAgent, type AgentRunArgs } from "../sdk";
import type { StageContext, StageOutcome } from "./types";

const DECK_TYPE_EN: Record<string, string> = {
  training: "training session",
  procedure: "procedure walkthrough",
  onboarding: "onboarding",
  policy_update: "policy update",
  workshop: "workshop",
};

/** The brief as prose for an agent prompt. */
export function briefText(project: ProjectState): string {
  const b = project.brief;
  return `Brief:
- Audience: ${b.audience}
- Goal: ${b.goal}
- Deck type: ${DECK_TYPE_EN[b.deckType] ?? b.deckType}
- Duration: ${b.durationMin} minutes → ${b.slideRange[0]}–${b.slideRange[1]} slides
- AI-generated images: ${b.aiImages ? "allowed" : "not allowed"}${b.notes ? `\n- Notes from the requester: ${b.notes}` : ""}`;
}

/** Unresolved reviewer comments for this stage, as a list the agent can act on. */
export async function commentBlock(ctx: StageContext): Promise<string> {
  const comments = await unresolvedComments(ctx.projectId, ctx.stage);
  if (!comments.length) return "(no comments)";
  return comments
    .map((c) => {
      const where =
        c.target.kind === "general" ? "general" :
        c.target.kind === "slide" ? `slide ${c.target.ref}` : `section ${c.target.ref}`;
      return `- [${where}] ${c.text}`;
    })
    .join("\n");
}

/** An agent run that ended in error still cost money; the runner books it. */
export class AgentFailure extends Error {
  constructor(message: string, public costUsd: number, public numTurns: number) {
    super(message);
  }
}

/**
 * Run an agent, validate what it wrote, and on failure run it once more with
 * the validation error appended. Two strikes and the stage fails loudly.
 */
export async function runWithValidation(args: {
  ctx: StageContext;
  validate: () => Promise<string | null>;
  /**
   * Extra context for the retry only: what the failed attempt already left on
   * disk. Without it the second attempt repeats work the first one paid for —
   * on the fixture run that meant buying the same web research twice.
   */
  retryContext?: () => Promise<string>;
  /**
   * Files this stage must (re)write. Validation fails unless each was modified
   * after the run started, so a run that dies early — or a lead that ends its
   * turn before the specialists return — never passes on a previous run's files.
   */
  outputs?: string[];
} & Omit<AgentRunArgs, "stage" | "iteration" | "signal" | "onEvent">): Promise<StageOutcome> {
  const { ctx, validate: validateContent, retryContext, outputs = [], ...run } = args;
  const runStartedAt = Date.now();
  const validate = async (): Promise<string | null> => {
    const stale: string[] = [];
    for (const file of outputs) {
      try {
        // One second of slack for filesystems with coarse mtimes.
        if ((await fs.stat(file)).mtimeMs < runStartedAt - 1000) stale.push(path.basename(file));
      } catch {
        stale.push(path.basename(file));
      }
    }
    if (stale.length) return `these files were not written in this run: ${stale.join(", ")}`;
    return validateContent();
  };
  const sessionIds: string[] = [];
  let costUsd = 0;
  let numTurns = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const salvage = attempt === 1 ? "" : ((await retryContext?.()) ?? "");
    const prompt =
      attempt === 1
        ? run.prompt
        : `${run.prompt}

Your previous attempt produced output that failed validation:
${lastError}
Fix exactly that and write the files again.${salvage ? `\n\n${salvage}` : ""}`;

    let failure: string | null = null;
    try {
      const result = await runAgent({
        ...run,
        prompt,
        stage: ctx.stage,
        iteration: ctx.iteration,
        signal: ctx.signal,
        onEvent: ctx.emit,
      });
      if (result.sessionId) sessionIds.push(result.sessionId);
      costUsd += result.costUsd;
      numTurns += result.numTurns;
      if (result.isError) failure = `הסוכן נכשל: ${describeSubtype(result.errorSubtype)}`;
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      failure = describeRunError(e);
    }

    if (failure) {
      // The agent often writes every artifact and only then dies (a usage limit
      // hit on the last turn, a budget cap, a dropped connection). If what is on
      // disk passes validation, the stage's work is done: keep it rather than
      // throwing away a paid run.
      if (!(await validate())) {
        ctx.emit({
          stage: ctx.stage, iteration: ctx.iteration, type: "progress",
          payload: { salvaged: true, reason: failure },
        });
        return { sessionIds, costUsd, numTurns };
      }
      // A usage limit fails the same way on a retry; stop now.
      throw new AgentFailure(failure, costUsd, numTurns);
    }

    const error = await validate();
    if (!error) return { sessionIds, costUsd, numTurns };
    lastError = error;
    ctx.emit({ stage: ctx.stage, iteration: ctx.iteration, type: "error", payload: { validation: error, attempt } });
  }
  throw new AgentFailure(`הפלט לא עבר אימות גם אחרי ניסיון חוזר: ${lastError}`, costUsd, numTurns);
}

/** A readable reason for an exception thrown out of the SDK. */
export function describeRunError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const limit = raw.match(/(?:session|usage) limit[^·]*·\s*resets\s*([^\n(]+)/i);
  if (limit || /session limit|usage limit/i.test(raw)) {
    const at = limit?.[1]?.trim();
    return `נגמרה מכסת השימוש של Claude${at ? `; היא מתאפסת ב־${at}` : ""}. אפשר להריץ מחדש אחרי האיפוס, או להגדיר ANTHROPIC_API_KEY בקובץ .env.local כדי להמשיך מיד על חשבון מפתח API.`;
  }
  if (/credit balance is too low/i.test(raw)) {
    return "אין מספיק יתרה בחשבון ה־API של Anthropic. אפשר להטעין יתרה ב־console.anthropic.com ולהריץ מחדש.";
  }
  if (/invalid (x-)?api[ -]?key|authentication_error|\b401\b|not logged in|please run \/login|oauth token/i.test(raw)) {
    return "Deck Studio לא מחובר ל־Claude, או שהמפתח לא תקין. הריצו בטרמינל pnpm wizard כדי לחבר מחדש, ואז הריצו את השלב שוב.";
  }
  return `הסוכן נכשל: ${raw}`;
}

export function describeSubtype(subtype: string | undefined): string {
  switch (subtype) {
    case "error_max_budget_usd": return "תקציב השלב נגמר";
    case "error_max_turns": return "מכסת הסבבים נגמרה";
    case "error_max_structured_output_retries": return "הפלט המובנה לא התקבל";
    default: return subtype ?? "שגיאה";
  }
}
