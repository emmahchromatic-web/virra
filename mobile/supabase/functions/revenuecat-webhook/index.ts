// Card 312. RevenueCat -> user_subscriptions.
//
// RevenueCat POSTs one JSON body per event. We verify the shared secret it
// was configured to send in the Authorization header, map the event to a row
// (see _shared/rcEvent.ts) and upsert it with the service role. Nothing here
// decides whether she is Pro: that is has_pro() in Postgres, which reads
// this table and the enforce_pro switch.
//
// Setup (once, by whoever holds the keys):
//   Supabase -> Edge Functions -> Secrets: RC_WEBHOOK_SECRET = <long random string>
//   RevenueCat -> Project -> Integrations -> Webhooks: URL
//     https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//     Authorization header value: Bearer <the same string>
//   Deploy with --no-verify-jwt (RevenueCat does not hold a Supabase JWT).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rowFromEvent, isStale, type RcEvent } from "./rcEvent.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const secret = Deno.env.get("RC_WEBHOOK_SECRET");
  if (!secret) return reply(500, { error: "RC_WEBHOOK_SECRET not set" });

  const auth = req.headers.get("Authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!constantTimeEqual(presented, secret)) return reply(401, { error: "Unauthorized" });

  let body: { event?: RcEvent };
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid JSON" }); }
  if (!body?.event?.type) return reply(400, { error: "No event" });

  const row = rowFromEvent(body.event);
  // Acknowledge what we deliberately ignore, or RevenueCat retries it forever.
  if (!row) return reply(200, { ok: true, ignored: body.event.type });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: existing, error: readErr } = await service
    .from("user_subscriptions")
    .select("source, last_event_at")
    .eq("user_id", row.user_id)
    .maybeSingle();
  if (readErr) return reply(500, { error: readErr.message });

  // A manual grant (QA account) is not RevenueCat's to revoke.
  if (existing?.source === "manual") return reply(200, { ok: true, ignored: "manual row" });
  if (isStale(row, existing?.last_event_at)) return reply(200, { ok: true, ignored: "stale event" });

  const { error: writeErr } = await service
    .from("user_subscriptions")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (writeErr) return reply(500, { error: writeErr.message });

  return reply(200, { ok: true, user_id: row.user_id, is_active: row.is_active, type: row.last_event_type });
});
