-- ─── insights_cache ────────────────────────────────────────────────────────
-- New table per Phase D spec. Distinct from the older insight_cache (singular).
create table public.insights_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  insight_type    text not null check (insight_type in ('dashboard', 'weekly')),
  phase           text not null,
  training_text   text not null,
  nutrition_text  text not null,
  overall_text    text,
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  input_tokens    integer,
  output_tokens   integer,
  unique (user_id, insight_type)
);

alter table public.insights_cache enable row level security;

create policy "Users read own insights"
  on public.insights_cache for select using (auth.uid() = user_id);

-- ─── user_events — add notes column ───────────────────────────────────────
-- user_events already exists from Phase E pre-shipping (has distance_goal, priority).
-- priority has default 1 so inserts without it work fine.
-- Just add the notes column needed by the AddEventModal.
alter table public.user_events
  add column if not exists notes text;

-- ─── Cache invalidation ────────────────────────────────────────────────────
-- Triggers expire insights_cache when underlying data changes.
-- Haiku is only re-called on next screen focus after expiry.

create or replace function expire_insights_cache()
returns trigger language plpgsql security definer as $$
begin
  update public.insights_cache
  set expires_at = now()
  where user_id = coalesce(new.user_id, old.user_id);
  return null;
end;
$$;

create trigger trg_insights_expire_activities
  after insert on public.activities
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_planned_sessions
  after update of status on public.planned_sessions
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_symptom_logs
  after insert on public.symptom_logs
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_user_events
  after insert or update or delete on public.user_events
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_training_blocks
  after insert on public.training_blocks
  for each row execute function expire_insights_cache();

notify pgrst, 'reload schema';
