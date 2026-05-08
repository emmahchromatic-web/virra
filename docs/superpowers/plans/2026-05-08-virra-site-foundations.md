# VIRRA Site — Plan 1: Foundations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate virra.app to Astro hybrid mode on Vercel, install the Vol.02 design system, wire up Sanity CMS schemas, create all three API endpoints, and build the global shell components (Header, Footer, Logo, NewsletterForm, ArticleCard, SectionLabel, PullQuote, LegalLayout).

**Architecture:** Astro 6 with `output: 'hybrid'` and `@astrojs/vercel` adapter. All pages statically prerendered; three serverless API endpoints handle newsletter (Beehiiv), coaching enquiry (Resend + Google Sheets), and contact (Resend). Sanity v3 is the CMS — Studio hosted at `virra.sanity.studio`, data fetched in Astro via `@sanity/client`.

**Tech Stack:** Astro 6, Vercel, Sanity v3, `@sanity/client`, Resend, `googleapis`, pnpm, Vitest (for Plan 3 calculator tests).

---

## File map

| Action | Path |
|---|---|
| Modify | `astro.config.mjs` |
| Modify | `package.json` |
| Create | `.env.example` |
| Rebuild | `src/styles/global.css` |
| Modify | `src/layouts/BaseLayout.astro` |
| Create | `sanity.config.ts` |
| Create | `sanity/schemas/index.ts` |
| Create | `sanity/schemas/article.ts` |
| Create | `sanity/schemas/homepageContent.ts` |
| Create | `sanity/schemas/coachingPage.ts` |
| Create | `sanity/schemas/aboutPage.ts` |
| Create | `sanity/schemas/legalPage.ts` |
| Create | `sanity/schemas/cycleCalculatorCopy.ts` |
| Create | `src/lib/sanity.ts` |
| Create | `src/lib/queries.ts` |
| Create | `src/lib/email.ts` |
| Create | `src/lib/sheets.ts` |
| Create | `src/pages/api/subscribe.ts` |
| Create | `src/pages/api/coaching-enquiry.ts` |
| Create | `src/pages/api/contact.ts` |
| Create | `src/components/Logo.astro` |
| Create | `src/components/NewsletterForm.astro` |
| Create | `src/components/SectionLabel.astro` |
| Create | `src/components/PullQuote.astro` |
| Create | `src/components/ArticleCard.astro` |
| Create | `src/layouts/LegalLayout.astro` |
| Rebuild | `src/components/Header.astro` |
| Rebuild | `src/components/Footer.astro` |
| Delete | `src/components/BlogCard.astro` |
| Delete | `src/components/CtaBanner.astro` |
| Delete | `src/layouts/BlogPostLayout.astro` |
| Delete | `src/content.config.ts` |
| Delete | `src/content/` (whole directory) |
| Delete | `src/pages/blog/` (whole directory) |

---

## Task 1: Prerequisites — accounts, credentials, env vars

Before writing code, gather all credentials and create external accounts.

- [ ] **Step 1: Create a Sanity project**

  Go to https://www.sanity.io/ → New project → name it "VIRRA" → dataset `production`. Note the **Project ID** (e.g. `abc123xy`).

- [ ] **Step 2: Create a Resend account + verify domain**

  Go to https://resend.com → create account → add domain `virra.app` → follow DNS verification. Create an API key. Note the key.

- [ ] **Step 3: Create a Google Cloud service account**

  1. Go to https://console.cloud.google.com → create project "VIRRA Website"
  2. Enable Google Sheets API
  3. Create a Service Account (IAM & Admin → Service Accounts → Create)
  4. Create a JSON key for the service account → download the file
  5. Note the service account email (looks like `virra@virra-website.iam.gserviceaccount.com`)
  6. Create a new Google Sheet owned by Emma → share it with the service account email (Editor)
  7. Note the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

- [ ] **Step 4: Create `.env.example` and `.env` at the repo root**

  `.env.example`:
  ```
  PUBLIC_SANITY_PROJECT_ID=your_sanity_project_id
  PUBLIC_SANITY_DATASET=production
  BEEHIIV_API_KEY=your_beehiiv_api_key
  BEEHIIV_PUBLICATION_ID=your_beehiiv_publication_id
  RESEND_API_KEY=your_resend_api_key
  EMMA_EMAIL=emma@virra.app
  GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
  GOOGLE_SHEET_ID=your_google_sheet_id
  SANITY_STUDIO_PROJECT_ID=your_sanity_project_id
  ```

  Create `.env` with real values. Confirm `.env` is in `.gitignore`.

- [ ] **Step 5: Commit**

  ```bash
  git add .env.example .gitignore
  git commit -m "chore: add .env.example with all required vars"
  ```

---

## Task 2: Install dependencies + configure Astro hybrid mode

- [ ] **Step 1: Install packages**

  ```bash
  pnpm add @astrojs/vercel @sanity/client @sanity/image-url resend googleapis
  pnpm add -D sanity vitest typescript @types/node
  ```

- [ ] **Step 2: Replace `astro.config.mjs`**

  ```javascript
  import { defineConfig } from 'astro/config';
  import sitemap from '@astrojs/sitemap';
  import vercel from '@astrojs/vercel';

  export default defineConfig({
    output: 'hybrid',
    adapter: vercel(),
    site: 'https://virra.app',
    integrations: [sitemap()],
  });
  ```

- [ ] **Step 3: Add test script to `package.json`**

  Add inside `"scripts"`:
  ```json
  "test": "vitest run",
  "test:watch": "vitest",
  "sanity:dev": "sanity dev",
  "sanity:deploy": "sanity deploy"
  ```

- [ ] **Step 4: Verify build succeeds**

  ```bash
  pnpm build
  ```
  Expected: build completes with no errors. You will see Vercel adapter output.

- [ ] **Step 5: Commit**

  ```bash
  git add astro.config.mjs package.json pnpm-lock.yaml
  git commit -m "chore: add Vercel adapter, hybrid mode, Sanity + Resend deps"
  ```

---

## Task 3: Rebuild global CSS with Vol.02 design tokens

