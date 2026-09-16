# VIRRA Education Library — Structure Proposal

**Prepared 2026-08-07 · for Emma's sign-off · no articles drafted yet**

This proposes the category structure, the top-10 real questions per category, and how the
existing 19 articles fold in. Five decisions are flagged with a recommendation each.

---

## 1. The headline

**Recommendation: five categories, not four — and 50 articles is a two-wave job, not one.**

Your starting point (cycle phases / fuelling & nutrition / training & performance / female
health) survives contact with the research almost intact. One thing doesn't: **"female health"
cannot hold ten articles.** It spans nine sub-themes whose medical risk runs from *zero*
(sports bras, chafing) to *highest in the set* (iron dosing, amenorrhoea, stress fracture).
Splitting it lets the safe, high-demand, hugely under-served half ship fast while the clinical
half goes through proper review.

There is also a **fourth taxonomy problem**: the app, the website and the tips table each
already use a different category list. Nothing currently reconciles them.

| Where | Categories today |
|---|---|
| App library filter chips (`library.tsx`) | Training · Nutrition · Recovery |
| App phase tags (`PHASE_TAGS`) | menstrual · follicular · ovulatory · luteal |
| Website (Sanity `article.ts`) | Training · Nutrition · Cycle & Hormones · Mindset · Race Day |
| Tips table (`tips` migration) | training · nutrition · lifestyle |

---

## 2. Decision A — category structure

The app already has **two orthogonal axes** and they both work. Keep them:

- **Category** = the filter chips (`tags.includes(filter.toLowerCase())`)
- **Cycle phase** = `menstrual` / `follicular` / `ovulatory` / `luteal`, which drives the
  personalised **"FOR YOUR PHASE"** shelf

Cycle articles get *both* — a category tag and a phase tag. That's already how the schema works.

### Option A1 — your four categories
Cycle · Fuelling · Training · Female Health → **40 articles, 22 net new**

Cheapest. But Health carries nine sub-themes in ten slots (iron, RED-S, bone, injury, sleep,
pelvic floor, postnatal, perimenopause, sports bra) — perimenopause alone could fill twelve
articles on its own. It also puts your riskiest and safest content on one shelf, so the whole
category inherits the highest editorial standard and the slowest review.

### Option A2 — five categories ✅ **RECOMMENDED**
Cycle · Fuelling · Training · Health · Body & Life → **50 articles, 32 net new**

Splits Health along the line the research kept drawing anyway:

- **Health** = the RED-S causal chain — under-fuelling → lost periods → low iron → weak bones
  → stress fractures. One coherent argument told across ten pieces. This *is* the fuelling-first
  thesis, and essentially all the medical risk lives here, so it can carry one consistent
  clinical-review standard.
- **Body & Life** = sports bra, pelvic floor, safety, kit, postnatal, perimenopause. Near-zero
  medical risk, highest raw prevalence in the whole research set, and the worst-served in the
  UK market. Ships fast and cheap.

The risk tiers map almost perfectly onto this split, which is a strong independent signal it's
the right cut.

### Option A3 — keep the three chips already in code
Training · Nutrition · Recovery → zero code change, but "Recovery" becomes a dumping ground and
the shelf names don't match how women describe their own problems. **Not recommended.**

---

## 3. Decision B — naming

The app and website both say **"Nutrition"**. Your voice says **"Fuelling"**.

