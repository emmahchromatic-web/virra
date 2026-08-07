import { defineType, defineField } from 'sanity';

export const newsletterLanding = defineType({
  name: 'newsletterLanding',
  title: 'Newsletter Landing Page',
  type: 'document',
  description: 'The standalone lead-magnet signup page at /run-hot (no site nav). Drives Run Hot signups.',
  fields: [
    defineField({ name: 'seoTitle', title: 'SEO title', type: 'string', description: 'Browser-tab / search-result title. Change this when the lead magnet changes.' }),
    defineField({ name: 'seoDescription', title: 'SEO description', type: 'text', rows: 2, description: 'Search / social description. Change this when the lead magnet changes.' }),
    defineField({ name: 'eyebrow', type: 'string', description: 'Small kicker / social-proof line above the headline (e.g. "Free guide · Strength for women who run").' }),
    defineField({ name: 'headline', type: 'string', description: 'Main headline — the first (Breath-coloured) part.' }),
    defineField({ name: 'headlineAccent', type: 'string', description: 'Headline — the Heat-coloured accent part (renders after the headline).' }),
    defineField({ name: 'subhead', type: 'text', rows: 3, description: 'One or two sentences under the headline.' }),
    defineField({
      name: 'benefits',
      title: "What's inside",
      type: 'array',
      of: [{ type: 'string' }],
      description: '3–4 short bullets on what the guide covers.',
    }),
    defineField({ name: 'ctaLabel', type: 'string', description: 'Submit button label (default "Get the guide").' }),
    defineField({ name: 'note', type: 'text', rows: 2, description: 'Small print under the form (what they\'re opting into).' }),
    defineField({ name: 'successMessage', type: 'string', description: 'Shown after signup (default mentions the guide is on its way).' }),

    // The guide "cover" shown on the right. Falls back to an on-brand rendered
    // cover built from the text fields if no image is supplied.
    defineField({ name: 'guideKicker', type: 'string', description: 'Cover kicker (e.g. "The Strength Guide").' }),
    defineField({ name: 'guideTitle', type: 'string', description: 'Cover title.' }),
    defineField({ name: 'guideSubtitle', type: 'text', rows: 2, description: 'Cover sub-line.' }),
    defineField({ name: 'guideCover', type: 'image', options: { hotspot: true }, description: 'Optional — a real cover render. Overrides the built cover.' }),
    defineField({ name: 'guideFile', title: 'Guide file (PDF)', type: 'file', options: { accept: '.pdf' }, description: 'The downloadable guide. When set, a Download button appears on the signup success screen.' }),
  ],
  preview: { prepare: () => ({ title: 'Newsletter Landing Page (/run-hot)' }) },
});
