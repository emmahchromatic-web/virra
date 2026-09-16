# VIRRA Education Library — Drafting Brief

**Version 1.0 · 2026-08-07 · governs all AI-drafted library articles**

Companion to [EDUCATION_LIBRARY_PROPOSAL.md](EDUCATION_LIBRARY_PROPOSAL.md). That document
argued the structure; this one is the working spec for producing the articles.

---

## 0. Decisions locked

| | Decision | Settled |
|---|---|---|
| A | Category structure | **Five shelves** — Cycle · Fuelling · Training · Health · Body & Life |
| B | Naming | **"Fuelling"**, not "Nutrition" |
| C | Sequencing | **Two waves** — 24 live for beta, 50 for launch |
| D | App/web relationship | **App is self-contained** — port the 13, RED-S becomes an in-app deep link |
| E | Phase-training articles | **Keep all four as structural content** |

---

## 1. The output contract

Every article is a row in Supabase `articles`. The drafting run produces exactly these fields:

| Field | Rule |
|---|---|
| `title` | Her question, near-verbatim. Sentence case. No colons-with-subtitle. Max ~65 chars. |
| `slug` | Lowercase kebab-case, derived from the topic not the full question. Stable — never change it after publishing. |
| `body_md` | Constrained markdown. See §3. 600–900 words. |
| `tags` | `[category, ...phases]`. Category tag **must be first**. See §5. |
| `published_at` | **`null` on insert.** Emma sets it when she approves. |
| `linked_feature` | Leave `null` unless the article explains a specific app feature. |

**Draft in the database, not in files.** Row-level security only exposes rows where
`published_at is not null`, so unpublished drafts are invisible to users but readable by Emma in
the dashboard. That's the review queue — no separate tooling needed.

---

## 2. Voice

VIRRA's voice is already established. The 13 website articles are the benchmark — read
*Why you're always cold (even in a heatwave)* and *A missed run is not a moral failing* before
drafting anything.

1. **British English throughout.** GP, anaemia, period, kit, knackered, fibre, oestrogen,
   practise (verb) / practice (noun), -ise endings.
2. **Fuelling-first.** Food is equipment. Under-eating is a performance problem before it is
   anything else.
3. **Anti-diet-culture, without lecturing.** Never weight-loss framed. Never "guilt-free",
   "clean", "earn it", "burn it off", "good/bad foods", "snap back", "bounce back".
   Don't moralise about the diet culture either — just don't participate in it.
4. **Talk to one woman, not an audience.** Second person. "You", not "runners" or "women".
5. **Name her experience before explaining it.** She arrives thinking she's broken or doing it
   wrong. Almost every question in the research had that underneath. The first two sentences
   should make her feel recognised.
6. **Confident, not hedging.** "That's real, and here's why" — not "some research suggests it
   may possibly be the case that".
7. **No hype.** Where the evidence is thin, say so. That honesty *is* the differentiator —
   especially on cycle syncing.
8. **No emoji. No exclamation marks. No rhetorical questions as headings.**

### The reframe rule

Several articles sit on search demand phrased in diet-culture terms. The rule:

> **Match her words in the title. Flip the frame in the first paragraph.**

She searches "why am I not losing weight running". The title meets her there —
*"I've been running for months and my body looks the same"* — and the opening paragraph answers
the question she actually has (what has changed, and why the scale is a poor instrument for it)
without ever endorsing the premise that the scale was the point.

**Never** write to weight-loss intent. If an article can only be written by accepting that frame,
flag it back rather than drafting it.

---

## 3. Format — hard constraints

⚠️ **The app's markdown renderer is very limited.** `renderBody` in
[mobile/app/(app)/library/[slug].tsx](mobile/app/(app)/library/[slug].tsx) splits on blank lines
and handles only three block types. Anything else renders as literal text with the asterisks
showing.

**Permitted:**
- `## Heading` — section heading
- A block that both starts *and* ends with `**` — renders as a bold standalone line
- Plain paragraphs

**Forbidden — these will visibly break:**
- Bullet lists (`- `, `* `) and numbered lists
- Links of any kind
- Inline bold or italic *inside* a paragraph
- `#`, `###`, `>`, tables, images, horizontal rules, code

**Blocks are separated by one blank line.** No trailing whitespace.

> If Paul upgrades `renderBody` before drafting starts, lists and inline emphasis unlock and this
> section gets revised. Until then, treat the constraints as absolute — a brief that assumes the
> upgrade will produce 50 broken articles.

### Structure template

