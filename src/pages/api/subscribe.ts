export const prerender = false;

import type { APIRoute } from 'astro';
import { addSubscriber } from '../../lib/beehiiv';
import { verifyTurnstile } from '../../lib/turnstile';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const { email, source, _hp, cfToken } = await request.json() as {
    email: string;
    source: string;
    _hp?: string;
    cfToken?: string;
  };

  if (_hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
  }

  const validSources = ['footer', 'hero', 'advice', 'advice-eoa', 'calculator', 'header-modal', 'run-hot-landing'];
  const safeSource = validSources.includes(source) ? source : 'website';

  // The /run-hot lead-magnet page is an ad-traffic surface, so it additionally
  // requires Cloudflare Turnstile. The other newsletter forms (homepage, modal,
  // advice) stay honeypot-only — they don't send a token, so they're unaffected.
  if (source === 'run-hot-landing') {
    const tokenOk = await verifyTurnstile(cfToken, clientAddress);
    if (!tokenOk) {
      return new Response(JSON.stringify({ error: 'Human verification failed' }), { status: 400 });
    }
  }

  try {
    await addSubscriber(email, safeSource);
  } catch (e) {
    console.error('Beehiiv error', e);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
