-- Phase H — Nutrition Input Expansion
--
-- Tags each food_entries row with how it was created so the UI can show
-- provenance (e.g. an "EST." badge on Haiku-estimated rows) and the
-- estimate-meal edge function can rate-limit per user.
--
-- Columns:
--   source       — how the row was created. 'manual' default keeps existing rows valid.
--   confidence   — model self-reported estimate quality, 0..1. NULL for non-haiku rows.
--   haiku_input  — the original natural-language meal description, so the user
--                  can re-parse or audit the estimate later. NULL for non-haiku rows.

alter table food_entries
  add column if not exists source       text    not null default 'manual'
    check (source in ('manual','common','off','barcode','haiku')),
  add column if not exists confidence   numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists haiku_input  text;

-- The estimate-meal rate limit counts recent haiku-source rows per user.
-- food_entries has no user_id directly — it joins through nutrition_logs —
-- so this index supports the filtered scan before the join.
create index if not exists food_entries_source_created_idx
  on food_entries(source, created_at desc)
  where source = 'haiku';
