import path from "node:path";

/**
 * Repo root. Next runs the server from the package root, and pnpm runs scripts
 * from there too, so cwd is correct in both. `import.meta.dirname` is not
 * available once the server code is bundled.
 */
export const REPO_ROOT = process.env.DECK_STUDIO_ROOT ?? process.cwd();
export const DATA_DIR = path.join(REPO_ROOT, "data", "projects");
export const TEMPLATES_DIR = path.join(REPO_ROOT, "templates", "deck");
export const AGENT_DIR = path.join(REPO_ROOT, "agent");
export const FIXTURES_DIR = path.join(REPO_ROOT, "fixtures");

export function projectDir(id: string) {
  return path.join(DATA_DIR, id);
}

/** Every artifact path inside a project, in one place. */
export function pp(id: string) {
  const root = projectDir(id);
  const j = (...p: string[]) => path.join(root, ...p);
  return {
    root,
    projectJson: j("project.json"),
    commentsJson: j("comments.json"),
    sourceDir: j("source"),
    runsDir: j("runs"),
    extraction: {
      dir: j("extraction"),
      textBlocks: j("extraction", "text-blocks.json"),
      candidates: j("extraction", "candidates.json"),
      pagesDir: j("extraction", "pages"),
      mediaDir: j("extraction", "media"),
    },
    ds: {
      dir: j("design-system"),
      decision: j("design-system", "brand-decision.json"),
      manifest: j("design-system", "manifest.json"),
      tokensDir: j("design-system", "tokens"),
      styles: j("design-system", "styles.css"),
      assetsDir: j("design-system", "assets"),
      logoDir: j("design-system", "assets", "logo"),
      imagesDir: j("design-system", "assets", "images"),
      brandBoard: j("design-system", "brand-board.html"),
      skill: j("design-system", "SKILL.md"),
    },
    outline: {
      dir: j("outline"),
      md: j("outline", "outline.md"),
      json: j("outline", "outline.json"),
      version: (n: number) => j("outline", `outline.v${n}.json`),
    },
    research: {
      dir: j("research"),
      md: j("research", "research.md"),
      facts: j("research", "facts.json"),
      breakdownMd: j("research", "breakdown.md"),
      breakdownJson: j("research", "breakdown.json"),
    },
    deck: {
      dir: j("deck"),
      slides: j("deck", "slides.html"),
      slideStyles: j("deck", "slide-styles.css"),
      index: j("deck", "index.html"),
      assetsDir: j("deck", "assets"),
    },
    qa: {
      dir: j("qa"),
      iterDir: (n: number) => j("qa", `iter-${n}`),
      auto: (n: number) => j("qa", `iter-${n}`, "auto-report.json"),
      report: (n: number) => j("qa", `iter-${n}`, "qa-report.json"),
    },
  };
}
export type ProjectPaths = ReturnType<typeof pp>;

/** Guard: a path must stay inside the project dir. Used by the PreToolUse hook. */
export function isInsideProject(id: string, target: string): boolean {
  const root = projectDir(id) + path.sep;
  const abs = path.resolve(target);
  return abs === projectDir(id) || abs.startsWith(root);
}
