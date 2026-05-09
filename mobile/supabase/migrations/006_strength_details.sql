create table public.strength_details (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid unique not null references public.activities(id) on delete cascade,
  session_type   text check (session_type in ('lower', 'upper', 'strength')),
  exercises_json jsonb not null default '[]'::jsonb,
  created_at     timestamptz default now()
);

alter table public.strength_details enable row level security;

create policy "Users manage own strength details"
  on public.strength_details for all
  using (auth.uid() = (select user_id from public.activities where id = activity_id));
