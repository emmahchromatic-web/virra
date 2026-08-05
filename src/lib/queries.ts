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

export const RELATED_ARTICLES_QUERY = `*[_type == "article" && slug.current != $slug] | order(publishedDate desc) [0..9] {
  title,
  slug,
  dek,
  category,
  publishedDate,
  heroImage
}`;

export const COACHING_QUERY = `*[_type == "coachingPage"][0]{
  heroImage,
  heroTagline,
  heroIntro,
  whoItsFor,
  tiers,
  miniAbout{ heading, body, image },
  motivationalQuote,
  whatsIncludedIntro,
  whatsIncluded,
  ctaBlock,
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
  body,
  lastUpdated
}`;

export const CYCLE_CALCULATOR_COPY_QUERY = `*[_type == "cycleCalculatorCopy"][0]{
  menstrual,
  follicular,
  ovulatory,
  luteal
}`;

export const NEWSLETTER_LANDING_QUERY = `*[_type == "newsletterLanding"][0]{
  eyebrow,
  headline,
  headlineAccent,
  subhead,
  benefits,
  ctaLabel,
  note,
  successMessage,
  guideKicker,
  guideTitle,
  guideSubtitle,
  guideCover
}`;

export const SITE_SETTINGS_QUERY = `*[_type == "siteSettings"][0]{
  newsletterCaption,
  legalLinks,
  instagramHandle,
  instagramUrl,
  copyrightName
}`;

export const ALL_ARTICLES_FOR_RSS_QUERY = `*[_type == "article"] | order(publishedDate desc) {
  title,
  "slug": slug.current,
  dek,
  publishedDate
}`;
