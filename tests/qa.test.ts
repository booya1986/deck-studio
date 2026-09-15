import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDeckQa } from "@/lib/qa/run-qa";
import { literalColoursInCss } from "@/lib/qa/token-whitelist";
import { REPO_ROOT } from "@/lib/store/paths";
import { tmpDir } from "./helpers";

const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "qa");

async function fixtureProject() {
  const dir = await tmpDir("qa");
  await fs.mkdir(path.join(dir, "deck"), { recursive: true });
  await fs.mkdir(path.join(dir, "design-system"), { recursive: true });
  await fs.mkdir(path.join(dir, "research"), { recursive: true });
  await fs.copyFile(path.join(FIXTURE, "index.html"), path.join(dir, "deck", "index.html"));
  await fs.copyFile(path.join(FIXTURE, "manifest.json"), path.join(dir, "design-system", "manifest.json"));
  await fs.copyFile(path.join(FIXTURE, "breakdown.json"), path.join(dir, "research", "breakdown.json"));
  return dir;
}

describe("deck QA checker", () => {
  it("finds literal colours outside var()", () => {
    expect(literalColoursInCss("a{color:var(--x)} b{color:#123456} c{background:rgba(0,0,0,.4)}").map((c) => c.value)).toEqual(["#123456"]);
  });

  it("catches the seeded defects and leaves the clean slide alone", async () => {
    const dir = await fixtureProject();
    const report = await runDeckQa({ projectDir: dir, iteration: 1, quick: true });
    const on = (n: number) => report.issues.filter((i) => i.slide === n);
    expect(on(3).some((i) => i.category === "overflow" && i.severity === "blocker")).toBe(true);
    expect(on(2).some((i) => i.category === "token")).toBe(true);
    expect(on(2).some((i) => i.category === "text")).toBe(true);
    expect(on(3).some((i) => i.category === "parity")).toBe(true);
    expect(on(1).filter((i) => i.severity !== "consider")).toEqual([]);
    expect(report.summary.slides).toBe(3);
    await fs.access(path.join(dir, "qa", "iter-1", "auto-report.json"));
  }, 120_000);

  it("writes a screenshot per slide when not quick", async () => {
    const dir = await fixtureProject();
    const report = await runDeckQa({ projectDir: dir, iteration: 2, quick: false });
    expect(report.screenshots.length).toBe(3);
    for (const s of report.screenshots) await fs.access(path.join(dir, s));
  }, 120_000);
});
