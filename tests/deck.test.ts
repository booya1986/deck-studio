import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { assembleDeck, hexInCss, slideCount } from "@/lib/deck/assemble";
import { emitDesignSystem } from "@/lib/design-system/emit";
import { TEMPLATES_DIR } from "@/lib/store/paths";
import { tmpDir } from "./helpers";

const decision = {
  orgName: "בנק אופק", language: "he", basis: "document",
  colors: {
    primary: { value: "#0b3d6b", provenance: "extracted", confidence: 0.9 },
    secondary: { value: "#0f7c86", provenance: "extracted", confidence: 0.7 },
    accent: { value: "#e4a400", provenance: "extracted", confidence: 0.6 },
    mode: "light",
  },
  fonts: {
    heading: { value: { family: "Heebo" }, provenance: "extracted", confidence: 0.8 },
    body: { value: { family: "Assistant" }, provenance: "inferred", confidence: 0.5 },
  },
  logo: { provenance: "inferred", background: "transparent" },
  contentImages: [], rationale: "בדיקה",
};

async function sampleProject() {
  const dir = await tmpDir("deck");
  await fs.mkdir(path.join(dir, "design-system"), { recursive: true });
  await fs.mkdir(path.join(dir, "deck"), { recursive: true });
  await fs.writeFile(path.join(dir, "design-system", "brand-decision.json"), JSON.stringify(decision));
  await emitDesignSystem({ dsDir: path.join(dir, "design-system"), extractionDir: path.join(dir, "extraction"), sourceFile: "x.docx" });
  await fs.copyFile(path.join(TEMPLATES_DIR, "sample-slides.html"), path.join(dir, "deck", "slides.html"));
  await fs.copyFile(path.join(TEMPLATES_DIR, "sample-slide-styles.css"), path.join(dir, "deck", "slide-styles.css"));
  return dir;
}

describe("deck template and assembler", () => {
  it("keeps the template free of literal colours", async () => {
    const template = await fs.readFile(path.join(TEMPLATES_DIR, "deck-template.html"), "utf8");
    const css = template.split("<style>")[1].split("</style>")[0];
    expect(hexInCss(css)).toEqual([]);
    expect(hexInCss("a{color:var(--x)} b{color:#123456} c{background:rgba(0,0,0,.4)}")).toEqual(["#123456"]);
  });

  it("assembles the sample deck into a self-contained index.html", async () => {
    const dir = await sampleProject();
    const { slides, out } = await assembleDeck({ projectDir: dir });
    expect(slides).toBe(12);
    const html = await fs.readFile(out, "utf8");
    expect(html).not.toContain("{{");
    expect(slideCount(html)).toBe(12);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("--primary: #0b3d6b;");
    expect(html).toContain("assets/gsap.min.js");
    await fs.access(path.join(dir, "deck", "assets", "gsap.min.js"));
  }, 60_000);

  it("refuses a slide count that disagrees with the breakdown", async () => {
    const dir = await sampleProject();
    await fs.mkdir(path.join(dir, "research"), { recursive: true });
    await fs.writeFile(path.join(dir, "research", "breakdown.json"), JSON.stringify({ title: "x", slides: [{}, {}] }));
    await expect(assembleDeck({ projectDir: dir })).rejects.toThrow(/מספר השקפים/);
  }, 60_000);

  it("renders in Chromium: static mode, deep link, no overflow, brand font, print stack", async () => {
    const dir = await sampleProject();
    const { out } = await assembleDeck({ projectDir: dir });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`file://${encodeURI(out)}?static=1&slide=3`, { waitUntil: "load" });
      await page.evaluate(() => (document as unknown as { fonts: FontFaceSet }).fonts.ready);

      const info = await page.evaluate(() => {
        const active = document.querySelector<HTMLElement>(".slide.active")!;
        // Real overflow is content leaving the slide box or being clipped, not
        // line-height slack or decorative pseudo-elements.
        const box = active.getBoundingClientRect();
        const overflow = [...active.querySelectorAll<HTMLElement>("*")]
          .filter((e) => !e.classList.contains("divider-number") && !e.classList.contains("slide-logo"))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const clipped = /hidden|clip/.test(getComputedStyle(e).overflow) && (e.scrollHeight > e.clientHeight + 8 || e.scrollWidth > e.clientWidth + 8);
            const outside = r.width > 0 && (r.right > box.right + 4 || r.left < box.left - 4 || r.bottom > box.bottom + 4);
            return clipped || outside;
          })
          .map((e) => e.className + "::" + (e.textContent ?? "").slice(0, 30));
        return {
          n: active.dataset.n,
          overflow,
          h1Font: getComputedStyle(document.querySelector("h1")!).fontFamily,
          hidden: [...document.querySelectorAll<HTMLElement>(".slide.active [data-fx]")].filter((e) => getComputedStyle(e).opacity !== "1").length,
        };
      });
      expect(errors.filter((e) => !/net::ERR|fonts.googleapis/.test(e))).toEqual([]);
      expect(info.n).toBe("3");
      expect(info.overflow).toEqual([]);
      expect(info.h1Font.toLowerCase()).toContain("heebo");
      // static mode shows every reveal element in its final state
      expect(info.hidden).toBe(0);

      await page.goto(`file://${encodeURI(out)}?print=1`, { waitUntil: "load" });
      const visible = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".slide")].filter((s) => getComputedStyle(s).visibility === "visible").length,
      );
      expect(visible).toBe(12);
    } finally {
      await browser.close();
    }
  }, 120_000);
});
