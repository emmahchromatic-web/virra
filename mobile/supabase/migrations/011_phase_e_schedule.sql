-- 1. Target finish time for race events (optional, user-set)
alter table public.user_events
  add column if not exists target_finish_time text;
-- Format: 'H:MM:SS' or 'HH:MM:SS', e.g. '4:15:00'. Nullable — validated in app.

-- 2. Prevent duplicate planned sessions for same user/date/modality/label
create unique index if not exists planned_sessions_no_clash_idx
  on public.planned_sessions (user_id, scheduled_date, modality, session_label)
  where status in ('planned', 'completed');
-- Allows upper + lower strength on same day (different session_label).
-- Blocks duplicate tempo run on same day at DB level.

notify pgrst, 'reload schema';
