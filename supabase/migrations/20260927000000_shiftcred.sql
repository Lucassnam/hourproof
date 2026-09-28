-- ShiftCred: kitchen QR check-in, supervisor confirmation with a kitchen PIN.
--
-- The database is reached only through the RPC functions below (security definer).
-- Tables have row-level security; a volunteer can read only their own shifts and name,
-- and nothing else is readable or writable directly.
--
-- Errors: every RPC raises an exception whose MESSAGE is exactly one of
--   not_found | already_open_elsewhere | not_checked_in | bad_pin | locked
--   | needs_correction | bad_name
-- (the client maps anything else, e.g. "permission denied", to `network`).
--
-- Times: stored as timestamptz. A shift's date is its California date of check-in:
--   (check_in at time zone 'America/Los_Angeles')::date
-- Shift hours (computed by the client): floor(extract(epoch from (check_out - check_in)) / 900) * 0.25

-- On Supabase pgcrypto already lives in schema `extensions`, so this is a no-op there.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.kitchens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  qr_code text not null unique,
  pin_hash text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.volunteers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id),
  check_in timestamptz not null default now(),
  check_out timestamptz,
  status text not null default 'open' check (status in ('open','pending','confirmed','rejected')),
  auto_closed boolean not null default false,
  confirmed_by text,
  reason text,
  decided_at timestamptz,
  check (check_out is null or check_out >= check_in)
);
create unique index shifts_one_open_per_user on public.shifts(user_id) where status = 'open';
create index shifts_kitchen_day on public.shifts(kitchen_id, check_in);
create table public.pin_attempts (
  id bigserial primary key,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null
);

alter table public.kitchens enable row level security;
alter table public.volunteers enable row level security;
alter table public.shifts enable row level security;
alter table public.pin_attempts enable row level security;
create policy shifts_select_own on public.shifts for select to authenticated using (user_id = auth.uid());
create policy volunteers_select_own on public.volunteers for select to authenticated using (user_id = auth.uid());
-- kitchens and pin_attempts: no policies (RPC only)

-- Defense in depth. Supabase's default privileges grant ALL on every new table and
-- sequence in `public` to anon and authenticated; RLS is the only thing between them
-- and the data unless the grants are narrowed too. Volunteers keep SELECT on their
-- own rows (RLS-filtered); everything else goes through the RPCs.
revoke all on table public.kitchens, public.pin_attempts, public.shifts, public.volunteers
  from public, anon, authenticated;
grant select on table public.shifts, public.volunteers to authenticated;
revoke all on sequence public.pin_attempts_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (granted to no one)
-- ---------------------------------------------------------------------------

-- A new public QR code: 16 random bytes, base64url without padding = 22 characters.
create function public._new_code() returns text
language sql volatile
set search_path = public, extensions, pg_temp
as $$
  select rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
$$;

-- The lazy auto-close: an open shift older than 8 hours becomes pending, ends at
-- check_in + 8h and is flagged auto_closed so the supervisor can correct it.
-- NULL arguments mean "any user" / "any kitchen".
create function public._auto_close(p_user uuid default null, p_kitchen uuid default null)
returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.shifts s
     set status = 'pending',
         check_out = s.check_in + interval '8 hours',
         auto_closed = true
   where s.status = 'open'
     and s.check_in < now() - interval '8 hours'
     and (p_user is null or s.user_id = p_user)
     and (p_kitchen is null or s.kitchen_id = p_kitchen);
end;
$$;

