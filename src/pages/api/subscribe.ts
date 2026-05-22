export const prerender = false;

import type { APIRoute } from 'astro';
import { addSubscriber } from '../../lib/beehiiv';

export const POST: APIRoute = async ({ request }) => {
  const { email, source, _hp } = await request.json() as { email: string; source: string; _hp?: string };

  if (_hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
  }

  const validSources = ['footer', 'hero', 'advice', 'advice-eoa', 'calculator', 'header-modal'];
  const safeSource = validSources.includes(source) ? source : 'website';

  try {
    await addSubscriber(email, safeSource);
  } catch (e) {
    console.error('Beehiiv error', e);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
