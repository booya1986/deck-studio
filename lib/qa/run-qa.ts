/**
 * Automated deck QA: renders every slide of `deck/index.html` in headless
 * Chromium (1920×1080, `?static=1&slide=N`) and emits `qa/iter-N/auto-report.json`
 * plus per-slide screenshots. See the check list in the README of this module
 * (overflow, tokens, fonts, contrast, RTL, text, images, console, parity).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { QaReport, type QaIssue } from "@/lib/schema/qa";
import { literalColoursInCss, parseTokens } from "./token-whitelist";
import { canonical, composite, contrastRatio, parseColor, requiredRatio, WHITE, type Rgba } from "./contrast";

export type RunDeckQaArgs = {
  projectDir: string;
  iteration: number;
  quick?: boolean;
  /** absolute path to the deck html; defaults to `<projectDir>/deck/index.html` */
  deckPath?: string;
};

/* ----------------------------------------------------------------------------
 * Browser-side scan. Runs inside the page via page.evaluate, so it must be
 * fully self-contained (no references to module scope).
 * ------------------------------------------------------------------------- */

type Ref = { where: string; text: string };
type SlideScan = {
  found: boolean;
  htmlDir: string;
  title: string;
  text: string;
  bodyWords: number;
  titleWords: number;
  overflow: { where: string; detail: string }[];
  colours: { prop: string; value: string; where: string; count: number }[];
  fonts: { family: string; loaded: boolean; where: string; count: number }[];
  contrast: { color: string; layers: string[]; size: number; weight: number; where: string; count: number }[];
  ltrHebrew: Ref[];
  reversedSigns: Ref[];
  rightArrows: Ref[];
  dashes: Ref[];
  emoji: Ref[];
  middots: Ref[];
  brokenImages: { where: string; src: string }[];
  emptySvgs: { where: string }[];
};

