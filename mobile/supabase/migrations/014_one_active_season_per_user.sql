-- One active season per user at most
create unique index seasons_one_active_per_user
  on public.seasons (user_id)
  where status = 'active';