- [ ] **Step 1: Replace `src/styles/global.css` entirely**

  ```css
  @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;900&family=Fraunces:ital,opsz,wght@1,9..144,400;1,9..144,800&family=Inter:wght@300;400;500;600&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

  :root {
    --pulse:     #D4FF26;
    --heat:      #FF2E7E;
    --mile:      #0A0A0F;
    --breath:    #F4EDE0;
    --dawn:      #FF6B3D;
    --mist:      #1C1C24;
    --muted:     rgba(244,237,224,0.5);
    --border:    rgba(244,237,224,0.10);
    --border-strong: rgba(244,237,224,0.20);

    --font-display:   'Big Shoulders Display', sans-serif;
    --font-editorial: 'Fraunces', serif;
    --font-body:      'Inter', sans-serif;
    --font-mono:      'Space Mono', monospace;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; scroll-behavior: smooth; }

  body {
    background: var(--mile);
    color: var(--breath);
    font-family: var(--font-body);
    font-weight: 300;
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* Grain overlay */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.04;
    pointer-events: none;
    z-index: 999;
  }

  /* Prose — used inside .prose wrapper */
  .prose h2 {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    color: var(--breath);
    margin: 2.5rem 0 1rem;
    line-height: 0.9;
  }
  .prose h3 {
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 3vw, 2rem);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: -0.015em;
    color: var(--breath);
    margin: 2rem 0 0.75rem;
    line-height: 0.95;
  }
  .prose p { font-size: 1.05rem; line-height: 1.82; color: rgba(244,237,224,0.75); margin-bottom: 1.5rem; }
  .prose a { color: var(--pulse); text-decoration: underline; text-underline-offset: 3px; }
  .prose strong { color: var(--breath); font-weight: 600; }
  .prose em { font-family: var(--font-editorial); font-style: italic; color: var(--heat); }
  .prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.5rem; }
  .prose li { font-size: 1.05rem; line-height: 1.8; color: rgba(244,237,224,0.75); margin-bottom: 0.5rem; }
  .prose blockquote {
    border-left: 4px solid var(--heat);
    padding-left: 1.5rem;
    margin: 2rem 0;
    font-family: var(--font-editorial);
    font-style: italic;
    font-size: 1.5rem;
    font-weight: 400;
    color: var(--breath);
    line-height: 1.4;
  }
  .prose img { width: 100%; border-radius: 2px; margin: 2rem 0; }
  .prose hr { border: none; border-top: 1px solid var(--border); margin: 2.5rem 0; }
  ```

- [ ] **Step 2: Verify fonts load**

  ```bash
  pnpm dev
  ```
  Open http://localhost:4321. Confirm the page has not crashed. (The homepage will look broken until Task 5 rebuilds it — that is expected.)

- [ ] **Step 3: Commit**

  ```bash
  git add src/styles/global.css
  git commit -m "feat: rebuild global CSS with Vol.02 design tokens and typography"
  ```

---

## Task 4: Update BaseLayout.astro

- [ ] **Step 1: Replace `src/layouts/BaseLayout.astro`**

  ```astro
  ---
  interface Props {
    title: string;
    description?: string;
    ogImage?: string;
    ogType?: 'website' | 'article';
  }
  const {
    title,
    description = 'Female-first running. Cycle-aware training, nutrition and performance — all in one place.',
    ogImage = '/og-default.png',
    ogType = 'website',
  } = Astro.props;
  const canonicalURL = new URL(Astro.url.pathname, Astro.site);
  ---
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="sitemap" href="/sitemap-index.xml" />
    <link rel="canonical" href={canonicalURL} />

    <title>{title}</title>
    <meta name="description" content={description} />

    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={new URL(ogImage, Astro.site)} />
    <meta property="og:url" content={canonicalURL} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={new URL(ogImage, Astro.site)} />
  </head>
  <body>
    <slot />
  </body>
  </html>
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/layouts/BaseLayout.astro
  git commit -m "feat: update BaseLayout with OG meta, canonical URL, Vol.02 font imports removed (now in global.css)"
  ```

---

## Task 5: Sanity Studio config + schema skeleton

- [ ] **Step 1: Create `sanity.config.ts` at repo root**

  ```typescript
  import { defineConfig } from 'sanity';
  import { structureTool } from 'sanity/plugins/structure';
  import { schemaTypes } from './sanity/schemas';

  export default defineConfig({
    name: 'virra',
    title: 'VIRRA',
    projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
    dataset: 'production',
    plugins: [structureTool()],
    schema: { types: schemaTypes },
  });
  ```

- [ ] **Step 2: Create `sanity/schemas/index.ts`**

  ```typescript
  import { article } from './article';
  import { homepageContent } from './homepageContent';
  import { coachingPage } from './coachingPage';
  import { aboutPage } from './aboutPage';
  import { legalPage } from './legalPage';
  import { cycleCalculatorCopy } from './cycleCalculatorCopy';

  export const schemaTypes = [
    article,
    homepageContent,
    coachingPage,
    aboutPage,
    legalPage,
    cycleCalculatorCopy,
  ];
  ```

- [ ] **Step 3: Create `sanity/schemas/article.ts`**

  ```typescript
  import { defineType, defineField } from 'sanity';

  export const article = defineType({
    name: 'article',
    title: 'Article',
    type: 'document',
    fields: [
      defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
      defineField({
        name: 'slug',
        type: 'slug',
        options: { source: 'title' },
        validation: (r) => r.required(),
      }),
      defineField({ name: 'featured', type: 'boolean', initialValue: false,
        description: 'Only one article should be featured at a time.' }),
      defineField({ name: 'heroImage', type: 'image', options: { hotspot: true } }),
      defineField({ name: 'dek', type: 'text', rows: 2,
        description: 'Short sub-headline shown on article cards.' }),
      defineField({
        name: 'category',
        type: 'string',
        options: {
          list: ['Training', 'Nutrition', 'Cycle & Hormones', 'Mindset', 'Race Day'],
          layout: 'radio',
        },
        validation: (r) => r.required(),
      }),
      defineField({ name: 'author', type: 'string', initialValue: 'Emma' }),
      defineField({ name: 'publishedDate', type: 'date', validation: (r) => r.required() }),
      defineField({
        name: 'body',
        type: 'array',
        of: [
          { type: 'block' },
          { type: 'image', options: { hotspot: true } },
        ],
      }),
      defineField({ name: 'seoTitle', type: 'string',
        description: 'Overrides title for search engines. Max 60 chars.' }),
      defineField({ name: 'seoDescription', type: 'text', rows: 2,
        description: 'Meta description. Max 155 chars.' }),
      defineField({ name: 'ogImage', type: 'image',
        description: 'Social share image. 1200×630px recommended.' }),
    ],
    preview: {
      select: { title: 'title', media: 'heroImage', subtitle: 'category' },
    },
  });
  ```