```
[Opening paragraph — name her experience back to her. 2–3 sentences. No heading.]

[Second paragraph — the short answer, plainly.]

**[One line: the thing to remember, if she reads nothing else.]**

## What's actually going on

[Mechanism. 2–4 paragraphs. Physiology in plain language.]

## What to do about it

[Practical. 2–4 paragraphs. Concrete enough to act on today.]

## When it's more than this          ← only where §4 requires it

[Signpost paragraph.]

[Closing paragraph — return to her, not to the science.]
```

Because lists are forbidden, sequences run as prose: *"Start with X. If that doesn't settle it
within a fortnight, try Y."* This is a constraint worth leaning into — it forces the writing to
stay conversational instead of collapsing into listicle.

---

## 4. Medical and editorial safety

**VIRRA is a consumer app, not a medical service.** No article diagnoses, prescribes, or gives
clearance to train.

### Tier 1 — hard stops

| Topic | Rule |
|---|---|
| **Iron dosing** | **Never publish a dose, brand, or supplement protocol.** Iron overload is genuinely dangerous, and unexplained anaemia can mask bowel cancer. The article is *how to get tested and what to ask for* — never what to take. |
| **Amenorrhoea** | Never normalise a missing period as a runner thing. Always name that pregnancy, PCOS, thyroid and pituitary causes exist and need ruling out. |
| **Stress fracture** | No self-assessment checklist that could read as permission to keep running. Bone pain that worsens with loading goes to a clinician, full stop. |
| **Any "is it safe to…" in pregnancy** | Individual clearance only. Describe considerations, never authorise. |

Useful, publishable nuance that *replaces* the unsafe version: standard NHS anaemia testing
measures haemoglobin, which depletes **after** ferritin. So a runner can be genuinely symptomatic
and still be told her bloods are normal. Teaching her to ask for a **ferritin** test specifically
is more useful than any dose ever would be.

### Tier 2 — substantial caveat plus signpost

Unexplained fatigue (broad differential — never funnel everyone to iron), under-fuelling and
RED-S (eating-disorder adjacency), bone density, postnatal return, contraception (never advise
starting, stopping or switching), perimenopause (HRT is a GP conversation).

### Tier 3 — publish freely

Sports bra, chafing, kit, sleep, running on your period, cycle-based training, taper anxiety,
pacing, progression.

### Signpost wording

Signposts are written as normal prose in a `## When it's more than this` section — never as a
disclaimer block, which reads as fear rather than care.

Templates to adapt:

> *Iron/fatigue:* "If you've been flat for more than a few weeks, it's worth asking your GP for a
> ferritin test specifically, not just a standard full blood count — and it's worth mentioning
> you're running, because the two get read differently."

> *Amenorrhoea:* "A period that's disappeared is information, not an achievement. It needs a GP,
> partly because running may not be the cause — pregnancy, thyroid and PCOS all need ruling out
> before anyone concludes it's your training."

> *Eating-disorder adjacency:* "If eating feels frightening or out of control rather than just
> complicated, that's worth proper support — your GP, or Beat, the UK eating disorder charity."

⚠️ **Verify Beat's current helpline number and URL at beateatingdisorders.org.uk immediately
before publishing anything that cites them.** A stale helpline number is worse than none, and I
have not confirmed the current details.

### Build item

Ask Paul for a small **signpost block** in the renderer — a distinct visual treatment for the
`## When it's more than this` section — so the clinical line reads as deliberate design rather
than a paragraph that happens to mention a GP. Low effort, meaningful trust payoff.

---

## 5. Tagging spec

**Category tags (exactly these lowercase strings):**

`cycle` · `fuelling` · `training` · `health` · `body`

**Phase tags (unchanged):** `menstrual` · `follicular` · `ovulatory` · `luteal`

### Rules

1. **The category tag is always `tags[0]`.** The library row's visible chip is the *first tag
   that isn't a phase tag*, so a stray tag in position 0 becomes the label.
2. Phase tags follow the category tag. Add a phase tag **only where the article genuinely speaks
   to that phase** — over-tagging floods the "For your phase" shelf with weak matches.
3. **No other tags.** Not yet. If a third axis is ever wanted, it needs a code change first.
4. Cycle articles usually carry one or two phase tags. Non-cycle articles usually carry none —
   except where a piece is genuinely phase-linked (luteal hunger belongs to `fuelling` + `luteal`).

Examples:

```
["cycle", "luteal"]
["cycle", "menstrual"]
["fuelling", "luteal"]
["training"]
["health"]
["body"]
```

