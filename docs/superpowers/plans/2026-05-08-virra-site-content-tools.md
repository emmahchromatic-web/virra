# VIRRA Site — Plan 3: Content & Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plans 1 and 2 must be complete. All foundations, global components, and core pages are in place.

**Goal:** Build the Advice hub (article index + article template + RSS), the three-mode Pace Calculator, the four legal/utility pages, and the cookie consent banner. Remove all remaining placeholder routes. Final cleanup and audit.

**Architecture:** Advice pages use `getStaticPaths` with Sanity GROQ queries for static generation. Pace Calculator is fully client-side (vanilla TypeScript, no backend). Calculator logic is extracted to `src/lib/calculator.ts` and tested with Vitest. Legal pages use `LegalLayout.astro` and pull content from Sanity.

**Tech Stack:** Astro 6, Sanity v3, `@portabletext/astro`, Vitest.

---

## File map

| Action | Path |
|---|---|
| Create | `src/pages/advice/index.astro` |
| Create | `src/pages/advice/[slug].astro` |
| Create | `src/pages/advice/rss.xml.ts` |
| Create | `src/lib/calculator.ts` |
| Create | `src/lib/calculator.test.ts` |
| Create | `src/pages/pace-calculator.astro` |
| Create | `src/pages/privacy.astro` |
| Create | `src/pages/terms.astro` |
| Create | `src/pages/cookies.astro` |
| Create | `src/pages/contact.astro` |
| Create | `src/components/CookieBanner.astro` |
| Modify | `src/layouts/BaseLayout.astro` |

---

## Task 1: Advice index page

- [ ] **Step 1: Create `src/pages/advice/index.astro`**

  ```astro
  ---
  export const prerender = false;

  import BaseLayout from '../../layouts/BaseLayout.astro';
  import Header from '../../components/Header.astro';
  import Footer from '../../components/Footer.astro';
  import SectionLabel from '../../components/SectionLabel.astro';
  import NewsletterForm from '../../components/NewsletterForm.astro';
  import ArticleCard from '../../components/ArticleCard.astro';
  import { client } from '../../lib/sanity';
  import { ALL_ARTICLES_QUERY, FEATURED_ARTICLE_QUERY } from '../../lib/queries';

  const CATEGORIES = ['All', 'Training', 'Nutrition', 'Cycle & Hormones', 'Mindset', 'Race Day'];
  const selectedCat = Astro.url.searchParams.get('cat') ?? 'All';

  const [allArticles, featured] = await Promise.all([
    client.fetch(ALL_ARTICLES_QUERY),
    client.fetch(FEATURED_ARTICLE_QUERY),
  ]);

  const PAGE_SIZE = 12;
  const pageParam = Number(Astro.url.searchParams.get('page') ?? '1');
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const filtered = selectedCat === 'All'
    ? allArticles
    : allArticles.filter((a: any) => a.category === selectedCat);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  ---
  <BaseLayout
    title="Advice — VIRRA"
    description="Female-first articles on running, nutrition, cycle awareness and performance. Evidence-informed, honest, practical."
  >
    <Header />
    <main>

      <!-- HERO + NEWSLETTER -->
      <section class="advice-hero">
        <div class="wrap">
          <SectionLabel text="Run Hot · The VIRRA newsletter" />
          <h1>Advice.</h1>
          <p class="hero-sub">Female-first thinking on training, nutrition and the science behind how you run.</p>
          <div class="hero-nl">
            <NewsletterForm source="advice" label="Run Hot — delivered to The Pack every week." />
          </div>
        </div>
      </section>

      <!-- FEATURED -->
      {featured && (
        <section class="featured">
          <div class="wrap">
            <SectionLabel text="Featured" />
            <a href={`/advice/${featured.slug.current}`} class="featured-card">
              <div class="fc-meta">
                <span class="fc-cat">{featured.category}</span>
              </div>
              <h2 class="fc-title">{featured.title}</h2>
              {featured.dek && <p class="fc-dek">{featured.dek}</p>}
            </a>
          </div>
        </section>
      )}

      <!-- CATEGORY FILTER -->
      <section class="filters">
        <div class="wrap">
          <div class="filter-bar" role="navigation" aria-label="Filter by category">
            {CATEGORIES.map((cat) => (
              <a
                href={cat === 'All' ? '/advice' : `/advice?cat=${encodeURIComponent(cat)}`}
                class:list={['filter-pill', { active: selectedCat === cat }]}
                aria-current={selectedCat === cat ? 'true' : undefined}
              >
                {cat}
              </a>
            ))}
          </div>
        </div>
      </section>

      <!-- ARTICLE GRID -->
      <section class="articles">
        <div class="wrap">
          {paged.length > 0
            ? (
              <div class="articles-grid">
                {paged.map((a: any) => (
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
            )
            : <p class="empty">No articles in this category yet.</p>
          }

          {totalPages > 1 && (
            <nav class="pagination" aria-label="Pagination">
              {page > 1 && (
                <a href={`/advice?${selectedCat !== 'All' ? `cat=${encodeURIComponent(selectedCat)}&` : ''}page=${page - 1}`} class="page-btn">← Previous</a>
              )}
              <span class="page-info">{page} / {totalPages}</span>
              {page < totalPages && (
                <a href={`/advice?${selectedCat !== 'All' ? `cat=${encodeURIComponent(selectedCat)}&` : ''}page=${page + 1}`} class="page-btn">Next →</a>
              )}
            </nav>
          )}
        </div>
      </section>

      <!-- MID-PAGE NEWSLETTER -->
      <section class="mid-nl">
        <div class="wrap">
          <NewsletterForm source="advice" label="Run Hot — sent to The Pack every week." />
        </div>
      </section>

    </main>
    <Footer />
  </BaseLayout>

  <style>
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0 48px; }

    .advice-hero { padding: 100px 0 60px; }
    .advice-hero h1 {
      font-family: var(--font-display);
      font-size: clamp(5rem, 14vw, 11rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      color: var(--breath);
      margin: 12px 0 20px;
    }
    .hero-sub { font-size: 1rem; line-height: 1.75; color: rgba(244,237,224,0.65); max-width: 540px; margin-bottom: 32px; }
    .hero-nl { max-width: 440px; }

    .featured { padding: 60px 0; border-top: 1px solid var(--border); }
    .featured-card {
      display: block;
      text-decoration: none;
      background: var(--mist);
      border: 1px solid var(--border);
      padding: 36px;
      border-radius: 2px;
      margin-top: 20px;
      transition: border-color 0.2s;
    }
    .featured-card:hover { border-color: var(--pulse); }
    .fc-meta { margin-bottom: 16px; }
    .fc-cat {
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--heat);
    }
    .fc-title {
      font-family: var(--font-display);
      font-size: clamp(2rem, 4vw, 3.5rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      line-height: 0.92;
      color: var(--breath);
      margin-bottom: 14px;
    }
    .fc-dek { font-size: 1rem; line-height: 1.65; color: rgba(244,237,224,0.65); max-width: 640px; }

    .filters { padding: 32px 0; border-top: 1px solid var(--border); }
    .filter-bar { display: flex; flex-wrap: wrap; gap: 8px; }
    .filter-pill {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      border: 1px solid var(--border-strong);
      color: var(--muted);
      padding: 6px 16px;
      border-radius: 100px;
      text-decoration: none;
      transition: color 0.2s, border-color 0.2s;
    }
    .filter-pill:hover, .filter-pill.active { color: var(--breath); border-color: var(--pulse); }

    .articles { padding: 40px 0 60px; }
    .articles-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .empty { color: var(--muted); font-size: 0.9rem; padding: 40px 0; }

    .pagination { display: flex; align-items: center; gap: 20px; margin-top: 40px; }
    .page-btn {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--pulse);
      text-decoration: none;
    }
    .page-btn:hover { text-decoration: underline; }
    .page-info { font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.12em; color: var(--muted); }

    .mid-nl { padding: 60px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }

    @media (max-width: 900px) { .articles-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 640px) {
      .wrap { padding: 0 24px; }
      .articles-grid { grid-template-columns: 1fr; }
    }
  </style>
  ```

  **Important:** This page uses `Astro.url.searchParams` for live filtering and pagination, so it must be server-rendered. The `export const prerender = false;` line at the top of the frontmatter (already included above) handles this — do not remove it.

