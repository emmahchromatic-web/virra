import { defineType, defineField } from 'sanity';

export const article = defineType({
  name: 'article',
  title: 'Article',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'title' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'featured', type: 'boolean', initialValue: false,
      description: 'Only one article should be featured at a time.' }),
    defineField({ name: 'heroImage', type: 'image', options: { hotspot: true } }),
    defineField({ name: 'dek', type: 'text', rows: 2,
      description: 'Short sub-headline shown on article cards.' }),
    defineField({
      name: 'category',
      type: 'string',
      options: {
        list: ['Training', 'Nutrition', 'Cycle & Hormones', 'Mindset', 'Race Day'],
        layout: 'radio',
      },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'author', type: 'string', initialValue: 'Emma' }),
    defineField({ name: 'publishedDate', type: 'date', validation: (r) => r.required() }),
    defineField({
      name: 'body',
      type: 'array',
      of: [
        { type: 'block' },
        { type: 'image', options: { hotspot: true } },
      ],
    }),
    defineField({ name: 'seoTitle', type: 'string',
      description: 'Overrides title for search engines. Max 60 chars.' }),
    defineField({ name: 'seoDescription', type: 'text', rows: 2,
      description: 'Meta description. Max 155 chars.' }),
    defineField({ name: 'ogImage', type: 'image',
      description: 'Social share image. 1200×630px recommended.' }),
  ],
  preview: {
    select: { title: 'title', media: 'heroImage', subtitle: 'category' },
  },
});
