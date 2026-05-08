export const prerender = false;

import type { APIRoute } from 'astro';
import { sendContactNotification } from '../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json() as {
    name: string;
    email: string;
    message: string;
    _hp?: string;
  };

  if (body._hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (!body.name || !body.email || !body.message) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  await sendContactNotification({
    name: body.name.trim(),
    email: body.email.trim(),
    message: body.message.trim(),
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
