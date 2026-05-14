import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function err(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("Unauthorized", 401);

  // Anon client to authenticate the caller
  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
  if (authErr || !user) return err("Unauthorized", 401);

  const userId = user.id;

  // Service-role client for privileged operations
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Best-effort: remove avatar files in the user's storage folder. Swallow errors.
  try {
    const { data: files } = await admin.storage.from("avatars").list(userId);
    if (files?.length) {
      await admin.storage
        .from("avatars")
        .remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch (_e) {
    // intentional: storage cleanup is best-effort and must not block deletion
  }

  // Cascade deletion across user-scoped tables happens via FK constraints
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return err(deleteErr.message, 500);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
});
