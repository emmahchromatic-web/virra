-- One plan per slot: bring existing rows in line with the rule.
--
-- The rule (Emma, 26 Aug): a runner holds at most one run plan, one strength
-- plan and one mobility/misc plan at a time. Starting a plan in an occupied
-- slot replaces what is in it.
--
-- Two things had to be repaired before that rule held over existing data.
--
-- 1. Duplicate open blocks in a slot. Starting a plan deactivated every
--    user_plans row but only closed a training_block when the new one was
--    primary, so a second plan of the same modality left the first open. One
--    account was in this state, with two open "Beginner 5K" run blocks. The
--    most recently started one is what the runner actually chose, so that is
--    the one kept.
--
-- 2. Inverted load modifiers. `sameModalityPrimary ? 1.0 : 0.5` put the
--    supplementary value on the wrong branch, so a runner's first and only
--    plan was stored at 0.5 and the Training tab reported "50% load", while a
--    genuinely supplementary plan got 1.0. Load is now a property of the slot:
--    run 1.0, strength 0.5, support 0.25 -- summing to 1.75, just inside the
--    1.8 ceiling, so the full permitted setup does not scale itself down.
--
-- NOTE ON current_date - 1. Blocks are closed with YESTERDAY's date, never
-- today. getActiveBlocks keeps anything with `ends_on >= today`, so a block
-- closed with today's date stays in the stack until tomorrow. The first run of
-- this migration used current_date and the verification query showed the
-- duplicate still open; that is also the bug the accompanying clearSlot() fix
-- addresses. No table is created -- an earlier draft used a temp table, which
-- trips the dashboard's RLS warning for no benefit.
--
-- APPLIED TO PROD 2026-08-26. Verified after: 8 open blocks, 0 duplicate
-- slots, 0 wrong load modifiers, 0 non-primary blocks, 0 active user_plans
-- without an open block. Closed blocks are historical record and are untouched.

with ranked as (
  select b.id, b.user_id, b.template_id,
         case when b.modality = 'run' then 'run'
              when b.modality = 'strength' then 'strength'
              else 'support' end as slot,
         row_number() over (
           partition by b.user_id,
                        case when b.modality = 'run' then 'run'
                             when b.modality = 'strength' then 'strength'
                             else 'support' end
           order by b.starts_on desc, b.id desc
         ) as rn
  from training_blocks b
  where b.ends_on is null or b.ends_on >= current_date
),
closed as (
  update training_blocks b
     set ends_on = current_date - 1
    from ranked r
   where b.id = r.id and r.rn > 1
  returning b.id
),
reloaded as (
  update training_blocks b
     set load_modifier = case r.slot when 'run' then 1.0 when 'strength' then 0.5 else 0.25 end,
         is_primary    = true
    from ranked r
   where b.id = r.id and r.rn = 1
  returning b.id
)
update user_plans p
   set is_active = false
 where p.is_active
   and not exists (
     select 1 from ranked r
      where r.rn = 1 and r.user_id = p.user_id and r.template_id = p.template_id
   );
