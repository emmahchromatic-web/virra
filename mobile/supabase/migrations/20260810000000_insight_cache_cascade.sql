-- Account deletion (the delete-account edge function → admin.deleteUser) failed
-- with a non-2xx status because public.insight_cache — the older, singular
-- insight-cache table created directly in the dashboard and still written to by
-- the generate-insight function — had its user_id FK to auth.users set to
-- ON DELETE NO ACTION. With any cached row present, deleting the auth user was
-- blocked by the constraint. Every other user-scoped table already cascades;
-- bring this one in line. (The plural public.insights_cache from migration 009
-- already cascades and is unaffected.)
alter table public.insight_cache
  drop constraint insight_cache_user_id_fkey,
  add constraint insight_cache_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
