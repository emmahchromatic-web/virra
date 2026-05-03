# Virra Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the Virra holding page and blog as a static Astro site with Decap CMS for content editing, deployed to GitHub Pages at virra.app.

**Architecture:** Astro generates all pages at build time from Markdown content files and `.astro` component templates. Non-technical writers publish via Decap CMS — a web UI at `/admin` that commits Markdown to GitHub, which triggers a GitHub Actions build and deploys to GitHub Pages automatically.

**Tech Stack:** Astro 4, Decap CMS 3, GitHub Pages, GitHub Actions, Formspree (email form), Google Fonts (Cormorant + Outfit)

---

## Prerequisites (do before any task)

1. **GitHub repo** — Create a new public repo at github.com. Name it `virra` (or `virra-web`). Note the full repo path: `yourhandle/virra`.
2. **Formspree account** — Sign up free at formspree.io. Create a new form, copy the form ID (looks like `xabcdefg`).
3. **GitHub OAuth App** — For Decap CMS auth (no backend server needed — uses PKCE flow):
   - GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - App name: `Virra CMS`
   - Homepage URL: `https://virra.app`
   - Authorization callback URL: `https://virra.app/admin`
   - Hit Register. Copy the **Client ID** (you do not need the secret).
4. **Node 20+ and pnpm** installed locally (`npm install -g pnpm` if not).
5. The approved design reference is at `option-1-editorial.html` in this folder — keep it for reference.

---

## File Map

```
virra/
├── .github/workflows/deploy.yml        NEW — build + deploy to GitHub Pages
├── _reference/                         NEW — move existing HTML mockups here
├── public/
│   ├── admin/
│   │   ├── index.html                  NEW — Decap CMS entry point
│   │   └── config.yml                  NEW — CMS collections + brand kit
│   ├── images/blog/.gitkeep            NEW — cover image upload target
│   └── CNAME                           NEW — "virra.app"
├── src/
│   ├── components/
│   │   ├── Header.astro                NEW
│   │   ├── Footer.astro                NEW
│   │   ├── BlogCard.astro              NEW — card on /blog index
│   │   └── CtaBanner.astro             NEW — waitlist CTA on every post
│   ├── content/
│   │   ├── config.ts                   NEW — Zod schema for blog collection
│   │   └── blog/
│   │       └── 2026-05-01-welcome.md   NEW — seed post for testing
│   ├── layouts/
│   │   ├── BaseLayout.astro            NEW — <head>, fonts, meta tags
│   │   └── BlogPostLayout.astro        NEW — full post template
│   ├── pages/
│   │   ├── index.astro                 NEW — holding page (ports option-1-editorial.html)
│   │   └── blog/
│   │       ├── index.astro             NEW — post grid
│   │       └── [...slug].astro         NEW — dynamic post route
│   └── styles/
│       └── global.css                  NEW — design tokens + prose styles
├── astro.config.mjs                    NEW
└── package.json                        NEW (from scaffold)
```

---

## Task 1: Scaffold Astro Project

**Files:**
- Create: `astro.config.mjs`, `package.json`, `src/env.d.ts` (all from scaffold)

- [x] **Step 1: Move existing HTML files to reference folder**

```bash
mkdir _reference
mv index.html option-1-editorial.html option-2-precision.html option-3-precision.html _reference/ 2>/dev/null; true
```

- [x] **Step 2: Scaffold Astro**

```bash
pnpm create astro@latest . --template minimal --no-install --no-git --skip-houston
```

When prompted to overwrite existing files: choose **Yes** for any conflicts. The scaffold creates `src/`, `astro.config.mjs`, `package.json`, `tsconfig.json`.

- [x] **Step 3: Install dependencies**

```bash
pnpm install
pnpm add @astrojs/sitemap
```

- [x] **Step 4: Verify dev server starts**

```bash
pnpm dev
```

Expected: `Local: http://localhost:4321` in terminal. Open in browser — you see the Astro starter page. Kill the server (Ctrl+C).

- [x] **Step 5: Clear the starter content**

Replace `src/pages/index.astro` with an empty placeholder:

```astro
---
---
<html lang="en"><body><p>placeholder</p></body></html>
```

- [x] **Step 6: Replace astro.config.mjs**

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://virra.app',
  integrations: [sitemap()],
});
```

- [x] **Step 7: Verify build succeeds**

```bash
pnpm build
```

Expected: `dist/` folder created, no errors.

- [x] **Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold astro project"
```

---

## Task 2: Global CSS Design Tokens

**Files:**
- Create: `src/styles/global.css`

- [x] **Step 1: Create styles directory and global.css**

```bash
mkdir -p src/styles
```

Write `src/styles/global.css`:

