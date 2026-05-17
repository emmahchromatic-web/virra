-- Phase H — first-use disclosure for the Haiku meal estimator.
--
-- Set when the user dismisses the explainer that runs once before the
-- describe-meal screen is usable. Nullable means "never seen the
-- explainer yet"; once set, the screen skips straight to the input.

alter table user_profiles
  add column if not exists haiku_disclosure_acknowledged_at timestamptz;