- [ ] **Step 2: Verify**

  ```bash
  pnpm dev
  ```
  Open http://localhost:4321/advice. Verify:
  - Hero + newsletter form visible
  - Featured article card appears if one is marked `featured: true` in Sanity
  - Category filter pills render
  - Article grid shows ArticleCards
  - Clicking a category pill filters the grid

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/advice/index.astro
  git commit -m "feat: add Advice index with category filter, pagination, newsletter forms"
  ```

---

## Task 2: Article template + RSS feed

- [ ] **Step 1: Create `src/pages/advice/[slug].astro`**

  ```astro
  ---
  import BaseLayout from '../../layouts/BaseLayout.astro';
  import Header from '../../components/Header.astro';
  import Footer from '../../components/Footer.astro';
  import SectionLabel from '../../components/SectionLabel.astro';
  import ArticleCard from '../../components/ArticleCard.astro';
  import NewsletterForm from '../../components/NewsletterForm.astro';
  import { client, urlFor } from '../../lib/sanity';
  import { ARTICLE_SLUGS_QUERY, ARTICLE_BY_SLUG_QUERY, RELATED_ARTICLES_QUERY } from '../../lib/queries';
  import { PortableText } from '@portabletext/astro';

  export async function getStaticPaths() {
    const slugs: { slug: string }[] = await client.fetch(ARTICLE_SLUGS_QUERY);
    return slugs.map(({ slug }) => ({ params: { slug } }));
  }

  const { slug } = Astro.params;
  const [article, related] = await Promise.all([
    client.fetch(ARTICLE_BY_SLUG_QUERY, { slug }),
    client.fetch(RELATED_ARTICLES_QUERY, { slug, category: '' }).then(async (r: any[]) => {
      if (r.length === 0) {
        const a = await client.fetch(ARTICLE_BY_SLUG_QUERY, { slug });
        return client.fetch(RELATED_ARTICLES_QUERY, { slug, category: a?.category ?? '' });
      }
      return r;
    }),
  ]);

  if (!article) {
    return Astro.redirect('/advice');
  }

  const date = new Date(article.publishedDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const wordCount = article.body
    ?.flatMap((b: any) => b._type === 'block' ? b.children?.map((c: any) => c.text ?? '') : [])
    .join(' ').split(/\s+/).length ?? 0;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const heroImageUrl = article.heroImage ? urlFor(article.heroImage).width(1200).height(630).url() : null;
  ---
  <BaseLayout
    title={`${article.seoTitle ?? article.title} — VIRRA`}
    description={article.seoDescription ?? article.dek ?? ''}
    ogImage={article.ogImage ? urlFor(article.ogImage).width(1200).height(630).url() : (heroImageUrl ?? undefined)}
    ogType="article"
  >
    <Header />
    <main class="article-main">

      <!-- HERO IMAGE -->
      {heroImageUrl && (
        <div class="art-hero-img">
          <img src={heroImageUrl} alt={article.title} width="1200" height="630" />
        </div>
      )}

      <div class="art-wrap">

        <!-- META -->
        <div class="art-meta">
          <SectionLabel text={article.category} />
          <h1 class="art-title">{article.title}</h1>
          {article.dek && <p class="art-dek">{article.dek}</p>}
          <div class="art-byline">
            <span>{article.author ?? 'Emma'}</span>
            <span class="dot">·</span>
            <time datetime={article.publishedDate}>{date}</time>
            <span class="dot">·</span>
            <span>{readTime} min read</span>
          </div>
        </div>

        <!-- BODY -->
        <div class="prose art-body">
          <PortableText value={article.body} />
        </div>

        <!-- END-OF-ARTICLE NEWSLETTER -->
        <div class="art-nl">
          <SectionLabel text="Enjoyed this?" />
          <p class="art-nl-sub">Run Hot lands in The Pack's inbox every week — female-first running, science you can actually use.</p>
          <NewsletterForm source="advice" />
        </div>

        <!-- RELATED -->
        {related?.length > 0 && (
          <div class="related">
            <SectionLabel text="More from VIRRA" />
            <div class="related-grid">
              {related.map((a: any) => (
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
          </div>
        )}

      </div>
    </main>
    <Footer />
  </BaseLayout>

  <style>
    .article-main { padding-bottom: 80px; }
    .art-hero-img { width: 100%; max-height: 520px; overflow: hidden; }
    .art-hero-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .art-wrap { max-width: 760px; margin: 0 auto; padding: 56px 48px 0; }

    .art-meta { margin-bottom: 40px; }
    .art-title {
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 6vw, 5rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.03em;
      line-height: 0.88;
      color: var(--breath);
      margin: 12px 0 16px;
    }
    .art-dek {
      font-family: var(--font-editorial);
      font-style: italic;
      font-size: 1.3rem;
      line-height: 1.4;
      color: rgba(244,237,224,0.75);
      margin-bottom: 20px;
      letter-spacing: -0.015em;
    }
    .art-byline {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .dot { opacity: 0.4; }

    .art-body { margin-bottom: 60px; }

    .art-nl {
      padding: 40px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      margin-bottom: 60px;
    }
    .art-nl-sub { font-size: 0.95rem; line-height: 1.65; color: rgba(244,237,224,0.65); margin: 8px 0 20px; }

    .related { padding-top: 40px; }
    .related-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 20px; }

    @media (max-width: 640px) {
      .art-wrap { padding: 40px 24px 0; }
      .related-grid { grid-template-columns: 1fr; }
    }
  </style>
  ```

  Note: The related articles query in `getStaticPaths` needs the article's category, but we don't have it at path-generation time. The workaround above fetches the article's category client-side in the component. This is fine — the page is statically generated at build time and the second fetch happens during the build, not at runtime.

  Simplify the related articles fetch by updating `RELATED_ARTICLES_QUERY` usage. In the frontmatter, replace the related articles fetch with:
  ```typescript
  const relatedArticles = article?.category
    ? await client.fetch(RELATED_ARTICLES_QUERY, { slug, category: article.category })
    : [];
  ```
  And remove the complex Promise.all above. The final frontmatter should be:
  ```typescript
  const { slug } = Astro.params;
  const article = await client.fetch(ARTICLE_BY_SLUG_QUERY, { slug });

  if (!article) return Astro.redirect('/advice');

  const related = await client.fetch(RELATED_ARTICLES_QUERY, {
    slug,
    category: article.category ?? '',
  });
  // ... rest of the computations
  ```

- [ ] **Step 2: Create `src/pages/advice/rss.xml.ts`**

  ```typescript
  import { client } from '../../lib/sanity';
  import { ALL_ARTICLES_FOR_RSS_QUERY } from '../../lib/queries';

  export async function GET() {
    const articles = await client.fetch(ALL_ARTICLES_FOR_RSS_QUERY);

    const items = articles.map((a: any) => `
      <item>
        <title><![CDATA[${a.title}]]></title>
        <link>https://virra.app/advice/${a.slug}</link>
        <guid>https://virra.app/advice/${a.slug}</guid>
        <pubDate>${new Date(a.publishedDate).toUTCString()}</pubDate>
        ${a.dek ? `<description><![CDATA[${a.dek}]]></description>` : ''}
      </item>
    `).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
      <title>VIRRA — Run Hot</title>
      <link>https://virra.app/advice</link>
      <description>Female-first running, training and nutrition. Advice from VIRRA.</description>
      <language>en-GB</language>
      <atom:link href="https://virra.app/advice/rss.xml" rel="self" type="application/rss+xml"/>
      ${items}
    </channel>
  </rss>`;

    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
  ```

- [ ] **Step 3: Add RSS link to BaseLayout**

  In `src/layouts/BaseLayout.astro`, add inside `<head>`:
  ```html
  <link rel="alternate" type="application/rss+xml" title="VIRRA — Run Hot" href="/advice/rss.xml" />
  ```

- [ ] **Step 4: Add Schema.org Article markup to article page**

  In `src/pages/advice/[slug].astro`, add inside `<BaseLayout>` before `<Header />`:
  ```astro
  <script type="application/ld+json" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.dek ?? '',
    "datePublished": article.publishedDate,
    "author": { "@type": "Person", "name": article.author ?? 'Emma' },
    "publisher": {
      "@type": "Organization",
      "name": "VIRRA",
      "url": "https://virra.app"
    },
    "url": `https://virra.app/advice/${article.slug.current}`,
    ...(heroImageUrl ? { "image": heroImageUrl } : {}),
  })} />
  ```

- [ ] **Step 5: Verify**

  In dev, navigate to http://localhost:4321/advice/[a slug from Sanity]. Verify:
  - Hero image, title, dek, byline render correctly
  - Article body renders as rich text with correct prose styles
  - End-of-article newsletter form is present
  - Related articles grid shows up to 2 articles
  - Visit http://localhost:4321/advice/rss.xml — valid XML with article items

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/advice/\[slug\].astro src/pages/advice/rss.xml.ts src/layouts/BaseLayout.astro
  git commit -m "feat: add article template with Schema.org markup, related articles, RSS feed"
  ```

---

## Task 3: Calculator logic (with tests)

- [ ] **Step 1: Create `src/lib/calculator.ts`**

  ```typescript
  // --- TYPES ---

  export type DistanceUnit = 'km' | 'mi';

  export interface PaceResult {
    paceSecsPerKm: number;
    paceSecsPerMile: number;
    totalSecs: number;
    distanceKm: number;
    splits: Split[];
  }

  export interface Split {
    label: string;
    paceDisplay: string;
  }

  export interface PredictionResult {
    riegelSecs: number;
    cameronSecs: number;
    display: string;
  }

  export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

  export interface PhaseInfo {
    phase: CyclePhase;
    dayInPhase: number;
    dayInCycle: number;
    paceModifier: number;
  }

  // --- UTILS ---

  export function secsToHMS(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.round(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  export function secsToMMSS(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  export function parseHMS(input: string): number {
    const parts = input.trim().split(':').map(Number);
    if (parts.some(Number.isNaN)) throw new Error('Invalid time format');
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0] * 60;
    throw new Error('Invalid time format');
  }

  export function parseMMSS(input: string): number {
    return parseHMS(input);
  }

  const KM_PER_MILE = 1.60934;

  export function distanceToKm(value: number, unit: DistanceUnit): number {
    return unit === 'mi' ? value * KM_PER_MILE : value;
  }

  export function kmToMiles(km: number): number {
    return km / KM_PER_MILE;
  }

  // --- MODE 1: PACE / TIME / DISTANCE ---

  export function calcTime(distanceKm: number, paceSecsPerKm: number): number {
    return distanceKm * paceSecsPerKm;
  }

  export function calcPace(distanceKm: number, totalSecs: number): number {
    return totalSecs / distanceKm;
  }

  export function calcDistance(totalSecs: number, paceSecsPerKm: number): number {
    return totalSecs / paceSecsPerKm;
  }

  export function buildSplits(distanceKm: number, paceSecsPerKm: number, unit: DistanceUnit): Split[] {
    const splits: Split[] = [];
    const totalUnits = unit === 'km' ? distanceKm : kmToMiles(distanceKm);
    const pacePerUnit = unit === 'km' ? paceSecsPerKm : paceSecsPerKm * KM_PER_MILE;
    const fullSplits = Math.floor(totalUnits);
    for (let i = 1; i <= fullSplits; i++) {
      splits.push({ label: `${unit === 'km' ? i : i} ${unit}`, paceDisplay: secsToMMSS(pacePerUnit) });
    }
    const remainder = totalUnits - fullSplits;
    if (remainder > 0.01) {
      splits.push({ label: `+${remainder.toFixed(2)} ${unit}`, paceDisplay: secsToMMSS(pacePerUnit) });
    }
    return splits;
  }

  // --- MODE 2: RACE TIME PREDICTOR (Riegel + Cameron) ---

  const KNOWN_DISTANCES_KM: Record<string, number> = {
    '5K': 5,
    '10K': 10,
    'Half Marathon': 21.0975,
    'Marathon': 42.195,
  };

  export function getKnownDistanceKm(label: string): number | undefined {
    return KNOWN_DISTANCES_KM[label];
  }

  export function riegelPredict(t1Secs: number, d1Km: number, d2Km: number): number {
    return t1Secs * Math.pow(d2Km / d1Km, 1.06);
  }

  export function cameronPredict(t1Secs: number, d1Km: number, d2Km: number): number {
    const a = 13.49681 - 0.000030363 * d1Km + (835.7114 / Math.pow(d1Km, 0.7905));
    const b = 13.49681 - 0.000030363 * d2Km + (835.7114 / Math.pow(d2Km, 0.7905));
    return (t1Secs / d1Km) * (a / b) * d2Km;
  }

  // --- MODE 3: CYCLE-AWARE PACE ---

  export function daysBetween(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  export function getCurrentPhase(periodStart: Date, cycleLength: number, today: Date): PhaseInfo {
    const dayInCycle = ((daysBetween(periodStart, today) % cycleLength) + cycleLength) % cycleLength;

    let phase: CyclePhase;
    let dayInPhase: number;
    let paceModifier: number;

    if (dayInCycle < 5) {
      phase = 'menstrual';
      dayInPhase = dayInCycle + 1;
      paceModifier = -0.10;
    } else if (dayInCycle < 13) {
      phase = 'follicular';
      dayInPhase = dayInCycle - 4;
      paceModifier = 0.05;
    } else if (dayInCycle < 16) {
      phase = 'ovulatory';
      dayInPhase = dayInCycle - 12;
      paceModifier = 0.08;
    } else {
      phase = 'luteal';
      dayInPhase = dayInCycle - 15;
      paceModifier = -0.05;
    }

    return { phase, dayInPhase, dayInCycle, paceModifier };
  }

  export function applyPaceModifier(basePaceSecsPerKm: number, modifier: number): number {
    return basePaceSecsPerKm * (1 - modifier);
  }
  ```

- [ ] **Step 2: Create `src/lib/calculator.test.ts`**

  ```typescript
  import { describe, it, expect } from 'vitest';
  import {
    secsToHMS,
    secsToMMSS,
    parseHMS,
    distanceToKm,
    kmToMiles,
    calcTime,
    calcPace,
    calcDistance,
    buildSplits,
    riegelPredict,
    cameronPredict,
    getCurrentPhase,
    applyPaceModifier,
    daysBetween,
  } from './calculator';

  describe('secsToHMS', () => {
    it('formats sub-hour times as M:SS', () => {
      expect(secsToHMS(312)).toBe('5:12');
    });
    it('formats over-hour times as H:MM:SS', () => {
      expect(secsToHMS(3723)).toBe('1:02:03');
    });
    it('pads single-digit seconds', () => {
      expect(secsToHMS(65)).toBe('1:05');
    });
  });

  describe('parseHMS', () => {
    it('parses M:SS', () => {
      expect(parseHMS('5:12')).toBe(312);
    });
    it('parses H:MM:SS', () => {
      expect(parseHMS('1:02:03')).toBe(3723);
    });
    it('throws on invalid input', () => {
      expect(() => parseHMS('abc')).toThrow();
    });
  });

  describe('distanceToKm', () => {
    it('returns km unchanged', () => {
      expect(distanceToKm(10, 'km')).toBe(10);
    });
    it('converts miles to km', () => {
      expect(distanceToKm(1, 'mi')).toBeCloseTo(1.60934);
    });
  });

  describe('calcTime', () => {
    it('calculates total time from distance and pace', () => {
      expect(calcTime(10, 312)).toBe(3120);
    });
  });

  describe('calcPace', () => {
    it('calculates pace from distance and time', () => {
      expect(calcPace(10, 3120)).toBe(312);
    });
  });

  describe('calcDistance', () => {
    it('calculates distance from time and pace', () => {
      expect(calcDistance(3120, 312)).toBeCloseTo(10);
    });
  });

  describe('buildSplits', () => {
    it('generates one split per km for a 3km run', () => {
      const splits = buildSplits(3, 312, 'km');
      expect(splits).toHaveLength(3);
      expect(splits[0].label).toBe('1 km');
      expect(splits[0].paceDisplay).toBe('5:12');
    });
    it('includes remainder split', () => {
      const splits = buildSplits(3.5, 300, 'km');
      expect(splits).toHaveLength(4);
      expect(splits[3].label).toContain('+0.50');
    });
  });

  describe('riegelPredict', () => {
    it('predicts marathon from half marathon with Riegel formula', () => {
      const halfTimeSecs = 2 * 3600; // 2:00:00
      const prediction = riegelPredict(halfTimeSecs, 21.0975, 42.195);
      expect(prediction).toBeGreaterThan(4 * 3600);
      expect(prediction).toBeLessThan(4.5 * 3600);
    });
    it('returns same time for same distance', () => {
      expect(riegelPredict(3600, 10, 10)).toBeCloseTo(3600);
    });
  });

  describe('cameronPredict', () => {
    it('predicts a 10K time from a 5K result', () => {
      const fiveKSecs = 25 * 60;
      const prediction = cameronPredict(fiveKSecs, 5, 10);
      expect(prediction).toBeGreaterThan(50 * 60);
      expect(prediction).toBeLessThan(60 * 60);
    });
  });

  describe('getCurrentPhase', () => {
    it('returns menstrual for day 1', () => {
      const start = new Date('2026-05-01');
      const today = new Date('2026-05-01');
      const result = getCurrentPhase(start, 28, today);
      expect(result.phase).toBe('menstrual');
      expect(result.dayInPhase).toBe(1);
    });
    it('returns follicular for day 6', () => {
      const start = new Date('2026-05-01');
      const today = new Date('2026-05-06');
      const result = getCurrentPhase(start, 28, today);
      expect(result.phase).toBe('follicular');
    });
    it('returns ovulatory around day 14', () => {
      const start = new Date('2026-05-01');
      const today = new Date('2026-05-14');
      const result = getCurrentPhase(start, 28, today);
      expect(result.phase).toBe('ovulatory');
    });
    it('returns luteal for day 17', () => {
      const start = new Date('2026-05-01');
      const today = new Date('2026-05-17');
      const result = getCurrentPhase(start, 28, today);
      expect(result.phase).toBe('luteal');
    });
    it('wraps correctly at cycle boundary', () => {
      const start = new Date('2026-04-01');
      const today = new Date('2026-05-01');
      const result = getCurrentPhase(start, 30, today);
      expect(result.dayInCycle).toBe(0);
      expect(result.phase).toBe('menstrual');
    });
  });

  describe('applyPaceModifier', () => {
    it('increases pace seconds (slows down) with negative modifier', () => {
      const adjusted = applyPaceModifier(300, -0.10);
      expect(adjusted).toBeCloseTo(330);
    });
    it('decreases pace seconds (speeds up) with positive modifier', () => {
      const adjusted = applyPaceModifier(300, 0.05);
      expect(adjusted).toBeCloseTo(285);
    });
  });
  ```

- [ ] **Step 3: Run tests — verify they all pass**

  ```bash
  pnpm test
  ```
  Expected output:
  ```
  ✓ src/lib/calculator.test.ts (18 tests)
  Test Files  1 passed (1)
  Tests  18 passed (18)
  ```

  If any test fails, fix `calculator.ts` before continuing.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/calculator.ts src/lib/calculator.test.ts
  git commit -m "feat: add calculator library with full Vitest test coverage"
  ```

---

## Task 4: Pace Calculator page

- [ ] **Step 1: Create `src/pages/pace-calculator.astro`**

  ```astro
  ---
  import BaseLayout from '../layouts/BaseLayout.astro';
  import Header from '../components/Header.astro';
  import Footer from '../components/Footer.astro';
  import SectionLabel from '../components/SectionLabel.astro';
  import NewsletterForm from '../components/NewsletterForm.astro';
  import { client } from '../lib/sanity';
  import { CYCLE_CALCULATOR_COPY_QUERY } from '../lib/queries';

  const cycleCopy = await client.fetch(CYCLE_CALCULATOR_COPY_QUERY);

  const cycleDefaultCopy = {
    menstrual: {
      guidance: 'Reduce effort by 10–15%. Run by feel, not by pace.',
      why: 'Progesterone and oestrogen are at their lowest. Energy reserves are reduced and body temperature runs slightly higher.',
    },
    follicular: {
      guidance: 'This is your window to push. Chase the PBs.',
      why: 'Rising oestrogen improves muscle recovery and pain tolerance. VO₂ max is at its seasonal peak.',
    },
    ovulatory: {
      guidance: 'Peak performance window. Go hard.',
      why: 'LH and oestrogen surge gives a brief window of maximal power output. Joint laxity increases — warm up properly.',
    },
    luteal: {
      guidance: 'Maintain consistency, not intensity. Fuelling matters most now.',
      why: 'Higher progesterone shifts fuel use toward fat. Carbohydrate cravings are real — honour them with quality fuel.',
    },
  };

  const copy = {
    menstrual: { ...cycleDefaultCopy.menstrual, ...(cycleCopy?.menstrual ?? {}) },
    follicular: { ...cycleDefaultCopy.follicular, ...(cycleCopy?.follicular ?? {}) },
    ovulatory: { ...cycleDefaultCopy.ovulatory, ...(cycleCopy?.ovulatory ?? {}) },
    luteal: { ...cycleDefaultCopy.luteal, ...(cycleCopy?.luteal ?? {}) },
  };
  ---
  <BaseLayout
    title="Running Pace Calculator — VIRRA"
    description="Pace, time and distance calculator for runners. Race time predictor using Riegel formula. Cycle-aware training paces — adjust for your menstrual phase."
  >
    <Header />
    <main class="calc-main">
      <div class="wrap">
        <SectionLabel text="Free tool" />
        <h1>Pace Calculator.</h1>
        <p class="calc-sub">Three tools. All client-side. No data stored.</p>

        <!-- TABS -->
        <div class="tabs" role="tablist" aria-label="Calculator modes">
          <button class="tab active" role="tab" aria-selected="true" aria-controls="tab-pace" id="btn-pace">
            Pace / Time / Distance
          </button>
          <button class="tab" role="tab" aria-selected="false" aria-controls="tab-predictor" id="btn-predictor">
            Race Predictor
          </button>
          <button class="tab" role="tab" aria-selected="false" aria-controls="tab-cycle" id="btn-cycle">
            Cycle-Aware
          </button>
        </div>

        <!-- TAB 1: PACE / TIME / DISTANCE -->
        <div id="tab-pace" class="tab-panel" role="tabpanel" aria-labelledby="btn-pace">
          <div class="calc-form">
            <div class="unit-toggle">
              <label><input type="radio" name="unit-pace" value="km" checked /> km</label>
              <label><input type="radio" name="unit-pace" value="mi" /> miles</label>
            </div>
            <div class="inputs-row">
              <label class="calc-label">
                <span>Distance</span>
                <input type="number" id="ptd-distance" placeholder="e.g. 10" min="0.1" step="0.01" />
              </label>
              <label class="calc-label">
                <span>Time (h:mm:ss or m:ss)</span>
                <input type="text" id="ptd-time" placeholder="e.g. 52:00" />
              </label>
              <label class="calc-label">
                <span>Pace (per unit)</span>
                <input type="text" id="ptd-pace" placeholder="e.g. 5:12" />
              </label>
            </div>
            <p class="calc-hint">Fill in any two — the third is calculated.</p>
            <button class="calc-btn" id="ptd-calc">Calculate</button>
            <div id="ptd-result" class="calc-result" hidden>
              <div class="result-grid">
                <div class="result-item"><span class="ri-label">Distance</span><span class="ri-val" id="ptd-r-dist">—</span></div>
                <div class="result-item"><span class="ri-label">Total time</span><span class="ri-val" id="ptd-r-time">—</span></div>
                <div class="result-item"><span class="ri-label">Pace /km</span><span class="ri-val" id="ptd-r-pace-km">—</span></div>
                <div class="result-item"><span class="ri-label">Pace /mi</span><span class="ri-val" id="ptd-r-pace-mi">—</span></div>
              </div>
              <div class="splits-wrap">
                <p class="splits-label">Splits</p>
                <table class="splits-table" id="ptd-splits"></table>
              </div>
              <a href="" class="share-link" id="ptd-share">Share these results ↗</a>
            </div>
          </div>
        </div>

        <!-- TAB 2: RACE PREDICTOR -->
        <div id="tab-predictor" class="tab-panel hidden" role="tabpanel" aria-labelledby="btn-predictor">
          <div class="calc-form">
            <div class="inputs-row">
              <label class="calc-label">
                <span>Recent race distance</span>
                <select id="pred-d1">
                  <option value="5">5K</option>
                  <option value="10">10K</option>
                  <option value="21.0975" selected>Half Marathon</option>
                  <option value="42.195">Marathon</option>
                </select>
              </label>
              <label class="calc-label">
                <span>Your finish time (h:mm:ss)</span>
                <input type="text" id="pred-t1" placeholder="e.g. 2:00:00" />
              </label>
              <label class="calc-label">
                <span>Target distance</span>
                <select id="pred-d2">
                  <option value="5">5K</option>
                  <option value="10">10K</option>
                  <option value="21.0975">Half Marathon</option>
                  <option value="42.195" selected>Marathon</option>
                </select>
              </label>
            </div>
            <button class="calc-btn" id="pred-calc">Predict</button>
            <div id="pred-result" class="calc-result" hidden>
              <div class="result-grid">
                <div class="result-item"><span class="ri-label">Riegel prediction</span><span class="ri-val" id="pred-r-riegel">—</span></div>
                <div class="result-item"><span class="ri-label">Cameron prediction</span><span class="ri-val" id="pred-r-cameron">—</span></div>
              </div>
              <p class="pred-note">Riegel: T₂ = T₁ × (D₂/D₁)^1.06 · Cameron: adjusts for event-specific efficiency factors. Both assume consistent training and conditions.</p>
              <a href="" class="share-link" id="pred-share">Share these results ↗</a>
            </div>
          </div>
        </div>

        <!-- TAB 3: CYCLE-AWARE -->
        <div id="tab-cycle" class="tab-panel hidden" role="tabpanel" aria-labelledby="btn-cycle">
          <div class="calc-form">
            <div class="inputs-row">
              <label class="calc-label">
                <span>Last period start date</span>
                <input type="date" id="cyc-date" />
              </label>
              <label class="calc-label">
                <span>Average cycle length (days)</span>
                <input type="number" id="cyc-length" value="28" min="21" max="40" />
              </label>
              <label class="calc-label">
                <span>Your easy pace (min:sec per km)</span>
                <input type="text" id="cyc-pace" placeholder="e.g. 6:00" />
              </label>
            </div>
            <button class="calc-btn" id="cyc-calc">Show my phases</button>
            <div id="cyc-result" class="calc-result" hidden>
              <div class="phase-grid" id="cyc-phases"></div>
              <p class="cycle-disclaimer">
                This tool adjusts training paces based on typical hormonal patterns across the menstrual cycle.
                It is informational only and is not medical advice. Every body is different —
                if something feels wrong, trust your body over any algorithm.
              </p>
              <a href="" class="share-link" id="cyc-share">Share these results ↗</a>
            </div>
          </div>
        </div>

        <!-- SAVE MY PACES -->
        <div class="save-paces">
          <SectionLabel text="Save my paces" />
          <p class="save-sub">Get a summary of your results in your inbox.</p>
          <NewsletterForm source="calculator" label="Run Hot — plus your paces in your first email." />
        </div>

      </div>
    </main>
    <Footer />
  </BaseLayout>

  <script>
    import {
      calcTime, calcPace, calcDistance,
      buildSplits, riegelPredict, cameronPredict,
      getCurrentPhase, applyPaceModifier,
      secsToHMS, secsToMMSS, parseHMS,
      distanceToKm, kmToMiles,
    } from '../lib/calculator';

    // --- TAB SWITCHING ---
    const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
    const panels = document.querySelectorAll<HTMLDivElement>('.tab-panel');

    function activateTab(id: string) {
      tabs.forEach((t) => {
        const active = t.id === `btn-${id}`;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      panels.forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${id}`));
      const url = new URL(location.href);
      url.hash = id;
      history.replaceState({}, '', url.toString());
    }

    tabs.forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.id.replace('btn-', '')));
    });

    // Restore tab from URL hash
    if (location.hash) {
      const h = location.hash.replace('#', '');
      if (['pace', 'predictor', 'cycle'].includes(h)) activateTab(h);
    }

    // --- TAB 1: PACE / TIME / DISTANCE ---
    document.getElementById('ptd-calc')!.addEventListener('click', () => {
      const unit = (document.querySelector<HTMLInputElement>('input[name="unit-pace"]:checked')?.value ?? 'km') as 'km' | 'mi';
      const distIn = (document.getElementById('ptd-distance') as HTMLInputElement).value;
      const timeIn = (document.getElementById('ptd-time') as HTMLInputElement).value;
      const paceIn = (document.getElementById('ptd-pace') as HTMLInputElement).value;

      const hasDistance = distIn.trim() !== '';
      const hasTime = timeIn.trim() !== '';
      const hasPace = paceIn.trim() !== '';

      if ([hasDistance, hasTime, hasPace].filter(Boolean).length !== 2) {
        alert('Fill in exactly two fields.');
        return;
      }

      try {
        let distKm: number, totalSecs: number, pacePerKm: number;

        if (hasDistance && hasTime) {
          distKm = distanceToKm(parseFloat(distIn), unit);
          totalSecs = parseHMS(timeIn);
          pacePerKm = calcPace(distKm, totalSecs);
        } else if (hasDistance && hasPace) {
          const paceInput = parseHMS(paceIn);
          pacePerKm = unit === 'km' ? paceInput : paceInput / 1.60934;
          distKm = distanceToKm(parseFloat(distIn), unit);
          totalSecs = calcTime(distKm, pacePerKm);
        } else {
          const paceInput = parseHMS(paceIn);
          pacePerKm = unit === 'km' ? paceInput : paceInput / 1.60934;
          totalSecs = parseHMS(timeIn);
          distKm = calcDistance(totalSecs, pacePerKm);
        }

        const paceMi = pacePerKm * 1.60934;
        const splits = buildSplits(distKm, pacePerKm, unit);

        document.getElementById('ptd-r-dist')!.textContent = unit === 'km'
          ? `${distKm.toFixed(2)} km`
          : `${kmToMiles(distKm).toFixed(2)} mi`;
        document.getElementById('ptd-r-time')!.textContent = secsToHMS(totalSecs);
        document.getElementById('ptd-r-pace-km')!.textContent = `${secsToMMSS(pacePerKm)}/km`;
        document.getElementById('ptd-r-pace-mi')!.textContent = `${secsToMMSS(paceMi)}/mi`;

        const table = document.getElementById('ptd-splits') as HTMLTableElement;
        table.innerHTML = splits.map((s) => `
          <tr>
            <td class="split-lbl">${s.label}</td>
            <td class="split-val">${s.paceDisplay}</td>
          </tr>
        `).join('');

        const params = new URLSearchParams({ dist: String(distKm), time: String(totalSecs), unit });
        const shareEl = document.getElementById('ptd-share') as HTMLAnchorElement;
        shareEl.href = `${location.origin}/pace-calculator?${params}#pace`;

        document.getElementById('ptd-result')!.hidden = false;
      } catch {
        alert('Check your inputs — time should be in M:SS or H:MM:SS format.');
      }
    });

    // --- TAB 2: RACE PREDICTOR ---
    document.getElementById('pred-calc')!.addEventListener('click', () => {
      const d1 = parseFloat((document.getElementById('pred-d1') as HTMLSelectElement).value);
      const t1Input = (document.getElementById('pred-t1') as HTMLInputElement).value;
      const d2 = parseFloat((document.getElementById('pred-d2') as HTMLSelectElement).value);

      try {
        const t1Secs = parseHMS(t1Input);
        const riegel = riegelPredict(t1Secs, d1, d2);
        const cameron = cameronPredict(t1Secs, d1, d2);

        document.getElementById('pred-r-riegel')!.textContent = secsToHMS(riegel);
        document.getElementById('pred-r-cameron')!.textContent = secsToHMS(cameron);

        const params = new URLSearchParams({ d1: String(d1), t1: String(t1Secs), d2: String(d2) });
        const shareEl = document.getElementById('pred-share') as HTMLAnchorElement;
        shareEl.href = `${location.origin}/pace-calculator?${params}#predictor`;

        document.getElementById('pred-result')!.hidden = false;
      } catch {
        alert('Check your time — use H:MM:SS format (e.g. 2:00:00).');
      }
    });

    // --- TAB 3: CYCLE-AWARE ---
    const cyclePhaseData = JSON.parse(document.getElementById('cycle-copy-data')!.textContent!);

    document.getElementById('cyc-calc')!.addEventListener('click', () => {
      const dateInput = (document.getElementById('cyc-date') as HTMLInputElement).value;
      const cycleLength = parseInt((document.getElementById('cyc-length') as HTMLInputElement).value);
      const basePaceInput = (document.getElementById('cyc-pace') as HTMLInputElement).value;

      if (!dateInput) { alert('Enter your last period start date.'); return; }
      if (!basePaceInput) { alert('Enter your easy pace per km.'); return; }

      try {
        const periodStart = new Date(dateInput);
        const today = new Date();
        const basePace = parseHMS(basePaceInput);

        const phases: Array<'menstrual' | 'follicular' | 'ovulatory' | 'luteal'> = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
        const phaseModifiers: Record<string, number> = {
          menstrual: -0.10,
          follicular: 0.05,
          ovulatory: 0.08,
          luteal: -0.05,
        };

        const current = getCurrentPhase(periodStart, cycleLength, today);

        const container = document.getElementById('cyc-phases')!;
        container.innerHTML = phases.map((phase) => {
          const modifier = phaseModifiers[phase];
          const adjustedPace = applyPaceModifier(basePace, modifier);
          const phaseCopy = cyclePhaseData[phase] ?? { guidance: '', why: '' };
          const isActive = phase === current.phase;

          return `
            <div class="phase-card${isActive ? ' active' : ''}">
              <span class="phase-tag${isActive ? ' active-tag' : ''}">${isActive ? '← Now' : ''}</span>
              <h3 class="phase-name">${phase.charAt(0).toUpperCase() + phase.slice(1)}</h3>
              <div class="phase-pace">${secsToMMSS(adjustedPace)}/km</div>
              <p class="phase-guidance">${phaseCopy.guidance}</p>
              <p class="phase-why">${phaseCopy.why}</p>
            </div>
          `;
        }).join('');

        const params = new URLSearchParams({ start: dateInput, len: String(cycleLength), pace: String(basePace) });
        const shareEl = document.getElementById('cyc-share') as HTMLAnchorElement;
        shareEl.href = `${location.origin}/pace-calculator?${params}#cycle`;

        document.getElementById('cyc-result')!.hidden = false;
      } catch {
        alert('Check your pace — use M:SS format (e.g. 6:00).');
      }
    });

    // Restore state from query params
    const sp = new URLSearchParams(location.search);
    if (sp.get('dist') && sp.get('time')) {
      const dist = parseFloat(sp.get('dist')!);
      const time = parseFloat(sp.get('time')!);
      const unit = (sp.get('unit') ?? 'km') as 'km' | 'mi';
      (document.getElementById('ptd-distance') as HTMLInputElement).value = unit === 'km' ? String(dist) : String(dist / 1.60934);
      (document.getElementById('ptd-time') as HTMLInputElement).value = secsToHMS(time);
      document.getElementById('ptd-calc')!.dispatchEvent(new Event('click'));
    }
    if (sp.get('d1') && sp.get('t1') && sp.get('d2')) {
      (document.getElementById('pred-d1') as HTMLSelectElement).value = sp.get('d1')!;
      (document.getElementById('pred-t1') as HTMLInputElement).value = secsToHMS(parseFloat(sp.get('t1')!));
      (document.getElementById('pred-d2') as HTMLSelectElement).value = sp.get('d2')!;
      document.getElementById('pred-calc')!.dispatchEvent(new Event('click'));
    }
  </script>

  <!-- Cycle copy passed to client script -->
  <script type="application/json" id="cycle-copy-data" set:html={JSON.stringify(copy)} />

  <style>
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0 48px; }
    .calc-main { padding: 100px 0 80px; }
    .calc-main h1 {
      font-family: var(--font-display);
      font-size: clamp(4rem, 11vw, 9rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      margin: 12px 0 8px;
    }
    .calc-sub { font-size: 0.9rem; color: var(--muted); margin-bottom: 40px; font-family: var(--font-mono); letter-spacing: 0.1em; }

    .tabs { display: flex; gap: 2px; margin-bottom: 2px; flex-wrap: wrap; }
    .tab {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      background: var(--mist);
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 12px 20px;
      border-radius: 2px 2px 0 0;
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
    }
    .tab.active, .tab:hover { color: var(--breath); border-color: var(--pulse); }
    .tab.active { background: var(--mist); border-bottom-color: var(--mist); }

    .tab-panel {
      background: var(--mist);
      border: 1px solid var(--border);
      padding: 36px;
      border-radius: 0 2px 2px 2px;
      margin-bottom: 40px;
    }
    .tab-panel.hidden { display: none; }

    .unit-toggle { display: flex; gap: 20px; margin-bottom: 20px; }
    .unit-toggle label { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 0.62rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--breath); cursor: pointer; }
    .unit-toggle input { accent-color: var(--pulse); }

    .inputs-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
    .calc-label { display: flex; flex-direction: column; gap: 6px; }
    .calc-label span { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
    .calc-label input, .calc-label select {
      background: rgba(244,237,224,0.04);
      border: 1px solid var(--border-strong);
      color: var(--breath);
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 300;
      padding: 10px 14px;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.2s;
    }
    .calc-label input:focus, .calc-label select:focus { border-color: var(--pulse); }

    .calc-hint { font-size: 0.8rem; color: var(--muted); margin-bottom: 16px; }
    .calc-btn {
      background: var(--pulse);
      color: var(--mile);
      border: none;
      font-family: var(--font-mono);
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 14px 28px;
      border-radius: 2px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .calc-btn:hover { background: #c8f020; }

    .calc-result { margin-top: 28px; padding-top: 28px; border-top: 1px solid var(--border); }
    .result-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .result-item { background: var(--mile); border: 1px solid var(--border); padding: 16px; border-radius: 2px; }
    .ri-label { display: block; font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
    .ri-val { display: block; font-family: var(--font-display); font-size: 1.6rem; font-weight: 900; letter-spacing: -0.02em; color: var(--pulse); }

    .splits-wrap { margin-bottom: 20px; }
    .splits-label { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
    .splits-table { width: 100%; border-collapse: collapse; }
    .splits-table :global(.split-lbl) { font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.1em; color: var(--muted); padding: 5px 0; border-bottom: 1px solid var(--border); }
    .splits-table :global(.split-val) { font-family: var(--font-mono); font-size: 0.75rem; color: var(--breath); text-align: right; border-bottom: 1px solid var(--border); padding: 5px 0; }

    .pred-note { font-size: 0.8rem; color: var(--muted); line-height: 1.6; margin-top: 16px; }

    .phase-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .phase-card { background: var(--mile); border: 1px solid var(--border); padding: 20px; border-radius: 2px; }
    .phase-card.active { border-color: var(--pulse); }
    .phase-tag { display: block; font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; min-height: 1em; }
    .active-tag { color: var(--pulse); }
    .phase-name { font-family: var(--font-display); font-size: 1.2rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; color: var(--breath); margin-bottom: 6px; }
    .phase-pace { font-family: var(--font-display); font-size: 2rem; font-weight: 900; color: var(--pulse); letter-spacing: -0.03em; margin-bottom: 10px; }
    .phase-guidance { font-size: 0.85rem; line-height: 1.5; color: var(--breath); margin-bottom: 8px; }
    .phase-why { font-size: 0.78rem; line-height: 1.5; color: var(--muted); }

    .cycle-disclaimer { font-size: 0.78rem; line-height: 1.65; color: var(--muted); border: 1px solid var(--border); padding: 14px 18px; border-radius: 2px; margin-top: 16px; }

    .share-link { display: inline-block; font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--pulse); text-decoration: none; margin-top: 16px; }
    .share-link:hover { text-decoration: underline; }

    .save-paces { margin-top: 60px; padding-top: 40px; border-top: 1px solid var(--border); }
    .save-sub { font-size: 0.9rem; color: var(--muted); margin: 8px 0 20px; }

    @media (max-width: 900px) {
      .inputs-row { grid-template-columns: 1fr 1fr; }
      .result-grid { grid-template-columns: 1fr 1fr; }
      .phase-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .wrap { padding: 0 24px; }
      .inputs-row { grid-template-columns: 1fr; }
      .result-grid { grid-template-columns: 1fr 1fr; }
      .phase-grid { grid-template-columns: 1fr; }
      .tab-panel { padding: 20px; }
    }
  </style>
  ```

- [ ] **Step 2: Verify all three tabs**

  ```bash
  pnpm dev
  ```
  Open http://localhost:4321/pace-calculator. Verify each tab:

  **Tab 1:** Enter Distance=10, Time=52:00 (leave Pace empty). Click Calculate. Expected: Pace ≈ 5:12/km, total time 52:00, splits table shows 10 rows.

  **Tab 2:** Select Half Marathon, enter 2:00:00, target Marathon. Click Predict. Expected: Riegel ≈ 4:09–4:15, Cameron similar.

  **Tab 3:** Enter last period date (a recent Monday), cycle length 28, easy pace 6:00. Click Show my phases. Expected: Four phase cards appear, correct phase highlighted with "← Now".

  **Share link:** Click a share link. Copy the URL, open in a new tab. The calculator should restore the inputs and show results.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/pace-calculator.astro
  git commit -m "feat: add Pace Calculator with 3 modes, shareable links, cycle-aware phases"
  ```

---

## Task 5: Legal pages + cookie banner

- [ ] **Step 1: Create `src/pages/privacy.astro`**

  ```astro
  ---
  import LegalLayout from '../layouts/LegalLayout.astro';
  import { client } from '../lib/sanity';
  import { LEGAL_BY_SLUG_QUERY } from '../lib/queries';
  import { PortableText } from '@portabletext/astro';

  const page = await client.fetch(LEGAL_BY_SLUG_QUERY, { slug: 'privacy' });
  ---
  <LegalLayout title="Privacy Policy">
    {page?.body
      ? <PortableText value={page.body} />
      : <p style="color:var(--muted)">Privacy policy coming soon. For questions, email <a href="mailto:hello@virra.app">hello@virra.app</a>.</p>
    }
  </LegalLayout>
  ```

- [ ] **Step 2: Create `src/pages/terms.astro`**

  ```astro
  ---
  import LegalLayout from '../layouts/LegalLayout.astro';
  import { client } from '../lib/sanity';
  import { LEGAL_BY_SLUG_QUERY } from '../lib/queries';
  import { PortableText } from '@portabletext/astro';

  const page = await client.fetch(LEGAL_BY_SLUG_QUERY, { slug: 'terms' });
  ---
  <LegalLayout title="Terms & Conditions">
    {page?.body
      ? <PortableText value={page.body} />
      : <p style="color:var(--muted)">Terms and conditions coming soon.</p>
    }
  </LegalLayout>
  ```

- [ ] **Step 3: Create `src/pages/cookies.astro`**

  ```astro
  ---
  import LegalLayout from '../layouts/LegalLayout.astro';
  import { client } from '../lib/sanity';
  import { LEGAL_BY_SLUG_QUERY } from '../lib/queries';
  import { PortableText } from '@portabletext/astro';

  const page = await client.fetch(LEGAL_BY_SLUG_QUERY, { slug: 'cookies' });
  ---
  <LegalLayout title="Cookie Policy">
    {page?.body
      ? <PortableText value={page.body} />
      : <p style="color:var(--muted)">Cookie policy coming soon.</p>
    }
  </LegalLayout>
  ```

- [ ] **Step 4: Create `src/pages/contact.astro`**

  ```astro
  ---
  import BaseLayout from '../layouts/BaseLayout.astro';
  import Header from '../components/Header.astro';
  import Footer from '../components/Footer.astro';
  import SectionLabel from '../components/SectionLabel.astro';
  ---
  <BaseLayout title="Contact — VIRRA" description="Get in touch with the VIRRA team.">
    <Header />
    <main class="contact-main">
      <div class="wrap">
        <SectionLabel text="Get in touch" />
        <h1>Contact.</h1>
        <div class="contact-inner">
          <div class="contact-links">
            <a href="mailto:hello@virra.app" class="contact-link">
              <span class="cl-label">Email</span>
              <span class="cl-val">hello@virra.app</span>
            </a>
            <a href="https://instagram.com/virrarun" target="_blank" rel="noopener noreferrer" class="contact-link">
              <span class="cl-label">Instagram</span>
              <span class="cl-val">@virrarun</span>
            </a>
          </div>
          <form class="contact-form" id="contact-form" novalidate>
            <input type="text" name="_hp" style="display:none" tabindex="-1" autocomplete="off" />
            <label class="cf-label">
              <span>Name *</span>
              <input type="text" name="name" required autocomplete="name" />
            </label>
            <label class="cf-label">
              <span>Email *</span>
              <input type="email" name="email" required autocomplete="email" />
            </label>
            <label class="cf-label">
              <span>Message *</span>
              <textarea name="message" required rows="5"></textarea>
            </label>
            <button type="submit" class="cf-btn">Send message</button>
          </form>
          <p id="cf-ok" hidden style="color:var(--pulse);margin-top:16px;">Message sent — we'll get back to you soon.</p>
          <p id="cf-err" hidden style="color:var(--dawn);margin-top:16px;">Something went wrong. Email <a href="mailto:hello@virra.app" style="color:var(--dawn)">hello@virra.app</a> directly.</p>
        </div>
      </div>
    </main>
    <Footer />
  </BaseLayout>

  <script>
    const form = document.getElementById('contact-form') as HTMLFormElement;
    const ok = document.getElementById('cf-ok') as HTMLElement;
    const err = document.getElementById('cf-err') as HTMLElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector<HTMLButtonElement>('button')!;
      btn.disabled = true;
      const fd = new FormData(form);
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _hp: fd.get('_hp'), name: fd.get('name'), email: fd.get('email'), message: fd.get('message') }),
      });
      if (res.ok) { form.hidden = true; ok.hidden = false; }
      else { btn.disabled = false; err.hidden = false; }
    });
  </script>

  <style>
    .wrap { max-width: 1200px; margin: 0 auto; padding: 0 48px; }
    .contact-main { padding: 100px 0 80px; }
    .contact-main h1 {
      font-family: var(--font-display);
      font-size: clamp(4rem, 11vw, 9rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 0.86;
      margin: 12px 0 40px;
    }
    .contact-inner { display: grid; grid-template-columns: 300px 1fr; gap: 80px; }
    .contact-links { display: flex; flex-direction: column; gap: 24px; }
    .contact-link { text-decoration: none; display: flex; flex-direction: column; gap: 4px; }
    .cl-label { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
    .cl-val { font-family: var(--font-display); font-size: 1.2rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; color: var(--pulse); }
    .contact-link:hover .cl-val { text-decoration: underline; }
    .contact-form { display: flex; flex-direction: column; gap: 16px; }
    .cf-label { display: flex; flex-direction: column; gap: 6px; }
    .cf-label span { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
    input[type=text], input[type=email], textarea {
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
      width: 100%;
    }
    input:focus, textarea:focus { border-color: var(--pulse); }
    textarea { resize: vertical; }
    .cf-btn {
      align-self: flex-start;
      background: var(--pulse);
      color: var(--mile);
      border: none;
      font-family: var(--font-mono);
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 14px 28px;
      border-radius: 2px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .cf-btn:hover { background: #c8f020; }
    .cf-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    @media (max-width: 768px) { .contact-inner { grid-template-columns: 1fr; gap: 40px; } }
    @media (max-width: 640px) { .wrap { padding: 0 24px; } }
  </style>
  ```

- [ ] **Step 5: Create `src/components/CookieBanner.astro`**

  ```astro
  <div id="cookie-banner" class="cookie-banner" role="dialog" aria-label="Cookie consent" hidden>
    <p class="cb-text">
      VIRRA uses functional cookies only — no tracking, no advertising.
      <a href="/cookies">Cookie policy</a>
    </p>
    <div class="cb-actions">
      <button id="cb-accept" class="cb-btn cb-accept">Accept</button>
      <button id="cb-reject" class="cb-btn cb-reject">Reject all</button>
    </div>
  </div>

  <script>
    const PREF_KEY = 'virra-cookie-consent';
    const banner = document.getElementById('cookie-banner')!;
    const pref = localStorage.getItem(PREF_KEY);

    if (!pref) {
      banner.hidden = false;
    }

    document.getElementById('cb-accept')!.addEventListener('click', () => {
      localStorage.setItem(PREF_KEY, 'accepted');
      banner.hidden = true;
    });

    document.getElementById('cb-reject')!.addEventListener('click', () => {
      localStorage.setItem(PREF_KEY, 'rejected');
      banner.hidden = true;
    });
  </script>

  <style>
    .cookie-banner {
      position: fixed;
      bottom: 24px;
      left: 24px;
      right: 24px;
      max-width: 560px;
      background: var(--mist);
      border: 1px solid var(--border-strong);
      border-radius: 2px;
      padding: 20px 24px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .cb-text { font-size: 0.85rem; line-height: 1.5; color: rgba(244,237,224,0.8); flex: 1; }
    .cb-text a { color: var(--pulse); text-decoration: underline; }
    .cb-actions { display: flex; gap: 8px; }
    .cb-btn {
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 8px 16px;
      border-radius: 2px;
      cursor: pointer;
      white-space: nowrap;
      border: 1px solid var(--border-strong);
    }
    .cb-accept { background: var(--pulse); color: var(--mile); border-color: var(--pulse); }
    .cb-reject { background: transparent; color: var(--muted); }
    .cb-reject:hover { color: var(--breath); }
  </style>
  ```

- [ ] **Step 6: Add CookieBanner to BaseLayout**

  In `src/layouts/BaseLayout.astro`, import and add CookieBanner before `</body>`:
  ```astro
  ---
  import CookieBanner from '../components/CookieBanner.astro';
  // ... existing imports
  ---
  ```
  And inside `<body>` after `<slot />`:
  ```html
  <CookieBanner />
  ```

- [ ] **Step 7: Verify all legal pages**

  Open in dev:
  - http://localhost:4321/privacy — shows placeholder or Sanity content
  - http://localhost:4321/terms — same
  - http://localhost:4321/cookies — same
  - http://localhost:4321/contact — shows contact form, submit a test message, verify Emma receives it

  Open any page in a fresh private window — cookie banner should appear. Click "Accept" — banner hides and preference is stored. Reload — banner does not reappear.

- [ ] **Step 8: Commit**

  ```bash
  git add src/pages/privacy.astro src/pages/terms.astro src/pages/cookies.astro \
    src/pages/contact.astro src/components/CookieBanner.astro src/layouts/BaseLayout.astro
  git commit -m "feat: add legal pages, contact form, cookie consent banner"
  ```

---

## Task 6: Final cleanup + audit

- [ ] **Step 1: Check for broken routes**

  ```bash
  pnpm build
  ```
  Expected: zero errors. Note any warnings and fix them.

- [ ] **Step 2: Verify nav links all resolve**

  Start `pnpm dev` and click every link in the header nav:
  - `/` → homepage loads
  - `/about` → about loads
  - `/coaching` → coaching loads
  - `/advice` → advice index loads
  - `/pace-calculator` → calculator loads
  - Subscribe pill → scrolls to footer newsletter form

  Click every footer link:
  - `/privacy` → privacy loads
  - `/terms` → terms loads
  - `/cookies` → cookies loads
  - `/contact` → contact loads
  - `@virrarun` → opens Instagram in new tab

- [ ] **Step 3: Mobile check**

  In Chrome DevTools, set to 375px viewport. Verify on every page:
  - Header hamburger opens nav
  - Subscribe pill is visible in mobile nav
  - Forms are single-column
  - No horizontal scrollbar
  - Text is legible at all sizes

- [ ] **Step 4: Brand audit**

  On every page, confirm:
  - Logo: V, RRA in Pulse lime; italic *i* in Heat magenta
  - No Cormorant or Outfit fonts in use anywhere (check DevTools > Network > Fonts)
  - No gradients
  - No stock-photo running shoes
  - Headline text is Big Shoulders Display
  - Italic accent text is Fraunces
  - Labels/metadata are Space Mono
  - Body text is Inter

- [ ] **Step 5: Check form flows end-to-end on production**

  After Vercel deploys, test:
  1. Newsletter signup (footer) → email appears in Beehiiv with source tag `footer`
  2. Newsletter signup (advice hero) → email appears with source tag `advice`
  3. Coaching enquiry → Emma's inbox + auto-reply + Google Sheet row
  4. Contact form → Emma's inbox

- [ ] **Step 6: Add Schema.org Organization markup to homepage**

  In `src/pages/index.astro`, add before `<Header />`:
  ```astro
  <script type="application/ld+json" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "VIRRA",
    "url": "https://virra.app",
    "sameAs": ["https://instagram.com/virrarun"],
    "description": "Female-first running platform. Cycle-aware training, nutrition and performance.",
  })} />
  ```

- [ ] **Step 7: Final commit and push**

  ```bash
  pnpm build
  git add -A
  git status
  git commit -m "feat: complete VIRRA website — 5 pages, legal, calculator, Sanity CMS"
  git push
  ```

  Verify Vercel deploys successfully and the live site at virra.app looks correct.

---

**Plan 3 complete. The full VIRRA website is live.**

All five nav pages, four legal pages, Sanity CMS, Beehiiv newsletter, coaching enquiry pipeline, pace calculator, cookie consent, and RSS feed are in place and tested end-to-end.
