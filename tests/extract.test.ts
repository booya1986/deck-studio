import { beforeAll, describe, expect, it } from "vitest";
import { extractSource } from "@/lib/extract";
import { scoreLogo } from "@/lib/extract/logo-score";
import { fixRtlLeadingNumber, guessOrgName } from "@/lib/extract/text-common";
import type { SourceBlock } from "@/lib/schema/common";
import { DOCX, PDF, ensureFixtures, tmpDir } from "./helpers";

const hexes = (c: { hex: string }[]) => c.map((x) => x.hex);
const headings = (b: SourceBlock[]) => b.filter((x) => x.kind === "heading").map((x) => x.text);

beforeAll(async () => {
  await ensureFixtures();
}, 180_000);

describe("docx extraction", () => {
  it("reads Hebrew text, brand colours, the complex-script font and the header logo", async () => {
    const out = await tmpDir("docx");
    const { textBlocks, candidates } = await extractSource({ sourcePath: DOCX, outDir: out });

    expect(textBlocks.language).toBe("he");
    expect(textBlocks.title).toBe("נוהל טיפול בפניית לקוח בערוץ הדיגיטלי");
    expect(textBlocks.blocks.length).toBeGreaterThan(30);
    expect(headings(textBlocks.blocks)).toContain("4. זמני תקן");

    // The Hebrew face lives in w:cs and must outrank the Latin one.
    expect(candidates.fonts[0].family).toBe("Narkisim");
    expect(candidates.fonts[0].script).toBe("hebrew");
    expect(candidates.fonts.map((f) => f.family)).toContain("Calibri");

    expect(hexes(candidates.colors)).toContain("#0b3d6b");
    expect(hexes(candidates.colors)).toContain("#0f7c86");

    expect(candidates.images.length).toBeGreaterThan(0);
    expect(candidates.images[0].inHeader).toBe(true);
    expect(candidates.images[0].logoScore).toBeGreaterThan(0.6);
    expect(candidates.text.orgNameGuess).toBe("בנק אופק");
  }, 120_000);
});

describe("pdf extraction", () => {
  it("orders RTL text logically, renders pages and finds exact brand colours", async () => {
    const out = await tmpDir("pdf");
    const { textBlocks, candidates } = await extractSource({ sourcePath: PDF, outDir: out });

    expect(textBlocks.language).toBe("he");
    expect(textBlocks.pageCount).toBe(4);
    // Word order proves the bidi handling: visual order would reverse this.
    expect(textBlocks.title).toBe("נוהל טיפול בפניית לקוח בערוץ הדיגיטלי");
    expect(headings(textBlocks.blocks).slice(0, 3)).toEqual([
      "1. מטרת הנוהל", "2. הגדרות", "3. שלבי הטיפול",
    ]);

    expect(candidates.pages.length).toBe(4);
    for (const c of ["#0b3d6b", "#0f7c86", "#e4a400"]) {
      expect(hexes(candidates.colors)).toContain(c);
    }
    expect(candidates.fonts[0].family).toBe("Heebo");
    expect(candidates.fonts[0].embedded).toBe(true);
    expect(candidates.images[0].logoScore).toBeGreaterThan(0.6);
    expect(candidates.text.orgNameGuess).toBe("בנק אופק");
  }, 180_000);
});

describe("heuristics", () => {
  it("scores a header logo above a large body image", () => {
    const header = scoreLogo({ path: "media/a.png", w: 420, h: 160, inHeader: true, onMaster: false, format: "png", convertible: true });
    const body = scoreLogo({ path: "media/b.jpg", w: 1600, h: 1200, inHeader: false, onMaster: false, format: "jpg", convertible: true });
    expect(header).toBeGreaterThan(body);
  });

  it("penalises formats we cannot convert", () => {
    const base = { path: "media/l.emf", w: 400, h: 150, inHeader: true, onMaster: false, format: "emf" };
    expect(scoreLogo({ ...base, convertible: false })).toBeLessThan(scoreLogo({ ...base, convertible: true }));
  });

  it("moves a bidi-displaced heading number back to the front", () => {
    expect(fixRtlLeadingNumber("הגדרות .2")).toBe("2. הגדרות");
    expect(fixRtlLeadingNumber("1. מטרת הנוהל")).toBe("1. מטרת הנוהל");
    expect(fixRtlLeadingNumber("סעיף ללא מספר")).toBe("סעיף ללא מספר");
  });

  it("stops the organisation name before the next phrase", () => {
    const blocks = [{ id: "b1", kind: "caption" as const, text: "בנק אופק מסמך מספר NB-114" }];
    expect(guessOrgName(blocks)).toBe("בנק אופק");
  });
});
