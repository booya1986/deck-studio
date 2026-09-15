import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildScale, chartSeries, contrast, lightestPassing, neutralScale } from "@/lib/design-system/palette";
import { resolveFont } from "@/lib/design-system/fonts";
import { emitDesignSystem } from "@/lib/design-system/emit";
import { buildPalette } from "@/lib/design-system/tokens";
import { DsManifest, type BrandDecision } from "@/lib/schema/design-system";
import { tmpDir } from "./helpers";

const decision = (over: Partial<BrandDecision> = {}): BrandDecision => ({
  orgName: "בנק אופק",
  language: "he",
  basis: "document",
  colors: {
    primary: { value: "#0b3d6b", provenance: "extracted", confidence: 0.9 },
    secondary: { value: "#0f7c86", provenance: "extracted", confidence: 0.7 },
    accent: { value: "#e4a400", provenance: "extracted", confidence: 0.6 },
    mode: "light",
  },
  fonts: {
    heading: { value: { family: "Frank Ruhl Libre", originalFamily: "Narkisim" }, provenance: "inferred", confidence: 0.6 },
    body: { value: { family: "Assistant" }, provenance: "inferred", confidence: 0.5 },
  },
  logo: { provenance: "inferred", background: "transparent" },
  contentImages: [],
  rationale: "בדיקה",
  ...over,
});

