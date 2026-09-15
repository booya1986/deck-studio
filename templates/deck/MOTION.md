# Motion

The template plays a reveal when a slide becomes active and resets it when the slide leaves. Nothing
animates on exit, nothing loops, and with `?static=1` or `prefers-reduced-motion` every element sits
in its final state. Motion is GSAP, driven by attributes; you never write animation code.

## Attributes

| Attribute | On | Effect |
|---|---|---|
| `data-fx="fade-up"` | any element | fades in rising 28px (default when the value is missing) |
| `data-fx="fade-in"` | any element | opacity only |
| `data-fx="slide-start"` / `slide-end` | any element | slides in from the start or end edge, direction-aware |
| `data-fx="scale"` | charts, figures, cards | grows from 92% |
| `data-fx-delay="150"` | with `data-fx` | delay in milliseconds |
| `data-fx-stagger="80"` | a parent (list, grid, row) | children reveal one after another, 80ms apart |
| `data-fx-mode="scale"` | with `data-fx-stagger` | which effect the children use |

Elements inside a staggered parent must not carry their own `data-fx`.

## Rules

- Duration is fixed at 0.6s with `power3.out`. Stagger between 60 and 100ms.
- The whole slide finishes inside 1.2 seconds; the template clamps delays and staggers to that cap.
- Order: eyebrow and title first (no delay), lead at 150ms, content at 250 to 300ms. The eye reads the
  message before the evidence arrives.
- One choreography per slide. Do not animate the logo, the note, or anything inside a `.chart` SVG
  separately; give the `<figure class="chart">` a single `data-fx="scale"`.
- KPI values do not count up; they arrive whole.
- A slide with no `data-fx` at all is a defect: every slide reveals, none just appears.

## Worked examples

Title slide: eyebrow `fade-in`, h1 `fade-up`, lead `fade-up` at 150, meta `fade-in` at 300.

Cards slide: h2 `fade-up`; the `.card-grid` gets `data-fx-stagger="90" data-fx-mode="scale"`.

Split slide with a chart: h2 `fade-up`; `.stack` gets `data-fx-stagger="80"`; the `figure.chart` gets
`data-fx="scale" data-fx-delay="250"`.