function scanSlideInBrowser(cfg: { n: number; isRtl: boolean }): SlideScan {
  const HEB = /[֐-׿]/;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.classList.length ? `.${Array.from(el.classList).slice(0, 2).join(".")}` : "";
    const txt = norm(el.textContent || "").slice(0, 40);
    return `${tag}${id}${cls}${txt ? ` "${txt}"` : ""}`;
  };
  const snippet = (s: string) => norm(s).slice(0, 60);
  const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const alphaOf = (v: string) => {
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return v === "transparent" ? 0 : 1;
    const parts = m[1].replace(/\//g, " ").split(/[\s,]+/).filter(Boolean);
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  };
  const visible = (el: Element) => {
    const anyEl = el as HTMLElement & { checkVisibility?: (o: object) => boolean };
    if (typeof anyEl.checkVisibility === "function") {
      return anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }
    return el.getClientRects().length > 0;
  };

  let slide = document.querySelector<HTMLElement>(`section.slide.active[data-n="${cfg.n}"]`);
  if (!slide) {
    // The deck did not honour ?slide=N; activate it ourselves.
    slide = document.querySelector<HTMLElement>(`section.slide[data-n="${cfg.n}"]`);
    if (slide) {
      document.querySelectorAll("section.slide").forEach((s) => s.classList.remove("active"));
      slide.classList.add("active");
    }
  }
  const empty: SlideScan = {
    found: false, htmlDir: document.documentElement.getAttribute("dir") || "", title: "", text: "",
    bodyWords: 0, titleWords: 0, overflow: [], colours: [], fonts: [], contrast: [], ltrHebrew: [],
    reversedSigns: [], rightArrows: [], dashes: [], emoji: [], middots: [], brokenImages: [], emptySvgs: [],
  };
  if (!slide) return empty;
  const out: SlideScan = { ...empty, found: true };
  void slide.offsetHeight; // force layout after activation

  const slideRect = slide.getBoundingClientRect();
  const all = [slide, ...Array.from(slide.querySelectorAll<Element>("*"))].filter(
    (el) => !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName),
  );

  // Title & word counts
  const headingSel = "h1,h2,h3,h4,h5,h6,[role=heading],.title,.slide-title";
  const firstHeading = slide.querySelector<HTMLElement>(headingSel);
  out.title = norm(slide.getAttribute("data-title") || firstHeading?.innerText || "");
  out.text = norm(slide.innerText || "");
  out.titleWords = words(out.title);

  // Text elements: have at least one non-blank direct text node
  const textEls: { el: Element; own: string }[] = [];
  for (const el of all) {
    let own = "";
    for (const c of Array.from(el.childNodes)) if (c.nodeType === 3) own += c.textContent || "";
    if (own.trim() && visible(el)) textEls.push({ el, own });
  }
  out.bodyWords = textEls
    .filter(({ el }) => !el.closest(headingSel))
    .reduce((n, { el, own }) => n + words(el.tagName === "LI" ? own : own), 0);

  // 1. overflow
  const flagged = new Set<Element>();
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "inline") continue;
    if (el.parentElement && flagged.has(el.parentElement)) continue;
    const detail: string[] = [];
    // Decorative pieces the template deliberately lets escape the slide box.
    if (el.classList.contains("divider-number") || el.classList.contains("slide-logo")) continue;
    if (cs.position === "absolute" && parseInt(cs.zIndex, 10) < 0) continue;
    // Content that a container clips is a real defect: the reader cannot see it.
    // Overflow that stays visible is judged against the slide box below; a few
    // pixels of line-height slack on a heading is not a finding.
    const fontPx = parseFloat(cs.fontSize) || 16;
    const clips = (v: string) => v === "hidden" || v === "clip" || v === "auto" || v === "scroll";
    // The slide itself clips decorative halos and numbers on purpose; its
    // children are each measured against the slide box below.
    if (el !== slide && clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
      detail.push(`התוכן נחתך: רחב ב-${el.scrollWidth - el.clientWidth}px מהמכל`);
    }
    if (el !== slide && clips(cs.overflowY) && el.scrollHeight > el.clientHeight + Math.max(8, fontPx * 0.45) && el.clientHeight > 0) {
      detail.push(`התוכן נחתך: גבוה ב-${el.scrollHeight - el.clientHeight}px מהמכל`);
    }
    // Visible overflow: measure the content's line boxes with a Range, which
    // ignores pseudo-element decoration and glyph ink, and compare with the box.
    if (el !== slide && (!clips(cs.overflowX) || !clips(cs.overflowY)) && el.childNodes.length) {
      const er = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const rr = range.getBoundingClientRect();
      range.detach();
      if (rr.width > 0 && rr.height > 0 && er.height > 0) {
        if (!clips(cs.overflowY) && rr.bottom > er.bottom + Math.max(6, fontPx * 0.4)) {
          detail.push(`התוכן גולש ${Math.round(rr.bottom - er.bottom)}px מתחת למכל`);
        }
        if (!clips(cs.overflowX) && (rr.right > er.right + 6 || rr.left < er.left - 6)) {
          detail.push(`התוכן גולש ${Math.round(Math.max(rr.right - er.right, er.left - rr.left))}px מעבר לרוחב המכל`);
        }
      }
    }
    if (el !== slide) {
      const r = el.getBoundingClientRect();
      const meaningful = !!norm(el.textContent || "") || ["IMG", "SVG", "CANVAS", "VIDEO"].includes(el.tagName.toUpperCase());
      if (meaningful && r.width > 0 && r.height > 0) {
        const over: string[] = [];
        if (r.right > slideRect.right + 2) over.push(`ימין ${Math.round(r.right - slideRect.right)}px`);
        if (r.bottom > slideRect.bottom + 2) over.push(`תחתית ${Math.round(r.bottom - slideRect.bottom)}px`);
        if (r.left < slideRect.left - 2) over.push(`שמאל ${Math.round(slideRect.left - r.left)}px`);
        if (r.top < slideRect.top - 2) over.push(`עליון ${Math.round(slideRect.top - r.top)}px`);
        if (over.length) detail.push(`חורג מגבולות השקף (${over.join(", ")})`);
      }
    }
    if (detail.length) {
      flagged.add(el);
      out.overflow.push({ where: describe(el), detail: detail.join("; ") });
    }
  }

  // 2. colours (raw computed values; membership decided on the Node side)
  const colourMap = new Map<string, { prop: string; value: string; where: string; count: number }>();
  const push = (prop: string, value: string, el: Element) => {
    if (!value || value === "none") return;
    const key = `${prop}|${value}`;
    const hit = colourMap.get(key);
    if (hit) hit.count++;
    else colourMap.set(key, { prop, value, where: describe(el), count: 1 });
  };
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const isSvg = el.namespaceURI === "http://www.w3.org/2000/svg";
    push("color", cs.color, el);
    push("background-color", cs.backgroundColor, el);
    for (const side of ["top", "right", "bottom", "left"]) {
      const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
      const style = cs.getPropertyValue(`border-${side}-style`);
      if (w > 0 && style !== "none" && style !== "hidden") push(`border-${side}-color`, cs.getPropertyValue(`border-${side}-color`), el);
    }
    if (isSvg && el.tagName.toLowerCase() !== "svg") {
      const explicit = (p: string) => el.hasAttribute(p) || (el.getAttribute("style") || "").includes(p);
      // Skip the UA defaults (fill black / stroke none) unless set explicitly.
      if (cs.fill !== "rgb(0, 0, 0)" || explicit("fill")) push("fill", cs.fill, el);
      if (cs.stroke !== "none" || explicit("stroke")) push("stroke", cs.stroke, el);
    }
  }
  out.colours = Array.from(colourMap.values());

  // 3. fonts
  const fontMap = new Map<string, { family: string; loaded: boolean; where: string; count: number }>();
  for (const { el } of textEls) {
    const fam = getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (!fam) continue;
    const hit = fontMap.get(fam.toLowerCase());
    if (hit) hit.count++;
    else {
      let loaded = true;
      try { loaded = document.fonts.check(`16px "${fam}"`); } catch { loaded = true; }
      fontMap.set(fam.toLowerCase(), { family: fam, loaded, where: describe(el), count: 1 });
    }
  }
  out.fonts = Array.from(fontMap.values());

  // 4. contrast inputs: colour + background layers from the element up to the slide
  const contrastMap = new Map<string, SlideScan["contrast"][number]>();
  for (const { el } of textEls) {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (!size || alphaOf(cs.color) === 0) continue;
    const layers: string[] = [];
    let unknown = false;
    let node: Element | null = el;
    while (node) {
      const ncs = getComputedStyle(node);
      if (ncs.backgroundImage && ncs.backgroundImage !== "none") { unknown = true; break; }
      const a = alphaOf(ncs.backgroundColor);
      if (a > 0) layers.push(ncs.backgroundColor);
      if (a >= 1 || node === slide) break;
      node = node.parentElement;
    }
    if (unknown) continue;
    if (!layers.length || alphaOf(layers[layers.length - 1]) < 1) {
      for (const floor of [document.body, document.documentElement]) {
        const bg = getComputedStyle(floor).backgroundColor;
        if (alphaOf(bg) > 0) { layers.push(bg); if (alphaOf(bg) >= 1) break; }
      }
    }
    const weight = parseInt(cs.fontWeight, 10) || (cs.fontWeight === "bold" ? 700 : 400);
    const large = size >= 24 || (weight >= 700 && size >= 19);
    const key = `${cs.color}|${layers.join(">")}|${large ? "L" : "S"}`;
    const hit = contrastMap.get(key);
    if (hit) hit.count++;
    else contrastMap.set(key, { color: cs.color, layers, size, weight, where: describe(el), count: 1 });
  }
  out.contrast = Array.from(contrastMap.values());

  // 5. RTL + 6. text audit
  const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;
  for (const { el, own } of textEls) {
    const ref: Ref = { where: describe(el), text: snippet(own) };
    const hasHeb = HEB.test(own);
    if (cfg.isRtl && hasHeb && getComputedStyle(el).direction !== "rtl") out.ltrHebrew.push(ref);
    if (hasHeb && (/\d+%\+/.test(own) || /%\d/.test(own))) out.reversedSigns.push(ref);
    if (hasHeb && own.includes("→")) out.rightArrows.push(ref);
    if (/[–—]/.test(own)) out.dashes.push(ref);
    if (EMOJI.test(own) && el.closest(`${headingSel},button,.btn,.button,[role=button]`)) out.emoji.push(ref);
    if (own.includes("·") && !el.closest(".eyebrow,.badge")) out.middots.push(ref);
  }

  // 7. images
  for (const img of Array.from(slide.querySelectorAll<HTMLImageElement>("img"))) {
    if (!img.complete || img.naturalWidth === 0) {
      out.brokenImages.push({ where: describe(img), src: (img.getAttribute("src") || "").slice(0, 80) });
    }
  }
  for (const svg of Array.from(slide.querySelectorAll("svg"))) {
    const r = svg.getBoundingClientRect();
    if (visible(svg) && (r.width === 0 || r.height === 0)) out.emptySvgs.push({ where: describe(svg) });
  }
  return out;
}