- [ ] **Step 4: Create `sanity/schemas/homepageContent.ts`**

  ```typescript
  import { defineType, defineField } from 'sanity';

  export const homepageContent = defineType({
    name: 'homepageContent',
    title: 'Homepage Content',
    type: 'document',
    fields: [
      defineField({ name: 'heroHeadline', type: 'string', validation: (r) => r.required() }),
      defineField({ name: 'heroSubline', type: 'string',
        description: 'Fraunces italic sub-line beneath the headline.' }),
      defineField({
        name: 'pillars',
        type: 'array',
        of: [{
          type: 'object',
          fields: [
            { name: 'name', type: 'string' },
            { name: 'body', type: 'text', rows: 3 },
            { name: 'accentColor', type: 'string',
              description: 'CSS var name, e.g. var(--pulse)' },
          ],
        }],
        description: 'Exactly 3 pillar cards: Pulse, Heat, Mile.',
      }),
      defineField({ name: 'founderName', type: 'string' }),
      defineField({ name: 'founderBio', type: 'text', rows: 4 }),
      defineField({ name: 'founderPortrait', type: 'image', options: { hotspot: true } }),
      defineField({ name: 'coachingTeaser', type: 'text', rows: 3 }),
      defineField({ name: 'calculatorTeaser', type: 'text', rows: 3 }),
      defineField({ name: 'newsletterHeadline', type: 'string' }),
      defineField({ name: 'newsletterSubline', type: 'string' }),
    ],
    preview: { prepare: () => ({ title: 'Homepage Content' }) },
  });
  ```

- [ ] **Step 5: Create `sanity/schemas/coachingPage.ts`**

  ```typescript
  import { defineType, defineField } from 'sanity';

  export const coachingPage = defineType({
    name: 'coachingPage',
    title: 'Coaching Page',
    type: 'document',
    fields: [
      defineField({ name: 'heroTagline', type: 'string' }),
      defineField({
        name: 'whoItsFor',
        type: 'array',
        of: [{ type: 'string' }],
        description: '4 bullets describing who coaching is for.',
      }),
      defineField({
        name: 'tiers',
        type: 'array',
        of: [{
          type: 'object',
          fields: [
            { name: 'tag', type: 'string', description: 'e.g. Standard, Premium · Recommended' },
            { name: 'price', type: 'number', description: 'Monthly price in GBP' },
            { name: 'description', type: 'text', rows: 2 },
            { name: 'features', type: 'array', of: [{ type: 'string' }] },
            { name: 'featured', type: 'boolean', initialValue: false },
          ],
        }],
      }),
      defineField({
        name: 'testimonials',
        type: 'array',
        of: [{
          type: 'object',
          fields: [
            { name: 'quote', type: 'text', rows: 3 },
            { name: 'name', type: 'string' },
            { name: 'photo', type: 'image', options: { hotspot: true } },
          ],
        }],
      }),
      defineField({
        name: 'faq',
        type: 'array',
        of: [{
          type: 'object',
          fields: [
            { name: 'question', type: 'string' },
            { name: 'answer', type: 'text', rows: 3 },
          ],
        }],
      }),
    ],
    preview: { prepare: () => ({ title: 'Coaching Page' }) },
  });
  ```

- [ ] **Step 6: Create `sanity/schemas/aboutPage.ts`**

  ```typescript
  import { defineType, defineField } from 'sanity';

  export const aboutPage = defineType({
    name: 'aboutPage',
    title: 'About Page',
    type: 'document',
    fields: [
      defineField({ name: 'heroTagline', type: 'string' }),
      defineField({ name: 'portrait', type: 'image', options: { hotspot: true } }),
      defineField({
        name: 'founderStory',
        type: 'array',
        of: [{ type: 'block' }, { type: 'image', options: { hotspot: true } }],
        description: 'Long-form founder story. Use pull-quote blocks where appropriate.',
      }),
      defineField({
        name: 'qualifications',
        type: 'array',
        of: [{ type: 'string' }],
        description: 'e.g. "L2 Fitness Instructor", "L3 PT (Origym)"',
      }),
      defineField({
        name: 'whyVirra',
        type: 'array',
        of: [{ type: 'block' }],
      }),
      defineField({
        name: 'pressItems',
        type: 'array',
        of: [{
          type: 'object',
          fields: [
            { name: 'outlet', type: 'string' },
            { name: 'url', type: 'url' },
          ],
        }],
        description: 'Press / podcast mentions. Displayed as a strip. Leave empty at launch.',
      }),
    ],
    preview: { prepare: () => ({ title: 'About Page' }) },
  });
  ```

- [ ] **Step 7: Create `sanity/schemas/legalPage.ts`**

  ```typescript
  import { defineType, defineField } from 'sanity';

  export const legalPage = defineType({
    name: 'legalPage',
    title: 'Legal Page',
    type: 'document',
    fields: [
      defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
      defineField({
        name: 'slug',
        type: 'slug',
        options: { source: 'title' },
        validation: (r) => r.required(),
      }),
      defineField({ name: 'body', type: 'array', of: [{ type: 'block' }] }),
    ],
    preview: { select: { title: 'title' } },
  });
  ```

