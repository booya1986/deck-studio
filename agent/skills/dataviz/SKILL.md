---
name: dataviz
description: Use when a slide needs a chart, KPI, or process diagram; how to choose the form, draw it as inline SVG with chart tokens only, handle Hebrew labels inside an LTR SVG, and pass the QA chart checklist.
---

# Dataviz

Charts in a deck are inline SVG, drawn by hand from the numbers in the breakdown spec, styled
only with tokens. No chart library, no images of charts, no canvas.

## Choose the form first

- One current value, or a value with a delta: a big number (`--fs-kpi`) with a label. Never a
  chart with one bar or a pie with two slices.
- Up to four headline numbers: a KPI row of tiles. Not a grouped bar chart.
- Compare magnitudes across categories: vertical bars; horizontal bars when labels are long or
  there are more than 6 categories.
- Change over time: a line; an area only for a single series. Fewer than 4 points: use bars.
- Parts of a whole: a stacked bar (one bar, segments labelled). A pie or donut only for 2 or 3
  parts, with the biggest slice starting at 12 o'clock.
- One series matters and the rest are context: draw all in `--chart-1` at reduced opacity and
  the one that matters in `--accent`. This is usually the honest chart.
- More than 7 categories, or two measures with different units: a table, or two charts.
  Never a dual axis.
- A process, flow or sequence: a step diagram, not a chart.

## SVG skeleton

```html
<figure class="chart">
  <svg viewBox="0 0 1240 600" role="img" aria-labelledby="c1-title"
       style="direction:ltr; width:100%; height:auto; font-family:var(--font-body)">
    <title id="c1-title">מכירות לפי ערוץ, 2025, באלפי שקלים</title>
    <g class="grid">…</g>
    <g class="axis">…</g>
    <g class="bars" data-fx="draw" data-fx-stagger="0.06">…</g>
    <g class="values">…</g>
    <g class="labels">…</g>
  </svg>
  <figcaption class="note">מקור: דוח רבעוני, עמוד 4</figcaption>
</figure>
```

- `viewBox` sets the coordinate space; the figure scales to its grid cell. Design at 1240x600
  for a 7-column visual, 1000x560 for a half slide, 1600x200 for a full-width process.
- Leave 60px top for value labels, 80px bottom for category labels, 90px on the axis side.

## Colour and stroke

- Series colours are `var(--chart-1)` to `var(--chart-5)` in fixed order, assigned by series
  identity. Series 1 is always `--chart-1` even after a filter removes series 2.
- Never more than 5 series. A sixth folds into "other" or gets its own chart.
- Single-series charts use `--chart-1` for all marks; the highlighted mark uses `--accent`.
  That highlight is the slide's one accent use.
- Gridlines: `stroke: var(--border)`, `stroke-width: 1`. Axis line: `var(--border-strong)`.
  Show 3 to 5 gridlines; no vertical gridlines on bar charts.
- Line series: `stroke-width: 4`, `stroke-linejoin: round`, `fill: none`. Markers `r="7"`
  with a `stroke: var(--surface)` ring of 3.
- Bars: `rx="4"`, a 12px minimum gap, bar width at least twice the gap. Stacked segments
  separated by a 2px `--surface` gap.
- Text: `fill: var(--text-2)` for axis and category labels, `var(--text-1)` for value labels
  and the emphasised value. Never fill text with a series colour.
- Font sizes inside SVG: values 28, category labels 24, axis ticks 22, never below 20.
- `font-variant-numeric: tabular-nums` on the `<svg>` style so digits line up.
- `--success`, `--warning`, `--danger` only for state (above or below target), never as series.

## Labels and legends

- Direct-label every series at its last point or on the bar. A legend box only when direct
  labels would collide, and then also direct-label the top two series.
- Value labels on every bar when 6 or fewer bars; otherwise only the highlighted bars.
- The chart title is the slide title plus the SVG `<title>`; do not draw a title inside the SVG.
- Round honestly: `1.2M`, `42%`, `3,400`. Never more than 3 significant digits.

## Hebrew inside an LTR SVG

- The `<svg>` carries `style="direction:ltr"`. Coordinates then mean what they say: x grows to
  the right, and the layout does not flip.
- Reading order is still right to left: the first category sits at the right edge, a process
  runs right to left. Time on a line chart runs left to right, because years are Western.
- A Hebrew label centred under a bar: `text-anchor="middle"`. Hebrew glyphs render correctly
  on their own; no `direction` attribute needed.
- A label that mixes Hebrew and digits: `<text direction="rtl" unicode-bidi="embed"
  text-anchor="start" x="…">` where x is the label's right edge.
- The value axis sits on the right side of the plot, labels `text-anchor="start"` at x = plot
  right + 16. Category labels centred under their marks.

## Accessibility

- `role="img"` and `aria-labelledby` pointing at a `<title>` that states the finding, not the
  chart type: "הדיגיטל מוביל עם 58 אלף" rather than "תרשים עמודות".
- Marks are never identified by colour alone: every series has a text label.

## Example 1: four-category bar chart

Spec: sales by channel, thousands of ILS. Branches 42, Digital 58, Call centre 31,
Partners 19. Message: digital leads. Scale max 60, plot height 440, baseline y=500.
Bar height = value / 60 * 440. First category at the right.

