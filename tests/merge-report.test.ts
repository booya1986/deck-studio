import { describe, expect, it } from "vitest";
import { mergeJudgeReport, recheckScope } from "@/lib/qa/merge-report";
import type { QaIssue, QaReport } from "@/lib/schema/qa";

const issue = (slide: number, severity: QaIssue["severity"], source: QaIssue["source"], text = "x"): QaIssue => ({
  slide, severity, category: "visual", issue: text, fixHint: "y", source,
});

const auto: QaReport = {
  iteration: 8,
  issues: [issue(3, "fix", "auto", "overflow")],
  summary: { slides: 15, clean: 14 },
  screenshots: ["qa/iter-8/slide-01.png"],
};

describe("QA report merge", () => {
  it("adds the mechanical findings to the judge's own and recomputes clean slides", () => {
    const { report, judgeValid } = mergeJudgeReport({
      iteration: 8, auto,
      judged: { issues: [issue(5, "blocker", "judge"), issue(6, "consider", "judge")] },
      carried: null, scope: null,
    });
    expect(judgeValid).toBe(true);
    expect(report.issues.map((i) => [i.slide, i.source])).toEqual([[3, "auto"], [5, "judge"], [6, "judge"]]);
    expect(report.summary).toEqual({ slides: 15, clean: 13 });
    expect(report.screenshots).toEqual(auto.screenshots);
  });

  it("drops mechanical findings the judge copied, and skips malformed issues", () => {
    const { report } = mergeJudgeReport({
      iteration: 8, auto,
      judged: { issues: [issue(3, "fix", "auto", "overflow"), { slide: "two" }, issue(9, "fix", "judge")] },
      carried: null, scope: null,
    });
    expect(report.issues.filter((i) => i.slide === 3)).toHaveLength(1);
    expect(report.issues.map((i) => i.slide)).toEqual([3, 9]);
  });

  it("carries forward judge findings for slides a scoped re-check did not look at", () => {
    const previous: QaReport = {
      iteration: 5,
      issues: [issue(2, "consider", "judge", "old-2"), issue(8, "blocker", "judge", "old-8"), issue(1, "fix", "auto")],
      summary: { slides: 15, clean: 13 },
      screenshots: [],
    };
    const { report } = mergeJudgeReport({
      iteration: 8, auto,
      judged: { issues: [issue(8, "consider", "judge", "new-8")] },
      carried: previous, scope: [3, 8],
    });
    const texts = report.issues.map((i) => i.issue);
    expect(texts).toContain("old-2");
    expect(texts).toContain("new-8");
    expect(texts).not.toContain("old-8");
    // Mechanical findings never carry forward; the new auto pass replaces them.
    expect(report.issues.filter((i) => i.source === "auto")).toHaveLength(1);
  });

  it("falls back to the mechanical findings when the judge wrote nothing usable", () => {
    const { report, judgeValid } = mergeJudgeReport({ iteration: 8, auto, judged: null, carried: null, scope: null });
    expect(judgeValid).toBe(false);
    expect(report.issues).toEqual(auto.issues);
  });

  it("scopes a re-check to fixed slides plus anything newly flagged", () => {
    expect(recheckScope([8, 4, 8], auto)).toEqual([3, 4, 8]);
  });
});
