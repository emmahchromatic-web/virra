create table public.training_breaks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  break_start date not null,
  break_end   date not null,
  mode        text not null check (mode in ('reschedule', 'skip')),
  block_ids   uuid[] not null default '{}',
  applied_at  timestamptz default now(),
  check (break_end >= break_start)
);

create index training_breaks_user_idx
  on public.training_breaks (user_id, break_start desc);

alter table public.training_breaks enable row level security;
create policy "Users manage own breaks"
  on public.training_breaks for all
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