```css
:root {
  --lime: #C8FF45;
  --pink: #FF3575;
  --bg: #09090A;
  --text: #EBE6DA;
  --muted: rgba(235,230,218,0.35);
  --border: rgba(235,230,218,0.08);
  --font-display: 'Cormorant', serif;
  --font-body: 'Outfit', sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-weight: 300;
  min-height: 100vh;
  overflow-x: hidden;
}

/* Grain overlay — applied once globally */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.04;
  pointer-events: none;
  z-index: 999;
}

/* Prose styles — used inside .prose wrapper in BlogPostLayout */
.prose h2 { font-family: var(--font-display); font-size: 2rem; font-weight: 400; color: var(--text); margin: 2.5rem 0 1rem; line-height: 1.1; }
.prose h3 { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--text); margin: 2rem 0 0.75rem; line-height: 1.1; }
.prose p { font-size: 1.05rem; line-height: 1.82; color: rgba(235,230,218,0.72); margin-bottom: 1.5rem; }
.prose a { color: var(--lime); text-decoration: underline; text-underline-offset: 3px; }
.prose strong { color: var(--text); font-weight: 500; }
.prose em { font-style: italic; }
.prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.5rem; }
.prose li { font-size: 1.05rem; line-height: 1.8; color: rgba(235,230,218,0.72); margin-bottom: 0.5rem; }
.prose blockquote {
  border-left: 2px solid var(--lime);
  padding-left: 1.5rem;
  margin: 2rem 0;
  font-family: var(--font-display);
  font-style: italic;
  font-size: 1.4rem;
  font-weight: 300;
  color: var(--text);
  line-height: 1.5;
}
.prose img { width: 100%; border-radius: 4px; margin: 2rem 0; }
.prose hr { border: none; border-top: 1px solid var(--border); margin: 2.5rem 0; }
```

- [x] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add global css design tokens and prose styles"
```

---

## Task 3: BaseLayout Component

**Files:**
- Create: `src/layouts/BaseLayout.astro`

- [x] **Step 1: Write BaseLayout.astro**

```astro
---
interface Props {
  title: string;
  description: string;
  ogImage?: string;
}

