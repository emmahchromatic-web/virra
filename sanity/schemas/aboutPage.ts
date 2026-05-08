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
