-- 20260527000000_widen_modality_check_cycle_hike.sql
-- Widen planned_sessions.modality, training_blocks.modality, and
-- activities.activity_type CHECK constraints to admit 'cycle' and 'hike'.

alter table public.planned_sessions
  drop constraint if exists planned_sessions_modality_check;
alter table public.planned_sessions
  add  constraint planned_sessions_modality_check
       check (modality in ('run','strength','swim','yoga','cycle','hike','other'));

alter table public.training_blocks
  drop constraint if exists training_blocks_modality_check;
alter table public.training_blocks
  add  constraint training_blocks_modality_check
       check (modality in ('run','strength','swim','yoga','cycle','hike','other'));

alter table public.activities
  drop constraint if exists activities_activity_type_check;
alter table public.activities
  add  constraint activities_activity_type_check
       check (activity_type in ('run','strength','swim','yoga','cycle','hike','other'));