const { title, description, ogImage } = Astro.props;
const siteUrl = 'https://virra.app';
const canonical = Astro.url.href;
const fullOgImage = ogImage
  ? (ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`)
  : `${siteUrl}/og-default.jpg`;
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content={description}>
  <link rel="canonical" href={canonical}>
  <meta property="og:title" content={title}>
  <meta property="og:description" content={description}>
  <meta property="og:image" content={fullOgImage}>
  <meta property="og:url" content={canonical}>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Virra">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content={title}>
  <meta name="twitter:description" content={description}>
  <meta name="twitter:image" content={fullOgImage}>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/global.css">
</head>
<body>
  <slot />
</body>
</html>
```

- [x] **Step 2: Verify build still passes**

```bash
pnpm build
```

Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat: add BaseLayout with SEO meta tags"
```

---

## Task 4: Header and Footer Components

**Files:**
- Create: `src/components/Header.astro`
- Create: `src/components/Footer.astro`

- [x] **Step 1: Write Header.astro**

```astro
---
---
<header class="site-header">
  <div class="h-wrap">
    <a href="/" class="logo">VIRRA<em>.</em></a>
    <nav>
      <a href="/blog">Journal</a>
    </nav>
  </div>
</header>

<style>
  .site-header {
    padding: 36px 0;
    position: relative;
    z-index: 10;
    animation: hdrUp 0.7s ease 0.1s both;
  }
  .h-wrap {
    max-width: 1140px;
    margin: 0 auto;
    padding: 0 52px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .logo {
    font-family: 'Cormorant', serif;
    font-weight: 600;
    font-size: 1.7rem;
    letter-spacing: 0.28em;
    color: var(--text);
    text-decoration: none;
  }
  .logo em { color: var(--lime); font-style: normal; }
  nav a {
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    text-decoration: none;
    transition: color 0.2s;
  }
  nav a:hover { color: var(--text); }
  @keyframes hdrUp {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 680px) { .h-wrap { padding: 0 28px; } }
</style>
```

- [x] **Step 2: Write Footer.astro**

```astro
---
const year = new Date().getFullYear();
---
<footer class="site-footer">
  <div class="f-wrap">
    <span class="cp">&copy; {year} Virra. All rights reserved.</span>
    <div class="pl">
      <span>iOS</span>
      <span>&mdash;</span>
      <span>Android</span>
    </div>
  </div>
</footer>

<style>
  .site-footer {
    padding: 30px 0;
    border-top: 1px solid var(--border);
  }
  .f-wrap {
    max-width: 1140px;
    margin: 0 auto;
    padding: 0 52px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .cp { font-size: 0.68rem; color: var(--muted); letter-spacing: 0.06em; }
  .pl {
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(235,230,218,0.22);
    display: flex;
    gap: 12px;
    align-items: center;
  }
  @media (max-width: 680px) {
    .f-wrap { padding: 0 28px; flex-direction: column; gap: 14px; }
  }
</style>
```

- [x] **Step 3: Commit**

```bash
git add src/components/Header.astro src/components/Footer.astro
git commit -m "feat: add Header and Footer components"
```

---

## Task 5: Holding Page

**Files:**
- Modify: `src/pages/index.astro`

- [x] **Step 1: Write index.astro** (ports `_reference/option-1-editorial.html`)

Replace the placeholder content in `src/pages/index.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
---
<BaseLayout
  title="Virra — Coming Soon"
  description="The first premium health and fitness platform built for women. Train, nourish, and thrive — all in one app."
>
  <div class="glow-lime" aria-hidden="true"></div>
  <div class="glow-pink" aria-hidden="true"></div>
  <div class="side-label" aria-hidden="true">Health &bull; Nutrition &bull; Performance</div>

  <Header />

  <main>
    <div class="wrap">
      <section class="hero">
        <p class="eyebrow">Your whole health, unified</p>

        <h1>
          <span class="lw"><span class="li">Train.</span></span>
          <span class="lw"><span class="li it cl">Nourish.</span></span>
          <span class="lw"><span class="li">Thrive.</span></span>
        </h1>

        <span class="rule" aria-hidden="true"></span>

        <p class="sub">
          The first premium platform built for women who want it all &mdash; workouts,
          nutrition, and progress tracking unified in one beautifully crafted app.
        </p>

        <div class="tags" aria-label="Supported disciplines">
          <span class="tag">Running</span>
          <span class="tag">Cycling</span>
          <span class="tag">Strength</span>
          <span class="tag">Yoga</span>
          <span class="tag">Pilates</span>
          <span class="tag">Nutrition</span>
          <span class="tag">Progress</span>
        </div>
      </section>

      <section class="signup" aria-labelledby="waitlist-label">
        <label id="waitlist-label" class="signup-lbl">Join the waitlist</label>
        <form
          class="form"
          id="frm"
          action="https://formspree.io/f/YOUR_FORMSPREE_ID"
          method="POST"
        >
          <input
            type="email"
            name="email"
            placeholder="your@email.com"
            autocomplete="email"
            required
          >
          <button type="submit">Get Early Access</button>
        </form>
        <p class="ok" id="ok" hidden>You&rsquo;re on the list &mdash; we&rsquo;ll be in touch soon.</p>
        <p class="note">No spam, ever. Unsubscribe at any time.</p>
      </section>
    </div>
  </main>

  <Footer />
</BaseLayout>

<style>
  .glow-lime {
    position: fixed; top: -280px; left: -180px;
    width: 650px; height: 650px;
    background: radial-gradient(circle, rgba(200,255,69,0.13) 0%, transparent 65%);
    pointer-events: none;
  }
  .glow-pink {
    position: fixed; bottom: -280px; right: -180px;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(255,53,117,0.10) 0%, transparent 65%);
    pointer-events: none;
  }
  .side-label {
    position: fixed; right: 28px; top: 50%;
    transform: rotate(90deg) translateX(-50%);
    transform-origin: right;
    font-size: 0.58rem; letter-spacing: 0.35em; text-transform: uppercase;
    color: rgba(200,255,69,0.2); white-space: nowrap;
    animation: fade 1.5s ease 1.8s both;
  }
  .wrap { max-width: 1140px; margin: 0 auto; padding: 0 52px; }

  /* Hero */
  .hero { padding: 96px 0 72px; }
  .eyebrow {
    font-size: 0.7rem; font-weight: 400; letter-spacing: 0.3em; text-transform: uppercase;
    color: var(--lime); margin-bottom: 44px;
    animation: up 0.7s ease 0.4s both;
    display: flex; align-items: center; gap: 14px;
  }
  .eyebrow::after { content: ''; width: 38px; height: 1px; background: currentColor; opacity: 0.5; display: block; }
  h1 {
    font-family: 'Cormorant', serif;
    font-size: clamp(5.5rem, 13vw, 10.5rem);
    font-weight: 300; line-height: 0.88;
    letter-spacing: -0.01em; margin-bottom: 52px;
  }
  .lw { display: block; overflow: hidden; }
  .li { display: block; transform: translateY(110%); opacity: 0; }
  .lw:nth-child(1) .li { animation: slide 1s cubic-bezier(0.16,1,0.3,1) 0.5s forwards; }
  .lw:nth-child(2) .li { animation: slide 1s cubic-bezier(0.16,1,0.3,1) 0.64s forwards; }
  .lw:nth-child(3) .li { animation: slide 1s cubic-bezier(0.16,1,0.3,1) 0.78s forwards; }
  .it { font-style: italic; }
  .cl { color: var(--lime); }
  .rule {
    display: block; width: 0; height: 1px;
    background: linear-gradient(90deg, var(--lime), transparent);
    margin-bottom: 32px;
    animation: widen 0.9s ease 1.1s forwards; opacity: 0;
  }
  .sub {
    font-size: 1.05rem; font-weight: 300; line-height: 1.78;
    color: rgba(235,230,218,0.5); max-width: 450px;
    animation: up 0.7s ease 1.0s both;
  }
  .tags {
    display: flex; flex-wrap: wrap; gap: 8px; margin-top: 40px;
    animation: up 0.7s ease 1.15s both;
  }
  .tag {
    font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase;
    border: 1px solid rgba(200,255,69,0.18); color: rgba(200,255,69,0.58);
    padding: 5px 13px; border-radius: 2px;
  }

  /* Signup */
  .signup { padding: 60px 0; border-top: 1px solid var(--border); animation: up 0.7s ease 1.3s both; }
  .signup-lbl {
    font-size: 0.68rem; letter-spacing: 0.25em; text-transform: uppercase;
    color: var(--muted); margin-bottom: 20px; display: block;
  }
  .form { display: flex; gap: 10px; max-width: 460px; }
  .form input[type=email] {
    flex: 1; background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.9rem;
    font-weight: 300; padding: 14px 20px; border-radius: 3px; outline: none;
    transition: border-color 0.25s, background 0.25s;
  }
  .form input[type=email]::placeholder { color: var(--muted); }
  .form input[type=email]:focus {
    border-color: rgba(200,255,69,0.38);
    background: rgba(200,255,69,0.03);
  }
  .form button {
    background: var(--lime); color: #09090A; border: none;
    font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.15em; text-transform: uppercase;
    padding: 14px 26px; border-radius: 3px; cursor: pointer;
    transition: background 0.2s, transform 0.15s; white-space: nowrap;
  }
  .form button:hover { background: #d6ff5e; transform: translateY(-1px); }
  .form button:active { transform: translateY(0); }
  .ok { color: var(--lime); font-size: 0.92rem; padding: 14px 0; }
  .note { margin-top: 14px; font-size: 0.68rem; color: var(--muted); }

  @keyframes up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fade { from { opacity:0; } to { opacity:1; } }
  @keyframes slide { to { transform:translateY(0); opacity:1; } }
  @keyframes widen { from { width:0; opacity:0; } to { width:80px; opacity:1; } }

  @media (max-width: 680px) {
    .wrap { padding: 0 28px; }
    h1 { font-size: clamp(4rem, 15vw, 6rem); }
    .form { flex-direction: column; }
    .side-label { display: none; }
  }
</style>

<script>
  const form = document.getElementById('frm') as HTMLFormElement;
  const ok = document.getElementById('ok') as HTMLElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const res = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      form.hidden = true;
      ok.hidden = false;
    }
  });
