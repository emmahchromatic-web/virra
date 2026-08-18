-- Personalised weight bands: per-phase [lower, upper] delta-from-baseline ranges
-- learned from the user's own body_weights history, replacing the fixed
-- population EXPECTED_BAND for classification and the cycle weight chart.
-- Recomputed alongside weight_baseline_kg whenever weight data changes
-- (see lib/weightBaseline.ts computeBaseline). Nullable — absent phases fall back
-- to the population band client-side.
alter table public.user_profiles
  add column if not exists weight_phase_bands jsonb;
