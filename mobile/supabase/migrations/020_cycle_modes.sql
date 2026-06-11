-- Add contraception sub-data columns
alter table public.user_profiles
  add column if not exists contraception_type  text,
  add column if not exists has_placebo_week    boolean,
  add column if not exists current_pack_start  date;

-- Expand cycle_profile check constraint to include two new values.
-- Drop the old one (name from 004_cycle_profile.sql) and recreate.
alter table public.user_profiles
  drop constraint if exists user_profiles_cycle_profile_check;

alter table public.user_profiles
  add constraint user_profiles_cycle_profile_check
  check (cycle_profile in (
    'natural', 'hormonal', 'irregular',
    'perimenopause', 'menopause',
    'pregnant_postpartum', 'prefer_not_to_say'
  ));

-- Contraception type constraint (nullable — only set for hormonal profile)
alter table public.user_profiles
  add constraint user_profiles_contraception_type_check
  check (contraception_type in (
    'combined_pill', 'ring', 'patch',
    'mini_pill', 'hormonal_iud', 'implant',
    'injection', 'other'
  ) or contraception_type is null);
