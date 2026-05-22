import { defineType, defineField } from 'sanity';

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'newsletterCaption',
      title: 'Footer newsletter caption',
      type: 'string',
      description: 'Caption shown above the Run Hot signup in the footer.',
      initialValue: 'Run Hot · sent every Sunday to The Pack.',
    }),
    defineField({
      name: 'legalLinks',
      title: 'Footer legal links',
      type: 'array',
      description: 'Legal / utility links shown in the footer bottom row.',
      of: [{
        type: 'object',
        fields: [
          { name: 'label', type: 'string' },
          { name: 'href', type: 'string', description: 'Path or URL, e.g. /privacy' },
        ],
        preview: { select: { title: 'label', subtitle: 'href' } },
      }],
    }),
    defineField({
      name: 'instagramHandle',
      title: 'Instagram handle',
      type: 'string',
      initialValue: '@virrarun',
    }),
    defineField({
      name: 'instagramUrl',
      title: 'Instagram URL',
      type: 'url',
      initialValue: 'https://instagram.com/virrarun',
    }),
    defineField({
      name: 'copyrightName',
      title: 'Copyright name',
      type: 'string',
      description: 'Shown as "© {name} {year}". The year is appended automatically.',
      initialValue: 'VIRRA',
    }),
  ],
  preview: { prepare: () => ({ title: 'Site Settings' }) },
});