describe("palette", () => {
  it("keeps the brand colour itself inside its scale", () => {
    expect(Object.values(buildScale("#0b3d6b"))).toContain("#0b3d6b");
  });

  it("produces a text ramp where every step clears AA and stays distinct", () => {
    const n = neutralScale("#0b3d6b");
    const bg = n[50];
    const t1 = lightestPassing(n, bg, 12, true);
    const t2 = lightestPassing(n, bg, 7, true);
    const t3 = lightestPassing(n, bg, 4.5, true);
    expect(contrast(t1, bg)).toBeGreaterThanOrEqual(12);
    expect(contrast(t3, bg)).toBeGreaterThanOrEqual(4.5);
    expect(new Set([t1, t2, t3]).size).toBe(3);
  });

  it("keeps chart series inside the brand hues", () => {
    const series = chartSeries(["#0b3d6b", "#e4a400", "#0f7c86"], 5);
    expect(series.slice(0, 3)).toEqual(["#0b3d6b", "#e4a400", "#0f7c86"]);
    expect(new Set(series).size).toBe(5);
  });

  it("derives an accent when the document supplied only one colour", () => {
    const p = buildPalette(decision({
      colors: { primary: { value: "#0b3d6b", provenance: "extracted", confidence: 0.9 }, mode: "light" },
    }));
    expect(p.roles["--accent"]).toBeTruthy();
    expect(p.roles["--accent"]).not.toBe(p.roles["--primary"]);
  });

  it("meets AA for body text in both light and dark modes", () => {
    for (const mode of ["light", "dark"] as const) {
      const p = buildPalette(decision({
        colors: { ...decision().colors, mode },
      }));
      expect(contrast(p.roles["--text-1"], p.roles["--bg"])).toBeGreaterThanOrEqual(7);
      expect(contrast(p.roles["--text-3"], p.roles["--bg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.roles["--primary-ink"], p.roles["--primary"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("fonts", () => {
  it("maps a system-only Hebrew font to a servable family and records the swap", () => {
    const r = resolveFont("Narkisim", "heading");
    expect(r.status).toBe("system_fallback");
    expect(r.originalFamily).toBe("Narkisim");
    expect(r.googleUrl).toContain("fonts.googleapis.com");
  });

  it("keeps a family that Google already serves", () => {
    const r = resolveFont("Heebo", "body");
    expect(r.status).toBe("google");
    expect(r.family).toBe("Heebo");
    expect(r.originalFamily).toBeUndefined();
  });

  it("falls back to a default when the document names nothing", () => {
    expect(resolveFont(undefined, "heading").family).toBe("Heebo");
  });
});

describe("emitter", () => {
  it("writes tokens, manifest and brand board, and is idempotent", async () => {
    const dir = await tmpDir("emit");
    const dsDir = path.join(dir, "design-system");
    const exDir = path.join(dir, "extraction");
    await fs.mkdir(dsDir, { recursive: true });
    await fs.mkdir(exDir, { recursive: true });
    await fs.writeFile(path.join(dsDir, "brand-decision.json"), JSON.stringify(decision()), "utf8");

    const first = await emitDesignSystem({ dsDir, extractionDir: exDir, sourceFile: "doc.docx" });
    expect(DsManifest.parse(first).tokens.length).toBeGreaterThan(80);

    const css = await fs.readFile(path.join(dsDir, "tokens", "colors.css"), "utf8");
    expect(css).toContain("--primary-800: #0b3d6b;");
    expect(css).toContain("/* inferred */");

    const board = await fs.readFile(path.join(dsDir, "brand-board.html"), "utf8");
    expect(board).toContain('dir="rtl"');
    expect(board).toContain("בנק אופק");
    // No logo was supplied, so the board must say so rather than show a broken image.
    expect(board).toContain("לא נמצא לוגו");

    const second = await emitDesignSystem({ dsDir, extractionDir: exDir, sourceFile: "doc.docx" });
    expect(second).toEqual(first);
  }, 60_000);

  it("flags that a logo upload is needed when none was found", async () => {
    const dir = await tmpDir("emit-nologo");
    const dsDir = path.join(dir, "design-system");
    await fs.mkdir(dsDir, { recursive: true });
    await fs.writeFile(path.join(dsDir, "brand-decision.json"), JSON.stringify(decision()), "utf8");
    await emitDesignSystem({ dsDir, extractionDir: path.join(dir, "extraction"), sourceFile: "doc.pdf" });
    const saved = JSON.parse(await fs.readFile(path.join(dsDir, "brand-decision.json"), "utf8"));
    expect(saved.logo.needsUpload).toBe(true);
  }, 60_000);
});

describe("bash policy", () => {
  it("allows read-only inspection, quoted operators, chaining and the stage's own commands", async () => {
    const { checkBashCommand } = await import("@/lib/runner/bash-policy");
    for (const cmd of [
      "ls -la extraction/",
      "head -c 200 a.json",
      "grep -n x b.css | head -5",
      "pnpm ds:emit",
      "ls -la extraction/ extraction/pages 2>&1 | head -60",
      "grep -oE '.{140}#(2563EB|4ADE80|FCD34D).{60}' \"/Users/x y/text-blocks.json\"",
      "jq -r '[.. | strings] | join(\" \") | .[0:400]' file.json",
      "sed -n '185,215p' \"/Users/x/design-system/brand-board.html\"",
      "ls \"/a/b\"; ls \"/a/b/tokens\"",
      "cat a.css && cat b.css",
      "pnpm ds:emit 2>&1 | tail -2",
      "wc -l < file.txt",
      "find . -name '*.png' 2>/dev/null",
      "cd extraction && ls",
      'P="/Users/x y/extraction"; ls "$P/media"',
    ]) {
      const v = checkBashCommand(cmd, ["pnpm ds:emit"]);
      expect(v.allowed, `${cmd} :: ${v.allowed ? "" : v.reason}`).toBe(true);
    }
  });

  it("blocks writes, substitution, scripting languages and the network", async () => {
    const { checkBashCommand } = await import("@/lib/runner/bash-policy");
    for (const cmd of [
      "cat a > b",
      "rm -rf .",
      "ls && rm x",
      "echo $(whoami)",
      "echo \"$(whoami)\"",
      "curl http://x",
      "git push",
      "npm install left-pad",
      "pnpm ds:emit && rm -rf /",
      "python3 -c 'import os'",
      "sed -i 's/a/b/' file",
      "find . -name x -exec rm {} \\;",
      "cat a | tee b",
      "sleep 100 &",
    ]) {
      expect(checkBashCommand(cmd, ["pnpm ds:emit"]).allowed, cmd).toBe(false);
    }
  });
});

describe("project ids", () => {
  it("are ASCII only, so paths and URLs never need decoding", async () => {
    const { newProjectId } = await import("@/lib/store/projects");
    for (const name of ["בנק אופק · נוהל דיגיטלי", "Ofek Bank / Q3", "   ", "מצגת"]) {
      const id = newProjectId(name);
      expect(id, name).toMatch(/^[a-z0-9-]+$/);
      expect(encodeURIComponent(id)).toBe(id);
    }
  });
});

describe("generic template", () => {
  it("detects a document with no brand signal and produces a valid decision", async () => {
    const { hasNoBrandSignal, genericDecision } = await import("@/lib/design-system/generic");
    const { BrandDecision } = await import("@/lib/schema/design-system");
    const plain = {
      kind: "docx" as const, pages: [], colors: [{ hex: "#1b1f24", count: 900, sources: ["run" as const] }],
      fonts: [{ family: "Calibri", count: 800, script: "latin" as const }],
      images: [], text: { headings: [] },
    };
    expect(hasNoBrandSignal(plain)).toBe(true);
    expect(hasNoBrandSignal({ ...plain, colors: [...plain.colors, { hex: "#0b3d6b", count: 120, sources: ["run"] }] })).toBe(false);
    expect(hasNoBrandSignal({ ...plain, images: [{ path: "media/l.png", w: 400, h: 150, inHeader: true, onMaster: false, logoScore: 0.8, format: "png", convertible: true }] })).toBe(false);
    const d = genericDecision({ orgName: "חברה", language: "he" });
    expect(BrandDecision.parse(d).basis).toBe("generic");
  });
});
