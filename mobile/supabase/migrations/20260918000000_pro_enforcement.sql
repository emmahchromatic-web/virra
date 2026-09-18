-- Card 312. Server-side enforcement of Virra Pro.
--
-- Until now Pro was enforced only on the device (card 298): RevenueCat on the
-- phone, locked tiles in the UI. Anyone who patches the bundle can call every
-- Pro data path with a free account, and estimate-meal costs money per call.
--
-- Three pieces:
--   1. user_subscriptions: one row per user, written by the revenuecat-webhook
--      edge function (or by hand for QA accounts, source = 'manual').
--   2. has_pro(uid): the one question every gate asks. 24 h of grace on
--      expires_at so a late webhook never locks a paying user out.
--   3. app_settings.enforce_pro: the switch. OFF at first. Beta testers hold
--      trials from before the webhook existed, so their rows are empty; while
--      the switch is off has_pro() answers true for everyone and the webhook
--      quietly fills the table. Flip it at launch, after the backfill.
--
-- Restrictive INSERT policies sit on the tables only a plan, a programme or
-- the recipe book can write to. Reads of her own rows are untouched: a lapsed
-- subscriber keeps her history, the UI keeps it behind the padlock.

-- 1. The switch --------------------------------------------------------------

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- No policies on purpose: only the service role (edge functions, the SQL
-- editor) reads or writes settings. Clients go through has_pro().

insert into public.app_settings (key, value)
values ('enforce_pro', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

-- 2. Subscriptions ----------------------------------------------------------

create table if not exists public.user_subscriptions (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  entitlement     text not null default 'virra_pro',
  is_active       boolean not null default false,
  period_type     text,                    -- TRIAL | NORMAL | INTRO | PROMOTIONAL
  product_id      text,
  store           text,                    -- APP_STORE | PROMOTIONAL | ...
  environment     text,                    -- SANDBOX | PRODUCTION
  expires_at      timestamptz,
  last_event_type text,
  last_event_at   timestamptz,
  source          text not null default 'revenuecat'
                  check (source in ('revenuecat', 'manual')),
  updated_at      timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

drop policy if exists "owner_select" on public.user_subscriptions;
create policy "owner_select" on public.user_subscriptions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the webhook (service role) writes.

-- 3. The question -----------------------------------------------------------

create or replace function public.pro_enforced()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value->>'enabled')::boolean from public.app_settings where key = 'enforce_pro'),
    false
  );
$$;

create or replace function public.has_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not public.pro_enforced()
    or exists (
      select 1
      from public.user_subscriptions s
      where s.user_id = uid
        and s.entitlement = 'virra_pro'
        and (
          s.is_active
          or (s.expires_at is not null and s.expires_at > now() - interval '24 hours')
        )
    );
$$;

revoke all on function public.pro_enforced() from public;
revoke all on function public.has_pro(uuid) from public;
grant execute on function public.pro_enforced() to authenticated, service_role;
grant execute on function public.has_pro(uuid)  to authenticated, service_role;

-- 4. The gates --------------------------------------------------------------
-- RESTRICTIVE policies AND with the existing owner policies: a row still has
-- to be hers, and now she also has to hold Pro to add it.

do $$
declare
  t text;
begin
  foreach t in array array[
    'planned_sessions',   -- a plan's sessions (run, strength, mobility)
    'user_plans',         -- plan enrolment
    'training_blocks',    -- plan blocks
    'seasons',            -- season built between races
    'training_breaks',    -- pausing a plan
    'strength_details',   -- guided strength logger
    'workout_drafts',     -- guided strength logger, in-progress
    'recipe_favourites'   -- the recipe book
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table does not exist', t;
      continue;
    end if;
    execute format('drop policy if exists "pro_required_insert" on public.%I', t);
    execute format(
      'create policy "pro_required_insert" on public.%I as restrictive for insert to authenticated with check (public.has_pro(auth.uid()))',
      t
    );
  end loop;
end $$;

-- 5. QA accounts ------------------------------------------------------------
-- Internal testers have no App Store entitlement. Give them a manual row:
--   insert into public.user_subscriptions (user_id, is_active, source, last_event_type)
--   values ('<uuid>', true, 'manual', 'MANUAL_GRANT')
--   on conflict (user_id) do update set is_active = true, source = 'manual', updated_at = now();
-- The webhook never overwrites a manual row (see revenuecat-webhook/index.ts).
