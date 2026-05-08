alter table public.user_profiles
  add column if not exists cycle_profile text not null default 'natural';

alter table public.user_profiles
  add constraint user_profiles_cycle_profile_check
  check (cycle_profile in ('natural', 'hormonal', 'irregular', 'perimenopause', 'menopause'));