</script>
```

- [x] **Step 2: Start dev server and visually check the holding page**

```bash
pnpm dev
```

Open http://localhost:4321. Verify:
- Dark background with grain texture
- Animated "Train. / Nourish. / Thrive." headline
- Lime green and pink glows
- Email form renders correctly
- Responsive: resize to mobile (< 680px), check form stacks

Kill the server.

- [x] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add holding page (Option 1 editorial design)"
```

---

## Task 6: Formspree Form ID

**Files:**
- Modify: `src/pages/index.astro` — replace `YOUR_FORMSPREE_ID`

- [x] **Step 1: Get your Formspree form ID**

Log in to formspree.io. Under Forms, find your form. The endpoint shown is `https://formspree.io/f/xxxxxxxx` — copy the `xxxxxxxx` part.

- [x] **Step 2: Replace placeholder in index.astro**

In `src/pages/index.astro`, find:
```
action="https://formspree.io/f/YOUR_FORMSPREE_ID"
```
Replace `YOUR_FORMSPREE_ID` with your actual form ID.

- [x] **Step 3: Test form submission**

```bash
pnpm dev
```

Open http://localhost:4321, enter a test email, submit. Check Formspree dashboard — the submission should appear within a few seconds.

- [x] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: wire Formspree email form"
```

---

## Task 7: Content Collection Schema

**Files:**
- Create: `src/content/config.ts`

- [x] **Step 1: Write config.ts**

```typescript
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string().max(200),
    hero_paragraph: z.string().max(400),
    cover_image: z.string(),
    category: z.enum(['Fitness', 'Nutrition', 'Performance', 'Wellbeing', 'App Updates']),
    tags: z.array(z.string()).optional().default([]),
    author: z.string(),
    published_date: z.coerce.date(),
  }),
});

export const collections = { blog };
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no TypeScript errors.

- [x] **Step 3: Commit**

```bash
git add src/content/config.ts
git commit -m "feat: add blog content collection schema"
```

---

## Task 8: CtaBanner Component

**Files:**
- Create: `src/components/CtaBanner.astro`

This banner appears at the bottom of every blog post. It mirrors the holding page's email form. The Formspree ID must match Task 6.

- [x] **Step 1: Write CtaBanner.astro**

Replace `YOUR_FORMSPREE_ID` with the same form ID used in Task 6.

```astro
---
---
<aside class="cta-banner" aria-label="Join the Virra waitlist">
  <div class="cta-inner">
    <p class="cta-eyebrow">Coming soon to iOS &amp; Android</p>
    <h2 class="cta-heading">Virra is almost here.</h2>
    <p class="cta-sub">Be first to know when we launch. Join the waitlist.</p>
    <form
      class="cta-form"
      id="cta-frm"
      action="https://formspree.io/f/YOUR_FORMSPREE_ID"
      method="POST"
    >
      <input type="email" name="email" placeholder="your@email.com" autocomplete="email" required>
      <button type="submit">Join Waitlist</button>
    </form>
    <p class="cta-ok" id="cta-ok" hidden>You&rsquo;re on the list &mdash; we&rsquo;ll be in touch soon.</p>
    <p class="cta-note">No spam, ever.</p>
  </div>
</aside>

<style>
  .cta-banner {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 56px 48px;
    margin-top: 72px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .cta-banner::before {
    content: '';
    position: absolute;
    top: -100px; left: 50%;
    transform: translateX(-50%);
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(200,255,69,0.07) 0%, transparent 65%);
    pointer-events: none;
  }
  .cta-inner { position: relative; z-index: 1; }
  .cta-eyebrow {
    font-size: 0.65rem; letter-spacing: 0.25em; text-transform: uppercase;
    color: var(--lime); margin-bottom: 16px; opacity: 0.8;
  }
  .cta-heading {
    font-family: 'Cormorant', serif; font-size: 2.5rem; font-weight: 300;
    color: var(--text); margin-bottom: 12px; line-height: 1;
  }
  .cta-sub { font-size: 0.95rem; color: var(--muted); margin-bottom: 32px; line-height: 1.6; }
  .cta-form { display: flex; gap: 10px; max-width: 380px; margin: 0 auto; }
  .cta-form input {
    flex: 1; background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.88rem;
    padding: 12px 16px; border-radius: 3px; outline: none;
    transition: border-color 0.25s;
  }
  .cta-form input::placeholder { color: var(--muted); }
  .cta-form input:focus { border-color: rgba(200,255,69,0.38); }
  .cta-form button {
    background: var(--lime); color: #09090A; border: none;
    font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    padding: 12px 20px; border-radius: 3px; cursor: pointer;
    transition: background 0.2s; white-space: nowrap;
  }
  .cta-form button:hover { background: #d6ff5e; }
  .cta-ok { color: var(--lime); font-size: 0.9rem; padding: 12px 0; }
  .cta-note { margin-top: 12px; font-size: 0.67rem; color: var(--muted); }

  @media (max-width: 600px) {
    .cta-form { flex-direction: column; }
    .cta-banner { padding: 36px 24px; }
    .cta-heading { font-size: 2rem; }
  }
</style>

<script>
  const form = document.getElementById('cta-frm') as HTMLFormElement;
  const ok = document.getElementById('cta-ok') as HTMLElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const res = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      form.hidden = true;
      ok.hidden = false;
    }
  });
</script>
```

