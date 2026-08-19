-- 20260819010000_get_strong_plan_templates.sql
--
-- PR2 bridge: give each authored Get Strong programme a plan_templates row so
-- the existing enrol -> schedule machinery (plan/[id] -> trainingBlocks.addBlock
-- -> generateAndSaveSchedule) works unchanged. The row is linked to the content
-- model by a new plan_templates.programme_id column; trainingBlocks.addBlock
-- detects it, pre-fetches the authored sessions, and writes v2 strength
-- structures instead of generated ones.
--
-- Idempotent: the programme-linked rows are deleted and reinserted, and the
-- column adds are guarded with "if not exists".
--
-- NOT applied here — the parent applies it against the live DB.

begin;

-- Link column back to the content model (nullable; only Get Strong rows use it).
alter table public.plan_templates
  add column if not exists programme_id text references public.programmes(id);

-- Picker visibility flag. Existing rows default to visible; the old generic
-- strength template is flipped off below so Get Strong replaces it entirely.
alter table public.plan_templates
  add column if not exists is_active boolean not null default true;

-- Hide the old generic strength template(s) from the picker (browse.tsx filters
-- on is_active). Non-destructive: the row and any FK references survive, and it
-- can be re-enabled by flipping the flag back.
update public.plan_templates
   set is_active = false
 where sport_type = 'strength'
   and programme_id is null;

-- Reseed the programme-bridged templates (delete-then-insert = idempotent).
delete from public.plan_templates where programme_id is not null;

insert into public.plan_templates
  (name, sport_type, duration_weeks, description, tagline, sort_order, programme_id, is_active, sessions_json)
select
  p.name,
  'strength',
  12,
  p.full_description,
  p.short_description,
  p.sort_order,
  p.id,
  true,
  (
    -- 12 weeks; the day focus strings repeat every week (index + 1 = day_index).
    -- Periodisation label per 4-week block, with week 4/8/12 as deload.
    select jsonb_agg(
             jsonb_build_object(
               'week',     w.week,
               'km',       0,
               'label',    case
                             when w.week % 4 = 0 then 'Deload'
                             when w.week <= 4    then 'Base'
                             when w.week <= 8    then 'Build'
                             else                     'Peak'
                           end,
               'sessions', focuses.arr
             )
             order by w.week
           )
    from generate_series(1, 12) as w(week)
  ) as sessions_json
from public.programmes p
cross join lateral (
  select jsonb_agg(pd.focus order by pd.day_index) as arr
  from public.programme_days pd
  where pd.programme_id = p.id
) as focuses
where p.id like 'get-strong-%'
  and p.is_active = true;

commit;

notify pgrst, 'reload schema';