/** Resolve every colour custom property on :root to its computed rgb. */
function resolveTokensInBrowser(names: string[]): Record<string, string> {
  const declared = new Set(names);
  const rootSel = /(^|,)\s*(:root|html)\s*(,|$)/;
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      const sr = r as CSSStyleRule;
      if (sr.style && rootSel.test(sr.selectorText || "")) {
        for (const p of Array.from(sr.style)) if (p.startsWith("--")) declared.add(p);
      }
      const inner = (r as CSSGroupingRule).cssRules;
      if (inner) walk(inner);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ }
  }
  for (const p of Array.from(document.documentElement.style)) if (p.startsWith("--")) declared.add(p);

  const rootCs = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  document.body.appendChild(probe);
  const out: Record<string, string> = {};
  for (const name of declared) {
    const raw = rootCs.getPropertyValue(name).trim();
    if (!raw || !CSS.supports("color", raw)) continue;
    probe.style.setProperty("color", `var(${name})`);
    out[name] = getComputedStyle(probe).color;
  }
  probe.remove();
  return out;
}

/* ----------------------------------------------------------------------------
 * Node side
 * ------------------------------------------------------------------------- */

type BreakdownLite = { slides: { n: number; title: string; body: string[] }[] };

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function fileUrl(absPath: string, query: string): string {
  return `file://${encodeURI(absPath)}${query}`;
}

