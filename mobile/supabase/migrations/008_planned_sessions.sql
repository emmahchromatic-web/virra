create table public.planned_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  block_id        uuid not null references public.training_blocks(id) on delete cascade,
  scheduled_date  date not null,
  week_number     integer not null check (week_number >= 1),
  day_of_week     integer not null check (day_of_week between 0 and 6),
  modality        text not null check (modality in ('run','strength','swim','yoga','other')),
  session_label   text not null,
  status          text not null default 'planned'
                    check (status in ('planned','completed','dropped','moved')),
  moved_to_id     uuid references public.planned_sessions(id) on delete set null,
  activity_id     uuid references public.activities(id) on delete set null,
  created_at      timestamptz default now()
);

create index planned_sessions_user_date_idx
  on public.planned_sessions (user_id, scheduled_date);

create index planned_sessions_user_month_idx
  on public.planned_sessions (user_id, scheduled_date desc);

create index planned_sessions_activity_idx
  on public.planned_sessions (activity_id)
  where activity_id is not null;

alter table public.planned_sessions enable row level security;
create policy "Users manage own planned sessions"
  on public.planned_sessions for all
  using (auth.uid() = user_id);

alter table public.activities
  add constraint activities_planned_session_id_fkey
  foreign key (planned_session_id) references public.planned_sessions(id)
  on delete set null;

notify pgrst, 'reload schema';
