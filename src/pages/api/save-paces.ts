export const prerender = false;

import type { APIRoute } from 'astro';
import { sendPaceResults } from '../../lib/email';
import { addSubscriber } from '../../lib/beehiiv';

export const POST: APIRoute = async ({ request }) => {
  const { email, _hp, result } = await request.json() as {
    email: string;
    _hp?: string;
    result?: { title: string; rows: { label: string; value: string }[]; shareUrl?: string };
  };

  if (_hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (!email || !email.includes('@') || !result || !Array.isArray(result.rows) || result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  // The results email is the thing the user asked for — fail loudly if it doesn't send.
  try {
    await sendPaceResults(email, result);
  } catch (e) {
    console.error('save-paces: results email failed', e);
    return new Response(JSON.stringify({ error: 'Could not send results' }), { status: 500 });
  }

  // Adding to Run Hot is a side-effect — don't fail the request if it errors.
  try {
    await addSubscriber(email, 'calc-save');
  } catch (e) {
    console.error('save-paces: beehiiv add failed', e);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