const auto = (i: Omit<QaIssue, "source">): QaIssue => ({ ...i, source: "auto" });

function normaliseText(s: string): string {
  return s.toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
}

function fuzzyPresent(item: string, slideText: string): boolean {
  const ws = normaliseText(item).split(" ").filter((w) => w.length >= 3);
  if (!ws.length) return true;
  const hits = ws.filter((w) => slideText.includes(w)).length;
  return hits / ws.length >= 0.6;
}

function isBlackOrWhiteOverlay(c: Rgba): boolean {
  if (c.a >= 1) return false;
  const bw = (v: number) => v <= 0 || v >= 255;
  return bw(c.r) && bw(c.g) && bw(c.b) && (c.r === c.g && c.g === c.b);
}

/** Static scan of `<style>` blocks in the deck html + deck/slide-styles.css. */
async function staticColourIssues(deckPath: string, projectDir: string): Promise<QaIssue[]> {
  const issues: QaIssue[] = [];
  const add = (label: string, css: string) => {
    for (const { value, line } of literalColoursInCss(css)) {
      issues.push(
        auto({
          slide: 0, severity: "fix", category: "token",
          issue: `צבע קשיח ב-CSS: ${value}`,
          fixHint: "החליפו את הערך ב-var(--token) מתוך design-system/manifest.json",
          where: `${label}:${line}`,
        }),
      );
    }
  };
  const html = await fs.readFile(deckPath, "utf8").catch(() => "");
  let k = 0;
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) add(`${path.basename(deckPath)} <style#${++k}>`, m[1]);
  const stylesPath = path.join(projectDir, "deck", "slide-styles.css");
  const css = await fs.readFile(stylesPath, "utf8").catch(() => null);
  if (css !== null) add("deck/slide-styles.css", css);
  return issues;
}

/**
 * Run a named function inside the page. tsx compiles with keepNames, which
 * wraps functions in an esbuild `__name(...)` helper that does not exist in
 * the browser, so the source is evaluated with a shim in scope.
 */
