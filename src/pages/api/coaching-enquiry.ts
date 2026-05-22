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

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((body.email ?? '').trim());

  if (!body.name || !emailValid || !body.tier || !body.level || !body.goal) {
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields' }), { status: 400 });
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

  const [notify, autoReply, sheet] = await Promise.allSettled([
    sendCoachingNotification(fields),
    sendCoachingAutoReply(fields.name, fields.email),
    appendCoachingEnquiry(fields),
  ]);

  if (notify.status === 'rejected') console.error('coaching-enquiry: notification email failed', notify.reason);
  if (autoReply.status === 'rejected') console.error('coaching-enquiry: auto-reply email failed', autoReply.reason);
  if (sheet.status === 'rejected') console.error('coaching-enquiry: sheet append failed', sheet.reason);

  // Notification email is the only thing Emma actually needs to act on the enquiry.
  // Sheet + auto-reply are nice-to-haves — don't show the user an error if they fail.
  if (notify.status === 'rejected') {
    return new Response(JSON.stringify({ error: 'Notification email failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
