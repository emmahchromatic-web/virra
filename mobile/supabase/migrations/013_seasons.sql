-- Seasons aggregate: links 2+ user_events into a continuous training arc.
-- See docs/superpowers/specs/2026-05-13-phase-e-sub3b-multi-event-design.md
create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'active'
                check (status in ('active','completed','abandoned')),
  created_at  timestamptz default now()
);

create index seasons_user_active_idx
  on public.seasons (user_id, status);

alter table public.seasons enable row level security;
create policy "Users manage own seasons"
  on public.seasons for all
  using (auth.uid() = user_id);

-- user_events: priority already exists as integer (1=A, 2=B, 3=C). Add season link + sequence.
alter table public.user_events
  add column season_id          uuid references public.seasons(id) on delete set null,
  add column sequence_position  integer;

-- training_blocks: season link
alter table public.training_blocks
  add column season_id uuid references public.seasons(id) on delete set null;

-- planned_sessions: phase tag populated by the periodisation engine
alter table public.planned_sessions
  add column phase text check (phase in ('recovery','base','build','peak','taper','race'));

notify pgrst, 'reload schema';