### ⚠️ Required code change before any of this works

`ALL_FILTERS` in [library.tsx](mobile/app/(app)/(tabs)/library.tsx) currently uses one string as
both the chip label *and* the tag (`tags.includes(filter.toLowerCase())`). "Body & Life" can't be
a tag. The filter list needs splitting into label/tag pairs:

```
[{label: 'All'},
 {label: 'Cycle',       tag: 'cycle'},
 {label: 'Fuelling',    tag: 'fuelling'},
 {label: 'Training',    tag: 'training'},
 {label: 'Health',      tag: 'health'},
 {label: 'Body & Life', tag: 'body'}]
```

---

## 6. Titles

- **Her question, near-verbatim.** *"Why am I so tired the week before my period"* —
  not *"Understanding luteal phase fatigue"*.
- Sentence case. No question mark unless the title is genuinely a question she'd type.
- Drop the interrogative where it reads better as a statement of her experience:
  *"I've been running for months and my body looks the same"*.
- No colon-subtitle constructions. No "Everything you need to know about…". No "The ultimate
  guide to…".
- The existing site title *Tired, not unfit: iron deficiency and the female runner* is the one
  permitted exception pattern — it earns the colon. Don't imitate it by default.

---

## 7. The two waves

### Wave 0 — mechanical, before any drafting

1. Port the 13 website articles into `articles` (Portable Text → constrained `body_md`).
   Expect real editing: every list becomes prose, every link becomes a cross-reference by name.
2. **Dedupe the iron article** — confirm whether the app's `iron` row and the site's
   *Tired, not unfit* are the same piece; keep one.
3. Re-tag all existing rows to the §5 vocabulary.
4. Run the tag audit query and confirm the result matches the plan:
   ```sql
   select title, slug, tags, published_at from articles order by published_at desc;
   ```

Result: **18 articles live, correctly shelved.**

### Beta wave — 6 new drafts → 24 live (target: in place before ~14 Sept)

Chosen for the dead-link unblock, the biggest shelf gaps, and zero-to-manageable risk.

| Slug | Title (working) | Shelf | Tags | Why now |
|---|---|---|---|---|
| `reds` | My period has stopped and I'm not pregnant — is it the running? | Health | `["health"]` | **Unblocks the dead RED-S link shipping in the app today.** Slug must be exactly `reds`. |
| `sports-bra` | My boobs hurt when I run | Body & Life | `["body"]` | Highest prevalence in the whole research set. Zero risk. |
| `leaking-when-running` | I leak a bit when I run — is that normal? | Body & Life | `["body"]` | Highest trust payoff per word in the library. |
| `running-alone-safety` | Is it safe to run alone? | Body & Life | `["body"]` | Gating question, Oct–Mar. Stops the shelf being empty at beta. |
| `eating-before-morning-run` | Do I have to eat before a morning run? | Fuelling | `["fuelling"]` | Single most repeated topic found. |
| `running-on-your-period` | Is it bad to run on my period? | Cycle | `["cycle","menstrual"]` | Highest-volume cycle question. |

Beta shelf counts: Cycle 7 · Fuelling 5 · Training 5 · Health 4 · Body & Life 3 = **24**.

### Launch wave — 26 new drafts → 50 live (target: late Oct)

Cycle +3 · Fuelling +5 · Training +5 · Health +6 · Body & Life +7.
Full question lists are in §7 of the proposal. Draft in shelf order, Health last so the clinical
review standard is settled by practice on the safer shelves first.

---

## 8. How to run the drafting

Draft **one article per run**, not in batches. Batching degrades voice consistency and makes
review harder to structure.

### Prompt scaffold

```
You are drafting one article for the VIRRA education library.

VOICE + FORMAT: follow EDUCATION_LIBRARY_DRAFTING_BRIEF.md exactly — particularly
§2 (voice), §3 (format constraints — no lists, no links, no inline bold) and
§4 (medical safety tier for this article).

BENCHMARK: match the register of the existing VIRRA articles, especially
"Why you're always cold (even in a heatwave)".

THIS ARTICLE
  Question she typed:  <the question, verbatim>
  What's underneath:   <the real concern, from the proposal's research>
  Shelf:               <shelf>
  Tags:                <exact array>
  Slug:                <slug>
  Safety tier:         <1 / 2 / 3, and which rules apply>
  Must cross-link to:  <article titles, named in prose — no URLs>

Return only: title, slug, tags, body_md.
Do not write a dek, meta description, or headings outside the §3 template.
```

