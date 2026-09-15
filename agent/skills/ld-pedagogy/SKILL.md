---
name: ld-pedagogy
description: Use when writing or reviewing a deck outline or slide-by-slide breakdown for a training deck; learning objectives with Bloom verbs, sequencing, slide budget, knowledge checks, speaker notes, and the critic questions that expose blind spots.
---

# L&D Pedagogy

A training deck exists to change what the learner does on the job. Every decision in the
outline and the breakdown is judged by that, not by how complete the source document looks.

## Learning objectives

- Write 1 main objective and 2 to 4 sub-objectives. More than 5 objectives means two decks.
- Format: "By the end of [duration], the learner will be able to [Bloom verb] [ability],
  measured by [observable evidence]." In Hebrew:
  "בסיום [זמן], הלומד יוכל [פועל פעולה] [יכולת], הנמדד ב-[אופן מדידה]".
- The verb is observable. Allowed: identify, list, define (remember); explain, summarise,
  describe (understand); apply, perform, demonstrate, complete (apply); compare, analyse,
  distinguish (analyse); evaluate, judge, recommend (evaluate); design, develop, create (create).
  Hebrew: לזהות, לרשום, להגדיר; להסביר, לסכם, לתאר; להפעיל, ליישם, להדגים; להשוות, לנתח,
  להבחין; להעריך, לשפוט, להמליץ; לעצב, לפתח, ליצור.
- Forbidden verbs: know, understand, be aware of, be familiar with, appreciate, learn.
  "מכיר את התהליך" cannot be observed, so it cannot be achieved. Rewrite it.
- Every objective has a condition and a criterion: "given a refund request over 500 ILS,
  route it to the correct approver, 5 of 5 cases correct". The condition names the real
  situation; the criterion is a number or a yes/no.
- Match the Bloom level to the job. A procedure deck stops at apply. A policy deck for people
  who decide reaches analyse or evaluate. Do not write "create" for a compliance refresher.
- Every objective maps to at least one practice or check slide. An objective with no slide
  behind it is aspirational; cut it or add the slide.
- Every content slide serves an objective. A slide that serves none is cut, or an objective is
  missing.

## Sequencing

Default arc for a deck, in this order:

1. Hook (1 slide): a real situation, a surprising number, or the costliest mistake. Not the
   agenda, not "welcome".
2. Why it matters (1 slide): what goes wrong without this, for the learner and for the customer.
3. Objectives (1 slide): the 2 to 4 things they will be able to do, in their words.
4. Concept (2 to 4 slides): the model or rule, one idea per slide, with the vocabulary the
   job actually uses.
5. Procedure (3 to 8 slides): the steps in the order they happen, with the screen or form they
   happen in. Each step slide shows what to do, the decision point, and the common error.
6. Practice or check (1 to 3 slides): a scenario the learner resolves, then the answer.
7. Edge cases and exceptions (1 to 2 slides): what the clean version hides.
8. Summary (1 slide): the 3 things to remember, phrased as actions.
9. What to do tomorrow (1 slide): the first concrete action, where to get help, who to ask.

- Repeat concept, procedure, practice per module when the deck has more than one module.
  Never front-load all theory and back-load all practice.
- Introduce at most 3 to 4 new terms per module and never two on one slide. Define a term on the
  slide where it is first needed, not in a glossary slide up front.
- Name what the learner does today before showing the correct behaviour. A deck that only
  describes the right way, without engaging the current habit, does not change behaviour.
- Give the learner one memorable handle per module: a rule of three, a named check, a mnemonic
  in Hebrew. Explanations without a hook are gone in a day.
- Put the costliest mistake early, not in the edge-case section.

## One message per slide

- Each breakdown entry has a `message` field: one sentence the slide proves. The slide title is
  that sentence or a shorter form of it.
- If the message contains "and", split the slide.
- A slide teaches, shows, checks or transitions. Never two of these at once.
- Content on the slide is the evidence for the message: a diagram, a number, a screen, a short
  list. Anything on the slide that does not support the message goes to the notes or is cut.

## Slide budget by duration

