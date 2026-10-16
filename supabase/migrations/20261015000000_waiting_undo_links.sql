-- ShiftCred, second migration (2026-10-15 audit fixes). Adds, without changing any
-- existing function or table:
--   kitchen_waiting  every shift still waiting at a kitchen from before a given day, so a
--                    shift nobody decided by the next day can still be decided (the
--                    dashboard could only reach today and yesterday)
--   undo_decision    puts a confirmed or rejected shift back to waiting, for 24 hours
--   device links     make_link_code / use_link_code join two of one person's browsers, so
--                    my_shifts returns the shifts checked in from either (on iPhone the
--                    camera opens the poster in Safari, and a Home Screen app has its own
--                    storage, so it never saw those shifts)
--
-- Same conventions as 20260927000000_shiftcred.sql: security definer with a pinned
-- search_path, EXECUTE revoked from everyone and granted back narrowly, RLS on with no
-- policies for tables reached only through these functions.

-- ---------------------------------------------------------------------------
-- kitchen_waiting
-- ---------------------------------------------------------------------------

-- The kitchen's pending shifts dated (California date of check-in) before p_before and at
-- most 90 days before it, oldest first. The dashboard passes yesterday's date, so this is
-- exactly what its Today and Yesterday views can't show.
create function public.kitchen_waiting(p_slug text, p_pin text, p_before date)
returns table (
  id uuid, kitchen_id uuid, check_in timestamptz, check_out timestamptz, status text,
  auto_closed boolean, confirmed_by text, reason text, decided_at timestamptz,
  kitchen_name text, volunteer_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kitchen uuid;
begin
  if p_before is null then
    raise exception 'not_found';
  end if;
  v_kitchen := public._check_pin(p_slug, p_pin);
  perform public._auto_close(null, v_kitchen);
  return query
    select r.* from public._kitchen_shift_rows(v_kitchen, null, null) r
     where r.status = 'pending'
       and (r.check_in at time zone 'America/Los_Angeles')::date < p_before
       and (r.check_in at time zone 'America/Los_Angeles')::date >= p_before - 90;
end;
$$;

-- ---------------------------------------------------------------------------
-- undo_decision
-- ---------------------------------------------------------------------------

-- A mistaken tap on Confirm or Reject can be taken back for 24 hours after it was made.
-- The shift goes back to pending with no decision; its check-out (including an end time the
-- supervisor corrected) is kept. After 24 hours a decision is final here, so a PIN can't be
-- used weeks later to quietly take back hours a volunteer already showed their county.
create function public.undo_decision(p_slug text, p_pin text, p_shift_id uuid)
returns table (
  id uuid, kitchen_id uuid, check_in timestamptz, check_out timestamptz, status text,
  auto_closed boolean, confirmed_by text, reason text, decided_at timestamptz,
  kitchen_name text, volunteer_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kitchen uuid;
  v_id uuid;
begin
  v_kitchen := public._check_pin(p_slug, p_pin);
  update public.shifts s
     set status = 'pending',
         confirmed_by = null,
         reason = null,
         decided_at = null
   where s.id = p_shift_id
     and s.kitchen_id = v_kitchen
     and s.status in ('confirmed', 'rejected')
     and s.decided_at > now() - interval '24 hours'
  returning s.id into v_id;
  if v_id is null then
    raise exception 'not_found';
  end if;
  return query select * from public._kitchen_shift_rows(v_kitchen, null, v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Device links
-- ---------------------------------------------------------------------------

-- One short-lived code per user. Single use; making a new one replaces the old one.
create table public.link_codes (
  code text primary key check (code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
-- Users in the same group see each other's shifts in my_shifts. A user with no row is in a
-- group of one.
create table public.device_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  group_id uuid not null,
  linked_at timestamptz not null default now()
);
create index device_links_group on public.device_links(group_id);
-- Wrong codes, per user, for the guess limit. use_link_code reports a wrong code by its
-- return value instead of raising, so this row is not rolled back with the transaction.
create table public.link_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index link_attempts_user_at on public.link_attempts(user_id, at);

alter table public.link_codes enable row level security;
alter table public.device_links enable row level security;
alter table public.link_attempts enable row level security;
revoke all on table public.link_codes, public.device_links, public.link_attempts
  from public, anon, authenticated;
revoke all on sequence public.link_attempts_id_seq from public, anon, authenticated;

-- The caller and everyone linked with them.
create function public._linked_users(p_user uuid) returns setof uuid
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select p_user
  union
  select d2.user_id from public.device_links d1
    join public.device_links d2 on d2.group_id = d1.group_id
   where d1.user_id = p_user
$$;

-- A new code for the signed-in user: 8 characters from 31 that can't be misread
-- (no 0/O, 1/I/L), about 2^39.6 possibilities, valid for 15 minutes. Bytes at or above
-- 248 (8 * 31) are redrawn so every character is equally likely.
create function public.make_link_code()
returns table (code text, expires_at timestamptz)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
-- The OUT columns code and expires_at are plpgsql variables here; prefer table columns.
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_b int;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if v_uid is null then
    raise exception 'not_checked_in';
  end if;
  delete from public.link_codes l where l.user_id = v_uid or l.expires_at < now();
  loop
    v_code := '';
    while char_length(v_code) < 8 loop
      v_b := get_byte(extensions.gen_random_bytes(1), 0);
      if v_b < 248 then
        v_code := v_code || substr(v_alphabet, v_b % 31 + 1, 1);
      end if;
    end loop;
    begin
      insert into public.link_codes(code, user_id, expires_at) values (v_code, v_uid, v_expires);
      exit;
    exception when unique_violation then
      -- Another user's live code; draw again.
    end;
  end loop;
  return query select v_code, v_expires;
end;
$$;

-- Joins the signed-in user with the owner of p_code. Returns one of:
--   ok        linked (or already linked)
--   bad_code  no such live code, or the caller's own code
--   locked    5 wrong codes in the last 15 minutes; try again later
-- Spaces and dashes are ignored and letters may be lowercase. A code works once.
create function public.use_link_code(p_code text)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_owner uuid;
  v_mine uuid;
  v_theirs uuid;
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'not_checked_in';
  end if;
  -- One caller at a time, so parallel guesses can't all slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('shiftcred.link:' || v_uid::text, 0));
  if (select count(*) from public.link_attempts a
       where a.user_id = v_uid and a.at > now() - interval '15 minutes') >= 5 then
    return 'locked';
  end if;

  delete from public.link_codes l
   where l.code = v_code and l.expires_at >= now() and l.user_id <> v_uid
  returning l.user_id into v_owner;
  if v_owner is null then
    insert into public.link_attempts(user_id) values (v_uid);
    return 'bad_code';
  end if;

  select d.group_id into v_mine from public.device_links d where d.user_id = v_uid;
  select d.group_id into v_theirs from public.device_links d where d.user_id = v_owner;
  v_group := coalesce(v_theirs, v_mine, gen_random_uuid());
  if v_mine is not null and v_mine <> v_group then
    update public.device_links d set group_id = v_group where d.group_id = v_mine;
  end if;
  insert into public.device_links(user_id, group_id) values (v_uid, v_group), (v_owner, v_group)
  on conflict (user_id) do update set group_id = excluded.group_id;
  return 'ok';
end;
$$;

-- my_shifts now returns the shifts of every linked user. Same signature and columns, so
-- clients deployed before this migration keep working.
create or replace function public.my_shifts(p_since date)
returns table (
  id uuid, kitchen_id uuid, check_in timestamptz, check_out timestamptz, status text,
  auto_closed boolean, confirmed_by text, reason text, decided_at timestamptz,
  kitchen_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_user uuid;
begin
  if v_uid is null then
    return;
  end if;
  for v_user in select u from public._linked_users(v_uid) u loop
    perform public._auto_close(v_user, null);
  end loop;
  return query
    select s.id, s.kitchen_id, s.check_in, s.check_out, s.status,
           s.auto_closed, s.confirmed_by, s.reason, s.decided_at, k.name
      from public.shifts s
      join public.kitchens k on k.id = s.kitchen_id
     where s.user_id in (select u from public._linked_users(v_uid) u)
       and (s.check_in at time zone 'America/Los_Angeles')::date >= p_since
     order by s.check_in, s.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.kitchen_waiting(text, text, date) from public, anon, authenticated;
revoke all on function public.undo_decision(text, text, uuid) from public, anon, authenticated;
revoke all on function public._linked_users(uuid) from public, anon, authenticated;
revoke all on function public.make_link_code() from public, anon, authenticated;
revoke all on function public.use_link_code(text) from public, anon, authenticated;
-- create or replace keeps my_shifts' existing grants; restated so this file says so.
revoke all on function public.my_shifts(date) from public, anon, authenticated;

-- Kitchen RPCs are PIN-gated, and supervisors have no session.
grant execute on function public.kitchen_waiting(text, text, date) to anon, authenticated;
grant execute on function public.undo_decision(text, text, uuid) to anon, authenticated;
-- Linking needs an identity on both sides.
grant execute on function public.make_link_code() to authenticated;
grant execute on function public.use_link_code(text) to authenticated;
grant execute on function public.my_shifts(date) to authenticated;
