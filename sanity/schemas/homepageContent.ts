import { defineType, defineField } from 'sanity';

export const homepageContent = defineType({
  name: 'homepageContent',
  title: 'Homepage Content',
  type: 'document',
  fields: [
    defineField({
      name: 'heroHeadline',
      type: 'text',
      rows: 2,
      description: 'Press Enter for a line break. Each newline renders as a new line in the hero.',
      validation: (r) => r.required(),
    }),
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
          {
            name: 'accentColor',
            title: 'Card colour',
            type: 'string',
            description: 'Brand colour that fills this pillar card.',
            options: {
              list: [
                { title: 'Pulse (lime)', value: 'pulse' },
                { title: 'Heat (hot pink)', value: 'heat' },
                { title: 'Mile (near-black)', value: 'mile' },
              ],
              layout: 'radio',
            },
          },
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
