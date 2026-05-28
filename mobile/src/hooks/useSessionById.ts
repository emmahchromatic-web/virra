import { useSessionStore } from '@/store/sessionStore';
import type { PlannedSessionRow, SessionId } from '@/store/sessionStore.types';

export function useSessionById(id: SessionId | null): PlannedSessionRow | null {
  return useSessionStore((s) => (id ? s.byId[id] ?? null : null));
}
