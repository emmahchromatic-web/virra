# VIRRA Mobility Sessions — Drafting Brief

**Version 1.1 · 2026-09-16 · the working spec for writing the mobility content**

Companion to Trello card 264. That card settled what mobility is; this is the shape to
write against, so that what you write drops into the app without being reshaped.

---

## 0. Decisions locked

| | Decision | Settled |
|---|---|---|
| A | What they are | **Pilates-style sessions for range of movement** |
| B | How they are used | **Two ways in** — programmed as repeatable, or tapped as a one-off |
| C | Who writes them | **Emma authors them**, like the Get Strong programmes and the recipes |
| D | One library or two | **One library.** The same session can be scheduled or done ad hoc |
| E | Cycle | **Phase-aware**, like the rest of the app |

---

## 1. What you actually write

One row per session, then a list of moves under it. Nothing else — no JSON, no ids, no
ordering columns. Those are mine.

### Per session

| Field | Rule |
|---|---|
| `name` | What it is, plainly. "Hips and Lower Back", not "Flow #2". This is what she taps. |
| `focus` | One line, max ~90 chars. What it loosens and why. Shown under the name. |
| `minutes` | 10, 20 or 30. Pick the honest one; see §3 — the app computes its own estimate and a mismatch will show. |
| `phases` | Which of `menstrual` / `follicular` / `ovulatory` / `luteal` this suits. One or more. See §4. |
| `intensity` | `gentle` / `moderate` / `strong`. Used to pick between sessions, not shown as a number. |

### Per move, in order

| Field | Rule |
|---|---|
| `name` | The move. Match an existing name where one exists, so it inherits its description. |
| `description` | One or two sentences: how to do it, and the one cue that stops it being done badly. Only needed for moves the library does not already have. |
| `reps` | Free text, and for mobility it is usually **time or breaths**: `"30s"`, `"45s each side"`, `"5 breaths"`, `"8-10 slow"`. |
| `sets` | **Usually leave empty.** Only fill it if the move genuinely repeats as rounds. |
| `cue` | Optional. The thing you would say out loud if you were in the room. |

**Leave `tempo` and `rest` empty.** Mobility moves carry neither — the app already knows
not to show a rest timer for this kind of work, and a tempo string on a stretch would be
noise.

---

## 2. Format to write in

Anything I can read: a Google Sheet, a doc, or markdown. A sheet is easiest if you want to
see them side by side, and it matches how the strength programmes were written.

One tab per session, or one row per move with a session column. Either is fine.

---

## 3. Length, and why the number matters

The `minutes` you write is what the card promises and what the workout screen shows, so
it has to be honest against the clock. Add the moves up the way you would do them:

- a hold at its length, and **twice** for "each side" — `45s each side` is 90 seconds
- breaths at about five seconds each
- reps at three or four seconds each, doubled for "each side" or "each way"
- a few seconds between moves to get into position

On that arithmetic a 10-minute session is roughly **10–15 moves**, a 20-minute one
**24–30**, and a 30-minute one **30–40**, depending on how many long holds it carries.

**Ignore the app's own 30-seconds-a-move rule for this.** That is a fallback the strength
programmes use for a move with no set count, and for mat work it undercounts by half or
worse: the first draft of a 30-minute session sized to it ran to nearly an hour. The seed
builder and the admin console both check your minutes against the clock and say so when
they are more than a couple of minutes apart.

---

## 4. Phases — the part that makes this Virra

Tag the session, not the move. The app picks which session to offer based on where she is.

| Phase | What tends to suit it |
|---|---|
| `menstrual` | Gentle, floor-based, nothing inverted or deeply compressive. Long holds. |
| `follicular` | Rising energy. Fuller range, more standing work, can be stronger. |
| `ovulatory` | Peak range of movement, and the phase where over-reaching is easiest. Worth a note in the cue if a move can be pushed too far here. |
| `luteal` | Lower back and hips take the brunt. Release-led rather than strength-led. |

A session can carry several phases. **Every phase needs at least one session at each
length**, or a woman in that phase gets nothing at that duration.

That is the one hard constraint in this document. Everything else is a preference.

---

## 5. Suggested first wave — 8 sessions

A starting point, not a requirement. Adjust freely; the shape matters more than the count.

| # | Name | Mins | Phases | Intensity |
|---|---|---|---|---|
| 1 | Wake Up | 10 | all four | gentle |
| 2 | Post-Run Reset | 10 | all four | gentle |
| 3 | Wind Down | 10 | menstrual, luteal | gentle |
| 4 | Hips and Lower Back | 20 | luteal, menstrual | moderate |
| 5 | Shoulders and Upper Back | 20 | follicular, ovulatory | moderate |
| 6 | Full Body Flow | 20 | follicular, ovulatory | moderate |
| 7 | Deep Release | 30 | menstrual, luteal | gentle |
| 8 | Strong and Supple | 30 | follicular, ovulatory | strong |

That covers all four phases at 10 and 20 minutes, and every phase at 30. Eight sessions is
also roughly the point where the library stops feeling repetitive in a week.

---

## 6. What happens to it

You write. I handle:

- the content model and the migration
- getting the moves into the `exercises` library with their descriptions
- admin console support, so you can edit them afterwards without me
- the ad-hoc entry point, which is the only genuinely new engineering

Worth knowing, because it shapes what you do **not** need to write:

- **No equipment variants.** The strength programmes carry three (gym, dumbbells,
  bodyweight). Mat work does not, so write each session once.
- **No 12-week blocks.** Strength programmes progress across three blocks. These do not,
  unless you want them to — say so and it changes the shape.
- **The mobility tab already exists** on the plan browser, and the week already has a slot
  for one mobility plan alongside one run and one strength block. The plumbing is there;
  it is empty.

---

## 7. When it is done

Send them however they end up. I will:

1. Load them, and tell you the app's own minute estimate per session so you can sanity-check §3.
2. Flag any move not already in the exercise library, so it gets a description rather than a bare name.
3. Check §4's constraint holds — every phase covered at every length.

