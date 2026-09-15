---
name: motion
description: Use when adding or reviewing GSAP reveal animation on Deck Studio slides; the data-fx contract, timing limits, chart draw rules, static and reduced-motion behaviour, and worked choreographies.
---

# Motion

Motion in a deck has one job: show the order in which the eye should read the slide. It never
decorates, never loops, and never hides content from a screenshot.

## The contract

- Mark an element with `data-fx="fade-up|fade-in|slide-start|scale|draw"`. The template's
  `fx.js` collects `[data-fx]` inside the active slide on slide enter and plays them once.
- Mark a parent with `data-fx-stagger="0.08"` to stagger its direct `[data-fx]` children.
  Children inherit the parent's order in DOM; do not set `data-fx` on the parent too.
- Optional `data-fx-delay="0.2"` on an element starts it later within the slide's choreography.
- Optional `data-fx-count="1250"` on a number element counts it up from 0. Only for values
  under 4 digits; a longer number counts too fast to read and flickers.
- Elements without `data-fx` are visible at slide enter. Do not hide anything with your own CSS.
- `?static=1` in the URL disables fx.js entirely; every element renders in its final state.
  Never author a slide whose final state depends on a tween having run (no `opacity: 0` in
  your CSS, no `transform` starting positions in your CSS). fx.js sets the from-state itself.
- `prefers-reduced-motion: reduce` behaves like `?static=1`. fx.js handles it; do not add
  `@media (prefers-reduced-motion)` rules of your own.
- Nothing animates on slide exit. Leaving a slide is a cut.
- fx.js is the only script that animates. Do not write `gsap.to` or CSS `@keyframes` in a
  slide, and never `transition` on an element that carries `data-fx`.

## What each effect does

- `fade-up`: opacity 0 to 1, y 24px to 0. Default for text, cards, images.
- `fade-in`: opacity 0 to 1 only. For backgrounds, captions, secondary labels.
- `slide-start`: opacity 0 to 1, x from the inline-start side (from the right in RTL, 40px).
  For items that enter a sequence in reading order.
- `scale`: opacity 0 to 1, scale 0.92 to 1, `transform-origin: center`. For a hero number,
  a single icon, a framed mockup. Never for text paragraphs.
- `draw`: for SVG. Every `path`, `line`, `polyline`, `circle` with a stroke inside the element
  draws once via `stroke-dasharray` and `stroke-dashoffset` measured with `getTotalLength()`.
  Every `rect.bar` inside the element grows from its baseline: `transform-origin` at the
  baseline edge, `scaleY` 0 to 1 (or `scaleX` for horizontal bars, origin at the inline start).
  Fills fade in after strokes finish.

## Timing rules

- Duration per element: 0.4s to 0.7s. Text 0.5s, cards 0.6s, draw 0.7s, count-up 0.7s.
- Ease: `power2.out` for text and fades, `power3.out` for cards, hero numbers and draws.
  Never `.inOut` on an entrance, never `back`, `elastic` or `bounce`.
- Stagger between siblings: 0.06s to 0.1s. Six bullets at 0.08s add 0.4s; cap a group so
  `count x stagger` stays under 0.5s (use 0.06s for more than 6 items).
- A slide's whole choreography, from enter to the last element at rest, ends within 1.2s.
  Budget: title 0 to 0.5s, body group 0.15s to 0.9s, visual 0.3s to 1.0s, footnote 0.9s to 1.2s.
- At most three phases per slide: title, content, one emphasis. More phases means the slide
  has more than one message.
- One direction per group. A bullet list is all `fade-up`, never alternating effects.
- Nothing repeats, pulses, floats, breathes or loops. No `repeat`, no `yoyo`.
- Nothing animates `width`, `height`, `top`, `left`, `font-size` or colour. Transforms and
  opacity only; fx.js enforces this by ignoring anything else.
- Hover and click animations do not exist in a deck.

## Charts and numbers

- Axes, gridlines and labels are visible at enter (no `data-fx`), so the frame is stable
  before data appears.
- Bars: `data-fx="draw"` on the `<g>` holding the `rect.bar` elements, with
  `data-fx-stagger="0.06"` on that group. Bars grow from the baseline, in reading order.
- Lines: `data-fx="draw"` on the `<path>`; markers on the line get `fade-in` with
  `data-fx-delay="0.5"` so they appear after the line lands.
- A process diagram draws its connecting arrows, then reveals boxes with `slide-start`.
- KPI values: `data-fx="scale"` plus `data-fx-count` when the value has at most 3 digits and no
  decimal. Percentages under 100 count; years, IDs, phone numbers and amounts over 999 never
  count; they use `scale` only.
