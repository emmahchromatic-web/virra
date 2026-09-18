# VIRRA — Beta Programme

> **DATE SHIFT 2026-08-07:** Emma's scope decisions (authored strength before beta, HR capture, real trial flow) move every date ~1 week: **beta 14 Sept – 9 Oct**, recruit email ~7 Sept, applications close ~10 Sept, acceptances 11 Sept. Also decided: WhatsApp group ✓, founding offer = 50% off annual year 1 ✓, testers use the REAL trial flow (TestFlight sandbox — no actual charges; update the acceptance email to warn about the trial/purchase screens being sandbox). Structure below is unchanged — slide all dates one week.

**Dates:** 7 Sept – 2 Oct 2026 (4 weeks, now ~14 Sept – 9 Oct) · **Companion to:** `LAUNCH_CRITICAL_PATH.md`
**Rendered version:** Claude artifact "VIRRA — Beta Programme"

Closed TestFlight beta, target 40 women runners (25–40 realistic — see recruitment maths). Weekly Monday build + focus email, Friday 3-question pulse. Testers get free access + a founding-member offer; the beta must prove: onboarding lands, the cycle-syncing feels real, and they'd pay.

---

## 1 · Goals & gates

| Question | Measured by | Gate to submit |
|---|---|---|
| Does it work? | Crash-free sessions, bug reports | >99% crash-free; no P0/P1 open final week |
| Does onboarding land? | Sign-ups reaching dashboard (Supabase) | >85% completion; all 4 distances generate plans |
| Do they come back? | Weekly active testers, runs/meals logged | >60% active in week 4 |
| Does the moat matter? | Week-3 focus survey on phase guidance | Signal, not a gate — feeds launch messaging |
| Would they pay? | Week-4 Sean Ellis + price check | >40% "very disappointed" = strong |

## 2 · Cohort — 40, deliberately mixed

- **Cycle status:** ~25 natural / ~10 hormonal contraception / ~5 peri-menopause (all three app modes need real users)
- **Distance:** spread across 5K/10K/half/marathon (exercises all four templates)
- **Device:** mix Apple Watch vs phone-only; some Strava/Runna/MFP users (unprompted competitor benchmarks)
- **Hard screens:** iPhone (iOS 16+), runs 2+×/week, training during the window, 5 min Friday check-in

**Recruitment maths (list = 131 subscribers):** dedicated send → ~55–65% open, ~10–20% of openers apply → **~10–20 applications from the list**. So run three channels as the plan: Run Hot list (~15–20) + hand-picked coaching clients/running friends (~10, personal messages — highest-quality feedback) + Instagram (~10–15). Land at 25–40; in practice every qualified applicant gets in. Keep the "40 places" framing (true, honest scarcity). Testers may bring a running friend if light. 25 committed > 60 lukewarm.

## 3 · The four weeks

| Week | Focus | Notes |
|---|---|---|
| **0** · 4–6 Sept | **Install weekend** | Acceptance email Fri w/ TestFlight link. Ask: install, onboard, generate plan before Mon. Rescue stuck testers by email — onboarding drop-off is the first data. |
| **1** · 7–13 Sept | **Train** — core loop | Follow plan, log runs (GPS + manual), dashboard daily. Pulse focus: did the plan feel right? Watch Supabase activation daily. |
| **2** · 14–20 Sept | **Fuel** — nutrition | Nudge logging: search, barcode, describe-meal. Pulse focus: fuelling or diet-culture counting? (brand promise under test) |
| **3** · 21–27 Sept | **Sync** — cycle | Most have crossed a phase boundary by now. Check-ins, readiness, shifted targets. Pulse focus: did you notice the app change with your cycle; credible? |
| **4** · 28 Sept–2 Oct | **Verdict** — free use | No nudges; watch unprompted behaviour (retention signal). Fri exit survey: Sean Ellis, price expectation, feature ranking, testimonial permission, "stay on for launch?" (yes = keep access until release). |

## 4 · Feedback & ops

**Channels:** TestFlight screenshot feedback (bugs, auto-attaches logs) · Friday pulse (same 3 Qs weekly: days opened / what worked–what felt off / 0–10 recommend + weekly focus Q) · WhatsApp group (decision 2).

**Triage:** P0 crash/data-loss/blocked → fix + ship that week · P1 broken-but-avoidable → next Monday build · P2 polish/requests → shared "post-launch" list (feedback never feels ignored). One Trello list, card per bug, severity labels.

**Emma's loop (~2 hrs/wk):** Mon send build+email (15 min) · daily 10-min skim · Fri send pulse · Sun read + triage with Claude (pull Supabase numbers, update Trello, draft Monday email — 45 min).

