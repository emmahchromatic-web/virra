# VIRRA Site — Plan 2: Core Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plan 1 (Foundations) must be complete. All components, API routes, Sanity schemas, and Vercel deployment are in place.

**Goal:** Build the Homepage, About, and Coaching pages — all content pulled from Sanity, all forms wired up and tested end-to-end.

**Architecture:** Each page is a statically prerendered Astro page. Sanity content is fetched at build time via `@sanity/client`. The Homepage shows live Sanity data for pillars, founder card, and latest articles. Coaching wires the enquiry form to `/api/coaching-enquiry`.

**Tech Stack:** Astro 6, Sanity v3 (`@sanity/client`), `@sanity/image-url`.

---

## File map

| Action | Path |
|---|---|
| Rebuild | `src/pages/index.astro` |
| Create | `src/pages/about.astro` |
| Create | `src/pages/coaching.astro` |

---

## Task 1: Homepage

- [ ] **Step 1: Replace `src/pages/index.astro`**

  ```astro
  ---
  import BaseLayout from '../layouts/BaseLayout.astro';
  import Header from '../components/Header.astro';
  import Footer from '../components/Footer.astro';
  import Logo from '../components/Logo.astro';
  import NewsletterForm from '../components/NewsletterForm.astro';
  import ArticleCard from '../components/ArticleCard.astro';
  import SectionLabel from '../components/SectionLabel.astro';
  import { client, urlFor } from '../lib/sanity';
  import {
    HOMEPAGE_QUERY,
    LATEST_ARTICLES_QUERY,
  } from '../lib/queries';

  const home = await client.fetch(HOMEPAGE_QUERY);
  const latestArticles = await client.fetch(LATEST_ARTICLES_QUERY);
  ---
  <BaseLayout
    title="VIRRA — Female-first running"
    description="Cycle-aware training, nutrition and performance — all in one place."
  >
    <Header />
    <main>

      <!-- HERO -->
      <section class="hero">
        <div class="wrap">
          <p class="eyebrow">Female-first running</p>
          <h1>
            {home?.heroHeadline ?? 'Run Hot.'}
          </h1>
          {home?.heroSubline && (
            <p class="hero-sub">{home.heroSubline}</p>
          )}
          <div class="hero-nl">
            <NewsletterForm source="hero" />
          </div>
        </div>
      </section>

      <!-- PILLARS -->
      {home?.pillars?.length > 0 && (
        <section class="pillars">
          <div class="wrap">
            <SectionLabel text="What VIRRA is" />
            <div class="pillars-grid">
              {home.pillars.map((p: any, i: number) => (
                <div class:list={['pillar', { featured: i === 1 }]}>
                  <h3 class="pillar-name">{p.name}</h3>
                  <p class="pillar-body">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <!-- FOUNDER -->
      <section class="founder">
        <div class="wrap founder-inner">
          <div class="founder-img">
            {home?.founderPortrait
              ? <img
                  src={urlFor(home.founderPortrait).width(480).height(600).url()}
                  alt={`${home?.founderName ?? 'Emma'} — founder of VIRRA`}
                  width="480"
                  height="600"
                />
              : <div class="founder-placeholder" aria-hidden="true" />
            }
          </div>
          <div class="founder-copy">
            <SectionLabel text="The founder" />
            <h2>{home?.founderName ?? 'Emma'}</h2>
            <p class="founder-bio">{home?.founderBio ?? 'Placeholder founder bio — update in Sanity.'}</p>
            <a href="/about" class="founder-link">Read Emma's story →</a>
          </div>
        </div>
      </section>

      <!-- LATEST FROM RUN HOT -->
      {latestArticles?.length > 0 && (
        <section class="latest">
          <div class="wrap">
            <SectionLabel text="Latest from Run Hot" />
            <div class="articles-grid">
              {latestArticles.map((a: any) => (
                <ArticleCard
                  title={a.title}
                  slug={a.slug}
                  dek={a.dek}
                  category={a.category}
                  publishedDate={a.publishedDate}
                  heroImage={a.heroImage}
                />
              ))}
            </div>
            <a href="/advice" class="see-all">All articles →</a>
          </div>
        </section>
      )}

      <!-- COACHING TEASER -->
      <section class="coaching-teaser">
        <div class="wrap coaching-inner">
          <div class="ct-copy">
            <SectionLabel text="1:1 Coaching" />
            <h2>Train with Emma.</h2>
            <p class="ct-body">{home?.coachingTeaser ?? '1:1 coaching for women runners — bespoke programmes, cycle-aware training, and real accountability.'}</p>
            <a href="/coaching" class="cta-btn">See coaching options →</a>
          </div>
        </div>
      </section>

      <!-- CALCULATOR TEASER -->
      <section class="calc-teaser">
        <div class="wrap">
          <div class="ct2-inner">
            <SectionLabel text="Free tool" />
            <h2>Pace Calculator.</h2>
            <p class="ct2-sub">{home?.calculatorTeaser ?? 'Pace, time, distance, race predictions — and cycle-aware training paces. All client-side, all free.'}</p>
            <a href="/pace-calculator" class="cta-btn-outline">Try the calculator →</a>
          </div>
        </div>
      </section>

      <!-- NEWSLETTER BLOCK -->
      <section class="nl-block">
        <div class="wrap">
          <SectionLabel text="Run Hot" />
          <h2>{home?.newsletterHeadline ?? 'Join The Pack.'}</h2>
          {home?.newsletterSubline && <p class="nl-block-sub">{home.newsletterSubline}</p>}
          <NewsletterForm source="hero" />
        </div>
      </section>

    </main>
    <Footer />
  </BaseLayout>

  <style>
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0 48px; }

    /* HERO */
    .hero { padding: 100px 0 80px; }
    .eyebrow {
      font-family: var(--font-mono);
      font-size: 0.62rem;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: var(--pulse);
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .eyebrow::after { content: ''; width: 32px; height: 1px; background: currentColor; opacity: 0.5; display: block; }
    h1 {
      font-family: var(--font-display);
      font-size: clamp(4.5rem, 12vw, 9rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      margin-bottom: 32px;
      color: var(--breath);
    }
    .hero-sub {
      font-family: var(--font-editorial);
      font-style: italic;
      font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      line-height: 1.3;
      color: rgba(244,237,224,0.75);
      max-width: 520px;
      margin-bottom: 40px;
      letter-spacing: -0.015em;
    }
    .hero-nl { max-width: 440px; }

    /* PILLARS */
    .pillars { padding: 80px 0; border-top: 1px solid var(--border); }
    .pillars-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
    .pillar {
      background: var(--mist);
      border: 1px solid var(--border);
      padding: 28px 24px;
      border-radius: 2px;
    }
    .pillar.featured { background: var(--heat); border-color: var(--heat); }
    .pillar.featured .pillar-name { color: var(--breath); }
    .pillar.featured .pillar-body { color: rgba(244,237,224,0.85); }
    .pillar-name {
      font-family: var(--font-display);
      font-size: 1.8rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      line-height: 0.9;
      color: var(--pulse);
      margin-bottom: 12px;
    }
    .pillar-body { font-size: 0.9rem; line-height: 1.65; color: rgba(244,237,224,0.7); }

    /* FOUNDER */
    .founder { padding: 80px 0; border-top: 1px solid var(--border); }
    .founder-inner { display: grid; grid-template-columns: 320px 1fr; gap: 64px; align-items: center; }
    .founder-img img, .founder-placeholder {
      width: 100%;
      aspect-ratio: 4/5;
      object-fit: cover;
      border-radius: 2px;
      display: block;
    }
    .founder-placeholder { background: var(--mist); }
    .founder-copy h2 {
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 5vw, 4rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.03em;
      line-height: 0.9;
      margin: 8px 0 20px;
    }
    .founder-bio { font-size: 1rem; line-height: 1.75; color: rgba(244,237,224,0.72); margin-bottom: 24px; }
    .founder-link {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--pulse);
      text-decoration: none;
    }
    .founder-link:hover { text-decoration: underline; }

    /* LATEST */
    .latest { padding: 80px 0; border-top: 1px solid var(--border); }
    .articles-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
    .see-all {
      display: inline-block;
      margin-top: 32px;
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--pulse);
      text-decoration: none;
    }
    .see-all:hover { text-decoration: underline; }

    /* COACHING TEASER */
    .coaching-teaser { padding: 80px 0; border-top: 1px solid var(--border); background: var(--mist); }
    .coaching-inner { max-width: 680px; }
    .coaching-teaser h2 {
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 5vw, 4.5rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.03em;
      line-height: 0.9;
      margin: 8px 0 20px;
    }
    .ct-body { font-size: 1rem; line-height: 1.75; color: rgba(244,237,224,0.72); margin-bottom: 28px; }
    .cta-btn {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      background: var(--pulse);
      color: var(--mile);
      padding: 14px 28px;
      border-radius: 2px;
      text-decoration: none;
      transition: background 0.2s;
    }
    .cta-btn:hover { background: #c8f020; }

    /* CALCULATOR TEASER */
    .calc-teaser { padding: 80px 0; border-top: 1px solid var(--border); }
    .ct2-inner { max-width: 600px; }
    .calc-teaser h2 {
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 5vw, 4.5rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.03em;
      line-height: 0.9;
      margin: 8px 0 20px;
    }
    .ct2-sub { font-size: 1rem; line-height: 1.75; color: rgba(244,237,224,0.72); margin-bottom: 28px; }
    .cta-btn-outline {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      border: 1px solid var(--pulse);
      color: var(--pulse);
      padding: 14px 28px;
      border-radius: 2px;
      text-decoration: none;
      transition: background 0.2s, color 0.2s;
    }
    .cta-btn-outline:hover { background: var(--pulse); color: var(--mile); }

    /* NEWSLETTER BLOCK */
    .nl-block { padding: 80px 0; background: var(--heat); border-top: 1px solid var(--border); }
    .nl-block :global(.section-label) { color: var(--pulse); }
    .nl-block h2 {
      font-family: var(--font-display);
      font-size: clamp(3rem, 7vw, 6rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      color: var(--breath);
      margin: 8px 0 20px;
    }
    .nl-block-sub { font-size: 1.05rem; color: rgba(244,237,224,0.85); margin-bottom: 28px; }

    @media (max-width: 900px) {
      .pillars-grid { grid-template-columns: 1fr; }
      .articles-grid { grid-template-columns: 1fr 1fr; }
      .founder-inner { grid-template-columns: 1fr; gap: 32px; }
      .founder-img img, .founder-placeholder { max-width: 320px; }
    }
    @media (max-width: 640px) {
      .wrap { padding: 0 24px; }
      .articles-grid { grid-template-columns: 1fr; }
    }
  </style>
  ```