Feed the research finding for that specific question — the "what's underneath" line is what
separates a generic answer from a VIRRA one.

---

## 9. Emma's review gate

No article gets `published_at` set until every line passes.

**Voice**
- [ ] Would I say this out loud to a client?
- [ ] British English throughout, no Americanisms.
- [ ] Zero diet-culture framing — including implied ("just", "only", "treat", "indulgence").
- [ ] Opens by recognising her experience, not by explaining physiology.

**Substance**
- [ ] Answers the question she actually asked, in the first 100 words.
- [ ] Nothing overstated. Where evidence is thin, the article says so.
- [ ] The practical section is concrete enough to act on today.

**Safety**
- [ ] Correct tier applied (§4). No dose, no diagnosis, no clearance.
- [ ] Signpost present where required, written as prose.
- [ ] Any cited helpline or organisation verified this week.

**Technical**
- [ ] `body_md` uses only `##`, whole-block bold, and paragraphs. No lists, links, or inline `**`.
- [ ] Blocks separated by exactly one blank line.
- [ ] `tags[0]` is the category tag; phase tags are genuine, not decorative.
- [ ] Slug is stable, lowercase, kebab-case.
- [ ] Renders correctly on a real device — not just in the dashboard.

---

## 10. Build tasks that must land alongside

Drafting isn't blocked on these, but publishing 50 articles is.

| | Task | Owner | Blocks |
|---|---|---|---|
| 🔴 | **Fix the phase-filter bug** — `remaining` strips every phase-matching article from the list while only 2 render in the phase shelf, and that shelf is hidden under any active filter. At 50 articles, phase-tagged content largely disappears. | Paul | Launch wave |
| 🟠 | **Split `ALL_FILTERS` into label/tag pairs** and add the five new chips (§5). | Paul | Wave 0 |
| 🟠 | **RED-S deep link** — repoint `REDS_URL` in `cycle-settings.tsx:37` and `(onboarding)/cycle.tsx:39` from the dead `virra.app/advice/reds` to in-app `/(app)/library/reds`. | Paul | Beta |
| 🟡 | **Upgrade `renderBody`** — lists, links, H3. Relaxes §3 and makes cross-linking real. | Paul | Nice-to-have |
| 🟡 | **Signpost block** in the renderer (§4). | Paul | Launch wave |
| 🟡 | **Search + pagination** — 50 articles in one `ScrollView`. | Paul | Launch wave |
| 🟡 | **Tip → article links.** The `tips` table already carries phase + category and renders on the home tab; it's the only natural route into the library. Align its categories with §5 at the same time. | Paul | Post-launch |

---

## 11. Specimen

Not a finished article — a shape reference for the format rules, showing what §3 produces.

**Title:** Why am I so tired the week before my period
**Slug:** `luteal-fatigue`
**Tags:** `["cycle","luteal"]`
**Tier:** 3

```
You are not imagining it, and you have not lost fitness overnight. The week before your
period is the week most women find their running hardest — and it is also the week most
of us quietly conclude we are unfit, lazy, or going backwards.

You are none of those things. Your body is running the same session against a different
internal backdrop, and the effort you feel is real even when the pace on your watch is not
telling the story.

**A harder-feeling run in your late luteal phase is data about your physiology, not a
verdict on your training.**

## What's actually going on

After ovulation, progesterone rises and stays high until just before your period. It nudges
your core temperature up by a few tenths of a degree, which means you start every run
slightly warmer than you would a fortnight earlier and reach the point of feeling hot sooner.

Your heart rate tends to sit higher for the same easy pace. Breathing changes subtly too.
None of this is dysfunction — it is the same body doing the same work with the dial set
differently. The trouble is that a watch reports the cost and not the reason.

## What to do about it

Run to effort, not to pace, for these few days. If your easy run wants to be forty seconds
per kilometre slower to feel easy, let it be forty seconds slower — that is the session
working, not failing.

Eat more, not less. Your energy requirement genuinely rises in the luteal phase, and the
hunger that arrives with it is a signal rather than a lapse. Going into a hard week
under-fuelled is what turns a manageable dip into a miserable one.

Keep the hard sessions if they feel available, and move them if they do not. One session
shifted by two days costs you nothing across a training block.

Then watch what happens across two or three cycles. The general pattern is well established;
your personal version of it is the useful bit, and you only get that by paying attention
before you start changing things.
```

Note what the specimen does: recognises her first, gives the answer before the mechanism,
converts what would have been a bullet list into prose, and never mentions weight.
