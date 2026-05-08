# VIRRA Website — Design Spec
**Date:** 2026-05-08  
**Scope:** Full rebuild of virra.app — 5 nav pages + 4 legal/utility pages  
**Brief reference:** `virra_website_brief.html` (Vol. 01)

---

## North Star

Build virra.app as the credibility-led content home for women runners — to grow *The Pack* before the app ships.

Primary CTA: **Run Hot** newsletter signup (Beehiiv).  
Secondary CTA: **Coaching enquiries** (income bridge while app is built).

---

## Section 1 — Architecture & Tech Stack

### Framework
Astro with `output: 'hybrid'`. All pages statically generated at build time. Two serverless endpoints:
- `POST /api/subscribe` — proxies newsletter signup to Beehiiv
- `POST /api/coaching-enquiry` — emails Emma + auto-reply + appends to Google Sheet
- `POST /api/contact` — emails Emma only (contact page form)

### Deployment
Vercel (replaces current GitHub Actions static deploy). Git push → Vercel build + deploy. Preview URLs per branch. Custom domain `virra.app` via DNS.

### CMS — Sanity
Studio at `virra.sanity.studio`. Package: `@sanity/astro`. Content fetched at build time; a Sanity webhook triggers a Vercel redeploy on publish.

**Schema types:**
| Type | Purpose |
|---|---|
| `article` | title, slug, body (rich text), category, SEO fields, published date, author, hero image, dek, read time, `featured: boolean` |
| `homepageContent` | hero copy, pillar cards (3), founder bio, coaching teaser, calculator teaser |
| `coachingPage` | tiers (array), testimonials (array), FAQ (array), who-it's-for copy |
| `aboutPage` | long-form body (rich text), qualifications (array), portrait image, why-VIRRA copy |
| `legalPage` | title, slug, body (rich text) |
| `cycleCalculatorCopy` | phase-specific copy for the calculator: one entry per phase (Menstrual / Follicular / Ovulatory / Luteal), each with a pace-guidance line and a "why" sentence |

### Email — Resend
Free tier (100 emails/day). Sends from `hello@virra.app`.  
- Coaching auto-reply to applicant (VIRRA voice, plain HTML template)
- Coaching notification to Emma (full submission details)
- Contact page notification to Emma

### Newsletter — Beehiiv
`/api/subscribe` POSTs to Beehiiv Subscribe API with source tag per surface:
| Surface | Source tag |
|---|---|
| Footer | `footer` |
| Homepage hero | `hero` |
| Advice page | `advice` |
| Calculator save | `calculator` |

API key stored in Vercel env vars. Never exposed client-side.

### Coaching Form → Google Sheet
`/api/coaching-enquiry` uses Sheets API v4 with a service account (JSON credentials in Vercel env var `GOOGLE_SERVICE_ACCOUNT`). Emma owns the sheet and shares it with the service account email. Appends: Name, Email, Tier, Level, Goal, Start Month, Referral, Newsletter opt-in, Timestamp.

### Cookie consent
Lightweight vanilla JS banner (no library). Stores preference in `localStorage`. Reject-all available. No dark patterns. UK ICO compliant.

---

## Section 2 — Design System & Global Components

### CSS Tokens (`src/styles/global.css`)
Replaces current Cormorant/Outfit tokens entirely.

```css
--pulse:  #D4FF26;   /* lime — primary accent, 30% ratio */
--heat:   #FF2E7E;   /* hot pink — CTAs, italic i, Heat pillar, 10% ratio */
--mile:   #0A0A0F;   /* near-black — primary bg, 60% ratio */
--breath: #F4EDE0;   /* warm cream — primary text */
--dawn:   #FF6B3D;   /* coral — race-day moments only, sparingly */
--mist:   #1C1C24;   /* dark navy — card backgrounds */

--font-display:   'Big Shoulders Display', sans-serif;  /* weight 900, caps */
--font-editorial: 'Fraunces', serif;                    /* italic 400/800 */
--font-body:      'Inter', sans-serif;                  /* weight 300–600 */
--font-mono:      'Space Mono', monospace;              /* labels, data */
```

Default type ratio: 60% Mile / 30% Pulse / 10% Heat. Dawn used sparingly (race-day moments only).

### Components

**`Logo.astro`** — Inline SVG wordmark. V, R, R, A in Big Shoulders Display 900 (Pulse lime); `i` in Fraunces Italic 800 (Heat magenta). Single swappable component — final SVG drops in without code changes.

**`Header.astro`** — Sticky (`position: sticky; top: 0`), z-index above content. Nav: Home · About · Coaching · Advice · Pace Calculator. Subscribe pill CTA (Heat bg, Mile text) → scrolls to/opens Run Hot form. Mobile: hamburger, Subscribe pill stays visible. Entry animation on load.

