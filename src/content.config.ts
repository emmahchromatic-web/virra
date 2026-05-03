import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string().max(200),
    hero_paragraph: z.string().max(400),
    cover_image: z.string(),
    category: z.enum(['Fitness', 'Nutrition', 'Performance', 'Wellbeing', 'App Updates']),
    tags: z.array(z.string()).optional().default([]),
    author: z.string(),
    published_date: z.coerce.date(),
  }),
});

export const collections = { blog };
