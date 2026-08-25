-- Finish the em-dash sweep: it only ever covered code.
--
-- PR #34 removed em-dashes from mobile/ source, but the Phase Tips copy is
-- seeded into public.tips by migration 20260610000000 and lives in the
-- database, so the sweep never saw it. Six tips still read with an em-dash in
-- production. Raised in build 11 UAT against card 34.
--
-- Rewritten rather than hyphen-swapped. Replacing an em-dash with a spaced
-- hyphen keeps the lazy construction and reads worse than the original; each
-- of these is recast so the sentence does the work the dash was doing.
--
-- Matched on (phase, category) rather than on the old text, so this still
-- applies if the punctuation was already patched by hand in the dashboard.

update public.tips set tip_text =
  'Bleed days call for gentler effort. Walk, stretch, or run easy. Honour how you feel.'
  where phase = 'menstrual' and category = 'training';

update public.tips set tip_text =
  'Rest is training. Your body is doing a lot right now. Sleep and warmth are your tools.'
  where phase = 'menstrual' and category = 'lifestyle';

update public.tips set tip_text =
  'Your peak adaptation window. Your body is primed, so hard sessions pay dividends now.'
  where phase = 'follicular' and category = 'training';

update public.tips set tip_text =
  'Social energy peaks in follicular. Use it. A group run or a class can lift performance.'
  where phase = 'follicular' and category = 'lifestyle';

update public.tips set tip_text =
  'A brief water lift around ovulation is normal. Staying hydrated supports performance.'
  where phase = 'ovulatory' and category = 'nutrition';

update public.tips set tip_text =
  'Effort feels harder now. That is real, not weakness. Run to feel, not to pace.'
  where phase = 'luteal' and category = 'training';
