# Deck Studio: development notes

For installing and using Deck Studio, see the [README](../README.md). This file is for people changing the code.

Local web app that turns one organisational document into a branded, self-contained HTML training deck
through a gated pipeline of Claude agents. Hebrew RTL by default, generic for any organisation.

```
intake → design system → outline → research + breakdown → deck build → QA
```

Each stage runs as its own Claude Agent SDK query, writes its artifacts to disk, and stops at a gate where
you approve or leave structured comments. Uploading a document starts the first stage on its own, and
approving a gate starts the next stage on its own, so the reviewer only ever approves or comments. Every agent is confined to its project folder with a read-only
shell policy, no MCP servers, and a spend ceiling per stage.

## Status (2026-09-05)

All five stages run end to end on the fixture document. Verified in a real browser: intake, brand board
with edits, outline gate, breakdown gate with fact verdicts, deck gate with QA findings per slide, and
the gate-4 revise round.

**The reviewer revise loop is verified end to end** (2026-09-05, from the UI, on
`2026-09-03-ofek-proceduredocx-f76d7a`). Commenting on slide 3 and pressing "שלח לתיקון" produced a
round that cost **$1.52 / 36 turns / 3.5 min** and behaved exactly as intended: the comment attached to
the slide the deck was showing (`postMessage` sync), the builder scoped every new rule to
`.slide[data-n="3"]`, `slides.html` came back byte-identical, mechanical QA reported 15/15 clean, the
stage returned to `awaiting_approval`, and approving marked the comment resolved in iteration 2.
Checked live in the browser: slide 3's content now reaches y=984 of 1080, against ~620 before.

Per-run cost measured from `runs/*.jsonl` on the 4-page fixture, `claude-opus-5` for creative agents and
`claude-sonnet-5` for critics. **Since 2026-09-15 the outline and research leads (and the web researcher) run on
`claude-sonnet-5` (`MODELS.fast`)**: on a 12-page regulation the Opus outline took over 12 minutes, most of it
model time between tool calls. Design system, deck build and fix rounds stay on Opus. The numbers below predate
that change.

| Stage | Cost | Turns | Notes |
|---|---|---|---|
| design system | $2.02 | 40 | skipped entirely (generic template) when the document has no brand signal |
| outline | $2.08 | 15 | 13 sections, every fact cites a block id |
| research | $9.31 | 28 | **$3.04 of it was a first attempt that wrote nothing** and was retried from scratch |
| build | $8.29 | 59 | 15 slides, mechanical QA clean on the builder's own pass |
| qa | $8.39 | 105 | judge $1.91 + fix round $4.75 + final judge $1.73 |
| gate-4 revise round | $1.52 | 36 | one reviewer comment, one slide |

The fixture run cost $33.09 through approval, $34.61 including the revise round above.

Two corrections to what this file used to claim: **the judge is not the expensive part of QA** — a judge
pass is $1.7–1.9, while the builder's fix round is $4.75 — and **a third of the research bill bought
nothing**. See "Where to save".

## Speed changes (2026-09-15)

Measured on a 12-page regulation, where the outline took 16 minutes on Opus and research ran 14 minutes
before dying on a usage limit:

- **Reviewer Markdown is rendered in code** (`lib/render/markdown.ts`), not typed by agents. `outline.md`
  and `breakdown.md` were pure restatements of the JSON and cost about two minutes each.
- **The web researcher writes `research.md` itself.** The lead used to re-emit the whole report: 143 s.
- **Researcher and fact-checker are dispatched in parallel.** The fact-checker takes the outline's key
  facts, which already cite block ids. Run serially they cost 190 s + 243 s back to back.
- **Critic fixes are Edits, not a rewrite** of `breakdown.json`. The full write took 271 s.
- **Web research is capped** at 6 searches, 3 fetches, 80 lines. Research lead effort is `medium`.
- **A run that dies after writing valid artifacts is kept.** `runWithValidation` validates what is on
  disk before failing the stage. `scripts/salvage-stage.ts` recovers research runs from before this.