- [ ] **Step 2: Verify in browser**

  ```bash
  pnpm dev
  ```
  Open http://localhost:4321. Verify:
  - Eyebrow label is Pulse lime, Space Mono
  - H1 is Big Shoulders Display, correct size
  - Hero sub-line is Fraunces italic
  - Newsletter form works (submit a test email)
  - Pillars grid shows 3 cards, middle one is Heat bg
  - Founder section shows placeholder image or real portrait
  - Latest articles show ArticleCards (or empty section if no articles in Sanity)
  - Coaching teaser CTA links to /coaching
  - Calculator teaser CTA links to /pace-calculator
  - Newsletter block at bottom is Heat-bg

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/index.astro
  git commit -m "feat: rebuild homepage with Vol.02 brand, all Sanity-powered sections"
  ```

---

## Task 2: About page

- [ ] **Step 1: Create `src/pages/about.astro`**

  ```astro
  ---
  import BaseLayout from '../layouts/BaseLayout.astro';
  import Header from '../components/Header.astro';
  import Footer from '../components/Footer.astro';
  import SectionLabel from '../components/SectionLabel.astro';
  import NewsletterForm from '../components/NewsletterForm.astro';
  import { client, urlFor } from '../lib/sanity';
  import { ABOUT_QUERY } from '../lib/queries';
  import { PortableText } from '@portabletext/astro';

  const about = await client.fetch(ABOUT_QUERY);
  ---
  <BaseLayout
    title="About Emma — VIRRA"
    description="Emma built VIRRA because women's physiology deserves to be at the centre of every training and nutrition decision — not an afterthought."
  >
    <Header />
    <main>

      <!-- HERO -->
      <section class="about-hero">
        <div class="wrap">
          <div class="hero-inner">
            <div class="hero-img">
              {about?.portrait
                ? <img
                    src={urlFor(about.portrait).width(560).height(700).url()}
                    alt="Emma — founder of VIRRA"
                    width="560"
                    height="700"
                  />
                : <div class="hero-placeholder" aria-hidden="true" />
              }
            </div>
            <div class="hero-copy">
              <SectionLabel text="The founder" />
              <h1>Emma.</h1>
              {about?.heroTagline && (
                <p class="hero-tagline">{about.heroTagline}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <!-- FOUNDER STORY -->
      {about?.founderStory && (
        <section class="story">
          <div class="wrap story-inner">
            <div class="prose">
              <PortableText value={about.founderStory} />
            </div>
          </div>
        </section>
      )}

      <!-- QUALIFICATIONS -->
      {about?.qualifications?.length > 0 && (
        <section class="quals">
          <div class="wrap">
            <SectionLabel text="Qualifications" />
            <ul class="quals-list">
              {about.qualifications.map((q: string) => (
                <li>{q}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <!-- WHY VIRRA -->
      {about?.whyVirra && (
        <section class="why">
          <div class="wrap">
            <SectionLabel text="Why VIRRA" />
            <div class="prose">
              <PortableText value={about.whyVirra} />
            </div>
          </div>
        </section>
      )}

      <!-- PRESS STRIP -->
      {about?.pressItems?.length > 0 && (
        <section class="press">
          <div class="wrap">
            <SectionLabel text="Press" />
            <div class="press-strip">
              {about.pressItems.map((item: any) => (
                <a href={item.url} target="_blank" rel="noopener noreferrer" class="press-item">
                  {item.outlet}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <!-- CROSS CTAs -->
      <section class="ctas">
        <div class="wrap ctas-inner">
          <a href="/coaching" class="cta-card">
            <span class="cta-label">Coaching</span>
            <span class="cta-arrow">→</span>
          </a>
          <a href="#newsletter" class="cta-card">
            <span class="cta-label">Subscribe to Run Hot</span>
            <span class="cta-arrow">→</span>
          </a>
          <a href="https://instagram.com/emmasrunlife" target="_blank" rel="noopener noreferrer" class="cta-card">
            <span class="cta-label">@emmasrunlife</span>
            <span class="cta-arrow">↗</span>
          </a>
        </div>
      </section>

    </main>
    <Footer />
  </BaseLayout>

  <style>
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0 48px; }

    /* HERO */
    .about-hero { padding: 80px 0; }
    .hero-inner { display: grid; grid-template-columns: 420px 1fr; gap: 80px; align-items: end; }
    .hero-img img { width: 100%; border-radius: 2px; display: block; }
    .hero-placeholder { width: 100%; aspect-ratio: 4/5; background: var(--mist); border-radius: 2px; }
    .hero-copy h1 {
      font-family: var(--font-display);
      font-size: clamp(5rem, 14vw, 12rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.82;
      color: var(--breath);
      margin: 12px 0 24px;
    }
    .hero-tagline {
      font-family: var(--font-editorial);
      font-style: italic;
      font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      line-height: 1.3;
      color: rgba(244,237,224,0.75);
      letter-spacing: -0.015em;
    }

    /* STORY */
    .story { padding: 80px 0; border-top: 1px solid var(--border); }
    .story-inner { max-width: 720px; }

    /* QUALS */
    .quals { padding: 60px 0; border-top: 1px solid var(--border); }
    .quals-list {
      list-style: none;
      padding: 0;
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .quals-list li {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--breath);
      padding-left: 20px;
      position: relative;
    }
    .quals-list li::before {
      content: '—';
      position: absolute;
      left: 0;
      color: var(--heat);
    }

    /* WHY */
    .why { padding: 60px 0; border-top: 1px solid var(--border); }
    .why .wrap { max-width: 720px; }

    /* PRESS */
    .press { padding: 60px 0; border-top: 1px solid var(--border); }
    .press-strip { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
    .press-item {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      border: 1px solid var(--border);
      padding: 8px 16px;
      border-radius: 2px;
      text-decoration: none;
      transition: color 0.2s, border-color 0.2s;
    }
    .press-item:hover { color: var(--breath); border-color: var(--breath); }

    /* CTAS */
    .ctas { padding: 80px 0; border-top: 1px solid var(--border); }
    .ctas-inner { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .cta-card {
      background: var(--mist);
      border: 1px solid var(--border);
      padding: 28px 24px;
      border-radius: 2px;
      text-decoration: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: border-color 0.2s;
    }
    .cta-card:hover { border-color: var(--pulse); }
    .cta-label {
      font-family: var(--font-display);
      font-size: 1.2rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      color: var(--breath);
    }
    .cta-arrow { font-size: 1.4rem; color: var(--pulse); }

    @media (max-width: 900px) {
      .hero-inner { grid-template-columns: 1fr; gap: 32px; }
      .hero-img img { max-width: 360px; }
      .ctas-inner { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) { .wrap { padding: 0 24px; } }
  </style>
  ```

- [ ] **Step 2: Install `@portabletext/astro`**

  ```bash
  pnpm add @portabletext/astro
  ```

- [ ] **Step 3: Verify in browser**

  Open http://localhost:4321/about. Verify:
  - Hero grid: placeholder or real portrait on left, "Emma." headline on right
  - If About Page has content in Sanity, founder story renders as rich text
  - Qualifications list renders with Heat `—` markers
  - Three CTA cards at the bottom link correctly
  - No broken imports or TypeScript errors in the terminal

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/about.astro
  git commit -m "feat: add About page with Sanity rich text, qualifications, press strip, CTAs"
  ```

---

## Task 3: Coaching page

- [ ] **Step 1: Create `src/pages/coaching.astro`**

  ```astro
  ---
  import BaseLayout from '../layouts/BaseLayout.astro';
  import Header from '../components/Header.astro';
  import Footer from '../components/Footer.astro';
  import SectionLabel from '../components/SectionLabel.astro';
  import { client } from '../lib/sanity';
  import { COACHING_QUERY } from '../lib/queries';

  const coaching = await client.fetch(COACHING_QUERY);
  ---
  <BaseLayout
    title="1:1 Coaching — VIRRA"
    description="Bespoke coaching for women runners. Cycle-aware training, nutrition, and real accountability. Three tiers from £50/month."
  >
    <Header />
    <main>

      <!-- HERO -->
      <section class="c-hero">
        <div class="wrap">
          <SectionLabel text="1:1 Coaching with Emma" />
          <h1>Train with purpose.</h1>
          {coaching?.heroTagline && (
            <p class="c-tagline">{coaching.heroTagline}</p>
          )}
        </div>
      </section>

      <!-- WHO IT'S FOR -->
      {coaching?.whoItsFor?.length > 0 && (
        <section class="who">
          <div class="wrap">
            <SectionLabel text="Who it's for" />
            <ul class="who-list">
              {coaching.whoItsFor.map((item: string) => (
                <li>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <!-- HOW IT WORKS -->
      <section class="how">
        <div class="wrap">
          <SectionLabel text="How it works" />
          <div class="steps-grid">
            <div class="step">
              <span class="step-num">01</span>
              <h3>Enquire</h3>
              <p>Fill in the form below. Tell Emma about your goals and your running history.</p>
            </div>
            <div class="step">
              <span class="step-num">02</span>
              <h3>Consult</h3>
              <p>Emma will get back to you within 48 hours to arrange a free 20-minute call.</p>
            </div>
            <div class="step">
              <span class="step-num">03</span>
              <h3>Start</h3>
              <p>Your first programme lands on day one. Coaching begins immediately.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- TIERS -->
      {coaching?.tiers?.length > 0 && (
        <section class="tiers">
          <div class="wrap">
            <SectionLabel text="Tiers" />
            <div class="tiers-grid">
              {coaching.tiers.map((tier: any) => (
                <div class:list={['tier-card', { featured: tier.featured }]}>
                  <span class="tier-tag">{tier.tag}</span>
                  <div class="tier-price">£{tier.price}<small>/mo</small></div>
                  <p class="tier-desc">{tier.description}</p>
                  <ul class="tier-features">
                    {tier.features.map((f: string) => (
                      <li>{f}</li>
                    ))}
                  </ul>
                  <a href="#enquire" class="tier-cta">Enquire →</a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <!-- TESTIMONIALS -->
      {coaching?.testimonials?.length > 0 && (
        <section class="testimonials">
          <div class="wrap">
            <SectionLabel text="What clients say" />
            <div class="testi-grid">
              {coaching.testimonials.map((t: any) => (
                <div class="testi-card">
                  <p class="testi-quote">"{t.quote}"</p>
                  <span class="testi-name">— {t.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <!-- FAQ -->
      {coaching?.faq?.length > 0 && (
        <section class="faq">
          <div class="wrap">
            <SectionLabel text="FAQ" />
            <div class="faq-list">
              {coaching.faq.map((item: any, i: number) => (
                <details class="faq-item">
                  <summary class="faq-q">{item.question}</summary>
                  <p class="faq-a">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <!-- ENQUIRY FORM -->
      <section class="enquire" id="enquire">
        <div class="wrap">
          <SectionLabel text="Get started" />
          <h2>Enquire.</h2>
          <p class="enquire-sub">Fill in the form and Emma will be in touch within 48 hours.</p>
          <form class="enq-form" id="enq-form" novalidate>
            <input type="text" name="_hp" style="display:none" tabindex="-1" autocomplete="off" />
            <div class="field-row">
              <label>
                <span>Full name *</span>
                <input type="text" name="name" required autocomplete="name" />
              </label>
              <label>
                <span>Email *</span>
                <input type="email" name="email" required autocomplete="email" />
              </label>
            </div>
            <div class="field-row">
              <label>
                <span>Tier interested in *</span>
                <select name="tier" required>
                  <option value="">Select...</option>
                  <option>Standard (£100/mo)</option>
                  <option>Premium (£150/mo)</option>
                  <option>Nutrition Only (£50/mo)</option>
                  <option>Not sure yet</option>
                </select>
              </label>
              <label>
                <span>Current running level *</span>
                <select name="level" required>
                  <option value="">Select...</option>
                  <option>Complete beginner</option>
                  <option>Recreational (occasional 5K–10K)</option>
                  <option>Intermediate (half marathon / consistent training)</option>
                  <option>Advanced (marathon / competitive)</option>
                </select>
              </label>
            </div>
            <label class="full">
              <span>Your goal *</span>
              <textarea name="goal" required rows="3" placeholder="e.g. Run my first half marathon in under 2 hours by October"></textarea>
            </label>
            <div class="field-row">
              <label>
                <span>Preferred start month</span>
                <input type="text" name="startMonth" placeholder="e.g. July 2026" />
              </label>
              <label>
                <span>How did you hear about VIRRA?</span>
                <input type="text" name="referral" />
              </label>
            </div>
            <label class="checkbox-label">
              <input type="checkbox" name="newsletter" />
              <span>Subscribe me to Run Hot (the VIRRA newsletter)</span>
            </label>
            <button type="submit" class="submit-btn">Send enquiry</button>
          </form>
          <p class="enq-ok" id="enq-ok" hidden>Done — Emma will be in touch within 48 hours.</p>
          <p class="enq-err" id="enq-err" hidden>Something went wrong. Email <a href="mailto:hello@virra.app">hello@virra.app</a> directly.</p>
        </div>
      </section>

    </main>
    <Footer />
  </BaseLayout>

  <script>
    const form = document.getElementById('enq-form') as HTMLFormElement;
    const ok = document.getElementById('enq-ok') as HTMLElement;
    const err = document.getElementById('enq-err') as HTMLElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const fd = new FormData(form);
      const payload = {
        _hp: fd.get('_hp'),
        name: fd.get('name'),
        email: fd.get('email'),
        tier: fd.get('tier'),
        level: fd.get('level'),
        goal: fd.get('goal'),
        startMonth: fd.get('startMonth'),
        referral: fd.get('referral'),
        newsletter: fd.get('newsletter') === 'on',
      };

      const res = await fetch('/api/coaching-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        form.hidden = true;
        ok.hidden = false;
      } else {
        btn.disabled = false;
        btn.textContent = 'Send enquiry';
        err.hidden = false;
      }
    });
  </script>

  <style>
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0 48px; }

    /* HERO */
    .c-hero { padding: 100px 0 60px; }
    .c-hero h1 {
      font-family: var(--font-display);
      font-size: clamp(4rem, 11vw, 9rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      color: var(--breath);
      margin: 12px 0 20px;
    }
    .c-tagline {
      font-family: var(--font-editorial);
      font-style: italic;
      font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      color: rgba(244,237,224,0.72);
      letter-spacing: -0.015em;
      line-height: 1.3;
    }

    /* WHO */
    .who { padding: 60px 0; border-top: 1px solid var(--border); }
    .who-list { list-style: none; padding: 0; margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
    .who-list li {
      font-size: 1rem;
      color: rgba(244,237,224,0.8);
      padding-left: 20px;
      position: relative;
    }
    .who-list li::before { content: '—'; position: absolute; left: 0; color: var(--pulse); }

    /* HOW */
    .how { padding: 60px 0; border-top: 1px solid var(--border); }
    .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
    .step { background: var(--mist); border: 1px solid var(--border); padding: 28px 24px; border-radius: 2px; }
    .step-num {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.2em;
      color: var(--heat);
      display: block;
      margin-bottom: 12px;
    }
    .step h3 {
      font-family: var(--font-display);
      font-size: 1.6rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      line-height: 0.95;
      color: var(--pulse);
      margin-bottom: 10px;
    }
    .step p { font-size: 0.9rem; line-height: 1.65; color: rgba(244,237,224,0.72); }

    /* TIERS */
    .tiers { padding: 80px 0; border-top: 1px solid var(--border); }
    .tiers-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
    .tier-card {
      background: var(--mist);
      border: 1px solid var(--border);
      padding: 28px 24px;
      border-radius: 2px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tier-card.featured { border-color: var(--pulse); }
    .tier-tag {
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--mile);
      background: var(--breath);
      padding: 3px 10px;
      border-radius: 3px;
      display: inline-block;
      align-self: flex-start;
    }
    .tier-card.featured .tier-tag { background: var(--pulse); }
    .tier-price {
      font-family: var(--font-display);
      font-size: 2.5rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      color: var(--breath);
      line-height: 1;
    }
    .tier-price small {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--muted);
      letter-spacing: 0;
    }
    .tier-desc {
      font-family: var(--font-editorial);
      font-style: italic;
      font-size: 0.95rem;
      line-height: 1.45;
      color: rgba(244,237,224,0.8);
    }
    .tier-features { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .tier-features li {
      font-size: 0.85rem;
      color: rgba(244,237,224,0.8);
      padding-bottom: 6px;
      border-bottom: 1px dashed var(--border);
    }
    .tier-features li:last-child { border-bottom: none; }
    .tier-cta {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--pulse);
      text-decoration: none;
      margin-top: auto;
    }
    .tier-cta:hover { text-decoration: underline; }

    /* TESTIMONIALS */
    .testimonials { padding: 80px 0; border-top: 1px solid var(--border); }
    .testi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
    .testi-card { background: var(--mist); border: 1px solid var(--border); padding: 28px 24px; border-radius: 2px; }
    .testi-quote {
      font-family: var(--font-editorial);
      font-style: italic;
      font-size: 1.1rem;
      line-height: 1.5;
      color: var(--breath);
      margin-bottom: 16px;
    }
    .testi-name { font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted); }

    /* FAQ */
    .faq { padding: 80px 0; border-top: 1px solid var(--border); }
    .faq-list { margin-top: 24px; display: flex; flex-direction: column; gap: 2px; }
    .faq-item { border: 1px solid var(--border); border-radius: 2px; }
    .faq-q {
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      color: var(--breath);
      padding: 18px 20px;
      cursor: pointer;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .faq-q::after { content: '+'; color: var(--pulse); font-family: var(--font-body); font-weight: 300; font-size: 1.4rem; }
    .faq-item[open] .faq-q::after { content: '−'; }
    .faq-a { padding: 0 20px 18px; font-size: 0.95rem; line-height: 1.7; color: rgba(244,237,224,0.75); }

    /* ENQUIRY FORM */
    .enquire { padding: 80px 0; border-top: 1px solid var(--border); }
    .enquire h2 {
      font-family: var(--font-display);
      font-size: clamp(3rem, 7vw, 6rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      margin: 8px 0 12px;
    }
    .enquire-sub { font-size: 0.95rem; color: var(--muted); margin-bottom: 32px; }
    .enq-form { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    label span {
      display: block;
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    input[type=text], input[type=email], select, textarea {
      width: 100%;
      background: rgba(244,237,224,0.03);
      border: 1px solid var(--border-strong);
      color: var(--breath);
      font-family: var(--font-body);
      font-size: 0.9rem;
      font-weight: 300;
      padding: 12px 16px;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--pulse); }
    select { cursor: pointer; }
    textarea { resize: vertical; }
    label.full { display: flex; flex-direction: column; }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }
    .checkbox-label input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--pulse); }
    .checkbox-label span {
      font-family: var(--font-body);
      font-size: 0.88rem;
      color: rgba(244,237,224,0.75);
      text-transform: none;
      letter-spacing: 0;
      margin-bottom: 0;
    }
    .submit-btn {
      align-self: flex-start;
      background: var(--pulse);
      color: var(--mile);
      border: none;
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 16px 32px;
      border-radius: 2px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .submit-btn:hover { background: #c8f020; }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .enq-ok { color: var(--pulse); font-size: 1rem; margin-top: 16px; }
    .enq-err { color: var(--dawn); font-size: 0.9rem; margin-top: 16px; }
    .enq-err a { color: var(--dawn); }

    @media (max-width: 768px) {
      .steps-grid, .tiers-grid, .testi-grid { grid-template-columns: 1fr; }
      .field-row { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) { .wrap { padding: 0 24px; } }
  </style>
  ```

- [ ] **Step 2: Verify in browser**

  Open http://localhost:4321/coaching. Verify:
  - Hero headline in Big Shoulders Display
  - Who It's For list renders if Sanity has data
  - How It Works three-step grid renders
  - Tiers render from Sanity (or show empty section if no Sanity data)
  - FAQ accordions open/close on click
  - Enquiry form submits: success message appears, Emma receives email, Google Sheet gets a row

- [ ] **Step 3: End-to-end form test**

  Fill in the form with real data (use a real email for the auto-reply test). Submit. Verify:
  1. Success message appears on page
  2. Emma's email (as configured in `EMMA_EMAIL`) receives a coaching notification
  3. The applicant email receives the auto-reply
  4. A new row appears in the Google Sheet

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/coaching.astro
  git commit -m "feat: add Coaching page with tiers, FAQ, testimonials, enquiry form"
  ```

---

**Plan 2 complete.** Homepage, About and Coaching are live.

Proceed to **Plan 3: Content & Tools** (`docs/superpowers/plans/2026-05-08-virra-site-content-tools.md`).
