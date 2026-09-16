# VIRRA Website — Launch Readiness Review

**Date:** 2026-08-04
**Scope:** The marketing site (`virra.app`) — the Astro project in `src/`. *Not* the mobile app.
**Measured against:** the MVP brief (`virra_mvp.html`), the Vol. 02 brand guidelines (`virra_guidelines.html`), and general launch/compliance hygiene.
**Method:** Full read of every page/component/lib in `src/`, full extraction of the brand guidelines, plus **live verification against production** (`www.virra.app`) — so Sanity-driven content that can't be seen in the code was checked as it actually renders. No code changed.

---

## Verdict

**The site is in good shape and close to launch-ready.** It is strongly on-brand, technically sound, and free of the usual pre-launch rot — no lorem ipsum, no dead `#` links, no broken routes, no stubbed forms. Every one of the 10 routes is live and returns 200.

What's left is **not a pile of broken things**. It's **one strategic decision** (how the app figures in the launch), a **couple of genuine config gaps** (spam protection, a stale CMS left exposed), and **a short list of polish items**. There are effectively **no hard functional blockers**.

---

## What's already right (don't touch)

| Dimension | Status |
|---|---|
| **Brand tokens** | Site runs on the exact Vol. 02 palette (`#D4FF26` Pulse, `#FF2E7E` Heat, `#0A0A0F` Mile, `#F4EDE0` Breath, `#FF6B3D` Dawn, `#1C1C24` Mist) and the four correct typefaces (Big Shoulders Display, Fraunces, Inter, Space Mono). *The CLAUDE.md note about Cormorant/Outfit fonts is stale — that migration already happened.* |
| **Brand voice** | Bang on. The hero — *"We run hot. We don't cool down for anyone."* — is the brand manifesto almost verbatim. Copy is warm/direct/adult, anti-diet-culture, cycle-positive. No cheerleader/bro-fitness/girlboss/streak-guilt language anywhere. |
| **Content** | Sanity is **populated** live: 12 published articles, the founder section, pillars, coaching tiers, and all three legal pages render real content. |
| **Legal / compliance** | Privacy, Terms and Cookie pages are live with real text (~500–650 words each). Cookie banner is ICO-clean: functional-only, equal-weight Accept/Reject, 12-month re-consent. |
| **SEO / meta** | Per-page title + description, canonical, full OG + Twitter cards, `og-default.png`, favicon set, sitemap, RSS, and JSON-LD (`Organization` + `Article`). Launch-ready. |
| **Forms** | Newsletter (Beehiiv), Coaching enquiry (Resend + Google Sheets), Contact (Resend), Save-my-paces (Resend + Beehiiv) — all genuinely wired, all with honeypots. |
| **Pace calculator** | Fully functional, client-side, three modes incl. the cycle-aware view, unit-tested. The strongest self-contained page. |

Brand conformance is tight enough that the only deviations found are cosmetic (see P2).

---

## Strategic framing (resolved)

**The site is deliberately an audience-builder, not app marketing — and that's the plan.** The primary CTA everywhere is the **Run Hot newsletter** ("Join The Pack"); the secondary CTAs are **1:1 coaching** and the **free pace calculator**. There is no App Store badge or app-download CTA — **by design**.

**Decision (Emma, 2026-08-04):** the app-download CTA is a **day-2 addition** that follows once the app formally launches. Until then the site's job is to **build the audience**. So the newsletter-first orientation is correct and on-strategy, not a gap — this review is measured against "audience-building site," which is the right target.

Practical implication: the app-story layer (hero app CTA, feature showcase, screenshots, App Store link) is **intentionally out of scope for this launch** and slots in as a later piece of work. The list below is therefore the whole job for launching the site as it stands.

---

## Gaps & anomalies

Severity reflects launch risk. "Live-verified" = I checked production, not just the code.