- [ ] **Step 8: Create `sanity/schemas/cycleCalculatorCopy.ts`**

  ```typescript
  import { defineType, defineField } from 'sanity';

  const PHASES = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'] as const;

  export const cycleCalculatorCopy = defineType({
    name: 'cycleCalculatorCopy',
    title: 'Cycle Calculator Copy',
    type: 'document',
    fields: PHASES.map((phase) =>
      defineField({
        name: phase.toLowerCase(),
        title: phase,
        type: 'object',
        fields: [
          {
            name: 'guidance',
            type: 'string',
            title: 'Pace guidance',
            description: 'e.g. "Reduce pace by 10–15% — energy is lower, but consistency matters."',
          },
          {
            name: 'why',
            type: 'string',
            title: 'Why (one sentence)',
            description: 'Brief physiological reason. Non-clinical.',
          },
        ],
      })
    ),
    preview: { prepare: () => ({ title: 'Cycle Calculator Copy' }) },
  });
  ```

- [ ] **Step 9: Launch Sanity Studio locally to confirm schemas load**

  ```bash
  pnpm sanity:dev
  ```
  Expected: Studio opens at http://localhost:3333. You should see all 6 document types in the sidebar (Article, Homepage Content, Coaching Page, About Page, Legal Page, Cycle Calculator Copy).

- [ ] **Step 10: Add seed content in Studio**

  Create one document of each singleton type (Homepage Content, Coaching Page, About Page, Cycle Calculator Copy) with placeholder text so pages don't crash during development. Create one Article as a test. Publish all.

- [ ] **Step 11: Deploy Studio to Sanity hosting**

  ```bash
  pnpm sanity:deploy
  ```
  Expected: Studio live at `virra.sanity.studio`.

- [ ] **Step 12: Commit**

  ```bash
  git add sanity.config.ts sanity/
  git commit -m "feat: add Sanity Studio config and all 6 schema types"
  ```

---

## Task 6: Sanity client + GROQ queries

- [ ] **Step 1: Create `src/lib/sanity.ts`**

  ```typescript
  import { createClient } from '@sanity/client';
  import imageUrlBuilder from '@sanity/image-url';
  import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

  export const client = createClient({
    projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID,
    dataset: import.meta.env.PUBLIC_SANITY_DATASET ?? 'production',
    apiVersion: '2026-05-08',
    useCdn: true,
  });

  const builder = imageUrlBuilder(client);

  export function urlFor(source: SanityImageSource) {
    return builder.image(source);
  }
  ```

- [ ] **Step 2: Create `src/lib/queries.ts`**

  ```typescript
  export const HOMEPAGE_QUERY = `*[_type == "homepageContent"][0]{
    heroHeadline,
    heroSubline,
    pillars,
    founderName,
    founderBio,
    founderPortrait,
    coachingTeaser,
    calculatorTeaser,
    newsletterHeadline,
    newsletterSubline
  }`;

  export const LATEST_ARTICLES_QUERY = `*[_type == "article"] | order(publishedDate desc) [0..2] {
    title,
    slug,
    dek,
    category,
    publishedDate,
    heroImage
  }`;

  export const FEATURED_ARTICLE_QUERY = `*[_type == "article" && featured == true][0] {
    title,
    slug,
    dek,
    category,
    publishedDate,
    heroImage
  }`;

  export const ALL_ARTICLES_QUERY = `*[_type == "article"] | order(publishedDate desc) {
    title,
    slug,
    dek,
    category,
    publishedDate,
    heroImage
  }`;

  export const ARTICLE_SLUGS_QUERY = `*[_type == "article"]{ "slug": slug.current }`;

  export const ARTICLE_BY_SLUG_QUERY = `*[_type == "article" && slug.current == $slug][0]{
    title,
    slug,
    dek,
    category,
    author,
    publishedDate,
    heroImage,
    body,
    seoTitle,
    seoDescription,
    ogImage
  }`;

  export const RELATED_ARTICLES_QUERY = `*[_type == "article" && category == $category && slug.current != $slug] | order(publishedDate desc) [0..2] {
    title,
    slug,
    dek,
    category,
    publishedDate,
    heroImage
  }`;

  export const COACHING_QUERY = `*[_type == "coachingPage"][0]{
    heroTagline,
    whoItsFor,
    tiers,
    testimonials,
    faq
  }`;

  export const ABOUT_QUERY = `*[_type == "aboutPage"][0]{
    heroTagline,
    portrait,
    founderStory,
    qualifications,
    whyVirra,
    pressItems
  }`;

  export const LEGAL_BY_SLUG_QUERY = `*[_type == "legalPage" && slug.current == $slug][0]{
    title,
    slug,
    body
  }`;

  export const CYCLE_CALCULATOR_COPY_QUERY = `*[_type == "cycleCalculatorCopy"][0]{
    menstrual,
    follicular,
    ovulatory,
    luteal
  }`;

  export const ALL_ARTICLES_FOR_RSS_QUERY = `*[_type == "article"] | order(publishedDate desc) {
    title,
    "slug": slug.current,
    dek,
    publishedDate
  }`;
  ```

- [ ] **Step 3: Verify the client can fetch data**

  Create a temporary file `src/pages/sanity-test.astro`:
  ```astro
  ---
  import { client } from '../lib/sanity';
  import { HOMEPAGE_QUERY } from '../lib/queries';
  const data = await client.fetch(HOMEPAGE_QUERY);
  ---
  <pre>{JSON.stringify(data, null, 2)}</pre>
  ```

  Run `pnpm dev` and visit http://localhost:4321/sanity-test. Expected: JSON output of homepage content from Sanity.

- [ ] **Step 4: Delete the test page**

  ```bash
  rm src/pages/sanity-test.astro
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/sanity.ts src/lib/queries.ts
  git commit -m "feat: add Sanity client and GROQ query library"
  ```

---

## Task 7: API route — newsletter subscribe

