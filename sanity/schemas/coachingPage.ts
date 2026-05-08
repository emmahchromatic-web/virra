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
