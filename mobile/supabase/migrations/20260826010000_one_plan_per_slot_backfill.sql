-- One plan per slot: bring existing rows in line with the rule.
--
-- The rule (Emma, 26 Aug): a runner holds at most one run plan, one strength
-- plan and one mobility/misc plan at a time. Starting a plan in an occupied
-- slot replaces what is in it.
--
-- Two things had to be repaired before that rule holds over existing data.
--
-- 1. Duplicate open blocks in a slot. Starting a plan deactivated every
--    user_plans row but only closed a training_block when the new one was
--    primary, so a second plan of the same modality left the first block open.
--    One account is in this state today: two open "Beginner 5K" run blocks.
--    The most recently started one is what the runner actually chose, so that
--    is the one kept.
--
-- 2. Inverted load modifiers. `sameModalityPrimary ? 1.0 : 0.5` put the
--    supplementary value on the wrong branch, so a runner's first and only
--    plan was stored at 0.5 and the Training tab reported "50% load", while a
--    genuinely supplementary plan got 1.0. Six of the nine open blocks are
--    wrong. Loads are now a property of the slot, not of a primary flag:
--    run 1.0, strength 0.5, support 0.25 -- summing to 1.75, just inside the
--    1.8 ceiling, so the full permitted setup does not scale itself down.
--
-- Verified before writing: 9 open blocks across 7 users, 1 to close, 6 loads
-- to correct. Closed blocks are historical record and are left untouched.

begin;

create temporary table _slot_ranked on commit drop as
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
  where b.ends_on is null or b.ends_on >= current_date;

-- 1. Close everything a slot no longer has room for.
update training_blocks b
   set ends_on = current_date
  from _slot_ranked r
 where b.id = r.id and r.rn > 1;

-- 2. Survivors own their slot, at the slot's load.
update training_blocks b
   set load_modifier = case r.slot when 'run' then 1.0 when 'strength' then 0.5 else 0.25 end,
       is_primary    = true
  from _slot_ranked r
 where b.id = r.id and r.rn = 1;

-- 3. user_plans is the same fact recorded twice; make it agree. A plan is
--    active exactly when it still has an open block.
update user_plans p
   set is_active = false
 where p.is_active
   and not exists (
     select 1 from _slot_ranked r
      where r.rn = 1 and r.user_id = p.user_id and r.template_id = p.template_id
   );

commit;
