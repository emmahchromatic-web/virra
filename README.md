# VIRRA — Marketing Site (virra.app)

The public marketing site for VIRRA: holding/landing pages, the Advice hub, the 1:1 coaching page, and the pace calculator. Built with Astro, content-managed in Sanity, deployed on Vercel.

> This repo is the **marketing site only**. The VIRRA mobile app is a separate codebase and shares no code with this project.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | [Astro](https://astro.build) (`output: 'server'`) |
| CMS | [Sanity](https://www.sanity.io) (Studio at `/admin`) |
| Hosting | [Vercel](https://vercel.com) (`@astrojs/vercel` adapter) |
| Email | [Resend](https://resend.com) — coaching/contact notifications + auto-replies |
| Newsletter | [Beehiiv](https://www.beehiiv.com) — "Run Hot" signups |
| Enquiry log | Google Sheets (coaching enquiries) |
| Package manager | pnpm |

---

## Prerequisites

- Node.js **≥ 22.12.0**
- pnpm (`npm i -g pnpm`)

## Install & run locally

```bash
pnpm install
pnpm dev          # Astro dev server (http://localhost:4321)
pnpm sanity:dev   # Sanity Studio locally (optional)
```

Other scripts:

```bash
pnpm build          # production build
pnpm preview        # preview the production build
pnpm test           # run vitest
pnpm sanity:deploy  # deploy the Sanity Studio
```

---

## Environment variables

Create a `.env` in the repo root (never commit it). The site reads:

| Variable | Used by | Notes |
|---|---|---|
| `PUBLIC_SANITY_PROJECT_ID` | Sanity client | Project ref (`elebuieojodsjmghwjub`) |
| `PUBLIC_SANITY_DATASET` | Sanity client | Defaults to `production` |
| `SANITY_STUDIO_PROJECT_ID` | Sanity Studio | Same project ref |
| `RESEND_API_KEY` | `src/lib/email.ts` | Resend transactional email |
| `EMMA_EMAIL` | email lib | Destination for enquiry/contact notifications |
| `GOOGLE_SERVICE_ACCOUNT` | `src/lib/sheets.ts` | Service-account JSON (stringified) |
| `GOOGLE_SHEET_ID` | sheets lib | Coaching-enquiry log sheet |
| `BEEHIIV_API_KEY` | `src/pages/api/subscribe.ts` | Newsletter subscribe |
| `BEEHIIV_PUBLICATION_ID` | subscribe endpoint | Run Hot publication |

On Vercel, set these in **Project → Settings → Environment Variables** (or via `vercel env`).

---

## Deploy

- **Production:** pushes to `main` auto-deploy via Vercel. Manual: `vercel deploy --prod`.
- **Previews:** every PR / branch gets a Vercel preview URL automatically.
- Custom domain `virra.app` + auto HTTPS are configured in the Vercel project. `public/CNAME` and `public/robots.txt` (→ `sitemap-index.xml`) are committed.

---

## Content management (Sanity)

- Studio is served at **`/admin`** on the deployed site, and at `virra.sanity.studio`.
- Singleton documents (one each): **Homepage Content**, **Coaching Page**, **About Page**, **Cycle Calculator Copy**, **Site Settings** (footer copy).
- Repeatable: **Article** (Advice posts), **Legal Page** (Privacy / Terms / Cookies).

### Add an Advice article
Studio → **Article** → New. Fill title, slug, dek, category, hero image, body, SEO fields. It appears automatically on `/advice` and the RSS feed.

### Add / edit a legal page
Studio → **Legal Page**. Use slug `privacy`, `terms`, or `cookies` to populate the matching route. Set **Last updated** so the date renders at the top.

### Edit footer copy
Studio → **Site Settings** (newsletter caption, legal links, Instagram, copyright name). The footer falls back to sensible defaults if this doc is empty.

---

## Architecture

```
src/
  pages/            file-based routes
    api/            POST endpoints (server-rendered)
      subscribe.ts        → Beehiiv newsletter add (honeypot + validation)
      contact.ts          → emails Emma via Resend
      coaching-enquiry.ts → Emma notify + auto-reply + Google Sheet append
      advice/rss.xml.ts   → RSS feed from Sanity articles
  components/        Header, Footer, NewsletterForm, CookieBanner, Logo, ...
  layouts/           BaseLayout (head/SEO), LegalLayout
  lib/               sanity client, queries, email, sheets, calculator
  styles/global.css  brand tokens (see below)
sanity/schemas/      CMS document/field definitions
```

### Brand tokens
Defined as CSS custom properties in `src/styles/global.css`:

```
--pulse #D4FF26  (lime, primary accent)   --breath #F4EDE0 (cream, text)
--heat  #FF2E7E  (hot pink, CTAs)         --mist   #1C1C24 (card bg)
--mile  #0A0A0F  (near-black, bg)         --dawn   #FF6B3D (warnings)
```

Fonts (loaded non-blocking in `BaseLayout`): Big Shoulders Display (display), Fraunces (editorial italic), Inter (body), Space Mono (metadata/labels).

---

## Third-party services / access

| Service | Purpose | Owner |
|---|---|---|
| Vercel | Hosting, CI, preview deploys | Paul / Emma |
| Sanity | CMS (`elebuieojodsjmghwjub`) | — |
| Resend | Transactional email | — |
| Beehiiv | Run Hot newsletter | Emma |
| Google Sheets | Coaching enquiry log | — |

---

## Known gaps / backlog

Tracked on the [Trello board](https://trello.com/b/M7tjcDl3/virraapp). Notable open items:

- No analytics / conversion tracking installed yet (pending tool decision).
- Header "Subscribe" CTA anchors to the footer signup; a dedicated modal is specced but not built.
- Homepage "Latest from Run Hot" currently pulls Sanity articles, not live Beehiiv posts (pending cross-post decision).
- "Save my paces" adds to Beehiiv but does not yet email the calculated results.
- No shared UI-primitive library / Storybook; component styles are largely per-page.
- Accessibility (WCAG 2.2 AA) and performance (Lighthouse ≥ 90) passes not yet formally completed.