- **A usage-limit failure says so in Hebrew**, with the reset time and the `ANTHROPIC_API_KEY` option.
- **A visual type that names a layout** ("timeline") maps to its drawing instead of failing validation.
- **QA: the judge writes only its own findings.** Mechanical findings are merged in code
  (`lib/qa/merge-report.ts`). The judge used to retype them before adding its own: 153 s of a 222 s pass.
- **QA: the second judge pass is scoped** to the slides the fix round touched plus anything the new
  mechanical pass flags. Findings on untouched slides carry forward. It used to re-read all 15 screenshots.
- **QA: the fix round reads only what the listed fixes need** and renders once, at effort `medium`. It
  spent 3 min 20 s re-reading the contract files and rendered twice. It stays on Opus.

## Requirements

- Node 22, pnpm 10
- A signed-in Claude Code on this machine. The Agent SDK reuses those credentials; no API key needed.
  Set `ANTHROPIC_API_KEY` in `.env.local` only to bill runs to a key instead.
- poppler (`pdftoppm`, `pdfimages`, `pdffonts`) for PDF extraction: `brew install poppler`
- Playwright Chromium: `npx playwright install chromium`

## Commands

| Command | What it does |
|---|---|
| `./setup.sh` | first-time setup: installs dependencies and runs the wizard |
| `pnpm wizard` | interactive checks and fixes: PDF tools, headless browser, Claude connection, port |
| `pnpm checkup [--test]` | the same checks without questions; exit 1 when something is missing; `--test` sends one tiny request to Claude |
| `pnpm studio [--no-open]` | start the app on `PORT` (default 3000, the next free port if busy) and open the browser |
| `pnpm dev` | plain `next dev` on port 3000 |
| `pnpm fixture` | generate the dummy Hebrew org document used for testing (DOCX + PDF + logo) |
| `pnpm extract <file> [outDir]` | run the deterministic extraction pass on a document |
| `pnpm pipeline <file> [stage]` | run the pipeline from the CLI up to a stage, approving each gate automatically |
| `pnpm pipeline --project <id> [stage]` | continue an existing project (approves a stage left waiting) |
| `pnpm ds:emit` | rebuild a project's design system from `brand-decision.json` (run from the project folder) |
| `pnpm deck:assemble` | merge `deck/slides.html` into the template (run from the project folder) |
| `pnpm deck:qa [--quick]` | mechanical deck checks and screenshots (run from the project folder) |
| `pnpm test` | unit, extraction, design-system, template and QA tests (27) |
| `pnpm typecheck` | TypeScript check |

## Stages and gates

| Stage | Agents | Gate |
|---|---|---|
| design system | `brand-analyst` (skipped for documents with no brand signal: generic template) | brand board; colours, fonts and logo editable, no agent cost |
| outline | `learning-designer` + `outline-critic` | outline with per-section comments |
| research | research lead + `ld-researcher`, `fact-checker`, `breakdown-critic` | slide breakdown with fact verdicts, contradictions and per-slide comments |
| build | `deck-builder` writes `slides.html` + `slide-styles.css`; a deterministic assembler builds `index.html` | the deck |
| qa | Playwright checker → `qa-judge` → `deck-builder` fix rounds (max 2, max 8 findings each) | deck with QA findings; comments trigger another round |

Rules that hold everywhere: the document is the source of truth and the web only enriches; contradictions
are shown to the reviewer, never resolved by an agent; claims the fact-checker marks WRONG cannot reach a
slide; agents never write token CSS, the emitter does; every artifact is zod-validated after a run and
one automatic retry carries the validation error back to the agent.

## Layout

- `lib/schema` — zod schemas; every artifact on disk is validated against one
- `lib/extract` — deterministic document extraction (text with locators, brand candidates); runs in a child process
- `lib/design-system` — palette completion, font mapping, generic template, token emitter, brand board
- `lib/runner` — stage runner over the Claude Agent SDK, bash policy, one module per stage
- `lib/deck` — deck assembler; `lib/qa` — Playwright deck checker
- `agent/prompts` — agent system prompts; `agent/skills` — trimmed skills the agents load (symlinked into `.claude/skills`)
- `templates/deck` — the deck template, its catalogues (LAYOUTS, COMPONENTS, MOTION) and a sample deck
- `app`, `components` — the Hebrew RTL interface
- `data/projects/<id>` — one folder per project, gitignored; `data/*.log` are pipeline run logs