- [ ] **Step 1: Create `src/pages/api/subscribe.ts`**

  ```typescript
  export const prerender = false;

  import type { APIRoute } from 'astro';

  export const POST: APIRoute = async ({ request }) => {
    const { email, source } = await request.json() as { email: string; source: string };

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
    }

    const validSources = ['footer', 'hero', 'advice', 'calculator'];
    const safeSource = validSources.includes(source) ? source : 'website';

    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${import.meta.env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: true,
          utm_source: safeSource,
          utm_medium: 'website',
          utm_campaign: 'run-hot',
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error('Beehiiv error', res.status, body);
      return new Response(JSON.stringify({ error: 'Subscription failed' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  ```

- [ ] **Step 2: Test with curl**

  ```bash
  pnpm dev
  # In a second terminal:
  curl -X POST http://localhost:4321/api/subscribe \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","source":"hero"}'
  ```
  Expected: `{"success":true}` and the email appears as a subscriber in the Beehiiv dashboard.

- [ ] **Step 3: Test invalid email**

  ```bash
  curl -X POST http://localhost:4321/api/subscribe \
    -H "Content-Type: application/json" \
    -d '{"email":"notanemail","source":"footer"}'
  ```
  Expected: `{"error":"Invalid email"}` with status 400.

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/api/subscribe.ts
  git commit -m "feat: add /api/subscribe endpoint wired to Beehiiv"
  ```

---

## Task 8: Email + Google Sheets helpers

- [ ] **Step 1: Create `src/lib/email.ts`**

  ```typescript
  import { Resend } from 'resend';

  const resend = new Resend(import.meta.env.RESEND_API_KEY);

  export async function sendCoachingNotification(fields: {
    name: string;
    email: string;
    tier: string;
    level: string;
    goal: string;
    startMonth: string;
    referral: string;
    newsletter: boolean;
  }) {
    await resend.emails.send({
      from: 'VIRRA <hello@virra.app>',
      to: [import.meta.env.EMMA_EMAIL],
      subject: `New coaching enquiry — ${fields.tier} — ${fields.name}`,
      html: `
        <h2>New coaching enquiry</h2>
        <table>
          <tr><td><b>Name</b></td><td>${fields.name}</td></tr>
          <tr><td><b>Email</b></td><td>${fields.email}</td></tr>
          <tr><td><b>Tier</b></td><td>${fields.tier}</td></tr>
          <tr><td><b>Level</b></td><td>${fields.level}</td></tr>
          <tr><td><b>Goal</b></td><td>${fields.goal}</td></tr>
          <tr><td><b>Start month</b></td><td>${fields.startMonth || '—'}</td></tr>
          <tr><td><b>Referral</b></td><td>${fields.referral || '—'}</td></tr>
          <tr><td><b>Newsletter</b></td><td>${fields.newsletter ? 'Yes' : 'No'}</td></tr>
        </table>
      `,
    });
  }

  export async function sendCoachingAutoReply(name: string, toEmail: string) {
    await resend.emails.send({
      from: 'Emma at VIRRA <hello@virra.app>',
      to: [toEmail],
      subject: "Got it — I'll be in touch soon.",
      html: `
        <p>Hi ${name},</p>
        <p>Thanks for reaching out. I've received your enquiry and I'll come back to you within 48 hours with everything you need to know.</p>
        <p>In the meantime, if you haven't already — <a href="https://virra.app/advice">read the advice section</a>. There's a lot in there that might be useful while you wait.</p>
        <p>Emma<br>VIRRA</p>
      `,
    });
  }

  export async function sendContactNotification(fields: {
    name: string;
    email: string;
    message: string;
  }) {
    await resend.emails.send({
      from: 'VIRRA <hello@virra.app>',
      to: [import.meta.env.EMMA_EMAIL],
      subject: `Contact form — ${fields.name}`,
      html: `
        <p><b>From:</b> ${fields.name} (${fields.email})</p>
        <p><b>Message:</b></p>
        <p>${fields.message.replace(/\n/g, '<br>')}</p>
      `,
    });
  }
  ```

- [ ] **Step 2: Create `src/lib/sheets.ts`**

  ```typescript
  import { google } from 'googleapis';

  export async function appendCoachingEnquiry(fields: {
    name: string;
    email: string;
    tier: string;
    level: string;
    goal: string;
    startMonth: string;
    referral: string;
    newsletter: boolean;
  }) {
    const credentials = JSON.parse(import.meta.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: import.meta.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          fields.name,
          fields.email,
          fields.tier,
          fields.level,
          fields.goal,
          fields.startMonth || '',
          fields.referral || '',
          fields.newsletter ? 'Yes' : 'No',
          new Date().toISOString(),
        ]],
      },
    });
  }
  ```

- [ ] **Step 3: Add headers to the Google Sheet**

  Open Emma's Google Sheet manually and add these headers in row 1:
  `Name | Email | Tier | Level | Goal | Start Month | Referral | Newsletter | Timestamp`

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/email.ts src/lib/sheets.ts
  git commit -m "feat: add Resend email helpers and Google Sheets append helper"
  ```

---

## Task 9: API route — coaching enquiry

- [ ] **Step 1: Create `src/pages/api/coaching-enquiry.ts`**

  ```typescript
  export const prerender = false;

  import type { APIRoute } from 'astro';
  import { sendCoachingNotification, sendCoachingAutoReply } from '../../lib/email';
  import { appendCoachingEnquiry } from '../../lib/sheets';

  export const POST: APIRoute = async ({ request }) => {
    const body = await request.json() as {
      name: string;
      email: string;
      tier: string;
      level: string;
      goal: string;
      startMonth?: string;
      referral?: string;
      newsletter?: boolean;
      _hp?: string;
    };

    // Honeypot spam check
    if (body._hp) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    if (!body.name || !body.email || !body.tier || !body.level || !body.goal) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const fields = {
      name: body.name.trim(),
      email: body.email.trim(),
      tier: body.tier,
      level: body.level,
      goal: body.goal.trim(),
      startMonth: body.startMonth ?? '',
      referral: body.referral ?? '',
      newsletter: body.newsletter ?? false,
    };

    await Promise.all([
      sendCoachingNotification(fields),
      sendCoachingAutoReply(fields.name, fields.email),
      appendCoachingEnquiry(fields),
    ]);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  ```

