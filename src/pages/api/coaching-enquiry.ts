export const prerender = false;

import type { APIRoute } from 'astro';
import { sendCoachingNotification, sendCoachingAutoReply } from '../../lib/email';
import { appendCoachingEnquiry } from '../../lib/sheets';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json() as {
    name: string;
    email: string;
    tier: string;
    level: string;
    goal: string;
    startMonth?: string;
    referral?: string;
    newsletter?: boolean;
    _hp?: string;
  };

  // Honeypot spam check
  if (body._hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (!body.name || !body.email || !body.tier || !body.level || !body.goal) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  const fields = {
    name: body.name.trim(),
    email: body.email.trim(),
    tier: body.tier,
    level: body.level,
    goal: body.goal.trim(),
    startMonth: body.startMonth ?? '',
    referral: body.referral ?? '',
    newsletter: body.newsletter ?? false,
  };

  await Promise.all([
    sendCoachingNotification(fields),
    sendCoachingAutoReply(fields.name, fields.email),
    appendCoachingEnquiry(fields),
  ]);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