**`Footer.astro`** — Two rows:
1. Run Hot signup: email input + submit → `/api/subscribe?source=footer`. Inline success/error.
2. Links row: Privacy · Terms · Cookies · Contact · @virrarun · © VIRRA {year}. All Space Mono, muted.

**`NewsletterForm.astro`** — Accepts `source: string` prop. Posts to `/api/subscribe`. Inline success/error state. Used on: footer, homepage hero, advice hero, advice mid-page, article end, calculator save-my-paces.

**`ArticleCard.astro`** — Hero image, category tag (Space Mono), title (Big Shoulders), dek (Inter), published date + read time. Used on Advice index and Homepage latest-posts block.

**`SectionLabel.astro`** — Space Mono kicker (e.g. `§01 — Context`). Used to introduce major page sections.

**`PullQuote.astro`** — Fraunces Italic, Heat left-border (`border-left: 4px solid var(--heat)`). Used in articles and About long-form.

**`BaseLayout.astro`** — Updated: new token imports, grain overlay (`body::before`), Google Fonts import for all four families, per-page `<title>` / `<meta description>` / OG tags from props.

---

## Section 3 — Pages

### 01. Homepage (`/`)

Sections (top → bottom):
1. **Hero** — Big Shoulders headline + Fraunces italic sub-line + `<NewsletterForm source="hero" />`
2. **Pillars** — Three cards (Pulse / Heat / Mile). Heat-bg on featured card, Mist on others. Copy from `homepageContent` Sanity type.
3. **Founder card** — Placeholder portrait (Sanity image field) + short bio + "About Emma →" link
4. **Latest from Run Hot** — Three most recent `article` docs from Sanity, rendered as `<ArticleCard />`
5. **Coaching teaser** — Short blurb from Sanity + CTA → `/coaching`
6. **Pace calculator teaser** — Illustrated card + CTA → `/pace-calculator`
7. **Newsletter block** — Full-width, Heat-led, `<NewsletterForm source="hero" />`
8. **Footer**

Must-haves: loads < 2s on 4G; all copy CMS-editable; latest articles auto-update on Sanity publish (Vercel webhook redeploy).

---

### 02. About (`/about`)

Sections:
1. Hero — placeholder portrait + Fraunces italic tagline (Sanity field)
2. Long-form founder story — Sanity rich text, `<PullQuote />` components embedded
3. Qualifications block — L2 Fitness Instructor, L3 PT (Origym), ongoing study. Sanity array.
4. "Why VIRRA" — her words, Sanity rich text
5. Press/podcast strip — placeholder slots (Sanity array, empty at launch)
6. Cross-CTAs — Coaching · Newsletter · @emmasrunlife

All body copy editable as Sanity rich text. Images Emma swaps herself via Studio.

---

### 03. Coaching (`/coaching`)

Sections:
1. Hero — "1:1 coaching with Emma" + Fraunces italic tagline
2. Who it's for — 4 bullets (Sanity array)
3. How it works — 3-step process (enquire → consult → start)
4. **Tier cards** — Three columns from Sanity `coachingPage.tiers` array:
   - Standard: £100/mo
   - Premium (featured): £150/mo
   - Nutrition Only: £50/mo
5. **Testimonials** — Grid of 3 cards from Sanity `coachingPage.testimonials`. Placeholder at launch.
6. **FAQ** — From Sanity `coachingPage.faq` array, rendered as expand/collapse accordion
7. **Enquiry form** — Fields: Full name*, Email*, Tier (Standard/Premium/Nutrition/Not sure)*, Current running level*, Goal (free text)*, Preferred start month, How they heard about VIRRA, Newsletter opt-in checkbox. Submits to `/api/coaching-enquiry`.

Form behaviour:
- Inline spam protection: honeypot field + rate limiting in serverless function
- On success: auto-reply email to applicant (Resend, VIRRA voice) + notification email to Emma + Sheet row
- Inline success message on submit

---

### 04. Advice (`/advice`)

Sections:
1. **Hero** — short proposition + `<NewsletterForm source="advice" />` (primary Run Hot signup surface)
2. **Featured article** — the article with `featured: true` in Sanity. Only one article should be featured at a time; Studio validation enforces this.
3. **Article grid** — all articles from Sanity, 12/page, filterable by category via `?cat=` query param. Categories: Training · Nutrition · Cycle & Hormones · Mindset · Race Day
4. **Client-side search** — over pre-fetched article title/dek metadata
5. **Mid-page newsletter block** — `<NewsletterForm source="advice" />`

