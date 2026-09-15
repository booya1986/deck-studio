# Layouts

Every slide is `<section class="slide" data-n="N" data-layout="…" data-title="…">`. Inside it, in this
order: an optional `<p class="eyebrow">`, one `<h1>` or `<h2>` (the message), an optional
`<p class="lead">`, one `<div class="content">` with everything else, and an optional `<p class="note">`
for the source line. Speaker notes go last in `<aside class="notes">` (hidden on screen).

Anything you drop directly into the section outside those slots lands in the content area, so a single
component (a `.card-grid`, a `.chart`) can sit there without the wrapper.

Add `data-logo="1"` to show the logo large (title and closing slides), `data-logo="small"` for a small
corner logo. Add class `inverse` for a primary-coloured slide (use once, for a divider or the close).

The canvas is 1920×1080. Slide padding is already applied; do not add margins to the section.

## title
Opening slide. Message as `<h1>`, the audience or subtitle in `.lead`, a `.meta` row for date, duration,
presenter. Gradient bar on the start edge and a soft primary halo are drawn by the template.
```html
<section class="slide" data-n="1" data-layout="title" data-title="…" data-logo="1">
  <p class="eyebrow" data-fx="fade-in">נוהל NB-114</p>
  <h1 data-fx="fade-up">הכותרת היא המסר</h1>
  <p class="lead" data-fx="fade-up" data-fx-delay="150">למי, ולמה זה חשוב במשפט אחד.</p>
  <div class="content"><div class="meta" data-fx="fade-in" data-fx-delay="300"><span>15 דקות</span><span>ספטמבר 2026</span></div></div>
  <aside class="notes">…</aside>
</section>
```

## agenda
Numbered list of the sections. `.agenda` is two columns; add `single` for one column when there are
five items or fewer. Each `<li>` may hold a `<small>` line.
```html
<section class="slide" data-n="2" data-layout="agenda" data-title="…">
  <p class="eyebrow">מה נעבור</p>
  <h2>חמישה שלבים, זמן תקן אחד</h2>
  <ol class="agenda" data-fx-stagger="80"><li>קליטה וזיהוי<small>2 שקפים</small></li>…</ol>
</section>
```

## divider
Section opener. Big `<h1>`, optional `.lead`, and `<div class="divider-number">01</div>` drawn faintly
in the corner. Often `inverse`.
```html
<section class="slide inverse" data-n="4" data-layout="divider" data-title="…">
  <p class="eyebrow plain">פרק 1</p>
  <h1 data-fx="fade-up">קליטה וזיהוי</h1>
  <p class="lead" data-fx="fade-in">מה קורה בדקה הראשונה</p>
  <div class="divider-number">01</div>
</section>
```

## split
Text on one side, visual on the other. `.content` is a two-column grid: `.split-text` then
`.split-visual`. Modifiers on `.content`: `equal`, `visual-wide`, `text-wide`.
```html
<section class="slide" data-n="5" data-layout="split" data-title="…">
  <p class="eyebrow">שלב 1</p>
  <h2>מאחדים פניות כפולות לפני שפותחים חדשה</h2>
  <div class="content">
    <div class="split-text"><ul class="stack" data-fx-stagger="80"><li><strong>…</strong>…</li></ul></div>
    <div class="split-visual"><figure class="chart" data-fx="scale"><svg viewBox="0 0 800 500">…</svg></figure></div>
  </div>
</section>
```

## centered
One statement or one number in the middle. A `.kpi` or a short `<h1>`; keep the content narrow.
```html
<section class="slide" data-n="6" data-layout="centered" data-title="…">
  <p class="eyebrow">בשנת 2025</p>
  <h1 data-fx="fade-up">78% מהפניות נסגרו בזמן</h1>
  <p class="lead" data-fx="fade-in" data-fx-delay="200">היעד לשנת 2026 הוא 90%</p>
</section>
```

## cards
Three or four parallel items. `.card-grid` with `cols-2`, `cols-3` (default) or `cols-4`, each `.card`
with an optional `.icon`, an `<h3>` and a `<p>`. Modifiers on a card: `primary`, `accent`, `raised`.
```html
<section class="slide" data-n="7" data-layout="cards" data-title="…">
  <h2>ארבע קטגוריות קובעות את זמן התקן</h2>
  <div class="card-grid cols-4" data-fx-stagger="90">
    <div class="card"><div class="icon"><svg …></svg></div><h3>שירות כללי</h3><p>4 שעות עבודה</p></div>…
  </div>
</section>
```

## process
A numbered horizontal flow in `.steps` (add `vertical` for a stacked list). Each `<li>` holds
`<span class="step-n"></span>` (auto-numbered), a `<strong>` and a `<p>`. Mark the current one with
class `current`. The connector direction follows the page direction, so in RTL it flows right to left.
```html
<section class="slide" data-n="8" data-layout="process" data-title="…">
  <h2>חמישה שלבים, בלי לדלג</h2>
  <ol class="steps" data-fx-stagger="100"><li><span class="step-n"></span><strong>קליטה</strong><p>…</p></li>…</ol>
</section>
```

## timeline
Dated points on a line: `.timeline` with `<li>` holding `<time>`, `<strong>`, `<p>`. Classes `done`
and `todo` on items. Add `vertical` for a column.

## quote
One `<figure class="quote">` with `<blockquote>` and `<figcaption>`; `mark` inside the quote for the
emphasised words. Centred by default; `start` aligns to the start edge.

## comparison
Two columns in `.compare`: a `.before` block and an `.after` block, each with an `<h3>` and a `.stack`.
The after column is tinted with the primary soft colour.

## summary
The takeaways. Usually a `.stack.numbered` or a `.card-grid cols-3`; `.content.two-col` splits into
two columns when pairing a list with a `.callout`.

## cta
Closing slide: what to do next and where to get help. `<h1>`, `.lead`, then a `.badge-row` or a
`.hstack` of contact items. Same chrome as the title slide. Use `data-logo="1"`.
