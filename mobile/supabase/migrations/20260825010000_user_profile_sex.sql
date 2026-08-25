-- Sex, because the calorie engine has always assumed it.
--
-- nutritionTargets.ts computes resting metabolic rate with the female
-- Mifflin-St Jeor equation, and the fallback tables were written for a
-- recreational female runner. Onboarding never asked, so a male user was
-- silently fuelled by the female formula: the two differ by 166 kcal at rest,
-- which is roughly 230-320 kcal/day once the activity factor is applied.
--
-- Nullable on purpose. Every existing account predates the question, and
-- VIRRA is a female-first product, so an absent value is read as female by
-- the engine and nobody's targets move when this ships.

alter table public.user_profiles
  add column if not exists sex text
    check (sex is null or sex in ('female', 'male'));

comment on column public.user_profiles.sex is
  'Biological sex, used only to pick the resting metabolic rate equation. '
  'NULL means never asked, which the nutrition engine treats as female.';
