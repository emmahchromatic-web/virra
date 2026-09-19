/**
 * The error shape outbox handlers throw when a Supabase write fails.
 *
 * WHY. `drain()` has to decide whether a failure is worth retrying or is
 * permanent, and a bare `new Error(error.message)` throws away the only two
 * fields that answer that reliably: the HTTP status and the PostgREST/Postgres
 * code. Without them a 500 from the database and a 403 from an RLS policy look
 * identical, and the classifier has to guess from prose — which is how an
 * ordinary server blip ended up dead-lettering an hour's workout.
 *
 * Handlers throw this; `outbox.ts` reads `status`/`code` off it. Nothing else
 * should need to know it exists.
 */
export class SupabaseWriteError extends Error {
  readonly status?: number;
  readonly code?:   string;
  readonly details?: string;

  constructor(message: string, meta: { status?: number; code?: string; details?: string } = {}) {
    super(message);
    this.name    = 'SupabaseWriteError';
    this.status  = meta.status;
    this.code    = meta.code;
    this.details = meta.details;
  }
}

/** Narrow an unknown throwable to the three fields the classifier cares about. */
export function describeError(e: unknown): { message: string; status?: number; code?: string } {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return {
      message: typeof o.message === 'string' ? o.message : String(e),
      status:  typeof o.status === 'number' ? o.status
             : typeof o.status === 'string' && o.status.trim() !== '' && Number.isFinite(Number(o.status))
               ? Number(o.status) : undefined,
      code:    typeof o.code === 'string' ? o.code : undefined,
    };
  }
  return { message: String(e) };
}