✅ **Recommended:** use **Fuelling** in the app. It's a one-word change that states the position
before anyone opens an article. Optionally rename the website's Sanity category to match
(schema enum edit + re-tag four articles — small, but it's a separate job).

Proposed chip set: **All · Cycle · Fuelling · Training · Health · Body & Life**

⚠️ Six chips will wrap onto two lines on smaller phones. The filter row already has
`flexWrap: 'wrap'`, so it degrades gracefully — worth eyeballing on a small device.

---

## 4. Decision C — volume and sequencing

50 articles is a lot of AI drafting **and a lot of your review time**. Beta kickoff is ~14 Sept;
launch is late Oct.

- **Option C1 ✅ RECOMMENDED — two waves.**
  **Beta wave (~24):** everything with high demand *and* low medical risk, plus the RED-S
  article (which unblocks a dead link shipping in the app today). Proves the library works with
  real testers before you commit review time to the rest.
  **Launch wave (remaining ~26):** the clinical shelf and the long tail.
- **Option C2 — all 50 by launch, one review push.** Highest risk to the date; content is
  already the critical-path blocker.
- **Option C3 — six per category for launch (30), top up after.** Safest for the date, but the
  shelves look thin next to a "10 per category" promise.

---

## 5. Decision D — website ↔ app relationship

Right now the app **links out to the website** for RED-S (`REDS_URL` in
[cycle-settings.tsx:37](mobile/app/(app)/cycle-settings.tsx:37) and
[cycle.tsx:39](mobile/app/(onboarding)/cycle.tsx:39)) — and that URL is dead, 307-ing to `/advice`.

✅ **Recommended:** the app library is **self-contained**. Port the website's 13 into Supabase
`articles`, and change RED-S to an in-app deep link (`/(app)/library/reds`). Website stays the
public/SEO surface; overlap between the two is fine and intentional. Mixed in-app/out-to-web
reading is the worst of both.

⚠️ **Porting is not free.** Website articles are Sanity Portable Text; app articles are
`body_md`. And the app's renderer is very limited (see §8) — website pieces using bullet lists
or links will not survive the port unchanged.

---

## 6. Decision E — where the four phase-training articles sit

The research turned up a genuinely useful asymmetry: **the follicular phase has essentially zero
search demand.** Nobody googles feeling fine. Menstrual and luteal dominate; ovulatory is thin.

But the **"FOR YOUR PHASE"** shelf needs content for *all four* phases or it goes empty for a
quarter of your users at any given time.

✅ **Recommended:** keep the four existing phase-training articles as **structural** content —
they exist to fill the phase shelf, not to answer a search query. They're the reason your
follicular and ovulatory coverage isn't a hole. Judge them on quality, not on demand.

---

## 7. The questions — top 10 per category

**Legend:** ✅ existing article answers it · 🟡 existing article partly covers it, needs
extending or a dedicated piece · ⬜ net new

### 7.1 CYCLE

| # | Question, as she'd actually type it | Phase | Status |
|---|---|---|---|
| 1 | "Is it bad to run on my period?" | menstrual | 🟡 app: menstrual phase training |
| 2 | "Why am I so tired the week before my period?" | luteal | ✅ web: *Your period week and your training* |
| 3 | "Why do I feel unstoppable one week and completely rubbish the next?" | general | ✅ web: *Running with your cycle, not against it* |
| 4 | "Why is my heart rate so much higher for the same easy pace?" | luteal | ⬜ |
| 5 | "Why am I slower on my period?" | menstrual | 🟡 app: menstrual phase training |
| 6 | "Does running help period cramps or make them worse?" | menstrual | ⬜ |
| 7 | "What do I wear running on my period so I don't leak?" | menstrual | ⬜ |
| 8 | "I'm going to have my period on race day — what do I do?" | menstrual | ⬜ |
| 9 | "Is cycle syncing actually real, or is it just hype?" | general | 🟡 — deserves its own sceptical piece |
| 10 | "Does the pill/IUD affect my running — and do I even have a cycle if I don't bleed?" | general | ⬜ |

**Q9 is your credibility article.** The market is split between over-claiming influencers and
dismissive sceptics. The honest answer — real patterns, big individual variation, fuel first,
track before you tinker — is the one nobody's writing, and it's the article that justifies the
app's whole premise.

**Q7 is the one that actually stops women leaving the house.** Rated far above its apparent
"importance" by the people asking it.

### 7.2 FUELLING

| # | Question | Group | Status |
|---|---|---|---|
| 1 | "Do I have to eat before a morning run? I feel sick if I do and rubbish if I don't." | pre | ⬜ |
| 2 | "How do I know if I'm eating enough for the mileage I'm doing?" | adequacy | 🟡 web: *Why you're always cold* |
| 3 | "Why am I absolutely ravenous for the rest of the day after a run?" | adequacy | 🟡 app: cycle fuelling |
| 4 | "How many gels do I actually need for a half marathon?" | during | ⬜ |
| 5 | "Gels wreck my stomach — what else can I use?" | practical/gut | ⬜ |
| 6 | "I've been running for months and my body looks the same — what has actually changed?" | reframe | 🟡 web: *Volume eating* |
| 7 | "Do I really need carbs, or can I run low-carb?" | adequacy | ⬜ |
| 8 | "I'm not hungry after a run — do I have to eat anyway?" | post | ⬜ |
| 9 | "What do I eat the night before and on race morning when I'm too nervous to eat?" | practical | ⬜ |
| 10 | "Why does the scale go up when my training is going well?" | reframe | ⬜ |

**Q2 is the flagship.** Everything else in the library can link into it.

**Q6 and Q10 are the two reframes.** Both sit on very high real search volume
("running but not losing weight", "gained weight marathon training"). Skipping them costs
meaningful reach; writing them in the original frame costs the brand. Recommended approach:
**match her words in the title, flip the frame in the first paragraph.**

Note Q3 arrives phrased as *hunger control* — that tells you the frame she turns up in.

### 7.3 TRAINING

| # | Question | Group | Status |
|---|---|---|---|
| 1 | "How do I keep going when I just don't want to?" | consistency | 🟡 web: *A missed run is not a moral failing* |
| 2 | "Why do my easy runs feel so hard?" | pacing | ✅ web: *Easy runs are meant to feel easy* |
| 3 | "Am I running too slow?" | pacing | 🟡 same article |
| 4 | "How do I run without stopping to walk?" | progression | ⬜ |
| 5 | "How many days a week should I run — and do I really need rest days?" | recovery | ⬜ |
| 6 | "How do I go from 5k to 10k?" | progression | ⬜ |
| 7 | "Do I actually have to lift weights? And will it make me bulky?" | strength | ✅ web: *Strength training is running training* — needs the "bulky" myth adding |
| 8 | "Why am I getting slower when I'm training more?" | plateau | ⬜ |
| 9 | "Why do my legs feel like lead in taper — have I lost all my fitness?" | race prep | ⬜ |
| 10 | "How do I not blow up in the first mile of a race?" | race prep | ✅ web: *Don't blow up in the first mile* |

**Q1 was the single strongest cluster in the entire research sweep** — six near-duplicate forum
threads on one page. It's a mindset question wearing training clothes, and *A missed run is not
a moral failing* is exactly the right voice for it. That article is also the reason Training
absorbs the website's "Mindset" category cleanly.

**Q5 sits directly on diet-culture "earn it" thinking** — rest-day guilt. High-leverage.

**Q9 is the cheapest win on the list:** research suggests runners who are simply *told what
taper feels like* report substantially less taper anxiety. Pure "just explain it" value.

### 7.4 HEALTH *(the clinical shelf)*

| # | Question | Risk | Status |
|---|---|---|---|
| 1 | "Why am I so tired all the time since I started running?" | 🔴 high | 🟡 web: *Tired, not unfit: iron deficiency* |
| 2 | "My period has stopped and I'm not pregnant — is it the running?" | 🔴 highest | ⬜ **unblocks the dead RED-S link** |
| 3 | "Do I need to take an iron supplement, and how much?" | 🔴 highest | 🟡 iron article — **must never publish a dose** |
| 4 | "Is this shin pain a stress fracture?" | 🔴 highest | ✅ web: *The rise of the stress fracture* |
| 5 | "How do I get my period back?" | 🔴 highest | ⬜ |
| 6 | "Why do I keep getting injured and keep catching every cold?" | 🟠 high | ⬜ — the RED-S "connect the dots" hub |
| 7 | "Will running wreck my bones / give me osteoporosis?" | 🟠 high | 🟡 adjacent to stress fracture piece |
| 8 | "Am I eating enough to have a period?" | 🟠 high | ⬜ — cross-links to Fuelling Q2 |
| 9 | "How do I come back from injury without causing the next one?" | 🟡 medium | ✅ web: *Coming back from a running injury* |
| 10 | "Why can't I sleep after an evening run?" | 🟢 low | ⬜ |

⚠️ **This shelf needs an editorial standard before a word is drafted.** See §9.

### 7.5 BODY & LIFE *(practical, near-zero risk, all net new)*

| # | Question | Note |
|---|---|---|
| 1 | "My boobs hurt when I run — what sports bra do I actually need?" | **Highest prevalence in the entire research set** (~72% of women report breast pain running) and the most under-served. Zero medical risk. **Lead with this one.** |
| 2 | "I leak a bit when I run — is that normal?" | Real forum title: *"embarrassing womens problem running"*. She can't even name it. Answering plainly buys enormous trust. |
| 3 | "Is it safe to run alone? What do I do about running in the dark?" | A *gating* question — it decides whether she runs at all, Oct–Mar. |
| 4 | "How do I keep running through winter?" | Dark, cold, and motivation — with the safety edge generic publishers ignore. |
| 5 | "When can I start running again after having a baby?" | Two opposite women ask this identically — one pushed too soon, one too frightened to start. Must serve both. |
| 6 | "Is it safe to keep running while pregnant?" | |
| 7 | "Why has running suddenly got so much harder in my 40s?" | |
| 8 | "What actually helps in perimenopause — training, fuelling, sleep, strength?" | |
| 9 | "Running through the menopause: sleep, hot flushes and heat" | |
| 10 | "How do I stop chafing — and what kit actually works?" | Low glamour, high utility, very shareable. |

**Three slots go to perimenopause/menopause and that is deliberate.** It surfaced unprompted in
multiple independent searches, has active UK forum threads, and is the fastest-growing area in
women's running. It could carry twelve articles on its own.

⚠️ **This is also where the diet-culture pressure is worst.** The single most weight-framed
verbatim thread title found was *"Anyone running to offset menopause weight gain"*. Q7/Q8/Q9 are
where an anti-diet-culture brand either proves itself or quietly capitulates. Recommended line:
**match the symptom, not the frame** — she searches "weight", she's usually describing body
composition change, fatigue and lost capability.

---

## 8. What exists, and the maths

### The 19 existing articles

**In the app (6, all published 2026-05-07)** — ⚠️ tags unverified, see §10
| Article | Goes to |
|---|---|
| Menstrual phase training | Cycle *(structural)* |
| Follicular phase training | Cycle *(structural)* |
| Ovulatory phase training | Cycle *(structural)* |
| Luteal phase training | Cycle *(structural)* |
| Cycle fuelling | Fuelling |
| Iron | Health — **likely the same piece as the website's iron article; dedupe** |

**On the website (13)**
| Article | Site category | Goes to |
|---|---|---|
| Your period week and your training | Cycle & Hormones | Cycle |
| Running with your cycle, not against it | Cycle & Hormones | Cycle |
| Volume eating, done right and done wrong | Nutrition | Fuelling |
| You can drink too much water | Nutrition | Fuelling |
| Why you're always cold (even in a heatwave) | Nutrition | Fuelling |
| Easy runs are meant to feel easy | Training | Training |
| Strength training is running training | Training | Training |
| Running in a heatwave | Training | Training |
| Don't blow up in the first mile | Race Day | Training |
| A missed run is not a moral failing | Mindset | Training |
| Coming back from a running injury | Training | Health |
| The rise of the stress fracture | Training | Health |
| Tired, not unfit: iron deficiency | Nutrition | Health *(dedupe with app's iron)* |

Two website articles — *You can drink too much water* and *Running in a heatwave* — don't answer
a top-10 question. They stay anyway; they're good and they're seasonal.

### Net-new count

| Category | Existing | Target | **Net new** |
|---|---:|---:|---:|
| Cycle | 6 | 10 | **4** |
| Fuelling | 4 | 10 | **6** |
| Training | 5 | 10 | **5** |
| Health | 3 | 10 | **7** |
| Body & Life | 0 | 10 | **10** |
| **Total** | **18** | **50** | **32** |

18 unique, not 19 — the iron article is counted once. On your four-category structure
(Option A1) it's **18 existing, 40 target, 22 net new**.

⚠️ "Existing" means *slots onto the shelf*, not *needs no work*. All 13 website pieces need
porting to `body_md`, and several of the 🟡 items need extending to answer the question directly.

---

## 9. Editorial standard for the Health shelf

The research mapped the risk surface, and it's sharper than it looks.

**Hard stop — signpost the GP and stop:**
- **Iron dosing.** Iron overload is genuinely dangerous, and unexplained anaemia can mask bowel
  cancer. **Never publish a dose.** (Commercial running sites do this confidently. Don't copy
  them.) The safe, genuinely useful article is *"how to get tested and what to ask your GP for"*
  — including the real nuance that standard NHS anaemia testing measures haemoglobin, which
  depletes *after* ferritin, so a runner can be symptomatic and still be told she's "normal".
- **Amenorrhoea, cause and recovery.** Serious non-exercise causes exist (pregnancy, PCOS,
  thyroid, pituitary). Must never be normalised as a runner thing.
- **Stress fracture.** No self-diagnosis checklist that could read as clearance to keep training.

**High — substantial caveat plus signpost:**
- Unexplained fatigue (broad differential — must not funnel everyone to iron)
- Under-fuelling / RED-S — eating-disorder adjacency; needs a **Beat** signpost and careful
  language
- Bone density, postnatal return

**Publish freely:** sports bra, chafing, kit, sleep, running on your period, cycle-based training.

Suggested build item: a small **reusable signpost component** for the article renderer, so the
GP/Beat line looks deliberate rather than bolted on.

---

## 10. Build dependencies

These are not blockers for *drafting*, but the library breaks at 50 articles without them.

1. 🔴 **Library filter bug.** In [library.tsx](mobile/app/(tabs)/library.tsx), `remaining`
   removes **every** phase-matching article from the main list, but only two are shown in the
   "FOR YOUR PHASE" shelf — and that shelf is hidden whenever a filter is active. So with a
   luteal user and 10 luteal-tagged articles, 8 are invisible on "All" and **all 10 vanish**
   under any filter. Today, with 6 articles, it's barely noticeable. At 50 it's severe.
2. 🟠 **The markdown renderer is very limited.** `renderBody` in
   [[slug].tsx](mobile/app/(app)/library/[slug].tsx) supports only `## ` headings, whole-block
   bold, and paragraphs. **No bullet lists, no numbered lists, no links, no inline bold, no H3,
   no blockquote.** Website articles use all of those. Either upgrade the renderer (recommended
   — lists are natural for this content, and cross-linking is how the shelves hold together) or
   the drafting brief must ban them.
3. 🟠 **No search and no pagination** — 50 articles render into a single `ScrollView`.
4. 🟡 **`ALL_FILTERS` is hardcoded** and matched via `tags.includes(filter.toLowerCase())`, so
   category tags must be exact lowercase strings. One-line change once §2 is agreed.
5. 🟡 **Tag order matters.** The chip on each row is the *first tag that isn't a phase tag* — so
   a stray tag in position 0 renders as the category label.
6. 🟡 **RED-S deep link.** Two screens link to a dead URL (see §5).
7. 🟡 **Discovery.** Nothing in the app links into the library except the tab itself. The `tips`
   table already carries phase + category and renders on the home tab — wiring **tip → matching
   article** is the natural entry point. (`articles.linked_feature` exists in the schema and has
   never been used; it's the obvious hook.) Also worth aligning the tips categories
   (`training`/`nutrition`/`lifestyle`) with the agreed shelf names.
8. 🟡 **Verify the 6 app articles' tags.** Anon PostgREST returns `[]` (RLS is `to
   authenticated`), so this needs one query in the Supabase dashboard:
   ```sql
   select title, slug, tags, published_at from articles order by published_at desc;
   ```

---

## 11. Drafting brief — the rules that fall out of this research

For when the AI drafting starts:

1. **British English.** GP, anaemia, period, kit, knackered.
2. **Fuelling-first, anti-diet-culture.** Never weight-loss framed. Where the real search
   phrasing is weight-shaped, match her *words* in the title and flip the *frame* in the opening
   paragraph.
3. **Title = her question, near-verbatim.** These are questions, not headings. "Why am I so
   tired the week before my period", not "Luteal phase physiology".
4. **Lead with the reassurance, then the mechanism.** Almost every question in this research has
   *"am I doing it wrong / am I broken"* underneath it.
5. **No lists or links until the renderer is upgraded** (§10.2).
6. **Cross-link, don't absorb.** Roughly a third of "cycle" demand is fuelling or clinical
   demand in a cycle-shaped costume. Signpost across shelves rather than re-answering.
7. **The existing 13 website articles are the voice benchmark** for the AI drafts.

---

## 12. A note on the evidence

Honest caveat on how this was researched: **Reddit was unavailable** — the search backend
stripped `site:reddit.com` on every attempt across all four research passes, so no r/XXRunning
thread titles were retrievable and none were invented.

What came back instead was **HealthUnlocked's Couch to 5K and Bridge to 10K forums**, which is
arguably a better source for VIRRA: UK-based, so the phrasing is already British, and
overwhelmingly women, skewing beginner/recreational rather than competitive. Verbatim thread
titles from there are the strongest evidence in this document. That's supplemented with
publisher headline density (Women's Running UK, Runner's World, Marathon Handbook, Femmi,
Canadian Running, Trail Runner) — SEO-written, so a decent proxy for query phrasing — and
prevalence literature used for ranking rather than wording.

**Treat the rankings as directional, not as keyword-volume data.**

One finding worth keeping in view: **weight-loss framing dominates the SEO/publisher space and
is almost absent from what women ask each other.** Across dozens of surfaced forum thread
titles, women asked about motivation, pace, rest days, walk breaks and whether they were doing
it wrong — not weight. Your positioning isn't fighting user demand; it's fighting the
advertising incentive that shaped the existing content. You'll take an organic-search hit for
it. You won't take a relevance hit.

---

## 13. What I need from you

| # | Decision | Recommendation |
|---|---|---|
| A | Four categories or five? | **Five** — split Health from Body & Life |
| B | "Nutrition" or "Fuelling"? | **Fuelling** in the app; website optional |
| C | 50 in one push, or two waves? | **Two waves** — ~24 for beta, rest for launch |
| D | App self-contained, or link out to web? | **Self-contained**; port the 13, fix the RED-S link |
| E | Keep the four phase-training articles? | **Keep as structural** — they cover the phases search demand ignores |

Once A–E are settled, the next step is the drafting brief and the first batch.
