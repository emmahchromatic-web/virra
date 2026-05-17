import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'notif_inbox_v1';
const MAX_ITEMS   = 50;

export interface NotificationItem {
  id:          string;
  title:       string;
  body:        string;
  data:        Record<string, unknown> | null;
  deliveredAt: string;       // ISO timestamp
  readAt:      string | null;
}

interface NotificationsState {
  items:       NotificationItem[];
  unreadCount: number;
  hydrated:    boolean;
  hydrate:     () => Promise<void>;
  add:         (input: { id: string; title: string; body: string; data?: Record<string, unknown> | null }) => Promise<void>;
  markAllRead: () => Promise<void>;
  clear:       () => Promise<void>;
}

function computeUnread(items: NotificationItem[]): number {
  return items.reduce((n, it) => (it.readAt === null ? n + 1 : n), 0);
}

async function persist(items: NotificationItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items:       [],
  unreadCount: 0,
  hydrated:    false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const items: NotificationItem[] = raw ? JSON.parse(raw) : [];
      set({ items, unreadCount: computeUnread(items), hydrated: true });
    } catch {
      set({ items: [], unreadCount: 0, hydrated: true });
    }
  },

  add: async ({ id, title, body, data }) => {
    const safeId    = typeof id    === 'string' && id.length    > 0 ? id    : `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeTitle = typeof title === 'string' ? title : '';
    const safeBody  = typeof body  === 'string' ? body  : '';

    const existing = get().items;
    if (existing.some((it) => it.id === safeId)) return;

    const entry: NotificationItem = {
      id:          safeId,
      title:       safeTitle,
      body:        safeBody,
      data:        data ?? null,
      deliveredAt: new Date().toISOString(),
      readAt:      null,
    };

    const next = [entry, ...existing].slice(0, MAX_ITEMS);
    set({ items: next, unreadCount: computeUnread(next) });
    await persist(next);
  },

  markAllRead: async () => {
    const nowIso = new Date().toISOString();
    const next   = get().items.map((it) => (it.readAt === null ? { ...it, readAt: nowIso } : it));
    set({ items: next, unreadCount: 0 });
    await persist(next);
  },

  clear: async () => {
    set({ items: [], unreadCount: 0 });
    await persist([]);
  },
}));