**Article template (`/advice/[slug]`):**
- Hero image (full-width)
- Category tag · Published date · Est. read time
- Title (Big Shoulders) + dek (Fraunces italic)
- Author
- Body — Sanity rich text with `<PullQuote />` support
- Related articles (3, by same category)
- End-of-article `<NewsletterForm source="advice" />`
- Schema.org `Article` markup
- Per-article meta title, meta description, OG image from Sanity SEO fields

**RSS feed** at `/advice/rss.xml` — title, link, description, pubDate per article.

CMS requirement: Emma can publish a new article in < 10 minutes from Sanity Studio without developer involvement.

---

### 05. Pace Calculator (`/pace-calculator`)

Three tabs, URL hash `#pace` (default) · `#predictor` · `#cycle`. All client-side, zero backend calls.

**Tab 1 — Pace / Time / Distance**
Enter any 2 of: distance, time, pace → calculate the third. Metric/imperial toggle. Splits table (per km and per mile). All calculations in vanilla JS.

**Tab 2 — Race Time Predictor**
Inputs: recent race distance + finish time, target race distance. Formula: Riegel (`T2 = T1 × (D2/D1)^1.06`) primary; Cameron secondary. Output: predicted finish time + pace. Shows formula assumptions. 

**Tab 3 — Cycle-Aware Pace View**
Inputs: period start date + average cycle length. Output: current phase + pace guidance for each phase (Menstrual / Follicular / Ovulatory / Luteal). Phase "why" copy from Sanity `cycleCalculatorCopy` type (Emma-editable). Non-clinical disclaimer displayed. Placeholder copy at build time.

**Shared:**
- Shareable result links: state serialised to URL query string
- "Save my paces" → `<NewsletterForm source="calculator" />` inline below result
- SEO targets: "running pace calculator", "race time predictor", "cycle-aware pace calculator"
- Components designed to be embeddable in Advice articles

---

### Legal & Utility

**Shared `LegalLayout.astro`** — full-width, readable column, Big Shoulders page title, body from Sanity rich text.

Pages:
- `/privacy` — UK GDPR compliant. Covers Beehiiv, forms, cookie consent.
- `/terms` — General T&C. Emma supplies copy.
- `/cookies` — Cookie policy. Integrates with consent banner.
- `/contact` — Email link (`hello@virra.app`) + Instagram + simple message form → `/api/contact` → Emma's inbox.

All copy plug-in from Sanity `legalPage` type. Emma (or her solicitor) pastes final text into Studio.

---

## Section 4 — Non-negotiables (from brief §06)

1. **Felt, not seen** — Big type, flat colour, no gradients, no stock-photo running shoes.
2. **Female-first, never diet-culture** — No calorie shaming, no weight-loss framing. Including alt text and meta copy.
3. **Body as data** — Cycle, HR, hormones treated as performance variables.
4. **Speak like an adult** — No "crush it", "beast mode". Honest hooks only.
5. **Built for Emma to update** — If she can't change copy or publish an article without dev, it isn't done.
6. **Anticipate the app** — Components and routes hold when "Get the App" replaces "Subscribe" as primary CTA.

---

## Section 5 — Out of Scope

- App download / waitlist flows (route `/app` reserved, not built)
- User accounts, login, member-only content
- E-commerce or digital product sales
- Native app integrations (HealthKit, Strava, Garmin)
- Community features, comments, forums
- Multilingual support
- Analytics (Plausible/Fathom — deferred, added post-launch)

---

## Section 6 — Assets Required from Emma Before Launch

| Asset | Required by |
|---|---|
| Final logo SVG | Kickoff |
| Brand Guidelines Vol. 02 | Kickoff |
| Homepage + coaching copy | End of build week 1 |
| Founder portrait + running shots | End of build week 1 |
| About long-form copy | End of build week 1 |
| Enquiry destination email address | Build week 1 |
| Beehiiv API key + publication ID + source tag structure | Build week 1 |
| Google Sheet setup: Emma creates a blank Sheet, we supply the service account email address, she shares it (Editor access). We then need the Sheet ID from the URL. | Build week 1 |
| Testimonial quotes + permissions | Before coaching page launch |
| 3–5 launch-day advice articles | Before advice page launch |
| Cycle-phase "why" copy (calculator) | Before calculator launch |
| Final Privacy / Terms / Cookies copy | Before launch |
| DNS access for virra.app | Before go-live |

---

## Acceptance Criteria

- Lighthouse mobile ≥ 90 on every shipped page
- WCAG 2.2 AA confirmed (automated + manual)
- Run Hot signup form delivers real email to Beehiiv with correct source tag
- Coaching form sends real notification + auto-reply
- Pace calculator correct across 10 manual test cases (Emma to supply)
- Emma can publish a new advice article in < 10 minutes unassisted
- Brand audit pass: wordmark correct (italic `i`), no font substitutions, no gradients