-- PIN lockout state.
--
-- WHY NOT pin_attempts: every RPC runs in one transaction (PostgREST does this per
-- request), and a wrong PIN has to end in `raise exception 'bad_pin'`, which rolls
-- back everything that transaction wrote, including an inserted failure row. A table
-- can therefore never count failures, and a lockout built on one never locks (the
-- PGlite test proved this: 5 bad_pin calls left 0 rows). Sequence writes are the one
-- thing Postgres does not roll back ("setval ... [is] not undone if the calling
-- transaction rolls back"), so each kitchen gets a sequence holding its lock state,
-- packed as last_failure_epoch_seconds * 16 + failures_count, and a transaction-
-- scoped advisory lock serializes the read-modify-write per kitchen.
--
-- Rule: 5 wrong PINs, each within 15 minutes of the previous one, lock the kitchen
-- until 15 minutes after the last wrong PIN. Refused calls while locked do not
-- compare the PIN (a correct PIN is refused too) and do not extend the lock.
-- This is at least as strict as "5 failures in any 15-minute window".
-- pin_attempts keeps its schema but only ever holds successful unlocks (audit).
create schema shiftcred_private;
revoke all on schema shiftcred_private from public, anon, authenticated;

create function public._pin_lock_seq(p_kitchen uuid) returns text
language sql immutable
set search_path = public, extensions, pg_temp
as $$
  select format('shiftcred_private.%I', 'pin_lock_' || replace(p_kitchen::text, '-', ''))
$$;

-- Every kitchen gets its lock sequence in the same transaction that creates it.
-- (Creating it lazily inside _check_pin would not work: DDL IS rolled back, so the
-- first wrong PIN would drop the sequence it had just created.)
create function public.tg_kitchens_pin_lock() returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
begin
  execute format('create sequence %s as bigint minvalue 0 start 0', public._pin_lock_seq(new.id));
  return new;
end;
$$;
create trigger kitchens_pin_lock after insert on public.kitchens
  for each row execute function public.tg_kitchens_pin_lock();

-- Checks a kitchen PIN and returns the kitchen id, or raises not_found / locked / bad_pin.
create function public._check_pin(p_slug text, p_pin text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_hash text;
  v_seq text;
  v_state bigint;
  v_last bigint;
  v_fails int;
  v_now bigint := floor(extract(epoch from now()))::bigint;
  v_ok boolean;
begin
  select k.id, k.pin_hash into v_id, v_hash
    from public.kitchens k
   where k.slug = p_slug and k.active;
  if v_id is null then
    raise exception 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('shiftcred.pin:' || v_id::text, 0));
  v_seq := public._pin_lock_seq(v_id);
  -- A missing sequence raises "relation does not exist": the kitchen fails closed.
  execute format('select last_value from %s', v_seq) into v_state;
  v_last := v_state / 16;
  v_fails := (v_state % 16)::int;
  if v_now - v_last >= 900 then
    v_fails := 0;
  end if;
  if v_fails >= 5 then
    raise exception 'locked';
  end if;

  v_ok := p_pin is not null and crypt(p_pin, v_hash) = v_hash;
  if not v_ok then
    perform setval(v_seq::regclass, v_now * 16 + v_fails + 1);  -- survives the raise below
    raise exception 'bad_pin';
  end if;
  insert into public.pin_attempts(kitchen_id, ok) values (v_id, true);
  return v_id;
end;
$$;

-- The rows a supervisor sees: one shift (p_shift) or one California day (p_day).
create function public._kitchen_shift_rows(p_kitchen uuid, p_day date default null, p_shift uuid default null)
returns table (
  id uuid, kitchen_id uuid, check_in timestamptz, check_out timestamptz, status text,
  auto_closed boolean, confirmed_by text, reason text, decided_at timestamptz,
  kitchen_name text, volunteer_name text
)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select s.id, s.kitchen_id, s.check_in, s.check_out, s.status,
         s.auto_closed, s.confirmed_by, s.reason, s.decided_at,
         k.name, coalesce(v.display_name, '')
    from public.shifts s
    join public.kitchens k on k.id = s.kitchen_id
    left join public.volunteers v on v.user_id = s.user_id
   where s.kitchen_id = p_kitchen
     and (p_shift is null or s.id = p_shift)
     and (p_day is null or (s.check_in at time zone 'America/Los_Angeles')::date = p_day)
   order by s.check_in, s.id
$$;

-- ---------------------------------------------------------------------------
-- Admin (SQL editor only)
-- ---------------------------------------------------------------------------

-- Creates a kitchen and returns its QR code. Run as postgres in the Supabase SQL editor:
--   select public.create_kitchen('Community Kitchen', 'community-kitchen', '123456', '555-0100');
create function public.create_kitchen(p_name text, p_slug text, p_pin text, p_phone text)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text := public._new_code();
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'bad_pin';
  end if;
  insert into public.kitchens(name, slug, qr_code, pin_hash, phone)
  values (btrim(p_name), p_slug, v_code, crypt(p_pin, gen_salt('bf', 10)), nullif(btrim(p_phone), ''));
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create function public.ping() returns int
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$ select 1 $$;

-- An active kitchen by its QR code (no rows if unknown or inactive).
create function public.kitchen_by_code(p_code text)
returns table (id uuid, name text, slug text)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select k.id, k.name, k.slug from public.kitchens k where k.qr_code = p_code and k.active
$$;

create function public.check_in(p_code text, p_name text)
returns public.shifts
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_kitchen uuid;
  v_open public.shifts;
begin
  if v_uid is null then
    raise exception 'not_checked_in';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 40 or v_name ~ '[[:cntrl:]]' then
    raise exception 'bad_name';
  end if;
  select k.id into v_kitchen from public.kitchens k where k.qr_code = p_code and k.active;
  if v_kitchen is null then
    raise exception 'not_found';
  end if;

  perform public._auto_close(v_uid, null);

  insert into public.volunteers(user_id, display_name) values (v_uid, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name;

  select * into v_open from public.shifts s where s.user_id = v_uid and s.status = 'open';
  if found then
    if v_open.kitchen_id <> v_kitchen then
      raise exception 'already_open_elsewhere';
    end if;
    return v_open;
  end if;

  begin
    insert into public.shifts(user_id, kitchen_id) values (v_uid, v_kitchen) returning * into v_open;
  exception when unique_violation then
    -- A concurrent check-in won the one-open-shift index; answer as if we had seen it.
    select * into v_open from public.shifts s where s.user_id = v_uid and s.status = 'open';
    if v_open.kitchen_id is distinct from v_kitchen then
      raise exception 'already_open_elsewhere';
    end if;
  end;
  return v_open;
end;
$$;

-- Closes this user's open shift at this kitchen. A shift left open past 8 hours is
-- capped at check_in + 8h and flagged auto_closed (the same result as the lazy auto-close).
create function public.check_out(p_code text)
returns public.shifts
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_shift public.shifts;
begin
  if v_uid is null then
    raise exception 'not_checked_in';
  end if;
  -- An inactive kitchen still lets a volunteer who is already there check out.
  select k.id into v_kitchen from public.kitchens k where k.qr_code = p_code;
  if v_kitchen is null then
    raise exception 'not_found';
  end if;

  update public.shifts s
     set check_out = least(now(), s.check_in + interval '8 hours'),
         auto_closed = now() > s.check_in + interval '8 hours',
         status = 'pending'
   where s.user_id = v_uid and s.kitchen_id = v_kitchen and s.status = 'open'
  returning * into v_shift;
  if not found then
    raise exception 'not_checked_in';
  end if;
  return v_shift;
end;
$$;

-- This user's shifts whose California check-in date is on or after p_since.
create function public.my_shifts(p_since date)
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
begin
  if v_uid is null then
    return;
  end if;
  perform public._auto_close(v_uid, null);
  return query
    select s.id, s.kitchen_id, s.check_in, s.check_out, s.status,
           s.auto_closed, s.confirmed_by, s.reason, s.decided_at, k.name
      from public.shifts s
      join public.kitchens k on k.id = s.kitchen_id
     where s.user_id = v_uid
       and (s.check_in at time zone 'America/Los_Angeles')::date >= p_since
     order by s.check_in, s.id;
end;
$$;

-- A kitchen's shifts for one California day (supervisor dashboard).
create function public.kitchen_shifts(p_slug text, p_pin text, p_day date)
returns table (
  id uuid, kitchen_id uuid, check_in timestamptz, check_out timestamptz, status text,
  auto_closed boolean, confirmed_by text, reason text, decided_at timestamptz,
  kitchen_name text, volunteer_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kitchen uuid := public._check_pin(p_slug, p_pin);
begin
  perform public._auto_close(null, v_kitchen);
  return query select * from public._kitchen_shift_rows(v_kitchen, p_day, null);
end;
$$;

-- Confirm or reject one shift. p_check_out corrects (or, for an open shift, sets) the end time.
create function public.decide_shift(
  p_slug text, p_pin text, p_shift_id uuid, p_decision text, p_supervisor text,
  p_reason text default null, p_check_out timestamptz default null
)
returns table (
  id uuid, kitchen_id uuid, check_in timestamptz, check_out timestamptz, status text,
  auto_closed boolean, confirmed_by text, reason text, decided_at timestamptz,
  kitchen_name text, volunteer_name text
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kitchen uuid := public._check_pin(p_slug, p_pin);
  v_supervisor text := btrim(p_supervisor);
  v_reason text := nullif(btrim(p_reason), '');
  v_shift public.shifts;
  v_end timestamptz;
begin
  if v_supervisor is null or char_length(v_supervisor) not between 1 and 40 or v_supervisor ~ '[[:cntrl:]]' then
    raise exception 'bad_name';
  end if;
  if p_decision is null or p_decision not in ('confirm', 'reject') then
    raise exception 'needs_correction';
  end if;

  perform public._auto_close(null, v_kitchen);

  select * into v_shift from public.shifts s
   where s.id = p_shift_id and s.kitchen_id = v_kitchen and s.status in ('open', 'pending')
   for update;
  if not found then
    raise exception 'not_found';
  end if;

  v_end := coalesce(p_check_out, v_shift.check_out, now());
  if v_end < v_shift.check_in or v_end > now() then
    raise exception 'needs_correction';
  end if;

  if p_decision = 'confirm' then
    if v_end - v_shift.check_in > interval '10 hours' then
      raise exception 'needs_correction';
    end if;
  else
    if v_reason is null or char_length(v_reason) > 280 then
      raise exception 'needs_correction';
    end if;
  end if;

  update public.shifts s
     set check_out = v_end,
         status = case when p_decision = 'confirm' then 'confirmed' else 'rejected' end,
         confirmed_by = v_supervisor,
         reason = v_reason,
         decided_at = now()
   where s.id = v_shift.id;

  return query select * from public._kitchen_shift_rows(v_kitchen, null, v_shift.id);
end;
$$;

create function public.poster_code(p_slug text, p_pin text)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kitchen uuid := public._check_pin(p_slug, p_pin);
  v_code text;
begin
  select k.qr_code into v_code from public.kitchens k where k.id = v_kitchen;
  return v_code;
end;
$$;

-- Replaces the QR code; every old poster stops working.
create function public.rotate_code(p_slug text, p_pin text)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kitchen uuid := public._check_pin(p_slug, p_pin);
  v_code text := public._new_code();
begin
  update public.kitchens k set qr_code = v_code where k.id = v_kitchen;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's default
-- privileges also grant it to anon, authenticated and service_role. So each function
-- is revoked from all three roles explicitly, then granted back only where intended.

revoke all on function public._new_code() from public, anon, authenticated;
revoke all on function public._auto_close(uuid, uuid) from public, anon, authenticated;
revoke all on function public._check_pin(text, text) from public, anon, authenticated;
revoke all on function public._pin_lock_seq(uuid) from public, anon, authenticated;
revoke all on function public.tg_kitchens_pin_lock() from public, anon, authenticated;
revoke all on function public._kitchen_shift_rows(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.create_kitchen(text, text, text, text) from public, anon, authenticated;

revoke all on function public.ping() from public, anon, authenticated;
revoke all on function public.kitchen_by_code(text) from public, anon, authenticated;
revoke all on function public.check_in(text, text) from public, anon, authenticated;
revoke all on function public.check_out(text) from public, anon, authenticated;
revoke all on function public.my_shifts(date) from public, anon, authenticated;
revoke all on function public.kitchen_shifts(text, text, date) from public, anon, authenticated;
revoke all on function public.decide_shift(text, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.poster_code(text, text) from public, anon, authenticated;
revoke all on function public.rotate_code(text, text) from public, anon, authenticated;

grant execute on function public.ping() to anon, authenticated;
grant execute on function public.kitchen_by_code(text) to anon, authenticated;
-- Volunteer RPCs need an identity. Supabase anonymous sign-in users run as `authenticated`;
-- the bare anon key has no auth.uid(), so it gets no volunteer RPCs.
grant execute on function public.check_in(text, text) to authenticated;
grant execute on function public.check_out(text) to authenticated;
grant execute on function public.my_shifts(date) to authenticated;
-- Kitchen RPCs are PIN-gated, and supervisors have no session.
grant execute on function public.kitchen_shifts(text, text, date) to anon, authenticated;
grant execute on function public.decide_shift(text, text, uuid, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.poster_code(text, text) to anon, authenticated;
grant execute on function public.rotate_code(text, text) to anon, authenticated;
