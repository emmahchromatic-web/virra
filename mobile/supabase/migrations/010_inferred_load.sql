alter table public.nutrition_logs
  add column if not exists inferred_load text
  check (inferred_load in ('rest', 'easy', 'moderate', 'hard'));

notify pgrst, 'reload schema';
