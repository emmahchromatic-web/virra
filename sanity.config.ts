import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity/schemas';

export default defineConfig({
  name: 'virra',
  title: 'VIRRA',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: 'production',
  plugins: [structureTool()],
  schema: { types: schemaTypes },
});
