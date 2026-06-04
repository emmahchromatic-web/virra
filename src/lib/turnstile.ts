export async function verifyTurnstile(token: string | null | undefined, ip?: string): Promise<boolean> {
  if (!token) return false;
  const secret = import.meta.env.TURNSTILE_SECRET_KEY;
  // In local dev without the key set, skip verification
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping verification');
    return true;
  }
  const params = new URLSearchParams({ secret, response: token });
  if (ip) params.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: params,
  });
  const data = await res.json() as { success: boolean };
  return data.success;
}