- [x] **Step 2: Commit**

```bash
git add src/components/CtaBanner.astro
git commit -m "feat: add CtaBanner component for blog posts"
```

---

## Task 9: BlogCard Component

**Files:**
- Create: `src/components/BlogCard.astro`

- [x] **Step 1: Write BlogCard.astro**

```astro
---
interface Props {
  title: string;
  excerpt: string;
  slug: string;
  cover_image: string;
  category: string;
  published_date: Date;
  readingTime: number;
}

const { title, excerpt, slug, cover_image, category, published_date, readingTime } = Astro.props;
const formattedDate = published_date.toLocaleDateString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric',
});
---
<a href={`/blog/${slug}`} class="card">
  <div class="card-image">
    <img src={cover_image} alt={title} loading="lazy" width="800" height="450">
  </div>
  <div class="card-body">
    <div class="card-meta">
      <span class="cat">{category}</span>
      <span class="dot" aria-hidden="true">&middot;</span>
      <span class="rtime">{readingTime} min read</span>
    </div>
    <h2 class="card-title">{title}</h2>
    <p class="card-excerpt">{excerpt}</p>
    <time class="card-date" datetime={published_date.toISOString()}>{formattedDate}</time>
  </div>
</a>

<style>
  .card {
    display: block; text-decoration: none;
    border: 1px solid var(--border); border-radius: 4px;
    overflow: hidden; transition: border-color 0.25s, transform 0.2s;
  }
  .card:hover { border-color: rgba(235,230,218,0.2); transform: translateY(-2px); }
  .card-image img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
  .card-body { padding: 24px; }
  .card-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .cat {
    font-size: 0.62rem; letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--lime); opacity: 0.8;
  }
  .dot { color: var(--muted); }
  .rtime { font-size: 0.68rem; color: var(--muted); }
  .card-title {
    font-family: 'Cormorant', serif; font-size: 1.5rem; font-weight: 400;
    color: var(--text); line-height: 1.15; margin-bottom: 12px;
  }
  .card-excerpt { font-size: 0.88rem; line-height: 1.65; color: var(--muted); margin-bottom: 16px; }
  .card-date { font-size: 0.65rem; color: var(--muted); letter-spacing: 0.05em; }
</style>
```

- [x] **Step 2: Commit**

```bash
git add src/components/BlogCard.astro
git commit -m "feat: add BlogCard component"
```

---

## Task 10: Blog Index Page

**Files:**
- Create: `src/pages/blog/index.astro`

- [x] **Step 1: Create blog directory**

```bash
mkdir -p src/pages/blog
```

- [x] **Step 2: Write blog/index.astro**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import Header from '../../components/Header.astro';
import Footer from '../../components/Footer.astro';
import BlogCard from '../../components/BlogCard.astro';

function readingTime(body: string): number {
  return Math.max(1, Math.ceil(body.split(/\s+/).length / 200));
}

const posts = await getCollection('blog');
const sorted = posts.sort(
  (a, b) => b.data.published_date.valueOf() - a.data.published_date.valueOf()
);
---
<BaseLayout
  title="Journal — Virra"
  description="Health, fitness, and nutrition insights from the Virra team."
>
  <Header />
  <main class="blog-main">
    <div class="b-wrap">
      <header class="page-header">
        <p class="page-eyebrow">Journal</p>
        <h1 class="page-title">Insights for women who move</h1>
      </header>
      {sorted.length === 0 && (
        <p class="empty">No posts yet &mdash; check back soon.</p>
      )}
      <div class="grid">
        {sorted.map(post => (
          <BlogCard
            title={post.data.title}
            excerpt={post.data.excerpt}
            slug={post.slug}
            cover_image={post.data.cover_image}
            category={post.data.category}
            published_date={post.data.published_date}
            readingTime={readingTime(post.body)}
          />
        ))}
      </div>
    </div>
  </main>
  <Footer />
</BaseLayout>

