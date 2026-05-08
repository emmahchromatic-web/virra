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