- [ ] **Step 2: Test with curl**

  ```bash
  curl -X POST http://localhost:4321/api/coaching-enquiry \
    -H "Content-Type: application/json" \
    -d '{"name":"Test User","email":"test@example.com","tier":"Premium","level":"Recreational","goal":"Run a half marathon"}'
  ```
  Expected: `{"success":true}`. Emma's inbox receives a notification, test@example.com receives an auto-reply, and a row appears in the Google Sheet.

- [ ] **Step 3: Test honeypot**

  ```bash
  curl -X POST http://localhost:4321/api/coaching-enquiry \
    -H "Content-Type: application/json" \
    -d '{"name":"Bot","email":"bot@spam.com","tier":"Standard","level":"Beginner","goal":"Spam","_hp":"triggered"}'
  ```
  Expected: `{"success":true}` with no emails sent and no Sheet row.

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/api/coaching-enquiry.ts
  git commit -m "feat: add /api/coaching-enquiry with email, auto-reply, and Sheet logging"
  ```

---

## Task 10: API route — contact form

- [ ] **Step 1: Create `src/pages/api/contact.ts`**

  ```typescript
  export const prerender = false;

  import type { APIRoute } from 'astro';
  import { sendContactNotification } from '../../lib/email';

  export const POST: APIRoute = async ({ request }) => {
    const body = await request.json() as {
      name: string;
      email: string;
      message: string;
      _hp?: string;
    };

    if (body._hp) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    if (!body.name || !body.email || !body.message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    await sendContactNotification({
      name: body.name.trim(),
      email: body.email.trim(),
      message: body.message.trim(),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  ```

- [ ] **Step 2: Test with curl**

  ```bash
  curl -X POST http://localhost:4321/api/contact \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"test@example.com","message":"Hello from the contact form"}'
  ```
  Expected: `{"success":true}`, Emma receives the email.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/api/contact.ts
  git commit -m "feat: add /api/contact endpoint"
  ```

---

## Task 11: Logo component

- [ ] **Step 1: Create `src/components/Logo.astro`**

  ```astro
  ---
  interface Props {
    class?: string;
  }
  const { class: className = '' } = Astro.props;
  ---
  <a href="/" class:list={['logo', className]} aria-label="VIRRA home">
    <span class="v">V</span><span class="i">i</span><span class="rra">RRA</span>
  </a>

  <style>
    .logo {
      font-family: var(--font-display);
      font-weight: 900;
      font-size: 1.6rem;
      letter-spacing: -0.03em;
      text-transform: uppercase;
      color: var(--pulse);
      text-decoration: none;
      line-height: 1;
      display: inline-block;
    }
    .i {
      font-family: var(--font-editorial);
      font-style: italic;
      font-weight: 800;
      color: var(--heat);
      text-transform: none;
    }
  </style>
  ```

- [ ] **Step 2: Verify**

  In `pnpm dev`, add `<Logo />` to a test page and confirm V and A are Pulse lime, the italic *i* is Heat magenta, RRA is Pulse lime.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/Logo.astro
  git commit -m "feat: add Logo component with Vol.02 wordmark (italic i in Heat)"
  ```

---

## Task 12: NewsletterForm component

- [ ] **Step 1: Create `src/components/NewsletterForm.astro`**

  ```astro
  ---
  interface Props {
    source: 'footer' | 'hero' | 'advice' | 'calculator';
    label?: string;
  }
  const { source, label = 'Run Hot — sent to The Pack.' } = Astro.props;
  const formId = `nl-${source}`;
  ---
  <div class="nl-wrap" data-source={source}>
    <p class="nl-label">{label}</p>
    <form class="nl-form" id={formId} novalidate>
      <input
        type="email"
        name="email"
        placeholder="your@email.com"
        autocomplete="email"
        required
        aria-label="Email address"
      />
      <button type="submit">Subscribe</button>
      <input type="text" name="_hp" style="display:none" tabindex="-1" autocomplete="off" />
    </form>
    <p class="nl-ok" id={`${formId}-ok`} hidden>You're in — welcome to The Pack.</p>
    <p class="nl-err" id={`${formId}-err`} hidden>Something went wrong. Try again.</p>
    <p class="nl-note">No spam, ever. Unsubscribe anytime.</p>
  </div>

  <script>
    document.querySelectorAll<HTMLDivElement>('.nl-wrap').forEach((wrap) => {
      const source = wrap.dataset.source!;
      const form = wrap.querySelector<HTMLFormElement>('.nl-form')!;
      const ok = wrap.querySelector<HTMLParagraphElement>('.nl-ok')!;
      const err = wrap.querySelector<HTMLParagraphElement>('.nl-err')!;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (form.elements.namedItem('email') as HTMLInputElement).value;
        const hp = (form.elements.namedItem('_hp') as HTMLInputElement).value;
        const btn = form.querySelector('button')!;
        btn.disabled = true;
        btn.textContent = '...';

        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source, _hp: hp }),
        });

        if (res.ok) {
          form.hidden = true;
          ok.hidden = false;
        } else {
          btn.disabled = false;
          btn.textContent = 'Subscribe';
          err.hidden = false;
        }
      });
    });
  </script>

  <style>
    .nl-wrap { display: flex; flex-direction: column; gap: 10px; }
    .nl-label {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .nl-form { display: flex; gap: 8px; max-width: 420px; }
    .nl-form input[type=email] {
      flex: 1;
      background: rgba(244,237,224,0.04);
      border: 1px solid var(--border-strong);
      color: var(--breath);
      font-family: var(--font-body);
      font-size: 0.9rem;
      font-weight: 300;
      padding: 12px 18px;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.2s;
    }
    .nl-form input[type=email]:focus { border-color: var(--pulse); }
    .nl-form input[type=email]::placeholder { color: var(--muted); }
    .nl-form button {
      background: var(--pulse);
      color: var(--mile);
      border: none;
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 12px 22px;
      border-radius: 2px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s;
    }
    .nl-form button:hover { background: #c8f020; }
    .nl-form button:disabled { opacity: 0.6; cursor: not-allowed; }
    .nl-ok { color: var(--pulse); font-size: 0.9rem; }
    .nl-err { color: var(--dawn); font-size: 0.85rem; }
    .nl-note { font-size: 0.65rem; color: var(--muted); }
    @media (max-width: 480px) { .nl-form { flex-direction: column; } }
  </style>
  ```

- [ ] **Step 2: Test**

  Add `<NewsletterForm source="hero" />` to a page in dev. Submit a real email. Confirm the success message appears and the email is in Beehiiv.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/NewsletterForm.astro
  git commit -m "feat: add NewsletterForm component with honeypot + Beehiiv integration"
  ```

---

## Task 13: Header component (full rebuild)

- [ ] **Step 1: Replace `src/components/Header.astro`**

  ```astro
  ---
  import Logo from './Logo.astro';
  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/coaching', label: 'Coaching' },
    { href: '/advice', label: 'Advice' },
    { href: '/pace-calculator', label: 'Pace Calculator' },
  ];
  const current = Astro.url.pathname;
  ---
  <header class="site-header">
    <div class="h-inner">
      <Logo />
      <button class="burger" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu">
        <span></span><span></span><span></span>
      </button>
      <nav id="nav-menu" aria-label="Main navigation">
        {navLinks.map((link) => (
          <a
            href={link.href}
            class:list={['nav-link', { active: current === link.href || (link.href !== '/' && current.startsWith(link.href)) }]}
            aria-current={current === link.href ? 'page' : undefined}
          >
            {link.label}
          </a>
        ))}
        <a href="#newsletter" class="nav-cta">Subscribe</a>
      </nav>
    </div>
  </header>

  <script>
    const burger = document.querySelector<HTMLButtonElement>('.burger')!;
    const nav = document.querySelector<HTMLElement>('#nav-menu')!;

    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
  </script>

  <style>
    .site-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(10,10,15,0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .h-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 48px;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 40px;
    }
    nav {
      display: flex;
      align-items: center;
      gap: 32px;
      margin-left: auto;
    }
    .nav-link {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      text-decoration: none;
      transition: color 0.2s;
    }
    .nav-link:hover, .nav-link.active { color: var(--breath); }
    .nav-cta {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      background: var(--heat);
      color: var(--breath);
      padding: 8px 18px;
      border-radius: 100px;
      text-decoration: none;
      transition: background 0.2s;
      white-space: nowrap;
    }
    .nav-cta:hover { background: #ff4d94; }
    .burger {
      display: none;
      flex-direction: column;
      gap: 5px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      margin-left: auto;
    }
    .burger span {
      display: block;
      width: 22px;
      height: 1px;
      background: var(--breath);
    }
    @media (max-width: 768px) {
      .h-inner { padding: 0 24px; }
      .burger { display: flex; }
      nav {
        display: none;
        position: absolute;
        top: 64px;
        left: 0;
        right: 0;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
        background: var(--mist);
        border-bottom: 1px solid var(--border);
        padding: 16px 24px 24px;
        margin-left: 0;
      }
      nav.open { display: flex; }
      .nav-link { padding: 12px 0; width: 100%; border-bottom: 1px solid var(--border); }
      .nav-cta { margin-top: 16px; align-self: flex-start; }
    }
  </style>
  ```

- [ ] **Step 2: Verify**

  In dev, open any page. Confirm: sticky header, Logo correct, nav links present, Subscribe pill is Heat magenta, mobile hamburger appears at ≤768px.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/Header.astro
  git commit -m "feat: rebuild Header with Vol.02 brand, sticky, mobile hamburger"
  ```

---

## Task 14: Footer component (full rebuild)

- [ ] **Step 1: Replace `src/components/Footer.astro`**

  ```astro
  ---
  import NewsletterForm from './NewsletterForm.astro';
  const year = new Date().getFullYear();
  ---
  <footer class="site-footer" id="newsletter">
    <div class="f-inner">
      <div class="f-nl">
        <NewsletterForm source="footer" label="Join The Pack — Run Hot, direct to your inbox." />
      </div>
      <div class="f-bottom">
        <div class="f-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms</a>
          <a href="/cookies">Cookies</a>
          <a href="/contact">Contact</a>
          <a href="https://instagram.com/virrarun" target="_blank" rel="noopener noreferrer">@virrarun</a>
        </div>
        <span class="f-copy">&copy; VIRRA {year}</span>
      </div>
    </div>
  </footer>

  <style>
    .site-footer {
      border-top: 1px solid var(--border);
      padding: 64px 0 40px;
    }
    .f-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 48px;
      display: flex;
      flex-direction: column;
      gap: 48px;
    }
    .f-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      border-top: 1px solid var(--border);
      padding-top: 24px;
    }
    .f-links {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
    }
    .f-links a {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      text-decoration: none;
      transition: color 0.2s;
    }
    .f-links a:hover { color: var(--breath); }
    .f-copy {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }
    @media (max-width: 640px) {
      .f-inner { padding: 0 24px; }
      .f-bottom { flex-direction: column; align-items: flex-start; }
    }
  </style>
  ```

- [ ] **Step 2: Verify**

  In dev, check the footer is present with the newsletter form, all links, and correct copyright year. Subscribe pill in the header links to `#newsletter` (the footer).

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/Footer.astro
  git commit -m "feat: rebuild Footer with Run Hot newsletter form + legal links"
  ```

---

## Task 15: Shared components + LegalLayout

- [ ] **Step 1: Create `src/components/SectionLabel.astro`**

  ```astro
  ---
  interface Props { text: string; }
  const { text } = Astro.props;
  ---
  <p class="section-label">{text}</p>
  <style>
    .section-label {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--heat);
      margin-bottom: 10px;
    }
  </style>
  ```

- [ ] **Step 2: Create `src/components/PullQuote.astro`**

  ```astro
  ---
  interface Props { text: string; }
  const { text } = Astro.props;
  ---
  <blockquote class="pull-quote">{text}</blockquote>
  <style>
    .pull-quote {
      border-left: 4px solid var(--heat);
      padding-left: 1.5rem;
      margin: 2.5rem 0;
      font-family: var(--font-editorial);
      font-style: italic;
      font-weight: 400;
      font-size: clamp(1.3rem, 3vw, 1.8rem);
      line-height: 1.35;
      color: var(--breath);
      letter-spacing: -0.015em;
    }
  </style>
  ```

- [ ] **Step 3: Create `src/components/ArticleCard.astro`**

  ```astro
  ---
  import { urlFor } from '../lib/sanity';
  interface Props {
    title: string;
    slug: { current: string };
    dek?: string;
    category: string;
    publishedDate: string;
    heroImage?: any;
  }
  const { title, slug, dek, category, publishedDate, heroImage } = Astro.props;
  const date = new Date(publishedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const imageUrl = heroImage ? urlFor(heroImage).width(640).height(360).url() : null;
  ---
  <a href={`/advice/${slug.current}`} class="article-card">
    <div class="ac-image" style={imageUrl ? `background-image:url(${imageUrl})` : ''} aria-hidden="true">
      {!imageUrl && <div class="ac-placeholder" />}
    </div>
    <div class="ac-body">
      <span class="ac-cat">{category}</span>
      <h3 class="ac-title">{title}</h3>
      {dek && <p class="ac-dek">{dek}</p>}
      <span class="ac-date">{date}</span>
    </div>
  </a>

  <style>
    .article-card {
      display: block;
      text-decoration: none;
      background: var(--mist);
      border: 1px solid var(--border);
      border-radius: 2px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .article-card:hover { border-color: var(--pulse); }
    .ac-image {
      height: 200px;
      background: var(--mile);
      background-size: cover;
      background-position: center;
    }
    .ac-placeholder { height: 100%; background: linear-gradient(135deg, var(--mist) 0%, var(--mile) 100%); }
    .ac-body { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
    .ac-cat {
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--heat);
    }
    .ac-title {
      font-family: var(--font-display);
      font-size: 1.4rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      line-height: 0.95;
      color: var(--breath);
    }
    .ac-dek { font-size: 0.88rem; line-height: 1.6; color: var(--muted); }
    .ac-date { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-top: 4px; }
  </style>
  ```

- [ ] **Step 4: Create `src/layouts/LegalLayout.astro`**

  ```astro
  ---
  import BaseLayout from './BaseLayout.astro';
  import Header from '../components/Header.astro';
  import Footer from '../components/Footer.astro';
  interface Props { title: string; }
  const { title } = Astro.props;
  ---
  <BaseLayout title={`${title} — VIRRA`}>
    <Header />
    <main class="legal-main">
      <div class="legal-wrap">
        <h1 class="legal-title">{title}</h1>
        <div class="prose">
          <slot />
        </div>
      </div>
    </main>
    <Footer />
  </BaseLayout>

  <style>
    .legal-main { padding: 80px 0; }
    .legal-wrap { max-width: 760px; margin: 0 auto; padding: 0 48px; }
    .legal-title {
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 6vw, 5rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.03em;
      line-height: 0.88;
      margin-bottom: 48px;
      color: var(--breath);
    }
    @media (max-width: 640px) { .legal-wrap { padding: 0 24px; } }
  </style>
  ```

- [ ] **Step 5: Delete old components**

  ```bash
  rm src/components/BlogCard.astro
  rm src/components/CtaBanner.astro
  rm src/layouts/BlogPostLayout.astro
  rm -rf src/content
  rm src/content.config.ts
  rm -rf src/pages/blog
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/SectionLabel.astro src/components/PullQuote.astro \
    src/components/ArticleCard.astro src/layouts/LegalLayout.astro
  git rm src/components/BlogCard.astro src/components/CtaBanner.astro \
    src/layouts/BlogPostLayout.astro src/content.config.ts
  git rm -r src/content src/pages/blog
  git commit -m "feat: add SectionLabel, PullQuote, ArticleCard, LegalLayout; remove old blog files"
  ```

---

## Task 16: Deploy to Vercel

- [ ] **Step 1: Build locally to catch any errors**

  ```bash
  pnpm build
  ```
  Expected: build completes with no errors.

- [ ] **Step 2: Connect repo to Vercel**

  Go to https://vercel.com → New Project → import the virra GitHub repo. Framework preset: Astro. Build command: `pnpm build`. Output directory: `dist`.

- [ ] **Step 3: Add environment variables in Vercel dashboard**

  In Project Settings → Environment Variables, add all vars from `.env.example` with real values. For `GOOGLE_SERVICE_ACCOUNT`, paste the full JSON string (minified, one line).

- [ ] **Step 4: Deploy and verify**

  Trigger a deploy. Visit the preview URL. Confirm:
  - Header is visible with correct nav links
  - Footer is visible with newsletter form
  - No build errors in Vercel logs

  Note: The homepage will look mostly blank until Plan 2 rebuilds it — that is expected.

- [ ] **Step 5: Configure custom domain**

  In Vercel → Project → Domains → Add `virra.app`. Update DNS at the registrar to point to Vercel. Wait for propagation.

- [ ] **Step 6: Configure Sanity webhook for auto-redeploy**

  In Sanity → API → Webhooks → Create webhook:
  - URL: `https://api.vercel.com/v1/integrations/deploy/[your-vercel-deploy-hook-url]`
  - Trigger on: `create`, `update`, `delete`
  - Dataset: `production`

  Get the deploy hook URL from Vercel → Project → Settings → Git → Deploy Hooks → Create hook named "Sanity publish".

- [ ] **Step 7: Commit any leftover changes**

  ```bash
  git status
  git add -p
  git commit -m "chore: final foundations cleanup"
  ```

---

**Plan 1 complete.** The foundations are in place: Vercel deployment, Vol.02 design system, Sanity schemas, all API endpoints, and global shell components.

Proceed to **Plan 2: Core Pages** (`docs/superpowers/plans/2026-05-08-virra-site-core-pages.md`).
