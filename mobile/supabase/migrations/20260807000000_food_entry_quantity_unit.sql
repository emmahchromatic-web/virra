-- Foods logged by volume (oils, drinks) were displayed in grams, because the
-- quantity column has always been quantity_g and nothing recorded what the
-- number actually meant.
--
-- The number itself does not change: for the drinks people log, 1 ml is close
-- enough to 1 g that the stored macros are already correct. Only the unit was
-- missing, so this adds it rather than converting anything.
--
-- Existing rows default to 'g', which is right for the overwhelming majority
-- of them and matches what was displayed before.

alter table food_entries
  add column if not exists quantity_unit text not null default 'g'
    check (quantity_unit in ('g', 'ml'));

comment on column food_entries.quantity_unit is
  'Unit for quantity_g: g for foods sold by mass, ml for foods sold by volume. '
  'The column name quantity_g is historical; the value is unit-agnostic.';
