---
name: deck-craft
description: Use when building or revising any slide of a Deck Studio HTML deck; the visual craft floor for hierarchy, density, grid, spacing, colour, typography and Hebrew RTL on a 1920x1080 canvas, using design-system tokens only.
---

# Deck Craft

You are the deck builder. Every slide is 1920x1080, Hebrew RTL by default, styled only with the
tokens in `design-system/tokens.css`. Read `design-system/SKILL.md` first: it says which colour
carries which job for this brand. This file says how to make a slide read well.

## Absolute rules

- Colour, font, size, spacing, radius and shadow come from tokens. Never a hex, rgb, px font-size
  or px margin. If a value you need has no token, use the nearest token, not a new value.
- One message per slide. If you cannot say the slide's message in one sentence, split it.
- The title states the message, not the topic. "Refunds over 500 ILS need a second approver",
  not "Refund policy".
- No em-dashes or en-dashes in visible text. Use a comma, a colon, or two sentences.
- No emoji in headings, titles, card titles or labels. Use inline SVG icons (1.5 stroke, 24 grid).
- Generate visuals, not bullet walls. A process becomes a diagram, a comparison becomes a chart
  or two columns, a number becomes a big number. Bullets are the last resort.
- Every slide reads correctly with `?static=1` (final state, no motion).

## Canvas and grid

- Safe area: `padding: var(--space-8) var(--space-9)` (64px top and bottom, 96px sides).
  Nothing except full-bleed backgrounds touches the edge.
- Lay content on a 12-column CSS grid inside the safe area: `display: grid;
  grid-template-columns: repeat(12, 1fr); column-gap: var(--space-6)`.
- Split slides: text 5 columns, visual 7 columns. Text is on the right in RTL, so the text block
  comes first in DOM order and the grid places it at the inline start.
- Align to one baseline per row. Card tops in a row share a y; card heights in a row are equal
  (`align-items: stretch`), never staggered by content.
- Max 3 cards or columns across; 4 only for KPI tiles. Five or more means a chart or a table.
- Centre only title, section-divider and single-statement slides. Content slides start-align.
- Title sits in the same place on every content slide: top of the safe area, `--fs-h2`,
  one or two lines, max 12 words.

## Density limits

- Body text: at most 40 words on the slide, excluding the title and axis labels.
- Bullets: at most 6, each at most 12 words, no sub-bullets. Two levels means two slides.
- Bullet with a title and description: title on its own line (`--fs-body-lg`, weight 600),
  description below (`--fs-body`, `--text-2`). Never inline "Title: description".
- Numbers are the biggest thing on the slide when they are the message: `--fs-kpi` or
  `--fs-display`, label under it in `--fs-eyebrow` and `--text-2`.
- Smallest text on any slide is `--fs-note` (18px); use it only for sources and footnotes.
- Minimum body line-height `--lh-normal`; headings `--lh-tight`; Hebrew never below `--lh-snug`.
- Line length for body copy: max 65 characters. Set `max-width: 28ch` on lead paragraphs.

## Spacing rhythm

- Use the token ladder consistently: `--space-2` inside a component (icon to text),
  `--space-4` between siblings in a group, `--space-6` between groups, `--space-8` between
  the title and the content area.
- Card padding is `--space-6`; KPI tile padding `--space-5`; tag or pill padding
  `--space-1 var(--space-3)`.
- The title block gets `margin-block-end: var(--space-8)`. Nothing else pushes against it.
- Leave at least one empty column or `--space-9` of air somewhere on every content slide.
  A slide filled edge to edge reads as a document, not a slide.
- Rows of cards share one gap value. Never mix `--space-4` and `--space-6` in the same row.

## Colour discipline

- Background is `--bg` or `--surface`. Cards sit on `--surface` with `border: 1px solid
  var(--border)`; a nested card uses `--surface-2`. Never a card on a card on a card.
- Text is `--text-1` (headings, values), `--text-2` (body, labels), `--text-3` (captions).
- `--primary` carries structure: title colour on divider slides, the numbered step badge,
  the selected state, the chart's main series. `--primary-soft` is the only tint allowed
  as a block background.
- `--accent` appears at most once per slide: the one number, the one highlighted bar, the one
  callout border. Two accent moments on a slide means neither is the message.
- Long text is never set in `--primary` or `--accent`. Use `--primary-text` or `--accent-text`
  for short coloured labels only; they are contrast-checked, the raw colours are not.
- `--success`, `--warning`, `--danger` mean state (done, at risk, blocked) and always ship with
  an icon or a word. Never use them as decorative colours or as a fourth series.
- `--gradient` is allowed on the title slide and the closing slide only, never behind text
  smaller than `--fs-h1`.