```html
<figure class="chart">
<svg viewBox="0 0 1240 600" role="img" aria-labelledby="ch1"
     style="direction:ltr;width:100%;height:auto;font-family:var(--font-body);font-variant-numeric:tabular-nums">
  <title id="ch1">הדיגיטל מוביל: 58 אלף שקלים, לעומת 42 בסניפים</title>
  <g class="grid" stroke="var(--border)" stroke-width="1">
    <line x1="80" y1="60" x2="1140" y2="60"/>
    <line x1="80" y1="206.7" x2="1140" y2="206.7"/>
    <line x1="80" y1="353.3" x2="1140" y2="353.3"/>
    <line x1="80" y1="500" x2="1140" y2="500" stroke="var(--border-strong)"/>
  </g>
  <g class="axis" fill="var(--text-2)" font-size="22" text-anchor="start">
    <text x="1156" y="68">60</text><text x="1156" y="214">40</text>
    <text x="1156" y="361">20</text><text x="1156" y="508">0</text>
  </g>
  <g class="bars" data-fx="draw" data-fx-stagger="0.06">
    <rect class="bar" x="920" y="192" width="180" height="308" rx="4" fill="var(--chart-1)"/>
    <rect class="bar" x="680" y="74.7" width="180" height="425.3" rx="4" fill="var(--accent)"/>
    <rect class="bar" x="440" y="272.7" width="180" height="227.3" rx="4" fill="var(--chart-1)"/>
    <rect class="bar" x="200" y="360.7" width="180" height="139.3" rx="4" fill="var(--chart-1)"/>
  </g>
  <g class="values" fill="var(--text-1)" font-size="28" font-weight="600" text-anchor="middle"
     data-fx="fade-in" data-fx-delay="0.8">
    <text x="1010" y="176">42</text><text x="770" y="58">58</text>
    <text x="530" y="256">31</text><text x="290" y="344">19</text>
  </g>
  <g class="labels" fill="var(--text-2)" font-size="24" text-anchor="middle">
    <text x="1010" y="548">סניפים</text><text x="770" y="548">דיגיטל</text>
    <text x="530" y="548">מוקד</text><text x="290" y="548">שותפים</text>
  </g>
</svg>
<figcaption class="note">אלפי שקלים, רבעון 2 2025. מקור: דוח מכירות</figcaption>
</figure>
```

## Example 2: five-step process, right to left

Spec: receive, verify, approve, pay, archive. Step 1 is the rightmost box; arrows point left.

```html
<figure class="diagram">
<svg viewBox="0 0 1600 200" role="img" aria-labelledby="p1"
     style="direction:ltr;width:100%;height:auto;font-family:var(--font-body)">
  <title id="p1">חמישה שלבים: קליטה, אימות, אישור, תשלום, תיוק</title>
  <style>
    .steps rect{fill:var(--surface);stroke:var(--border);stroke-width:2}
    .steps circle{fill:var(--primary)}
    .steps .n{fill:var(--primary-ink);font-size:22px;text-anchor:middle}
    .steps .l{fill:var(--text-1);font-size:28px;text-anchor:middle}
  </style>
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
            orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="var(--primary)"/></marker>
  </defs>
  <g class="arrows" stroke="var(--primary)" stroke-width="4" data-fx="draw" data-fx-stagger="0.08">
    <line x1="1356" y1="100" x2="1268" y2="100" marker-end="url(#arr)"/>
    <line x1="1016" y1="100" x2="928" y2="100" marker-end="url(#arr)"/>
    <line x1="676" y1="100" x2="588" y2="100" marker-end="url(#arr)"/>
    <line x1="336" y1="100" x2="248" y2="100" marker-end="url(#arr)"/>
  </g>
  <g class="steps" data-fx-stagger="0.08">
    <g data-fx="slide-start">
      <rect x="1360" y="40" width="240" height="120" rx="12"/><circle cx="1568" cy="72" r="18"/>
      <text class="n" x="1568" y="80">1</text><text class="l" x="1480" y="112">קליטה</text>
    </g>
    <g data-fx="slide-start">
      <rect x="1020" y="40" width="240" height="120" rx="12"/><circle cx="1228" cy="72" r="18"/>
      <text class="n" x="1228" y="80">2</text><text class="l" x="1140" y="112">אימות</text>
    </g>
    <g data-fx="slide-start">
      <rect x="680" y="40" width="240" height="120" rx="12"/><circle cx="888" cy="72" r="18"/>
      <text class="n" x="888" y="80">3</text><text class="l" x="800" y="112">אישור</text>
    </g>
    <g data-fx="slide-start">
      <rect x="340" y="40" width="240" height="120" rx="12"/><circle cx="548" cy="72" r="18"/>
      <text class="n" x="548" y="80">4</text><text class="l" x="460" y="112">תשלום</text>
    </g>
    <g data-fx="slide-start">
      <rect x="0" y="40" width="240" height="120" rx="12"/><circle cx="208" cy="72" r="18"/>
      <text class="n" x="208" y="80">5</text><text class="l" x="120" y="112">תיוק</text>
    </g>
  </g>
</svg>
</figure>
```

## QA rejects a chart when

- Any `fill` or `stroke` is a hex, rgb, or named colour instead of a token.
- A series uses `--primary`, `--secondary` or a status colour instead of `--chart-n`.
- More than 5 series, or a pie with more than 3 slices, or a dual y-axis.
- A single bar or a two-slice pie stands where a big number should be.
- Any text inside the SVG is under 20px in viewBox units, or filled with a series colour.
- A series is identified by colour only, with no direct label or legend text.
- Arrows in a Hebrew process point right, or step 1 is on the left.
- Digits inside a Hebrew label reorder (missing `direction="rtl" unicode-bidi="embed"`).
- Labels overlap, are clipped by the viewBox, or a bar touches the top edge.
- The SVG lacks `role="img"`, a `<title>`, or `direction:ltr`.
- Values on the chart do not match the numbers in the breakdown spec.