<style>
  .blog-main { padding: 48px 0 96px; }
  .b-wrap { max-width: 1140px; margin: 0 auto; padding: 0 52px; }
  .page-header { margin-bottom: 56px; animation: up 0.7s ease 0.2s both; }
  .page-eyebrow {
    font-size: 0.7rem; letter-spacing: 0.28em; text-transform: uppercase;
    color: var(--lime); margin-bottom: 16px; opacity: 0.8;
  }
  .page-title {
    font-family: 'Cormorant', serif;
    font-size: clamp(2.5rem, 5vw, 4rem);
    font-weight: 300; color: var(--text);
  }
  .empty { color: var(--muted); font-size: 0.95rem; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @keyframes up { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } .b-wrap { padding: 0 24px; } }
</style>
```

- [x] **Step 3: Commit**

```bash
git add src/pages/blog/index.astro
git commit -m "feat: add blog index page"
```

---

## Task 11: Blog Post Layout

**Files:**
- Create: `src/layouts/BlogPostLayout.astro`

- [x] **Step 1: Write BlogPostLayout.astro**

```astro
---
import BaseLayout from './BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import CtaBanner from '../components/CtaBanner.astro';

interface Props {
  title: string;
  excerpt: string;
  hero_paragraph: string;
  cover_image: string;
  category: string;
  tags: string[];
  author: string;
  published_date: Date;
  readingTime: number;
}

const {
  title, excerpt, hero_paragraph, cover_image,
  category, tags, author, published_date, readingTime,
} = Astro.props;

const formattedDate = published_date.toLocaleDateString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric',
});
---
<BaseLayout title={`${title} — Virra Journal`} description={excerpt} ogImage={cover_image}>
  <Header />
  <main class="post-main">
    <div class="p-wrap">
      <div class="post-meta">
        <span class="post-cat">{category}</span>
        <span class="mdot" aria-hidden="true">&middot;</span>
        <span>{readingTime} min read</span>
        <span class="mdot" aria-hidden="true">&middot;</span>
        <time datetime={published_date.toISOString()}>{formattedDate}</time>
        <span class="mdot" aria-hidden="true">&middot;</span>
        <span>{author}</span>
      </div>

      <h1 class="post-title">{title}</h1>

      <p class="hero-paragraph">{hero_paragraph}</p>

      <div class="cover-wrap">
        <img class="cover-img" src={cover_image} alt={title} width="1200" height="675">
      </div>

      <article class="prose">
        <slot />
      </article>

      {tags.length > 0 && (
        <div class="post-tags" aria-label="Post tags">
          {tags.map(tag => <span class="ptag">{tag}</span>)}
        </div>
      )}

      <CtaBanner />
    </div>
  </main>
  <Footer />
</BaseLayout>

<style>
  .post-main { padding: 40px 0 80px; }
  .p-wrap { max-width: 720px; margin: 0 auto; padding: 0 52px; }

  .post-meta {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    margin-bottom: 28px;
    font-size: 0.68rem; color: var(--muted); letter-spacing: 0.06em;
  }
  .post-cat {
    color: var(--lime); opacity: 0.8;
    text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.62rem;
  }
  .mdot { opacity: 0.4; }

  .post-title {
    font-family: 'Cormorant', serif;
    font-size: clamp(2.4rem, 6vw, 4rem);
    font-weight: 300; line-height: 1.05;
    color: var(--text); margin-bottom: 32px;
  }

  /* Hero paragraph — reader-facing TLDR standfirst */
  .hero-paragraph {
    font-family: 'Cormorant', serif;
    font-size: 1.4rem; font-style: italic; font-weight: 300;
    line-height: 1.65; color: rgba(235,230,218,0.72);
    border-left: 2px solid var(--lime); padding-left: 24px;
    margin-bottom: 40px;
  }

  .cover-wrap { margin-bottom: 48px; border-radius: 4px; overflow: hidden; }
  .cover-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }

  .post-tags {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-top: 48px; padding-top: 32px;
    border-top: 1px solid var(--border);
  }
  .ptag {
    font-size: 0.62rem; letter-spacing: 0.15em; text-transform: uppercase;
    border: 1px solid var(--border); color: var(--muted);
    padding: 4px 12px; border-radius: 2px;
  }

  @media (max-width: 680px) {
    .p-wrap { padding: 0 24px; }
    .hero-paragraph { font-size: 1.2rem; }
  }
</style>
```

- [x] **Step 2: Commit**

```bash
git add src/layouts/BlogPostLayout.astro
git commit -m "feat: add BlogPostLayout with hero paragraph standfirst"
```

---

## Task 12: Dynamic Blog Post Route

**Files:**
- Create: `src/pages/blog/[...slug].astro`

- [x] **Step 1: Write [...slug].astro**

```astro
---
import { getCollection, type CollectionEntry } from 'astro:content';
import BlogPostLayout from '../../layouts/BlogPostLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

interface Props {
  post: CollectionEntry<'blog'>;
}

const { post } = Astro.props;
const { Content } = await post.render();

const wordCount = post.body.split(/\s+/).length;
const readingTime = Math.max(1, Math.ceil(wordCount / 200));
---
<BlogPostLayout
  title={post.data.title}
  excerpt={post.data.excerpt}
  hero_paragraph={post.data.hero_paragraph}
  cover_image={post.data.cover_image}
  category={post.data.category}
  tags={post.data.tags}
  author={post.data.author}
  published_date={post.data.published_date}
  readingTime={readingTime}
