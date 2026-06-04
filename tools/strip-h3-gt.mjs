/**
 * Migration: strip leading "> " from all H3 blocks in Sanity articles.
 * Run with: node tools/strip-h3-gt.mjs
 * Requires an active `npx sanity login` session (or SANITY_TOKEN env var).
 */
import { createClient } from '@sanity/client';

const token = process.env.SANITY_TOKEN;

const client = createClient({
  projectId: '6h65mfrg',
  dataset: 'production',
  apiVersion: '2026-05-08',
  useCdn: false,
  ...(token ? { token } : {}),
});

const docs = await client.fetch('*[_type=="article"]{_id,"slug":slug.current,body}');
const tx = client.transaction();
let patched = 0;

for (const doc of docs) {
  let changed = false;
  const newBody = (doc.body ?? []).map(block => {
    if (block.style !== 'h3') return block;
    const newChildren = (block.children ?? []).map(child => {
      if (!child.text?.startsWith('> ')) return child;
      changed = true;
      return { ...child, text: child.text.slice(2) };
    });
    return { ...block, children: newChildren };
  });
  if (changed) {
    tx.patch(doc._id, p => p.set({ body: newBody }));
    patched++;
    console.log('Queued:', doc.slug);
  }
}

if (patched > 0) {
  await tx.commit();
  console.log(`Done — patched ${patched} documents.`);
} else {
  console.log('Nothing to patch.');
}