- Plan about one slide per 45 to 75 seconds of talk. A dense procedure slide takes 90 seconds;
  a statement slide 20 seconds.
- 5 minutes: 5 to 7 slides. 10 minutes: 10 to 13. 20 minutes: 18 to 25. 45 minutes: 35 to 50.
  60 minutes: 45 to 60. Above 60 minutes, split into modules with a break slide.
- Self-paced (no presenter): 30% fewer slides, 30% more words in the on-slide takeaway, and a
  check after every module because nobody is there to ask.
- Budget slides per section in the outline before writing the breakdown, and hold to it. If a
  section overflows, the section has more than one message.
- Title, objectives, summary and closing slides are counted in the budget.

## Knowledge checks

- Place a check at the end of each module and in any case every 8 to 10 content slides, so the
  learner is doing something at least every 10 minutes.
- Put the first check within the first third of the deck; a check that only appears at the end
  is an exam, not learning.
- Each check tests one objective at that objective's Bloom level: a scenario with a decision for
  apply, a "which of these is wrong" for analyse, a recall list only for remember.
- A check slide holds the scenario and the question. The answer is on the next slide with the
  reason, never on the same slide.
- Distractors are the errors people actually make on the job, taken from the source or the SME,
  not obviously wrong options.
- Write the check so the presenter can run it aloud in under 2 minutes and a self-paced learner
  can answer it alone.
- Do not check knowledge that no slide taught.

## Speaker notes

- Notes say what to say, not what is on the slide. Never repeat the slide text.
- Open with the transition from the previous slide in one sentence.
- Then: the story, example or reason that the slide's visual cannot show. Aim for 60 to 120
  words per content slide, in the presenter's spoken register, second person.
- Include the question to ask the room and the answer you expect, where a check or a pause fits.
- Include the one thing the learner must not misunderstand on this slide, phrased as a warning
  the presenter says out loud.
- Mark source references in the notes, not on the slide, unless the slide is a quote.
- Mark timing: "(45 seconds)" at the top of each note. The sum must match the deck duration.
- For self-paced decks, the notes become the on-slide takeaway line and a short audio script.
- Notes never contain instructions to the builder or the QA agent; those go in the breakdown's
  `builder_notes` field.

## Blind-spot questions the critic asks

Run these against the outline before the breakdown, and again against the breakdown before the
build. Return questions and findings, not rewrites, unless the fix is unambiguous.

- What would a new employee misunderstand on this slide, and does the next slide catch it?
- What is the costliest mistake this topic prevents, and which slide names it explicitly?
- What does the source document assume the reader already knows: which system, which form,
  which role, which prior policy? Is each assumption taught or at least named?
- Who is affected by this topic and does not appear in the outline: the customer, the next
  person in the process, a part-timer, someone asked about it by phone?
- What is true today and false in six months: a system migration, a regulation, a threshold?
  Mark it on the slide so the deck can be updated.
- Where does the procedure have an exception or judgment call that the clean version hides?
- What happens when the learner does the right thing and it does not work? Who do they call?
- Which slide would someone who does this job daily call obviously wrong or simplified past
  usefulness?
- Which objective has no slide producing it, and which slide serves no objective?
- Count new terms per module. Where do they arrive faster than three per module?
- Describe exactly what the learner does differently tomorrow morning. If it cannot be said
  concretely, the deck is informational, not instructional.
- Is a deck even the right medium? If a checklist, a job aid, or a change in the system would
  work better, say so.

## Output checks for the outline and breakdown

- Objectives use observable verbs, with a condition and a criterion. No forbidden verbs.
- The section order follows the arc, or deviates for a stated reason.
- Every slide has exactly one `message`; no message contains "and" joining two ideas.
- Slide count fits the budget for the stated duration.
- A check appears at least every 10 content slides and within the first third.
- Every objective points to at least one practice or check slide.
- Speaker notes exist for every content slide, do not repeat slide text, and carry timing.
- The costliest mistake, the exceptions, and the "what to do tomorrow" slide all exist.
- The audience, their current behaviour, and the system they work in are named in the outline.
- Numbers, thresholds, names of systems and forms trace to the source document with a locator.