>
  <Content />
</BlogPostLayout>
```

- [x] **Step 2: Commit**

```bash
git add src/pages/blog/\[...slug\].astro
git commit -m "feat: add dynamic blog post route"
```

---

## Task 13: Sitemap

Already installed `@astrojs/sitemap` in Task 1. Just need to verify it's wired into `astro.config.mjs` (done in Task 1 Step 6).

- [x] **Step 1: Verify sitemap config**

Open `astro.config.mjs`. It should contain:

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://virra.app',
  integrations: [sitemap()],
});
```

If anything is missing, fix it now.

- [x] **Step 2: Build and verify sitemap output**

```bash
pnpm build
ls dist/sitemap-index.xml dist/sitemap-0.xml
```

Expected: both files exist. Open `dist/sitemap-0.xml` — it should list `https://virra.app/` and `https://virra.app/blog/`.

- [x] **Step 3: Commit if any changes were made**

```bash
git add astro.config.mjs
git commit -m "feat: verify sitemap integration"
```

---

## Task 14: Seed Blog Post

A real Markdown file so the blog isn't empty during testing. This is a placeholder — writers will replace it with real content via Decap CMS.

**Files:**
- Create: `src/content/blog/2026-05-01-welcome.md`
- Create: `public/images/blog/.gitkeep`

- [x] **Step 1: Create the images directory**

```bash
mkdir -p public/images/blog
touch public/images/blog/.gitkeep
```

- [x] **Step 2: Write the seed post**

Create `src/content/blog/2026-05-01-welcome.md`:

```markdown
---
title: "Welcome to the Virra Journal"
excerpt: "Virra is coming — a unified health and fitness platform built for women. Here's what we're building and why."
hero_paragraph: "We started Virra because we were tired of juggling three apps to track one workout. This is our story, and we'd love you to be part of it from the beginning."
cover_image: "/images/blog/welcome.jpg"
category: "App Updates"
tags: ["launch", "about", "fitness"]
author: "Virra Team"
published_date: 2026-05-01
---

## Why we built Virra

Health is not one thing. It's your Tuesday run, your Thursday lift, the meal you prepped Sunday, the sleep you didn't get. Yet every app treats one slice of your life as if it were the whole thing.

Virra is our answer to that. One platform, every discipline, beautifully unified.

## What's coming

We're building something we're proud of. Here's what to expect at launch:

- **Multi-discipline tracking** — running, cycling, strength, yoga, pilates, and more
- **Nutrition logging** — intuitive, not obsessive
- **Unified progress view** — see the full picture, not just the parts

We're targeting a launch later this year on iOS and Android. [Join the waitlist](/) to be first.
```

- [x] **Step 3: Add a placeholder cover image**

The seed post references `/images/blog/welcome.jpg`. For testing, copy any JPEG to that path:

```bash
# If you have no image handy, create a 1px placeholder so the build doesn't error
# (In production, replace with a real image via the CMS)
curl -o public/images/blog/welcome.jpg https://placehold.co/1200x675/09090A/C8FF45/jpg?text=Virra 2>/dev/null || \
  echo "Skipping placeholder image — add public/images/blog/welcome.jpg manually before building"
```

- [x] **Step 4: Build and verify blog renders**

```bash
pnpm build && pnpm preview
```

Open http://localhost:4321/blog — the seed post card should appear.
Open http://localhost:4321/blog/2026-05-01-welcome — the full post should render with the hero paragraph styled as a standfirst below the title.

Kill the server.

- [x] **Step 5: Commit**

```bash
git add src/content/blog/2026-05-01-welcome.md public/images/blog/
git commit -m "feat: add seed blog post for testing"
```

---

## Task 15: Decap CMS Setup

**Files:**
- Create: `public/admin/index.html`
- Create: `public/admin/config.yml`

- [ ] **Step 1: Create admin directory**

```bash
mkdir -p public/admin
```

- [ ] **Step 2: Write public/admin/index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Virra CMS</title>
  <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
</head>
<body></body>
</html>
```

- [ ] **Step 3: Write public/admin/config.yml**

Replace `YOUR_GITHUB_USERNAME/virra` with the actual repo path and `YOUR_OAUTH_CLIENT_ID` with the Client ID from the OAuth App you created in Prerequisites.

```yaml
backend:
  name: github
  repo: YOUR_GITHUB_USERNAME/virra
  branch: main
  auth_type: pkce
  app_id: YOUR_OAUTH_CLIENT_ID

publish_mode: editorial_workflow

media_folder: public/images/blog
public_folder: /images/blog

