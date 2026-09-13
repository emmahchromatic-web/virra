-- Mobility sessions: Pilates-style range-of-movement work.
--
-- Card 264. Emma's decisions, 2026-09-12: she authors them, ONE library serves
-- both uses (scheduled into a week, or tapped as a one-off), and they are
-- phase-aware like the rest of the app.
--
-- WHY NOT REUSE programmes / programme_days / programme_exercises. That trio is
-- shaped by two things mobility does not have. `variant` forces a session to
-- exist three times over (gym, dumbbells, bodyweight) when mat work has no
-- equipment at all, and `block` assumes a 12-week progression these do not run.
-- Storing mobility there would mean writing 'bodyweight' and 1 into every row
-- as a placeholder, which is a lie the next reader has to decode.
--
-- Moves carry their name and description INLINE rather than referencing
-- exercises(id). The persisted v2 workout structure already keeps a
-- description per exercise, so nothing at render time needs the exercise
-- library, and Emma can write a move that does not exist yet without a row
-- being created for it first.

-- Wrapped, because the constraint changes below are drop-then-add: a failed add
-- would otherwise leave those three tables with no modality constraint at all,
-- which is worse than the state this migration is fixing.
begin;

create table if not exists mobility_sessions (
  id          text primary key,                -- slug, e.g. 'hips-and-lower-back'
  name        text not null,
  focus       text,                            -- one line, shown under the name
  minutes     int  not null check (minutes between 5 and 90),
  intensity   text not null check (intensity in ('gentle','moderate','strong')),
  -- Which cycle phases this suits. The app picks a session from these, so an
  -- empty array would make a session unreachable rather than universal.
  phases      text[] not null check (
                cardinality(phases) > 0
                and phases <@ array['menstrual','follicular','ovulatory','luteal']::text[]
              ),
  is_active   boolean not null default true,   -- retire a session without deleting its history
  position    int not null default 0,          -- display order within a length
  created_at  timestamptz not null default now()
);

create table if not exists mobility_session_moves (
  id          bigint generated always as identity primary key,
  session_id  text not null references mobility_sessions(id) on delete cascade,
  position    int  not null,
  name        text not null,
  description text,
  -- Free text, and for mobility it is usually time or breaths: '30s',
  -- '45s each side', '5 breaths'. Mirrors programme_exercises.reps.
  reps        text,
  -- Null for almost every mobility move. Only set where the move genuinely
  -- repeats as rounds: the app estimates 30s per move when this is null, which
  -- is what makes the stated minutes and the timer agree.
  sets        int,
  -- The thing you would say out loud if you were in the room.
  cue         text,
  unique (session_id, position)
);

create index if not exists mobility_session_moves_session_idx
  on mobility_session_moves(session_id, position);

-- Content, so readable by any signed-in user and writable only through the
-- dashboard or the admin console's service role. Same shape as the programme
-- tables in 20260819000000.
alter table mobility_sessions enable row level security;
drop policy if exists "mobility_sessions_read" on mobility_sessions;
create policy "mobility_sessions_read" on mobility_sessions
  for select to authenticated using (true);

alter table mobility_session_moves enable row level security;
drop policy if exists "mobility_session_moves_read" on mobility_session_moves;
create policy "mobility_session_moves_read" on mobility_session_moves
  for select to authenticated using (true);

-- 'mobility' was not a value any of these would accept.
--
-- Found while wiring the one-off path: the workout screen writes
-- `activity_type: modality` when a session is finished, so completing a
-- mobility session would have failed the CHECK with nothing but a constraint
-- error to show for it.
--
-- It is not only the one-off path. The plan browser has had a mobility tab
-- since card 247, filtering plan_templates.sport_type = 'mobility', and the
-- week already reserves a slot for one mobility plan. Scheduling one would have
-- hit the same wall the moment a session was generated or completed. The tab
-- being empty is what has kept this hidden.
--
-- Same three tables and the same shape as 20260527000000, which widened them
-- for 'cycle' and 'hike'.
alter table public.planned_sessions
  drop constraint if exists planned_sessions_modality_check;
alter table public.planned_sessions
  add  constraint planned_sessions_modality_check
       check (modality in ('run','strength','swim','yoga','cycle','hike','mobility','other'));

alter table public.training_blocks
  drop constraint if exists training_blocks_modality_check;
alter table public.training_blocks
  add  constraint training_blocks_modality_check
       check (modality in ('run','strength','swim','yoga','cycle','hike','mobility','other'));

alter table public.activities
  drop constraint if exists activities_activity_type_check;
alter table public.activities
  add  constraint activities_activity_type_check
       check (activity_type in ('run','strength','swim','yoga','cycle','hike','mobility','other'));

commit;