async function evalInPage<A, R>(page: Page, fn: (arg: A) => R, arg: A): Promise<R> {
  const src = `(() => { const __name = (f) => f; return (${fn.toString()})(${JSON.stringify(arg)}); })()`;
  return page.evaluate(src) as Promise<R>;
}

async function gotoSlide(page: Page, deckPath: string, n: number) {
  await page.goto(fileUrl(deckPath, `?static=1&slide=${n}`), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => r(null)))));
}

export async function runDeckQa(args: RunDeckQaArgs): Promise<QaReport> {
  const projectDir = path.resolve(args.projectDir);
  const deckPath = path.resolve(args.deckPath ?? path.join(projectDir, "deck", "index.html"));
  const iterDir = path.join(projectDir, "qa", `iter-${args.iteration}`);
  await fs.mkdir(iterDir, { recursive: true });

  const manifest = await readJson<{ tokens?: { name: string; value: string; kind?: string }[]; brandFonts?: { family: string }[] }>(
    path.join(projectDir, "design-system", "manifest.json"),
  );
  const manifestTokens = parseTokens(manifest);
  const brandFamilies = new Set((manifest?.brandFonts ?? []).map((f) => f.family.trim().toLowerCase()).filter(Boolean));
  const breakdown = await readJson<BreakdownLite>(path.join(projectDir, "research", "breakdown.json"));

  const issues: QaIssue[] = [];
  const screenshots: string[] = [];
  issues.push(...(await staticColourIssues(deckPath, projectDir)));

  await fs.access(deckPath).catch(() => {
    throw new Error(`deck not found: ${deckPath}`);
  });

  const browser = await chromium.launch({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const consoleErrors = new Set<string>();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.add(m.text()); });
    page.on("pageerror", (e) => consoleErrors.add(e.message));

    // First load: slide count, direction, token resolution.
    await page.goto(fileUrl(deckPath, "?static=1"), { waitUntil: "load" });
    const meta = await page.evaluate(() => ({
      slides: document.querySelectorAll("section.slide").length,
      dir: (document.documentElement.getAttribute("dir") || "ltr").toLowerCase(),
    }));
    const resolved = await evalInPage(page, resolveTokensInBrowser, Array.from(manifestTokens.keys()));
    const tokenSet = new Set<string>();
    for (const v of Object.values(resolved)) {
      const c = parseColor(v);
      if (c) tokenSet.add(canonical(c));
    }
    for (const v of manifestTokens.values()) {
      const c = parseColor(v);
      if (c) tokenSet.add(canonical(c));
    }
    const isRtl = meta.dir === "rtl";

    if (meta.slides === 0) {
      issues.push(auto({ slide: 0, severity: "blocker", category: "visual", issue: "לא נמצאו שקפים (section.slide) במצגת", fixHint: "ודאו ש-deck/index.html מכיל <section class=\"slide\" data-n=\"N\">" }));
    }
    if (breakdown?.slides && breakdown.slides.length !== meta.slides) {
      issues.push(auto({
        slide: 0, severity: "blocker", category: "parity",
        issue: `מספר השקפים במצגת (${meta.slides}) שונה מהפירוק (${breakdown.slides.length})`,
        fixHint: "התאימו את מספר השקפים ל-research/breakdown.json או עדכנו את הפירוק",
      }));
    }

    let clean = 0;
    for (let n = 1; n <= meta.slides; n++) {
      await gotoSlide(page, deckPath, n);
      const scan = await evalInPage(page, scanSlideInBrowser, { n, isRtl });
      const before = issues.length;
      const slideText = normaliseText(scan.text);

      if (!scan.found) {
        issues.push(auto({ slide: n, severity: "blocker", category: "visual", issue: `שקף ${n} לא נמצא (data-n="${n}")`, fixHint: "ודאו שכל שקף נושא data-n רציף החל מ-1" }));
        continue;
      }

      // 1. overflow
      for (const o of scan.overflow) {
        issues.push(auto({
          slide: n, severity: "blocker", category: "overflow",
          issue: `גלישת תוכן: ${o.detail}`,
          fixHint: "קצרו את הטקסט, הקטינו את הגופן או הגדילו את המכל; התוכן חייב להישאר בתוך 1920×1080",
          where: o.where,
        }));
      }

      // 2. token adherence
      for (const c of scan.colours) {
        const parsed = parseColor(c.value);
        if (!parsed || parsed.a === 0) continue;
        if (c.value === "currentcolor") continue;
        if (tokenSet.has(canonical(parsed))) continue;
        if (isBlackOrWhiteOverlay(parsed)) continue;
        issues.push(auto({
          slide: n, severity: "fix", category: "token",
          issue: `צבע שאינו טוקן: ${c.value} ב-${c.prop}${c.count > 1 ? ` (${c.count} אלמנטים)` : ""}`,
          fixHint: "השתמשו ב-var(--token) מטוקני מערכת העיצוב במקום צבע קשיח",
          where: c.where,
        }));
      }

      // 3. fonts
      for (const f of scan.fonts) {
        const fam = f.family.toLowerCase();
        if (brandFamilies.size && !brandFamilies.has(fam)) {
          issues.push(auto({
            slide: n, severity: "fix", category: "font",
            issue: `גופן שאינו מהמותג: ${f.family}${f.count > 1 ? ` (${f.count} אלמנטים)` : ""}`,
            fixHint: `השתמשו ב-var(--font-heading) / var(--font-body) (${Array.from(brandFamilies).join(", ")})`,
            where: f.where,
          }));
        } else if (!f.loaded) {
          issues.push(auto({
            slide: n, severity: "fix", category: "font",
            issue: `הגופן ${f.family} לא נטען (document.fonts.check נכשל)`,
            fixHint: "ודאו שקובץ הגופן מוטמע במצגת או שה-@font-face תקין",
            where: f.where,
          }));
        }
      }

      // 4. contrast
      for (const c of scan.contrast) {
        const fg = parseColor(c.color);
        if (!fg) continue;
        let bg: Rgba = WHITE;
        for (const layer of [...c.layers].reverse()) {
          const l = parseColor(layer);
          if (l) bg = composite(l, bg);
        }
        const ratio = contrastRatio(fg, bg);
        const need = requiredRatio(c.size, c.weight);
        if (ratio < need) {
          issues.push(auto({
            slide: n, severity: "fix", category: "contrast",
            issue: `ניגודיות נמוכה ${ratio.toFixed(2)}:1 (נדרש ${need}:1) עבור ${c.color} על ${c.layers[0] ?? "רקע השקף"} בגודל ${Math.round(c.size)}px`,
            fixHint: "הכהו את צבע הטקסט או הבהירו את הרקע; העדיפו --text-1 על --bg/--surface",
            where: c.where,
          }));
        }
      }

      // 5. RTL
      if (isRtl) {
        if (n === 1 && scan.htmlDir !== "rtl") {
          issues.push(auto({ slide: 1, severity: "fix", category: "rtl", issue: "html[dir] אינו rtl", fixHint: 'הוסיפו dir="rtl" lang="he" לתגית <html>' }));
        }
        for (const r of scan.ltrHebrew) {
          issues.push(auto({ slide: n, severity: "fix", category: "rtl", issue: `טקסט עברי בכיוון LTR: "${r.text}"`, fixHint: "הסירו direction:ltr או הוסיפו dir=\"rtl\" לאלמנט", where: r.where }));
        }
      }
      for (const r of scan.reversedSigns) {
        issues.push(auto({ slide: n, severity: "consider", category: "text", issue: `סימן אחוז/פלוס במיקום הפוך: "${r.text}"`, fixHint: "בעברית כותבים +30% ולא 30%+; עטפו מספרים ב-<span dir=\"ltr\"> במידת הצורך", where: r.where }));
      }
      for (const r of scan.rightArrows) {
        issues.push(auto({ slide: n, severity: "consider", category: "text", issue: `חץ ימני (→) בטקסט עברי: "${r.text}"`, fixHint: "בעברית החץ 'מוביל ל' מצביע שמאלה (←)", where: r.where }));
      }

      // 6. text audit
      for (const r of scan.dashes) {
        issues.push(auto({ slide: n, severity: "fix", category: "text", issue: `קו מפריד ארוך (em/en dash) בטקסט: "${r.text}"`, fixHint: "החליפו במקף רגיל, נקודתיים או פיסוק אחר", where: r.where }));
      }
      for (const r of scan.emoji) {
        issues.push(auto({ slide: n, severity: "fix", category: "text", issue: `אימוג'י בכותרת או בכפתור: "${r.text}"`, fixHint: "הסירו את האימוג'י; השתמשו באייקון SVG מהמערכת אם צריך סמל", where: r.where }));
      }
      for (const r of scan.middots) {
        issues.push(auto({ slide: n, severity: "consider", category: "text", issue: `נקודה אמצעית (·) מחוץ ל-eyebrow/badge: "${r.text}"`, fixHint: "השתמשו בפסיק או בפיסוק רגיל בטקסט גוף", where: r.where }));
      }
      if (scan.bodyWords > 90) {
        issues.push(auto({ slide: n, severity: "consider", category: "text", issue: `השקף עמוס: ${scan.bodyWords} מילים בגוף (מעל 90)`, fixHint: "פצלו לשני שקפים או תמצתו לנקודות קצרות" }));
      }
      if (scan.titleWords > 12) {
        issues.push(auto({ slide: n, severity: "consider", category: "text", issue: `כותרת ארוכה: ${scan.titleWords} מילים (מעל 12)`, fixHint: "קצרו את הכותרת למסר אחד ברור", where: scan.title.slice(0, 60) }));
      }

      // 7. images
      for (const b of scan.brokenImages) {
        issues.push(auto({ slide: n, severity: "blocker", category: "visual", issue: `תמונה לא נטענה: ${b.src || "(ללא src)"}`, fixHint: "ודאו שהתמונה מוטמעת (data URI) או שהנתיב יחסי ל-deck/", where: b.where }));
      }
      for (const s of scan.emptySvgs) {
        issues.push(auto({ slide: n, severity: "blocker", category: "visual", issue: "SVG ללא גודל (רוחב או גובה 0)", fixHint: "הגדירו width/height או viewBox ל-SVG", where: s.where }));
      }

      // 9. parity
      const bd = breakdown?.slides?.find((s) => s.n === n);
      if (bd) {
        // The planned title must be the slide's own title, not merely appear somewhere in its text.
        const title = normaliseText(bd.title ?? "");
        const shown = normaliseText(scan.title);
        if (title && shown !== title && !shown.includes(title) && !title.includes(shown)) {
          issues.push(auto({ slide: n, severity: "fix", category: "parity", issue: "כותרת השקף שונה מהפירוק", fixHint: `הכותרת בפירוק: "${bd.title}"`, where: scan.title.slice(0, 60) }));
        }
        const body = bd.body ?? [];
        if (body.length) {
          const present = body.filter((item) => fuzzyPresent(item, slideText)).length;
          const pct = Math.round((present / body.length) * 100);
          if (present / body.length < 0.6) {
            issues.push(auto({ slide: n, severity: "consider", category: "parity", issue: `רק ${pct}% מנקודות הגוף שבפירוק מופיעות בשקף (${present}/${body.length})`, fixHint: "ודאו שהמסרים המרכזיים מהפירוק מופיעים בשקף, או עדכנו את הפירוק" }));
          }
        }
      }

      if (!args.quick) {
        const file = path.join(iterDir, `slide-${String(n).padStart(2, "0")}.png`);
        await page.screenshot({ path: file, type: "png" });
        screenshots.push(path.relative(projectDir, file).split(path.sep).join("/"));
      }
      if (!issues.slice(before).some((i) => i.severity !== "consider")) clean++;
    }

    // 8. console (collected across all loads, attributed to slide 0)
    for (const msg of consoleErrors) {
      issues.push(auto({ slide: 0, severity: "blocker", category: "console", issue: `שגיאת קונסול: ${msg.slice(0, 200)}`, fixHint: "פתחו את המצגת בדפדפן ותקנו את השגיאה (נתיב חסר, סקריפט שבור)" }));
    }

    const report = QaReport.parse({
      iteration: args.iteration,
      issues,
      summary: { slides: meta.slides, clean },
      screenshots,
    });
    await fs.writeFile(path.join(iterDir, "auto-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
    return report;
  } finally {
    await browser.close();
  }
}
