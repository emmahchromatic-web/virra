import { defineType, defineField } from 'sanity';

export const legalPage = defineType({
  name: 'legalPage',
  title: 'Legal Page',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'title' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'body', type: 'array', of: [{ type: 'block' }] }),
    defineField({
      name: 'lastUpdated',
      title: 'Last updated',
      type: 'date',
      description: 'Shown at the top of the page. Bump this whenever the policy changes.',
    }),
  ],
  preview: { select: { title: 'title' } },
});