## Known gaps

- No LibreOffice on the machine, so DOCX/PPTX pages are not rendered; brand extraction there relies on
  OOXML theme, run properties, media and header placement. PDF gets rendered pages.
- EMF/WMF logos cannot be converted; the brand gate asks for an upload instead.
- AI-generated images are a brief toggle only; no stage acts on it yet.
- Sessions are not resumed; a revision is a fresh run fed the artifact and the comments.
- **An approved stage cannot be reopened from the UI.** The gates render their comment box and their
  action buttons only while a stage is `awaiting_approval` (`editable` in `project-workspace.tsx`), so a
  reviewer who approves and then notices something has no way back and has to edit `project.json` by
  hand. This bites hardest on projects run through `pnpm pipeline`, which approves every gate
  automatically and so hands over a deck that is already frozen.
- A Claude Code session rate limit kills agent runs mid-flight; the stage shows `failed` with the
  reason in `project.json` and can be re-run from the gate.

## Where to save

Four cuts are **written but not yet measured** — the measurement run died on a Claude Code session limit
(see "Measuring the cuts" below). Each one comes from the run logs, not from a guess:

- **The wasted research attempt ($3.04).** Attempt 1 got through the web research, then its
  `fact-checker` subagent's `Read` was denied, a second `Agent` dispatch was denied, and finally the
  parent's `Write` of `research.md` was denied. The lead stopped and asked a human for permission — and
  no human is watching a pipeline run, so the attempt ended with nothing on disk and was retried from
  scratch, buying the same web research twice. These denials did **not** come from `bash-policy.ts`:
  every hook denial in the logs is a `Bash` call. They came from the SDK's own layer under
  `permissionMode: "dontAsk"`, and they did not recur on attempt 2 with identical options, so this is
  flaky rather than deterministic. Fixed from both sides: `research-lead.md` now says the run is
  unattended, gives a fallback per specialist, and requires `facts.json` and `breakdown.json` to exist
  before it stops; and `runWithValidation` takes a `retryContext` so a retry is told which artifacts
  survived and not to re-run searches already saved in `research.md`.
- **Re-reading the template (build and every QA fix round).** The builder opened the 40KB
  `templates/deck/deck-template.html` three times in the build run, and three times *in the same second*
  during a fix round. It never edits that file, and `COMPONENTS.md` already lists every class it
  provides. `deck-builder.md` now forbids opening it, `sample-slides.html` and `lib/`.
- **The QA judge.** Moved to `claude-sonnet-5`, worth about $1 a pass. Note the risk: the judge is the
  sharpest agent in the pipeline right now — its findings were checked against the screenshots and were
  accurate and specific — so if reports get vaguer, put `judge()` back to `MODELS.main`.
- Still open: the fix round is the single most expensive QA item at $4.75 for 60 turns, and build is
  $8.29 for 59. The template cut targets both, but neither has a post-change number yet.

### Measuring the cuts

`data/projects/2026-09-03-ofek-proceduredocx-f76d7a` is parked ready for exactly this: its QA stage is
`failed` (session limit, $0 booked) with an unresolved comment on slide 9 asking for the same kind of
fix that cost $1.52 on slide 3. Re-run that gate and compare against $1.52 / 36 turns; the judge and
research cuts need a fuller run. Restart the dev server before measuring — `loadPrompt` caches prompts
in a module-level Map, so an edited prompt is not picked up by a server that was already running.

## Third-party files in the repository

- `templates/deck/gsap.min.js` is [GSAP](https://gsap.com), bundled so a finished deck works offline. It is distributed under the GSAP Standard License; see gsap.com/standard-license before redistributing decks commercially.
- Everything else arrives through `pnpm install` under each package's own license.
