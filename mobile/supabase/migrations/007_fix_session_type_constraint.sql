alter table public.strength_details
  drop constraint strength_details_session_type_check,
  add constraint strength_details_session_type_check
    check (session_type in ('lower', 'upper', 'general'));
