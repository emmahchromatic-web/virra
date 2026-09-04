-- Card 246: a default is not an answer.
--
-- `workout_preference` was created NOT NULL DEFAULT 'gym_full'. Nothing has
-- ever asked the user for it: it is not in onboarding and nothing prompts on
-- the training tab. So every account carries 'gym_full' whether or not anyone
-- chose it, and `variantForPreference` silently enrols someone training at home
-- with a pair of dumbbells onto the full-gym variant of a Get Strong programme.
--
-- The app cannot currently tell "chose the gym" from "never asked", which is
-- the actual root of the card. Emma's decision is that dismissing the prompt
-- must leave the preference UNSET and show all variants at enrolment, rather
-- than guessing. That needs a state the column cannot currently express.
--
-- Same principle as `injury_level`, where `declined` is stored so that "asked
-- and refused" stays distinguishable from "never asked".
--
-- Note the CHECK constraint needs no change: in Postgres a CHECK evaluates to
-- NULL for a NULL input and a NULL result passes, so `in (...)` already admits
-- NULL once the NOT NULL is gone.

alter table public.user_profiles alter column workout_preference drop default;
alter table public.user_profiles alter column workout_preference drop not null;

-- Backfill, deliberately narrow.
--
-- Rows holding 'gym_full' are indistinguishable from rows that were never
-- asked, because that was the default. They become unset so the prompt asks
-- properly. Anyone who actively chose dumbbells or bodyweight keeps their
-- answer, since those values can only have come from a real choice.
--
-- The cost is that a user who genuinely chose the gym gets asked once more.
-- That is the right trade pre-launch: asking again is a small annoyance,
-- training someone in a bedroom on a barbell programme is not.
update public.user_profiles
   set workout_preference = null
 where workout_preference = 'gym_full';
