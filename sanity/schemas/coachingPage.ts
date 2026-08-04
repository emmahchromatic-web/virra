import { defineType, defineField } from 'sanity';

export const coachingPage = defineType({
  name: 'coachingPage',
  title: 'Coaching Page',
  type: 'document',
  fields: [
    // Block 1 — Hero & Enquiry Form
    defineField({
      name: 'heroImage',
      type: 'image',
      options: { hotspot: true },
      description: 'Block 1 — welcoming hero image (left column). Warm, smiling, on-brand.',
    }),
    defineField({ name: 'heroTagline', type: 'string', description: 'Block 1 — italic hero tagline.' }),
    defineField({ name: 'heroIntro', type: 'text', rows: 3, description: 'Block 1 — short intro line above the enquiry form.' }),
    defineField({
      name: 'whoItsFor',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Block 1 — short bullets on who coaching is for (folded into the hero).',
    }),

    // Block 3 — Mini About Emma
    defineField({
      name: 'miniAbout',
      title: 'Mini About Emma',
      type: 'object',
      description: 'Block 3 — a short "about Emma" for the coaching page.',
      fields: [
        { name: 'heading', type: 'string' },
        { name: 'body', type: 'text', rows: 5 },
        { name: 'image', type: 'image', options: { hotspot: true }, description: 'Optional portrait; falls back to text-only.' },
      ],
    }),

    // Block 4 — Motivational Quote
    defineField({
      name: 'motivationalQuote',
      type: 'object',
      description: 'Block 4 — a featured motivational quote.',
      fields: [
        { name: 'quote', type: 'text', rows: 3 },
        { name: 'attribution', type: 'string', description: 'Optional — e.g. Emma, or a source.' },
      ],
    }),

    // Block 5 — What's Included (replaces the price tiers on the page)
    defineField({
      name: 'whatsIncludedIntro',
      type: 'text',
      rows: 2,
      description: 'Block 5 — optional intro line above the What\'s Included list.',
    }),
    defineField({
      name: 'whatsIncluded',
      title: "What's Included",
      type: 'array',
      description: 'Block 5 — what coaching includes. Replaces the old price tiers on the page.',
      of: [{
        type: 'object',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'description', type: 'text', rows: 2 },
        ],
        preview: { select: { title: 'title' } },
      }],
    }),

    // Block 7 — Closing CTA
    defineField({
      name: 'ctaBlock',
      title: 'Closing CTA',
      type: 'object',
      description: 'Block 7 — closing call to action (its button scrolls to the enquiry form).',
      fields: [
        { name: 'heading', type: 'string' },
        { name: 'body', type: 'text', rows: 2 },
        { name: 'buttonLabel', type: 'string', description: 'e.g. Start your enquiry' },
      ],
    }),

    // Block 2 & 6 — existing
    defineField({
      name: 'testimonials',
      type: 'array',
      description: 'Block 2.',
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
      description: 'Block 6.',
      of: [{
        type: 'object',
        fields: [
          { name: 'question', type: 'string' },
          { name: 'answer', type: 'text', rows: 3 },
        ],
      }],
    }),

    // Retained for the enquiry form's "interested in" dropdown (names only, no prices
    // shown on the page). The price grid is no longer rendered.
    defineField({
      name: 'tiers',
      title: 'Tiers (form options only — not shown as a price grid)',
      type: 'array',
      of: [{
        type: 'object',
        fields: [
          { name: 'tag', type: 'string', description: 'e.g. Standard, Premium · Recommended' },
          { name: 'price', type: 'number', description: 'Monthly price in GBP (no longer shown on the page)' },
          { name: 'description', type: 'text', rows: 2 },
          { name: 'features', type: 'array', of: [{ type: 'string' }] },
          { name: 'featured', type: 'boolean', initialValue: false },
        ],
      }],
    }),
  ],
  preview: { prepare: () => ({ title: 'Coaching Page' }) },
});