- A count-up number keeps `font-variant-numeric: tabular-nums` and a fixed width so the layout
  does not shift while it counts.

## Worked example 1: title plus three cards

Message: the three approval levels. Reading order: title, then cards right to left.

```html
<section class="slide">
  <h2 data-fx="fade-up">שלוש רמות אישור, לפי סכום</h2>
  <div class="cards" data-fx-stagger="0.1">
    <article class="card" data-fx="fade-up">…</article>
    <article class="card" data-fx="fade-up">…</article>
    <article class="card" data-fx="fade-up">…</article>
  </div>
  <p class="note" data-fx="fade-in" data-fx-delay="0.6">מקור: נוהל 4.2</p>
</section>
```

Timeline: title 0 to 0.5s; cards start at 0.15s, 0.25s, 0.35s, each 0.6s, last at rest 0.95s;
note 0.6s to 1.0s. Total 1.0s.

## Worked example 2: hero number with consequence

Message: 63% of returns fail on the first check.

```html
<section class="slide slide-statement">
  <p class="kpi" data-fx="scale" data-fx-count="63"><bdi>63%</bdi></p>
  <p class="kpi-label" data-fx="fade-up" data-fx-delay="0.3">מההחזרות נופלות בבדיקה הראשונה</p>
  <p class="lead" data-fx="fade-up" data-fx-delay="0.6">רוב הכשלים הם שדה חסר, לא טעות בסכום</p>
</section>
```

Timeline: number scales and counts 0 to 0.7s; label 0.3s to 0.8s; consequence 0.6s to 1.1s.
The number is the only `scale` on the slide, and the only accent colour.

## Worked example 3: bar chart with a highlighted bar

Message: the digital channel now leads.

```html
<section class="slide">
  <h2 data-fx="fade-up">הדיגיטל עקף את הסניפים השנה</h2>
  <svg viewBox="0 0 1240 600" role="img" aria-label="…">
    <g class="grid">…gridlines and axis labels, no data-fx…</g>
    <g class="bars" data-fx="draw" data-fx-stagger="0.06" data-fx-delay="0.2">
      <rect class="bar" …/><rect class="bar" …/><rect class="bar" …/><rect class="bar" …/>
    </g>
    <g class="values" data-fx="fade-in" data-fx-delay="0.8">…value labels…</g>
  </svg>
  <p class="lead" data-fx="fade-up" data-fx-delay="0.5">…one-line takeaway…</p>
</section>
```

Timeline: title 0 to 0.5s; bars grow from 0.2s, stagger 0.06s, each 0.7s, last at rest 1.08s;
value labels fade from 0.8s; takeaway 0.5s to 1.0s. Total 1.1s.

## Reference behaviour of fx.js

fx.js does the following; author markup that assumes exactly this and nothing more.

```js
// on slide enter (skipped entirely when ?static=1 or prefers-reduced-motion)
const els = slide.querySelectorAll('[data-fx]');
const FROM = { 'fade-up': {opacity:0, y:24}, 'fade-in': {opacity:0},
  'slide-start': {opacity:0, x:40}, 'scale': {opacity:0, scale:0.92} };
els.forEach((el, i) => {
  const fx = el.dataset.fx, delay = +(el.dataset.fxDelay || 0)
    + siblingIndex(el) * +(el.parentElement.dataset.fxStagger || 0);
  if (fx === 'draw') drawSvg(el, delay);          // strokes via dashoffset, rect.bar via scale
  else gsap.fromTo(el, FROM[fx], { opacity:1, x:0, y:0, scale:1,
    duration: fx === 'scale' ? 0.6 : 0.5, ease: 'power2.out', delay, overwrite: true });
  if (el.dataset.fxCount) countUp(el, +el.dataset.fxCount, 0.7, delay);
});
// on slide exit: gsap.killTweensOf(els); gsap.set(els, {clearProps:'all'});  no exit motion
```

## QA rejects a slide when

- Any element is invisible or offset in the `?static=1` screenshot.
- The choreography runs past 1.2s, or an element is still moving 1.5s after enter.
- Anything loops, pulses or re-triggers on hover, click or scroll.
- A chart animates its axes, or a bar grows from the centre instead of the baseline.
- A number with 4 or more digits counts up.
- A slide uses more than three phases or mixes effect types inside one group.
- Motion direction contradicts reading direction (a `slide-start` group that enters from the
  left on a Hebrew slide).
- Custom `gsap` calls, `@keyframes` or `transition` exist inside a slide.
