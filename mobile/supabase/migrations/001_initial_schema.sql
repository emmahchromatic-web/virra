-- mobile/supabase/migrations/001_initial_schema.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── user_profiles ─────────────────────────────────────────────────────────
create table public.user_profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  fitness_level    text check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  running_goal     text check (running_goal in ('5k', '10k', 'half_marathon', 'marathon')),
  dietary_prefs    text[]   default '{}',
  baseline_pace_seconds_per_km integer,
  weekly_mileage_km  numeric,
  assessment_history jsonb  default '[]',
  onboarding_complete boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table public.user_profiles enable row level security;
create policy "owner_select" on public.user_profiles for select using (auth.uid() = id);
create policy "owner_insert" on public.user_profiles for insert with check (auth.uid() = id);
create policy "owner_update" on public.user_profiles for update using (auth.uid() = id);

-- ── fitness_assessments ───────────────────────────────────────────────────
create table public.fitness_assessments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null default current_date,
  stated_level     text,
  actual_pace_seconds_per_km integer,
  trigger_description text,
  celebrated_at    timestamptz,
  created_at       timestamptz default now()
);
alter table public.fitness_assessments enable row level security;
create policy "owner_all" on public.fitness_assessments using (auth.uid() = user_id);

-- ── cycle_logs ────────────────────────────────────────────────────────────
create table public.cycle_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  period_start     date not null,
  cycle_length_days integer not null default 28,
  phase_overrides  jsonb default '{}',
  created_at       timestamptz default now()
);
alter table public.cycle_logs enable row level security;
create policy "owner_all" on public.cycle_logs using (auth.uid() = user_id);

-- ── symptom_logs ──────────────────────────────────────────────────────────
create table public.symptom_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null default current_date,
  energy           integer check (energy between 1 and 5),
  mood             integer check (mood between 1 and 5),
  sleep_quality    integer check (sleep_quality between 1 and 5),
  symptoms         text[] default '{}',
  notes            text,
  created_at       timestamptz default now(),
  unique (user_id, date)
);
alter table public.sympt_logs enable row level security;
create policy "owner_all" on public.sympt_logs using (auth.uid() = user_id);

-- ── plan_templates ────────────────────────────────────────────────────────
create table public.plan_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  sport_type       text not null default 'run'
                   check (sport_type in ('run', 'swim', 'strength', 'yoga', 'other')),
  distance_goal    text,
  duration_weeks   integer not null,
  sessions_json    jsonb not null default '[]',
  created_at       timestamptz default now()
);
alter table public.plan_templates enable row level security;
create policy "authenticated_select" on public.plan_templates
  for select to authenticated using (true);

-- ── user_plans ────────────────────────────────────────────────────────────
create table public.user_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  template_id      uuid references public.plan_templates(id),
  start_date       date not null,
  goal_date        date,
  is_active        boolean default true,
  created_at       timestamptz default now()
);
alter table public.user_plans enable row level security;
create policy "owner_all" on public.user_plans using (auth.uid() = user_id);

-- ── activities ────────────────────────────────────────────────────────────
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null
                   check (type in ('run', 'swim', 'strength', 'yoga', 'other')),
  started_at       timestamptz not null,
  duration_seconds integer not null,
  distance_meters  numeric,
  notes            text,
  phase_at_time    text check (phase_at_time in ('menstrual','follicular','ovulatory','luteal')),
  hk_uuid          text unique,
  planned_session_id uuid,
  created_at       timestamptz default now()
);
alter table public.activities enable row level security;
create policy "owner_all" on public.activities using (auth.uid() = user_id);

-- ── run_details ───────────────────────────────────────────────────────────
create table public.run_details (
  id               uuid primary key default gen_random_uuid(),
  activity_id      uuid not null references public.activities(id) on delete cascade unique,
  avg_pace_seconds_per_km integer,
  splits_json      jsonb default '[]',
  hr_avg           integer,
  hr_max           integer,
  elevation_gain_meters numeric,
  gps_trace        jsonb,
  created_at       timestamptz default now()
);
alter table public.run_details enable row level security;
create policy "owner_all" on public.run_details using (
  auth.uid() = (select user_id from public.activities where id = activity_id)
);

-- ── nutrition_logs ────────────────────────────────────────────────────────
create table public.nutrition_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null default current_date,
  phase_at_time    text check (phase_at_time in ('menstrual','follicular','ovulatory','luteal')),
  training_load    text check (training_load in ('rest','easy','moderate','hard')),
  targets_json     jsonb not null default '{}',
  created_at       timestamptz default now(),
  unique (user_id, date)
);
alter table public.nutrition_logs enable row level security;
create policy "owner_all" on public.nutrition_logs using (auth.uid() = user_id);

-- ── food_entries ──────────────────────────────────────────────────────────
create table public.food_entries (
  id               uuid primary key default gen_random_uuid(),
  log_id           uuid not null references public.nutrition_logs(id) on delete cascade,
  meal_type        text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  nutritionix_id   text,
  food_name        text not null,
  quantity_g       numeric not null,
  carbs_g          numeric not null default 0,
  protein_g        numeric not null default 0,
  fat_g            numeric not null default 0,
  calories         numeric not null default 0,
  created_at       timestamptz default now()
);
alter table public.food_entries enable row level security;
create policy "owner_all" on public.food_entries using (
  auth.uid() = (select n.user_id from public.nutrition_logs n where n.id = log_id)
);

-- ── articles ──────────────────────────────────────────────────────────────
create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  slug             text not null unique,
  body_md          text not null,
  tags             text[] default '{}',
  linked_feature   text,
  published_at     timestamptz,
  created_at       timestamptz default now()
);
alter table public.articles enable row level security;
create policy "published_select" on public.articles for select to authenticated
  using (published_at is not null and published_at <= now());

-- ── subscriptions ─────────────────────────────────────────────────────────
create table public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade unique,
  rc_customer_id   text,
  status           text not null default 'trial'
                   check (status in ('trial','active','expired','cancelled')),
  trial_end        timestamptz,
  activated_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "owner_select" on public.subscriptions for select using (auth.uid() = user_id);
create policy "service_all" on public.subscriptions using (true);
