begin;

-- Card 298 measurement. The app has crash reporting and no analytics, and
-- RevenueCat only knows that a trial started, not which locked tile sent her
-- to the paywall, how many open it and leave, or how many hide Pro features.
-- This is the smallest thing that answers those: an append-only event log,
-- written by the app for the signed-in user, read only through the SQL editor.
--
-- No third-party tool, no device identifiers, nothing but the user id, the
-- event name and a few short labels. It is covered by the existing privacy
-- wording on product analytics; confirm against the app policy at launch.

create table if not exists public.pro_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  event      text not null check (event in (
               'paywall_open', 'paywall_close', 'continue_free',
               'purchase_start', 'purchase_success', 'purchase_cancel', 'purchase_fail',
               'restore_success', 'restore_none',
               'show_pro_features_on', 'show_pro_features_off')),
  feature    text,          -- which locked surface sent her (plans, recipes, ...), null from onboarding
  source     text,          -- 'onboarding' | 'app'
  status     text,          -- her tier at the time: free | expired | trial | active | unknown
  product_id text,
  created_at timestamptz not null default now()
);

create index if not exists pro_events_created_at_idx on public.pro_events (created_at);
create index if not exists pro_events_user_idx       on public.pro_events (user_id, created_at);

alter table public.pro_events enable row level security;

drop policy if exists "owner_insert" on public.pro_events;
create policy "owner_insert" on public.pro_events
  for insert to authenticated with check (auth.uid() = user_id);
-- No select/update/delete policies: the app can add a row and nothing else.

-- The funnel, per locked feature, for the SQL editor:
--   select * from public.pro_funnel;
create or replace view public.pro_funnel
with (security_invoker = true) as
select
  coalesce(feature, '(onboarding)')                                  as feature,
  count(*) filter (where event = 'paywall_open')                     as paywall_opens,
  count(distinct user_id) filter (where event = 'paywall_open')      as people,
  count(*) filter (where event = 'purchase_start')                   as purchase_starts,
  count(*) filter (where event = 'purchase_success')                 as purchases,
  count(*) filter (where event = 'purchase_cancel')                  as apple_sheet_cancelled,
  count(*) filter (where event in ('paywall_close', 'continue_free')) as left_without_buying
from public.pro_events
group by 1
order by paywall_opens desc;

commit;
