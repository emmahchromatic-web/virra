export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const { email, source, _hp } = await request.json() as { email: string; source: string; _hp?: string };

  if (_hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
  }

  const validSources = ['footer', 'hero', 'advice', 'calculator'];
  const safeSource = validSources.includes(source) ? source : 'website';

  const res = await fetch(
    `https://api.beehiiv.com/v2/publications/${import.meta.env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.BEEHIIV_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: safeSource,
        utm_medium: 'website',
        utm_campaign: 'run-hot',
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error('Beehiiv error', res.status, body);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
