# Components

All colours, sizes and spacing come from tokens the template already applies. Use these classes as
they are; add slide-specific CSS in `slide-styles.css` only for something no component covers, and even
then only with `var(--…)` values.

| Class | Use | Notes |
|---|---|---|
| `.eyebrow` | short label above the title | accent dash before it; `plain` removes the dash |
| `.lead` | one-sentence subtitle under the title | `--fs-lead`, `--text-2` |
| `.note` | source line at the bottom | `--fs-note`, `--text-3`; put the document reference here |
| `.meta` | row of facts on the title slide | children separated by accent dots |
| `.stack` | vertical bullets with an accent marker | `<li><strong>Title</strong>Body</li>`; `numbered` gives primary circles; `compact` tightens |
| `.prose` | short paragraphs | body copy only, max three paragraphs |
| `.card-grid` + `.card` | parallel items | `cols-2/3/4`; card modifiers `primary`, `accent`, `raised`; optional `.icon`, `.badge`, `.card-footer` |
| `.icon` | 64px tile for an SVG mark | `accent`, `solid`, `small`; put a simple geometric `<svg>` inside, never emoji |
| `.highlight` | one emphasised sentence | primary soft background, primary bar on the start edge |
| `.callout` | warning or tip | accent soft; `<span class="callout-title">` first, optional `.icon` |
| `.kpi-row` + `.kpi` | big numbers | `<div class="kpi"><div class="kpi-value">78<small>%</small></div><div class="kpi-label">…</div><div class="kpi-delta up">…</div></div>`; max three per row |
| `.steps` | numbered process | `<li><span class="step-n"></span><strong>…</strong><p>…</p></li>`; `current`, `vertical` |
| `.timeline` | dated points | `<li class="done"><time>…</time><strong>…</strong><p>…</p></li>`; `vertical` |
| `.compare` | before/after | children `.before` and `.after`, each `<h3>` + `.stack` |
| `.quote` | quotation | `<figure class="quote"><blockquote>… <mark>…</mark></blockquote><figcaption><strong>who</strong>role</figcaption></figure>` |
| `.chart` | inline SVG chart or diagram | `<figure class="chart"><div class="chart-title">…</div><svg viewBox="0 0 800 480">…</svg><div class="chart-legend">…</div></figure>` |
| `.figure` | image from the document | `<figure class="figure"><img src="assets/images/…"><figcaption>…</figcaption></figure>`; `plain` removes the shadow |
| `.browser` | screenshot frame | `.browser-bar` with three `<i>` dots and `.browser-url`, then `.browser-body` (`flush` for no padding) |
| `.badge` | small label | `accent`, `solid`, `success`, `warning`, `danger`, `neutral`, `large`; group in `.badge-row` |
| `.progress` | labelled bar | `<div class="progress"><span class="label">…</span><span class="value">78%</span><div class="progress-bar" style="--value:78%"><span></span></div></div>`; bar modifiers `accent`, `success`, `warning`, `danger` |
| `.hstack` / `.vstack` | flex rows and columns | `gap-6`, `gap-8` |
| `.center`, `.muted`, `.faint`, `.text-primary`, `.text-accent`, `.tabular` | small utilities | |

## Charts inside `.chart`

Series classes on SVG shapes: `s1`…`s5` for fills, `l1`…`l5` for lines; they map to `--chart-1..5`.
`axis` and `grid` classes for lines; `label` and `value` for text. Write `<svg viewBox="…">` with
`direction: ltr` implied; place Hebrew labels with `text-anchor="end"` on the right. Numbers get
`class="value"`. Give the SVG `role="img"` and a `<title>`.

## Text rules the components assume

- Hebrew text is RTL by the page; wrap numbers, Latin words and codes in `<bdi>` inside Hebrew
  sentences so they keep their order.
- Arrows meaning "then" point in the reading direction: `←` in Hebrew.
- No em-dashes; use a comma, a colon or a new sentence. No emoji anywhere. Middle dots `·` only in
  `.eyebrow`, `.meta` and `.badge`.
- A slide title is one line of at most twelve words. Body text on a slide stays under forty words.