- Inverted (dark) slides: background `--primary`, text `--primary-ink`. Use at most one
  inverted slide per section for a divider or a single big statement.

## Typography roles

- Headings: `--font-heading`, weight 700, `--lh-tight`. Body: `--font-body`, weight 400.
- Ramp: `--fs-display` for the cover title only; `--fs-h1` for section dividers and single
  statements; `--fs-h2` for content-slide titles; `--fs-h3` for card titles; `--fs-lead` for a
  one-sentence takeaway; `--fs-body` for everything else.
- Emphasis inside body text: `<strong>` only, in `--text-1`. No coloured words inside a
  heading, no italics for emphasis in Hebrew.
- Eyebrow label (`--fs-eyebrow`, `--text-3`) marks the section name. Use it on at most one slide
  in three; the title alone is usually enough.
- Numbered markers (01, 02, 03) only when the content is an actual sequence.
- Numbers use `font-variant-numeric: tabular-nums` wherever they line up (KPI rows, tables).

## RTL rules

- `<html lang="he" dir="rtl">`. Every slide inherits it; do not set `direction` on cards.
- Use logical properties only: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`,
  `border-inline-start`, `text-align: start`. Never `left`, `right`, `margin-left`.
- Flex rows keep `flex-direction: row`; RTL already mirrors them. `row-reverse` is a bug.
- Icon-first cards: icon then title in DOM order, so the icon sits on the right of the title.
- Arrows that mean "leads to" or "next" point left: ← . Processes run right to left, timelines
  start at the right edge, step 1 is the rightmost box.
- Numbers, currency, dates, product codes and English terms inside Hebrew go in `<bdi>` or a
  `<span dir="ltr">`. A percentage sign stays attached: `<bdi>42%</bdi>`.
- Ranges and units read as one unit: `<bdi>500 ILS</bdi>`, `<bdi>2024-2025</bdi>`.
- A slide that is mostly English (code, a product name list) may set `dir="ltr"` on that
  block only, with `text-align: start`.
- Punctuation at the end of a Hebrew sentence stays inside the same text node; no trailing
  `:` or `?` in a separate span.
- Latin text in a Hebrew heading keeps the Hebrew font size; never mix two heading fonts.

## Templated tells and how to avoid them

- Three identical rounded cards with an icon, a title and two lines each. Fix: vary the layout
  by content, give one card a real visual, or turn the three into a single diagram.
- Every slide with a small caps-style eyebrow, a title and a paragraph. Fix: drop the eyebrow,
  let the title carry it, and give the slide a visual.
- Same radius on everything. Fix: `--radius-lg` for cards, `--radius-md` for images and inputs,
  `--radius-pill` for tags, `--radius-sm` for chips inside cards.
- The same shadow under every element. Fix: `--shadow-sm` on cards, `--shadow-lg` on one
  hero element per deck, nothing else.
- A one-bar chart or a pie with two slices. Fix: a big number with its label.
- Centred everything. Fix: start-align content slides; centre only statements.
- A gradient wash as decoration. Fix: use `--surface-3` blocks or no decoration.
- An icon in a tinted square on every bullet. Fix: icons only where they disambiguate.
- Stock metaphors: glowing brain, handshake, hexagon mesh, circuit lines. Fix: draw the
  actual mechanism (the form, the screen, the flow, the table).
- Placeholder copy or "Lorem". Fix: real content from the breakdown, or leave the slot marked
  `<!-- TODO: asset -->` and report it.

## Visuals over bullets

- Process or steps: horizontal step diagram, right to left, arrows pointing left.
- Comparison of two options: two columns with matching rows, differences in `--text-1`,
  sameness in `--text-3`.
- Numbers: a KPI row of at most 4 tiles, or one hero number with a one-line consequence.
- Change over time or magnitudes: an inline SVG chart following the `dataviz` skill.
- Roles or responsibilities: a table with at most 4 columns, header row on `--surface-2`.
- A screen or document: a framed mockup (`--radius-md`, `--border`, `--shadow-sm`) with the
  key area outlined in `--accent`.
- Definition: the term in `--fs-h1` on the right, the definition in `--fs-lead` on the left.

## Self-check before handing to QA

- Read each slide title alone: does the list of titles tell the story? If not, rewrite titles.
- Count accent uses per slide: 0 or 1.
- Search the HTML for `#`, `rgb(`, `px;` inside `font-size`, `left:`, `right:`, `margin-left`,
  `row-reverse`, `—`, `–`, and emoji ranges. Every hit is a defect.
- Open with `?static=1` and screenshot: nothing clipped, nothing overlapping, nothing outside the
  safe area, no text under 18px.
- Check the smallest text at 25% zoom. If it is illegible there, it is too small.
- Every number inside Hebrew is wrapped in `<bdi>`.
- Every arrow in Hebrew flow points left.
