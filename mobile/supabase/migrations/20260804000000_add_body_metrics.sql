-- Body metrics captured in the optional onboarding "Personalise your fuelling"
-- step. Used to compute individualised nutrition targets (BMR from date_of_birth
-- + height_cm, combined with HealthKit weight when track_weight is enabled).
-- track_weight already exists from the Phase G weight work.
alter table public.user_profiles
  add column if not exists date_of_birth date,
  add column if not exists height_cm     numeric;
