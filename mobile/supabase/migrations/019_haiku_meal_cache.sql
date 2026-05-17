-- Phase H — cache for Haiku meal estimates, keyed by a normalised hash of the
-- description (trim + lowercase + collapse internal whitespace, SHA-256).
--
-- Global, not per-user: the macro estimate for "Wagamama chicken katsu curry"
-- is identical regardless of who asked. Global cache maximises hit rate and
-- keeps no user identity beyond the description text itself.
--
-- No TTL today — descriptions don't go stale. If we change model or system
-- prompt we'll truncate this table manually.

create table if not exists haiku_meal_cache (
  hash          text         primary key,
  description   text         not null,
  result        jsonb        not null,
  created_at    timestamptz  not null default now(),
  last_used_at  timestamptz  not null default now()
);

-- For ops queries — find recently-popular descriptions, prune by recency etc.
create index if not exists haiku_meal_cache_last_used_idx
  on haiku_meal_cache(last_used_at desc);
