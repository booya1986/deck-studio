import { QaIssue, type QaReport } from "@/lib/schema/qa";

/**
 * Build the QA report the gate shows from three sources, in code rather than by
 * the judge:
 *
 * - the mechanical findings (`auto-report.json`), always all of them;
 * - the judge's own findings from this pass;
 * - on a scoped re-check after a fix round, the judge findings from the previous
 *   pass for every slide that was not re-judged.
 *
 * The judge used to copy the mechanical findings into its report before adding
 * its own, which cost minutes of typing per pass, and a second pass re-judged
 * all fifteen slides when only the fixed ones had changed.
 */
export function mergeJudgeReport(args: {
  iteration: number;
  auto: QaReport;
  /** whatever the judge wrote; parsed leniently, one issue at a time */
  judged: unknown;
  /** the previous pass's merged report, when this pass was scoped */
  carried: QaReport | null;
  /** slides the judge was asked to look at; null means all of them */
  scope: number[] | null;
}): { report: QaReport; judgeValid: boolean } {
  const raw =
    args.judged && typeof args.judged === "object" ? (args.judged as { issues?: unknown }).issues : undefined;
  const judgeValid = Array.isArray(raw);

  const own: QaIssue[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    // A judge that still copies the mechanical findings would double them.
    if ((item as { source?: unknown }).source === "auto") continue;
    const parsed = QaIssue.safeParse({ ...(item as object), source: "judge" });
    if (parsed.success) own.push(parsed.data);
  }

  const scope = args.scope;
  const carried =
    scope && args.carried
      ? args.carried.issues.filter((i) => i.source === "judge" && !scope.includes(i.slide))
      : [];

  const issues = [...args.auto.issues, ...own, ...carried];
  const slides = args.auto.summary.slides;
  const dirty = new Set(issues.filter((i) => i.severity !== "consider" && i.slide > 0).map((i) => i.slide));

  return {
    report: {
      iteration: args.iteration,
      issues,
      summary: { slides, clean: Math.max(0, slides - dirty.size) },
      screenshots: args.auto.screenshots,
    },
    judgeValid,
  };
}

/** Slides a re-check must look at: what the fix round touched, plus anything the mechanical pass flags. */
export function recheckScope(fixedSlides: number[], auto: QaReport): number[] {
  const flagged = auto.issues.filter((i) => i.severity !== "consider").map((i) => i.slide);
  return [...new Set([...fixedSlides, ...flagged])].filter((n) => n > 0).sort((a, b) => a - b);
}
