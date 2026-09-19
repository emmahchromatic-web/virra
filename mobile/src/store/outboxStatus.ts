import { create } from 'zustand';

interface OutboxStatusState {
  syncing:         boolean;
  pendingCount:    number;
  deadLetterCount: number;
  justSynced:      boolean;
  setSyncing:      (syncing: boolean) => void;
  setCounts:       (pendingCount: number, deadLetterCount: number) => void;
  setJustSynced:   (justSynced: boolean) => void;
}

export const useOutboxStatus = create<OutboxStatusState>((set) => ({
  syncing:         false,
  pendingCount:    0,
  deadLetterCount: 0,
  justSynced:      false,
  setSyncing:      (syncing) => set({ syncing }),
  setCounts:       (pendingCount, deadLetterCount) => set({ pendingCount, deadLetterCount }),
  setJustSynced:   (justSynced) => set({ justSynced }),
}));
