-- training_blocks: one row per active training commitment.
-- is_primary=true = the user's main run plan; is_primary=false = supplementary modality (strength, swim, yoga).
-- load_modifier controls what fraction of that plan's volume is scheduled (0.0–2.0; 1.0 = full).
-- event_id is reserved for Phase E Part 2 (multi-event planning); nullable for now.
create table if not exists training_blocks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  template_id    uuid references plan_templates(id) on delete set null,
  starts_on      date not null default current_date,
  ends_on        date,
  load_modifier  numeric not null default 1.0 check (load_modifier >= 0 and load_modifier <= 2.0),
  modality       text not null check (modality in ('run', 'strength', 'swim', 'yoga', 'other')),
  is_primary     boolean not null default false,
  event_id       uuid,
  created_at     timestamptz default now()
);

-- user_events: target races for multi-event planning (Phase E Part 2 — reserved).
create table if not exists user_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  event_date     date not null,
  distance_goal  text,
  priority       integer not null default 1 check (priority between 1 and 3),
  created_at     timestamptz default now()
);

alter table training_blocks
  add constraint training_blocks_event_id_fkey
  foreign key (event_id) references user_events(id) on delete set null;

alter table training_blocks enable row level security;
create policy "Users manage own training blocks" on training_blocks
  for all using (auth.uid() = user_id);

alter table user_events enable row level security;
create policy "Users manage own events" on user_events
  for all using (auth.uid() = user_id);
