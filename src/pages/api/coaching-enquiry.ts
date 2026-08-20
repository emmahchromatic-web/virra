export const prerender = false;

import type { APIRoute } from 'astro';
import { sendCoachingNotification, sendCoachingAutoReply } from '../../lib/email';
import { appendCoachingEnquiry } from '../../lib/sheets';
import { addSubscriber } from '../../lib/beehiiv';
import { verifyTurnstile } from '../../lib/turnstile';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.json() as {
    name: string;
    email: string;
    helpWith: string;
    level: string;
    goal: string;
    struggling?: string;
    triedBefore?: string;
    startMonth?: string;
    referral?: string;
    newsletter?: boolean;
    _hp?: string;
    cfToken?: string;
  };

  // Honeypot spam check
  if (body._hp) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  // Turnstile verification
  const tokenOk = await verifyTurnstile(body.cfToken, clientAddress);
  if (!tokenOk) {
    return new Response(JSON.stringify({ error: 'Human verification failed' }), { status: 400 });
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((body.email ?? '').trim());

  if (!body.name || !emailValid || !body.helpWith || !body.level || !body.goal) {
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields' }), { status: 400 });
  }

  const fields = {
    name: body.name.trim(),
    email: body.email.trim(),
    helpWith: body.helpWith,
    level: body.level,
    goal: body.goal.trim(),
    struggling: (body.struggling ?? '').trim(),
    triedBefore: (body.triedBefore ?? '').trim(),
    startMonth: body.startMonth ?? '',
    referral: body.referral ?? '',
    newsletter: body.newsletter ?? false,
  };

  // If the user ticked the Run Hot opt-in, also add them to Beehiiv. Wrap in a
  // resolved no-op when they didn't so the Promise.allSettled destructure stays clean.
  const maybeSubscribe = fields.newsletter
    ? addSubscriber(fields.email, 'coaching-form')
    : Promise.resolve();

  const [notify, autoReply, sheet, beehiiv] = await Promise.allSettled([
    sendCoachingNotification(fields),
    sendCoachingAutoReply(fields.name, fields.email),
    appendCoachingEnquiry(fields),
    maybeSubscribe,
  ]);

  if (notify.status === 'rejected') console.error('coaching-enquiry: notification email failed', notify.reason);
  if (autoReply.status === 'rejected') console.error('coaching-enquiry: auto-reply email failed', autoReply.reason);
  if (sheet.status === 'rejected') console.error('coaching-enquiry: sheet append failed', sheet.reason);
  if (beehiiv.status === 'rejected') console.error('coaching-enquiry: beehiiv add failed', beehiiv.reason);

  // Notification email is the only thing Emma actually needs to act on the enquiry.
  // Sheet + auto-reply + Beehiiv are nice-to-haves — don't show the user an error if they fail.
  if (notify.status === 'rejected') {
    return new Response(JSON.stringify({ error: 'Notification email failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
