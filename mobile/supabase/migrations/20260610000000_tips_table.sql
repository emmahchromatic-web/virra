create table public.tips (
  id           uuid primary key default gen_random_uuid(),
  phase        text not null
                 check (phase in ('menstrual','follicular','ovulatory','luteal','all')),
  category     text not null
                 check (category in ('training','nutrition','lifestyle')),
  tip_text     text not null,
  detail_text  text,
  active       boolean not null default true,
  sort_order   integer,
  created_at   timestamptz not null default now()
);

alter table public.tips enable row level security;

create policy "tips_read_authenticated"
  on public.tips for select
  to authenticated
  using (true);

insert into public.tips (phase, category, tip_text, active) values
  ('menstrual',  'training',   'Bleed days call for gentler effort. Walk, stretch, or run easy. Honour how you feel.',     true),
  ('menstrual',  'nutrition',  'Iron-rich foods support what your body loses during your period. Red meat, lentils, spinach.',       true),
  ('menstrual',  'lifestyle',  'Rest is training. Your body is doing a lot right now. Sleep and warmth are your tools.',             true),
  ('follicular', 'training',   'Your peak adaptation window. Your body is primed, so hard sessions pay dividends now.',               true),
  ('follicular', 'nutrition',  'Oestrogen suppresses appetite in follicular phase. Hit protein targets even when not hungry.',      true),
  ('follicular', 'lifestyle',  'Social energy peaks in follicular. Use it. A group run or a class can lift performance.',          true),
  ('ovulatory',  'training',   'Strength and power peak around ovulation. A good week for PBs and race efforts.',                  true),
  ('ovulatory',  'nutrition',  'A brief water lift around ovulation is normal. Staying hydrated supports performance.',          true),
  ('ovulatory',  'lifestyle',  'Confidence is high right now. Set intentions, have the hard conversations, lead the run.',         true),
  ('luteal',     'training',   'Effort feels harder now. That is real, not weakness. Run to feel, not to pace.',                  true),
  ('luteal',     'nutrition',  'Carb cravings are hormonal signals. Honour them with quality fuel before long efforts.',           true),
  ('luteal',     'lifestyle',  'Sleep quality dips in luteal. Aim for 8h and lower screen time before bed.',                       true);