## 5 · Newsletter launch — 5 sends

1. **Thu 28 Aug** — tease block inside regular Run Hot issue ("40 women get in early; applications open Monday"). Mirror on IG stories.
2. **Mon 31 Aug** — dedicated send, full list. Subject: "Be one of the first 40 inside the VIRRA app." Offer: free access from 7 Sept, direct line, founding-member price. Ask: iPhone, 2+ runs/wk, 5 min Fridays. CTA → application form. Closes Thu 3 Sept. Same day: IG post + personal notes to ~10 coaching clients.
3. **Wed 2 Sept** — last call, to non-clickers segment only.
4. **Fri 4 Sept** — acceptance email (personal, not Beehiiv): TestFlight steps, how the weeks work, WhatsApp link, "data carries to launch," "rough edges are the job," "no socials until launch week." Waitlist variant: first in line at launch; week-1 spot if one opens. Nobody hears silence.
5. **Mon 7 Sept** — kickoff to testers; weekly Monday cadence begins.

Full email drafts (paste-ready) are in the rendered artifact.

## 6 · Application form — LIVE at https://tally.so/r/0QYGgN (Tally, built 2026-08-07)

Name+email · iPhone? (hard screen, kind Android dead-end) · run frequency · training for what + race date · cycle status incl. prefer-not-to-say (+ privacy line) · watch? · current apps (multi) · one-line why · commitment self-screen · IG handle (optional, launch champions).

## 7 · Decisions (rec = A throughout)

1. **Form tool** — A *(rec)*: Tally (free, logic, CSV). B: build on virra.app (dev time during crunch). C: Google Form (off-brand).
2. **Community** — A *(rec)*: WhatsApp group (~10 min/day cap). B: email-only. C: Discord (ghost town).
3. **Founding offer** — A *(rec)*: free until launch + 50% off annual year 1 for testers; smaller launch-week discount for waitlist/list. B: free year (no revenue data). C: nothing (squanders warmest 40).

## 8 · Prerequisites before Send 2 (31 Aug)

- Plan templates seeded, all 4 distances generating
- Library populated; sign-up no-session fixed + email confirmation re-enabled
- Nutrition migrations applied; branches merged post-UAT
- First TestFlight build through external beta review (upload by ~28 Aug)
- Internal UAT (wk 24 Aug) passed, no open P0s
- Application form live, tested on a phone

**If the build slips, slip the recruitment — never the reverse.** A broken first impression with the 40 warmest prospects is the only unrecoverable failure. A one-week slide costs almost nothing (launch → late Oct/early Nov).

## 9 · Exit survey: the free-tier questions (card 315, drafted 2026-09-18)

The beta was designed around a hard paywall. On 2026-09-16 Virra became free with Pro (card 298): logging is free, anything Virra prescribes is Pro. Testers on builds before 16 never saw a free tier, so the exit survey has to ask about the line directly. Add these to the week-4 Tally survey, after the Sean Ellis question and before the testimonial permission.

**Q-A. Which of these would you expect to be free in an app like Virra?** Multi-select, options in random order, no grouping, no hint of which side each is on today.
- Logging my period and seeing my cycle phase
- Logging what I eat, with daily totals
- Logging runs and workouts, including from Apple Health
- Logging my weight and a daily check-in
- A training plan that adjusts to my cycle
- Nutrition targets that change with my cycle phase
- Strength programmes
- Mobility sessions
- The recipe book
- Insights and trends about my training and cycle
- Describing a meal and having it estimated for me
- A season planned around my races

**Q-B. At what monthly price would Virra Pro feel like good value?** Single choice: under £5 · £5–£7.99 · £8–£9.99 · £10–£12.99 · £13 or more · I would not pay for it. (Replaces the generic price question. It must say "Virra Pro", not "the app": the app is free.)

**Q-C. (Build 16 testers only) Did you turn "Show Pro features" off in your Profile?** Yes · No · I didn't know it was there. Follow-up if Yes, free text: what made you turn it off?

**Reading the answers.** Four of the twelve options are free today (the first four). For each Pro feature, the share of testers who expected it free:
- over 50%: candidate to move to free, decide with Emma before the October submission;
- 30–50%: keep Pro, but check the locked tile and paywall copy explain it well;
- under 30%: the line is in the right place.

For each free feature, under a third expecting it free means it could carry a padlock without surprise, which is a reason to keep it free, not to lock it: it is generosity people notice. Compare Q-A with `select * from public.pro_funnel;` (which locked tiles actually get tapped) before changing anything. Record the outcome on card 298.