| # | Item | Severity | Live-verified | Notes |
|---|------|:---:|:---:|-------|
| 1 | **App positioning** — no app CTA/waitlist anywhere | **Resolved** | ✅ confirmed absent | Intentional: newsletter-first now, app-download CTA is a day-2 addition after the app launches. Not a gap. |
| 2 | **Stale Decap CMS exposed at `/admin`** | **P0** | ✅ `/admin` returns 200 | Dead scaffolding: a Netlify/Decap config pointing at a `src/content/blog` folder that doesn't exist and wrong categories/author. The real pipeline is Sanity. It's publicly reachable. Remove it (delete `public/admin/`) or lock it down. |
| 3 | **Turnstile spam protection is a no-op** | **P0** | ⚠️ can't see prod env | Coaching + Contact render a Cloudflare Turnstile widget, but `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` aren't in `.env.example` or local `.env`, and `verifyTurnstile()` **returns `true` when the secret is missing**. If prod also lacks them, all three public forms have zero bot protection. Confirm keys are set in Vercel; add both to `.env.example`. |
| 4 | **Dev fallback strings can leak to users** | P1 | ✅ not showing now (Sanity populated) | If Sanity ever hiccups, the homepage shows the literal *"Placeholder founder bio. Update in Sanity."*, About collapses to a bare headline, and legal pages show *"…coming soon."* These are ugly failure modes for a live site collecting personal data. Replace with graceful, on-brand fallback copy. |
| 5 | **Instagram handle: personal vs brand** | P1 | ✅ both live | About "Follow Emma" → `emmasrunlife` (personal); footer/JSON-LD → `virrarun` (brand). Probably intentional (follow Emma vs follow VIRRA) — just confirm it's what you want, since it reads as an inconsistency. |
| 6 | **Newsletter source attribution reused** | P1 | — | The homepage's bottom newsletter block posts `source="hero"` (same as the top one), so Beehiiv can't tell them apart. Cosmetic for launch, but you'll want clean signup-source data from day one. |
| 7 | **www vs apex link drift** | P2 | ✅ redirect works | Canonicals use `www.virra.app`; `CNAME` and some hardcoded links (email/RSS) use apex `virra.app`. The apex→www redirect works, so this is cosmetic — tidy the hardcoded links for consistency. |
| 8 | **Brand nit: gradient in article-card placeholder** | P2 | ✅ | `ArticleCard.astro:44` uses a `linear-gradient` for articles with no image. Guidelines say *"Virra colours are flat. Always."* Swap to a flat fill, or (better) make sure every article has a hero image. |
| 9 | **Brand nit: off-palette hover shades** | P2 | ✅ | A few hover colours (`#C8F020`, `#E3D9C6`) and a stray grey sit just outside the named palette. Trivial; align if you're being strict. |
| 10 | **Favicon spec** | P2 | — | Guidelines say the favicon should be the **Pulse Mark**, never the wordmark (the italic *i* disappears below 60px). Worth a 30-second check that `favicon.svg` is the mark. |

**Downgraded from the initial static audit** (worried about, but verified fine live): legal pages *are* populated; Sanity *is* populated; the coaching *"from £50/mo"* claim is accurate (live tiers £50 / £100 / £150).

---

## Prioritised action list

### P0 — before you call it launched
1. **Remove or lock down `/admin`** — delete `public/admin/` (the Decap config), since content is managed in Sanity.
2. **Confirm Turnstile keys are set in production** and add both vars to `.env.example`. Otherwise the forms have no spam protection.

*(App positioning is resolved — newsletter-first is intentional; app CTA is day-2. No action for this launch.)*

### P1 — polish before launch
4. Replace dev fallback strings (founder bio, legal "coming soon") with graceful on-brand copy.
5. Confirm the About-page Instagram handle is intentionally Emma's personal account.
6. Give the homepage's second newsletter form its own `source` for clean analytics.

### P2 — nice to have / brand tightening
7. Make hardcoded email/RSS links match the canonical `www` host.
8. Flatten the article-card gradient (or ensure every article has an image).
9. Align stray off-palette hover shades; confirm favicon is the Pulse Mark.

---

## Confidence notes
- **HIGH (live-verified):** brand tokens/fonts/voice; legal & content populated; forms wired; SEO; `/admin` exposed; coaching prices; absence of app CTA.
- **MEDIUM (can't see prod env):** whether Turnstile keys are set in Vercel — verify directly.
- **Not assessed:** actual email deliverability (Resend domain verification), Beehiiv/Google Sheets live credentials, and analytics/consent-mode wiring beyond the cookie banner.