collections:
  - name: blog
    label: Blog Posts
    folder: src/content/blog
    create: true
    slug: "{{year}}-{{month}}-{{day}}-{{fields.slug}}"
    preview_path: "blog/{{slug}}"
    fields:
      - label: Title
        name: title
        widget: string
        hint: "The post headline. Keep it under 70 characters for SEO."

      - label: URL Slug
        name: slug
        widget: string
        hint: "URL-safe identifier, e.g. 'five-ways-to-improve-your-run'. Lowercase, hyphens only."
        pattern: ['^[a-z0-9-]+$', "Lowercase letters, numbers, and hyphens only"]

      - label: Excerpt
        name: excerpt
        widget: text
        hint: "Max 200 chars. Used on index cards and search results — NOT shown inside the article. Write it like a search result snippet."
        pattern: ['.{10,200}', "Between 10 and 200 characters"]

      - label: Hero Paragraph
        name: hero_paragraph
        widget: text
        hint: "Max 400 chars. Shown at the top of the article in italic display font — the reader-facing TLDR. Write it like a magazine standfirst."
        pattern: ['.{20,400}', "Between 20 and 400 characters"]

      - label: Cover Image
        name: cover_image
        widget: image
        hint: "16:9 ratio recommended. Minimum 1200×675px."

      - label: Category
        name: category
        widget: select
        options:
          - Fitness
          - Nutrition
          - Performance
          - Wellbeing
          - App Updates

      - label: Tags
        name: tags
        widget: list
        required: false
        hint: "Optional. Comma-separated keywords."

      - label: Author
        name: author
        widget: select
        options:
          - Virra Team
        hint: "Add more authors here as the team grows."

      - label: Published Date
        name: published_date
        widget: datetime
        default: ""
        hint: "Set to a future date to schedule (the post goes live on next build after that date)."

      - label: Body
        name: body
        widget: markdown
```

- [ ] **Step 4: Build to confirm CMS files copy to dist/**

```bash
pnpm build
ls dist/admin/
```

Expected: `index.html` and `config.yml` both present.

- [ ] **Step 5: Commit**

```bash
git add public/admin/
git commit -m "feat: add Decap CMS admin interface and blog collection config"
```

---

## Task 16: GitHub Actions Deploy Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [x] **Step 1: Create workflows directory**

```bash
mkdir -p .github/workflows
```

- [x] **Step 2: Write deploy.yml**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm astro build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [x] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions deploy workflow"
```

---

## Task 17: Custom Domain File

**Files:**
- Create: `public/CNAME`

- [x] **Step 1: Write CNAME**

```bash
echo "virra.app" > public/CNAME
```

- [x] **Step 2: Commit**

```bash
git add public/CNAME
git commit -m "chore: add CNAME for virra.app custom domain"
```

---

## Task 18: Push to GitHub and Enable Pages

- [ ] **Step 1: Add GitHub remote**

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username (or org name):

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/virra.git
```

- [ ] **Step 2: Push**

```bash
git push -u origin main
```

- [ ] **Step 3: Watch the first build**

Open the repo on GitHub → Actions tab. You should see a "Deploy to GitHub Pages" workflow running. Wait for it to complete (~60 seconds). Green tick = success.

- [ ] **Step 4: Enable GitHub Pages**

In the GitHub repo: Settings → Pages → Source → select **GitHub Actions**. Save.

Expected: GitHub shows a URL like `https://yourhandle.github.io/virra` or, once DNS is set, `https://virra.app`.

---

## Task 19: DNS Configuration for virra.app

Do this at your domain registrar (wherever virra.app is registered).

- [ ] **Step 1: Add A records**

Create four A records pointing `@` (root domain) to GitHub Pages IPs:

```
Type  Name  Value
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
```

- [ ] **Step 2: Add CNAME for www**

```
Type   Name  Value
CNAME  www   YOUR_GITHUB_USERNAME.github.io
```

- [ ] **Step 3: Set custom domain in GitHub Pages settings**

GitHub repo → Settings → Pages → Custom domain → enter `virra.app` → Save.

GitHub will verify DNS and issue a Let's Encrypt SSL certificate automatically. This can take up to 24 hours for DNS to propagate, but is usually under an hour.

- [ ] **Step 4: Verify**

Once DNS propagates: open https://virra.app — the holding page should load over HTTPS.

---

## Task 20: Verify Decap CMS Works End-to-End

- [ ] **Step 1: Open the CMS**

Go to https://virra.app/admin

- [ ] **Step 2: Authenticate**

Click "Login with GitHub". You'll be redirected through the GitHub OAuth flow using PKCE (no backend server needed). Approve access.

- [ ] **Step 3: Create a test draft post**

In the CMS: New Blog Post → fill in all required fields → Save (this saves as a draft in the `cms/posts` branch, not yet live).

- [ ] **Step 4: Publish the test post**

Change status from Draft → Published and click Publish. This merges the Markdown file to `main`, triggering the GitHub Actions build.

- [ ] **Step 5: Verify post appears on the live site**

Wait ~60 seconds for the build. Open https://virra.app/blog — your new post card should appear. Open the post — verify the hero paragraph renders in italic Cormorant below the title.

- [ ] **Step 6: Delete the test post**

In the CMS, set the test post back to Draft and delete it (or keep it if you want to use it as a real post).

---

## Self-Review Notes

- All field names in `config.ts` (`title`, `excerpt`, `hero_paragraph`, `cover_image`, `category`, `tags`, `author`, `published_date`) match exactly across: schema (`config.ts`), CMS config (`config.yml`), blog post layout props, and `[...slug].astro` data access.
- `readingTime` is computed locally in both `blog/index.astro` and `[...slug].astro` — not stored in frontmatter — so it's always fresh.
- `Formspree ID` must be the same in both `index.astro` and `CtaBanner.astro`.
- `CNAME` file lives in `public/` so it copies to `dist/` root on build — required for GitHub Pages custom domain to persist across deploys.
