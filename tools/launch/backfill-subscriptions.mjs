#!/usr/bin/env node
// Card 312, launch day. Fills public.user_subscriptions for everyone who
// subscribed or trialled BEFORE the RevenueCat webhook existed, so that
// flipping app_settings.enforce_pro does not lock paying users out.
//
// Reads each Supabase user's subscriber record from RevenueCat's REST API and
// upserts one row per user. Safe to re-run. Never touches a manual (QA) row.
// Dry run by default: it prints what it would write and changes nothing.
//
//   RC_SECRET_KEY=sk_...  SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=...  node tools/launch/backfill-subscriptions.mjs
//   ...same, plus --write to actually upsert.
//
// Keys come from the environment and are never printed. Run it from a machine
// that is allowed to hold them (Paul's), not from a chat session.

const ENTITLEMENT = 'virra_pro';
const WRITE = process.argv.includes('--write');
const { RC_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const sb = (path, init = {}) => fetch(`${SUPABASE_URL}${path}`, {
  ...init,
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  },
});

/** Pure: RevenueCat subscriber JSON -> row, or null when she never held the entitlement. */
export function rowFromSubscriber(userId, subscriber, nowMs = Date.now()) {
  const ent = subscriber?.entitlements?.[ENTITLEMENT];
  if (!ent) return null;
  const sub = subscriber.subscriptions?.[ent.product_identifier] ?? {};
  const expiresMs = ent.expires_date ? Date.parse(ent.expires_date) : null;
  return {
    user_id:         userId,
    entitlement:     ENTITLEMENT,
    is_active:       expiresMs === null || expiresMs > nowMs,
    period_type:     (sub.period_type ?? 'normal').toUpperCase(),
    product_id:      ent.product_identifier ?? null,
    store:           (sub.store ?? '').toUpperCase() || null,
    environment:     sub.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
    expires_at:      expiresMs === null ? null : new Date(expiresMs).toISOString(),
    last_event_type: 'BACKFILL',
    last_event_at:   new Date(nowMs).toISOString(),
    source:          'revenuecat',
  };
}

async function allUserIds() {
  const ids = [];
  for (let page = 1; ; page++) {
    const res = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) throw new Error(`auth admin list failed: ${res.status}`);
    const { users } = await res.json();
    ids.push(...users.map((u) => u.id));
    if (users.length < 200) break;
  }
  return ids;
}

async function main() {
  for (const [k, v] of Object.entries({ RC_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
    if (!v) { console.error(`Missing env var ${k}`); process.exit(1); }
  }
  const [ids, manualRes] = await Promise.all([
    allUserIds(),
    sb(`/rest/v1/user_subscriptions?select=user_id&source=eq.manual`),
  ]);
  const manual = new Set((await manualRes.json()).map((r) => r.user_id));
  console.log(`${ids.length} users, ${manual.size} manual rows left alone. ${WRITE ? 'WRITING' : 'Dry run (add --write to apply)'}`);

  let active = 0, lapsed = 0, never = 0, failed = 0;
  for (const id of ids) {
    if (manual.has(id)) continue;
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${RC_SECRET_KEY}` },
    });
    if (!res.ok) { failed++; console.warn(`  ${id}: RevenueCat ${res.status}`); continue; }
    const row = rowFromSubscriber(id, (await res.json()).subscriber);
    if (!row) { never++; continue; }
    row.is_active ? active++ : lapsed++;
    console.log(`  ${id}  ${row.is_active ? 'ACTIVE' : 'lapsed'}  ${row.period_type}  until ${row.expires_at ?? 'n/a'}`);
    if (WRITE) {
      const up = await sb('/rest/v1/user_subscriptions?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) { failed++; console.warn(`  ${id}: upsert ${up.status} ${await up.text()}`); }
    }
    await new Promise((r) => setTimeout(r, 120)); // stay well under RevenueCat's rate limit
  }
  console.log(`\nactive ${active} · lapsed ${lapsed} · never subscribed ${never} · failed ${failed}`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
