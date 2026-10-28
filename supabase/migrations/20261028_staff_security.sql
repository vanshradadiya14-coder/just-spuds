-- =============================================================================
-- JUST SPUDS — STAFF SIGN-IN AND DEVICE PAIRING ON THE SERVER
-- =============================================================================
-- Run ONCE in Supabase › SQL Editor › New query › Run, AFTER the version of the
-- app that ships this file is live. (Older versions of the app can't sign in
-- once this has run.) The result table at the end shows what you need next:
-- a temporary PIN for each owner / manager account and a pairing code for the
-- first devices.
--
-- What changes
--  * PINs are checked here, not in the browser. They are stored as
--    HMAC-SHA256 with a secret key that never leaves the database, in a schema
--    the website's public key cannot read. The old PIN hashes are removed from
--    the public staff and driver lists.
--  * Only paired devices can try a PIN. A manager pairs each till, kitchen
--    screen or phone once with a one-time code (Admin › Staff Accounts).
--  * Wrong PINs lock that device: 5 in a row → 30 s, doubling up to 15 min;
--    25 in a row blocks it until a manager unblocks it.
--  * Every PIN is reset: owners / managers get a temporary PIN below, everyone
--    else gets one from a manager. A temporary PIN must be changed at the
--    first sign-in. The starter PINs published with the app never work again.
--  * The settings table becomes read-only for the public key. The shop's
--    public documents (menu, prices, hours) stay readable; private documents
--    (till list, blocked customers, shifts, timecards, audit log) and every
--    write go through functions that check the device.
--
-- Safe to run again: PINs, devices and sessions are kept. A re-run prints a
-- new pairing code, and temporary PINs only for owner accounts with no PIN.
--
-- Emergencies, from this editor:
--   select jsp_private.reset_pin('usr-owner-1');   -- new temporary PIN
--   select jsp_private.new_pairing_code();         -- new pairing code (24 h)
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists jsp_private;
revoke all on schema jsp_private from public;

-- -----------------------------------------------------------------------------
-- Tables (private schema: not reachable through the website's API)
-- -----------------------------------------------------------------------------

create table if not exists jsp_private.config (
  id int primary key default 1 check (id = 1),
  pepper bytea not null,
  store_prefix text not null,
  created_at timestamptz not null default now()
);

create table if not exists jsp_private.people (
  id text primary key,
  kind text not null check (kind in ('staff', 'driver')),
  name text not null,
  role text not null,
  active boolean not null default true,
  email text,
  pin_lookup text unique,
  pin_set_at timestamptz,
  must_change boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jsp_private.devices (
  id text primary key,
  name text not null,
  token_hash text not null unique,
  paired_at timestamptz not null default now(),
  paired_by text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  fail_streak int not null default 0,
  locked_until timestamptz,
  blocked_at timestamptz
);

create table if not exists jsp_private.pairing_codes (
  code_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  uses_left int not null default 1,
  created_by text
);

create table if not exists jsp_private.sessions (
  token_hash text primary key,
  person_id text not null references jsp_private.people (id) on delete cascade,
  device_id text references jsp_private.devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists sessions_person_idx on jsp_private.sessions (person_id);
create index if not exists sessions_device_idx on jsp_private.sessions (device_id);

create table if not exists jsp_private.events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  ok boolean not null,
  person_id text,
  device_id text,
  ip text,
  detail text
);
create index if not exists events_at_idx on jsp_private.events (at desc);
create index if not exists events_kind_at_idx on jsp_private.events (kind, at desc);

-- Belt and braces: even if the schema were ever exposed, no row is visible.
alter table jsp_private.config enable row level security;
alter table jsp_private.people enable row level security;
alter table jsp_private.devices enable row level security;
alter table jsp_private.pairing_codes enable row level security;
alter table jsp_private.sessions enable row level security;
alter table jsp_private.events enable row level security;
revoke all on all tables in schema jsp_private from public, anon, authenticated;
revoke all on all sequences in schema jsp_private from public, anon, authenticated;

-- One secret key for PIN lookups, and the key prefix the app uses ("just_spuds").
insert into jsp_private.config (id, pepper, store_prefix)
select
  1,
  extensions.gen_random_bytes(32),
  coalesce(
    (select split_part(store_id, '::', 1) from public.delivery_settings
      where split_part(store_id, '::', 2) in ('doc', 'priv', 'rec') limit 1),
    'just_spuds'
  )
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function jsp_private.sha(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

create or replace function jsp_private.pin_lookup(p_pin text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(
    extensions.hmac(convert_to(coalesce(p_pin, ''), 'UTF8'), (select c.pepper from jsp_private.config c where c.id = 1), 'sha256'),
    'hex')
$$;

/** ISO-8601 in UTC with milliseconds — the format the app compares as text. */
create or replace function jsp_private.iso(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function jsp_private.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  return nullif(trim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', h ->> 'x-forwarded-for', ''), ',', 1)), '');
end
$$;

create or replace function jsp_private.log(p_kind text, p_ok boolean, p_person text, p_device text, p_detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into jsp_private.events (kind, ok, person_id, device_id, ip, detail)
  values (p_kind, p_ok, p_person, p_device, jsp_private.client_ip(), left(p_detail, 300));
  -- Housekeeping now and then.
  if random() < 0.02 then
    delete from jsp_private.events where at < now() - interval '120 days';
    delete from jsp_private.sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days';
    delete from jsp_private.pairing_codes where expires_at < now() - interval '7 days';
  end if;
end
$$;

create or replace function jsp_private.is_admin_role(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p in ('STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), false)
$$;

create or replace function jsp_private.is_manager_role(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p in ('SUPERVISOR', 'STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), false)
$$;

create or replace function jsp_private.person_json(p jsp_private.people) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'name', p.name, 'role', p.role, 'active', p.active,
    'email', coalesce(p.email, ''), 'hasPin', p.pin_lookup is not null, 'mustChange', p.must_change,
    'pinSetAt', jsp_private.iso(p.pin_set_at))
$$;

/** Why a PIN can't be used (null = fine): format, short, weak or taken. */
create or replace function jsp_private.pin_problem(p_pin text, p_role text, p_except text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    return 'format';
  end if;
  if jsp_private.is_manager_role(p_role) and length(p_pin) < 6 then
    return 'short';
  end if;
  if p_pin ~ '^([0-9])\1+$' or p_pin ~ '^([0-9]{2})\1+$' or p_pin ~ '^([0-9]{3})\1+$'
     or strpos('01234567890123456789', p_pin) > 0 or strpos('98765432109876543210', p_pin) > 0
     or p_pin = any (array[
       -- starter PINs that shipped with the app (public) and other well-known ones
       '2468', '5555', '3333', '1111', '1234', '8888', '7777', '7778', '7779', '0000',
       '1004', '2000', '6969', '2580', '0852', '1379', '1397', '1590',
       '246810', '135790', '147258', '258369', '159753', '102030', '112233', '696969', '200000', '111222'
     ]) then
    return 'weak';
  end if;
  if exists (select 1 from jsp_private.people p where p.pin_lookup = jsp_private.pin_lookup(p_pin) and p.id is distinct from p_except) then
    return 'taken';
  end if;
  return null;
end
$$;

create or replace function jsp_private.pin_message(p_problem text) returns text
language sql immutable set search_path = '' as $$
  select case p_problem
    when 'format' then 'PINs are 4 to 8 digits.'
    when 'short' then 'Supervisors and managers need a PIN of 6 to 8 digits.'
    when 'weak' then 'Too easy to guess — avoid repeated, sequential or well-known PINs.'
    when 'same' then 'Choose a new PIN — not the one you have now.'
    when 'taken' then 'That PIN can''t be used — choose a different one.'
    else 'That PIN can''t be used.'
  end
$$;

/** Random code from an alphabet without look-alike characters (no 0/O, 1/I/L). */
create or replace function jsp_private.random_code(p_len int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_out text := '';
  b bytea;
  v int;
begin
  while length(v_out) < p_len loop
    b := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      v := get_byte(b, i);
      if v < 248 and length(v_out) < p_len then
        v_out := v_out || substr(alphabet, (v % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  return v_out;
end
$$;

create or replace function jsp_private.random_pin(p_len int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_out text;
  b bytea;
  v int;
begin
  loop
    v_out := '';
    while length(v_out) < p_len loop
      b := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        v := get_byte(b, i);
        if v < 250 and length(v_out) < p_len then
          v_out := v_out || (v % 10)::text;
        end if;
      end loop;
    end loop;
    exit when jsp_private.pin_problem(v_out, 'SUPER_ADMIN', null) is null;
  end loop;
  return v_out;
end
$$;

create or replace function jsp_private.require_device(p_token text) returns jsp_private.devices
language plpgsql security definer set search_path = '' as $$
declare
  d jsp_private.devices;
begin
  select * into d from jsp_private.devices where token_hash = jsp_private.sha(p_token) and revoked_at is null;
  if d.id is null then
    raise exception 'This device is not paired with the shop' using errcode = '28000';
  end if;
  if d.last_seen_at is null or d.last_seen_at < now() - interval '5 minutes' then
    update jsp_private.devices set last_seen_at = now() where id = d.id;
  end if;
  return d;
end
$$;

/** The person behind a live session (null if it ended), sliding its expiry. */
create or replace function jsp_private.session_person(p_token text) returns jsp_private.people
language plpgsql security definer set search_path = '' as $$
declare
  s jsp_private.sessions;
  p jsp_private.people;
begin
  select * into s from jsp_private.sessions
  where token_hash = jsp_private.sha(p_token) and revoked_at is null and expires_at > now();
  if s.token_hash is null then
    return null;
  end if;
  select * into p from jsp_private.people where id = s.person_id and active;
  if p.id is null then
    return null;
  end if;
  if s.device_id is not null and not exists (select 1 from jsp_private.devices d where d.id = s.device_id and d.revoked_at is null) then
    return null;
  end if;
  update jsp_private.sessions
  set expires_at = least(now() + interval '16 hours', created_at + interval '7 days')
  where token_hash = s.token_hash and expires_at < now() + interval '15 hours';
  return p;
end
$$;

create or replace function jsp_private.admin_from_session(p_token text) returns jsp_private.people
language plpgsql security definer set search_path = '' as $$
declare
  p jsp_private.people;
begin
  p := jsp_private.session_person(p_token);
  if p.id is null or p.kind <> 'staff' or not jsp_private.is_admin_role(p.role) or p.must_change then
    return null;
  end if;
  return p;
end
$$;

create or replace function jsp_private.forbidden() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'error', 'forbidden',
    'message', 'Only an owner or store manager can do that. If you were signed in a while ago, sign in again.')
$$;

/** The public staff list every device reads: names and roles, never PIN data. */
create or replace function jsp_private.publish_roster() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := (select c.store_prefix from jsp_private.config c where c.id = 1) || '::doc::staff.roster';
  v_now timestamptz := clock_timestamp();
  v_members jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'role', p.role,
      'status', case when p.active then 'ACTIVE' else 'DISABLED' end,
      'email', coalesce(p.email, ''), 'pinHash', '', 'defaultPin', false,
      'pinSet', p.pin_lookup is not null, 'mustChange', p.must_change,
      'pinSetAt', jsp_private.iso(p.pin_set_at), 'updatedAt', jsp_private.iso(p.updated_at))
      order by p.created_at, p.id), '[]'::jsonb)
  into v_members
  from jsp_private.people p
  where p.kind = 'staff';

  insert into public.delivery_settings (store_id, settings, updated_at)
  values (
    v_key,
    jsonb_build_object(
      'data', jsonb_build_object('salt', 'server', 'managedBy', 'server', 'members', v_members),
      'at', jsp_private.iso(v_now),
      'by', 'server'),
    v_now)
  on conflict (store_id) do update set settings = excluded.settings, updated_at = excluded.updated_at;
end
$$;

-- -----------------------------------------------------------------------------
-- No PIN data in the shared documents, whoever writes them
-- -----------------------------------------------------------------------------

create or replace function jsp_private.scrub_pins() returns trigger
language plpgsql set search_path = '' as $$
begin
  if split_part(new.store_id, '::', 2) = 'doc' then
    if split_part(new.store_id, '::', 3) = 'staff.roster' and jsonb_typeof(new.settings #> '{data,members}') = 'array' then
      new.settings := jsonb_set(new.settings, '{data,members}', (
        select coalesce(jsonb_agg(
          case when jsonb_typeof(m) = 'object' then m || jsonb_build_object('pinHash', '', 'defaultPin', false) else m end
          order by i), '[]'::jsonb)
        from jsonb_array_elements(new.settings #> '{data,members}') with ordinality as t (m, i)));
      new.settings := jsonb_set(new.settings, '{data,salt}', to_jsonb('server'::text));
    elsif split_part(new.store_id, '::', 3) = 'drivers' and jsonb_typeof(new.settings -> 'data') = 'array' then
      new.settings := jsonb_set(new.settings, '{data}', (
        select coalesce(jsonb_agg(
          case when jsonb_typeof(d) = 'object' then (d - 'pin' - 'pinHash') || jsonb_build_object('defaultPin', false) else d end
          order by i), '[]'::jsonb)
        from jsonb_array_elements(new.settings -> 'data') with ordinality as t (d, i)));
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists jsp_scrub_pins on public.delivery_settings;
create trigger jsp_scrub_pins
  before insert or update on public.delivery_settings
  for each row execute function jsp_private.scrub_pins();

-- -----------------------------------------------------------------------------
-- Functions the app calls (exposed through the API, each checks for itself)
-- -----------------------------------------------------------------------------

create or replace function public.jsp_auth_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', true, 'version', 1)
$$;

/** Pair a device with a one-time code from a manager. Returns the device's secret token. */
create or replace function public.jsp_pair_device(p_code text, p_device_id text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := jsp_private.client_ip();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id text := case when coalesce(p_device_id, '') ~ '^[A-Za-z0-9_.:-]{4,80}$' then p_device_id
                    else 'dev_' || encode(extensions.gen_random_bytes(8), 'hex') end;
  v_name text := coalesce(nullif(left(trim(coalesce(p_name, '')), 60), ''), 'Shop device');
  c jsp_private.pairing_codes;
  v_token text;
begin
  if (select count(*) from jsp_private.events e
      where e.kind = 'pair' and not e.ok and e.at > now() - interval '15 minutes' and e.ip is not distinct from v_ip) >= 10
     or (select count(*) from jsp_private.events e
      where e.kind = 'pair' and not e.ok and e.at > now() - interval '15 minutes') >= 100 then
    return jsonb_build_object('ok', false, 'error', 'locked', 'retryAfter', 900,
      'message', 'Too many wrong pairing codes. Wait 15 minutes and try again.');
  end if;

  select * into c from jsp_private.pairing_codes
  where code_hash = jsp_private.sha(v_code) and uses_left > 0 and expires_at > now()
  for update;
  if c.code_hash is null then
    perform jsp_private.log('pair', false, null, v_id, null);
    return jsonb_build_object('ok', false, 'error', 'invalid',
      'message', 'That pairing code is wrong or has expired. Ask a manager for a new one.');
  end if;

  update jsp_private.pairing_codes set uses_left = uses_left - 1 where code_hash = c.code_hash;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into jsp_private.devices (id, name, token_hash, paired_at, paired_by, last_seen_at)
  values (v_id, v_name, jsp_private.sha(v_token), now(), c.created_by, now())
  on conflict (id) do update set
    name = excluded.name, token_hash = excluded.token_hash, paired_at = now(), paired_by = excluded.paired_by,
    last_seen_at = now(), revoked_at = null, fail_streak = 0, locked_until = null, blocked_at = null;
  -- A re-paired device starts again: sessions opened under its old token end.
  update jsp_private.sessions set revoked_at = now() where device_id = v_id and revoked_at is null;
  perform jsp_private.log('pair', true, null, v_id, v_name);
  return jsonb_build_object('ok', true, 'token', v_token,
    'device', jsonb_build_object('id', v_id, 'name', v_name), 'pairedBy', c.created_by);
end
$$;

create or replace function public.jsp_device_status(p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsp_private.devices;
begin
  select * into d from jsp_private.devices where token_hash = jsp_private.sha(p_device) and revoked_at is null;
  if d.id is null then
    return jsonb_build_object('ok', true, 'paired', false);
  end if;
  update jsp_private.devices set last_seen_at = now() where id = d.id;
  return jsonb_build_object('ok', true, 'paired', true, 'id', d.id, 'name', d.name, 'blocked', d.blocked_at is not null);
end
$$;

/**
 * Check a PIN typed on a paired device. p_open_session = true signs the person
 * in (returns a session token); false only identifies them (manager approval,
 * time clock). Wrong PINs count against the device either way.
 */
create or replace function public.jsp_check_pin(p_device text, p_pin text, p_open_session boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsp_private.devices;
  p jsp_private.people;
  v_kind text := case when p_open_session then 'sign_in' else 'verify' end;
  v_streak int;
  v_wait int;
  v_token text;
  v_expires timestamptz;
begin
  select * into d from jsp_private.devices
  where token_hash = jsp_private.sha(p_device) and revoked_at is null
  for update;
  if d.id is null then
    return jsonb_build_object('ok', false, 'error', 'device',
      'message', 'This device isn''t paired with the shop yet. Ask a manager for a pairing code.');
  end if;
  if d.blocked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'blocked',
      'message', 'Too many wrong PINs, so this device is blocked. A manager can unblock it in Admin › Staff Accounts.');
  end if;
  if d.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'retryAfter', ceil(extract(epoch from d.locked_until - now()))::int,
      'message', 'Too many wrong PINs. Wait a moment and try again.');
  end if;

  if coalesce(p_pin, '') ~ '^[0-9]{4,8}$' then
    select * into p from jsp_private.people where pin_lookup = jsp_private.pin_lookup(p_pin) and active;
  end if;

  if p.id is null then
    v_streak := d.fail_streak + 1;
    v_wait := case when v_streak >= 5 then least(30 * power(2, v_streak - 5), 900)::int else 0 end;
    update jsp_private.devices set
      fail_streak = v_streak,
      locked_until = case when v_wait > 0 then now() + make_interval(secs => v_wait) else null end,
      blocked_at = case when v_streak >= 25 then now() else null end,
      last_seen_at = now()
    where id = d.id;
    perform jsp_private.log(v_kind, false, null, d.id, null);
    if v_streak >= 25 then
      return jsonb_build_object('ok', false, 'error', 'blocked',
        'message', 'Too many wrong PINs, so this device is blocked. A manager can unblock it in Admin › Staff Accounts.');
    end if;
    if v_wait > 0 then
      return jsonb_build_object('ok', false, 'error', 'locked', 'retryAfter', v_wait,
        'message', 'Wrong PIN. Too many tries — wait a moment and try again.');
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'triesLeft', 5 - v_streak, 'message', 'Wrong PIN.');
  end if;

  update jsp_private.devices set fail_streak = 0, locked_until = null, last_seen_at = now() where id = d.id;

  if not p_open_session and p.must_change then
    perform jsp_private.log(v_kind, false, p.id, d.id, 'temporary PIN');
    return jsonb_build_object('ok', false, 'error', 'must_change',
      'message', p.name || ' still has a temporary PIN. Sign in once to choose your own PIN first.');
  end if;

  if p_open_session then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires := now() + interval '16 hours';
    insert into jsp_private.sessions (token_hash, person_id, device_id, expires_at)
    values (jsp_private.sha(v_token), p.id, d.id, v_expires);
  end if;
  perform jsp_private.log(v_kind, true, p.id, d.id, null);
  return jsonb_build_object(
    'ok', true,
    'person', jsp_private.person_json(p),
    'mustChange', p.must_change,
    'session', case when v_token is null then null
                    else jsonb_build_object('token', v_token, 'expiresAt', jsp_private.iso(v_expires)) end);
end
$$;

create or replace function public.jsp_session(p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p jsp_private.people;
begin
  p := jsp_private.session_person(p_session);
  if p.id is null then
    return jsonb_build_object('ok', false, 'error', 'session', 'message', 'Your session has ended — sign in again.');
  end if;
  return jsonb_build_object('ok', true, 'person', jsp_private.person_json(p), 'mustChange', p.must_change);
end
$$;

create or replace function public.jsp_sign_out(p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update jsp_private.sessions set revoked_at = now()
  where token_hash = jsp_private.sha(p_session) and revoked_at is null;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.jsp_change_my_pin(p_session text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p jsp_private.people;
  v_problem text;
begin
  p := jsp_private.session_person(p_session);
  if p.id is null then
    return jsonb_build_object('ok', false, 'error', 'session', 'message', 'Your session has ended — sign in again.');
  end if;
  if (select count(*) from jsp_private.events e
      where e.kind = 'pin_change' and not e.ok and e.person_id = p.id and e.at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'message', 'Too many attempts. Try again in an hour, or ask a manager to set a new PIN.');
  end if;
  if p.pin_lookup is not null and p.pin_lookup = jsp_private.pin_lookup(p_new_pin) then
    v_problem := 'same';
  else
    v_problem := jsp_private.pin_problem(p_new_pin, p.role, p.id);
  end if;
  if v_problem is not null then
    perform jsp_private.log('pin_change', false, p.id, null, v_problem);
    return jsonb_build_object('ok', false, 'error', v_problem, 'message', jsp_private.pin_message(v_problem));
  end if;

  update jsp_private.people
  set pin_lookup = jsp_private.pin_lookup(p_new_pin), pin_set_at = now(), must_change = false, updated_at = now()
  where id = p.id;
  -- Every other session this person had (other tills, phones) ends.
  update jsp_private.sessions set revoked_at = now()
  where person_id = p.id and revoked_at is null and token_hash <> jsp_private.sha(p_session);
  if p.kind = 'staff' then
    perform jsp_private.publish_roster();
  end if;
  perform jsp_private.log('pin_change', true, p.id, null, null);
  return jsonb_build_object('ok', true, 'message', 'Your new PIN is set.');
end
$$;

-- ---- Owner / manager tools ---------------------------------------------------

create or replace function public.jsp_admin_people(p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  return jsonb_build_object('ok', true, 'people', (
    select coalesce(jsonb_agg(jsp_private.person_json(p) order by p.kind desc, p.created_at, p.id), '[]'::jsonb)
    from jsp_private.people p));
end
$$;

/** Add or update a staff member or driver: name, role, active. PINs are set separately. */
create or replace function public.jsp_admin_save_person(p_session text, p_person jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
  e jsp_private.people;
  v_id text := nullif(trim(coalesce(p_person ->> 'id', '')), '');
  v_kind text := coalesce(nullif(p_person ->> 'kind', ''), 'staff');
  v_role text;
  v_name text;
  v_active boolean;
  v_email text;
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  if v_kind not in ('staff', 'driver') then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Unknown kind of account.');
  end if;
  if v_id is not null then
    if v_id !~ '^[A-Za-z0-9_.:-]{3,80}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Invalid account ID.');
    end if;
    select * into e from jsp_private.people where id = v_id for update;
  end if;
  if e.id is not null and e.kind <> v_kind then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'That ID belongs to another kind of account.');
  end if;

  v_role := case when v_kind = 'driver' then 'DRIVER' else coalesce(nullif(p_person ->> 'role', ''), e.role, 'CASHIER') end;
  if v_kind = 'staff' and v_role not in ('CASHIER', 'KITCHEN_STAFF', 'STAFF', 'SUPERVISOR', 'STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Unknown role.');
  end if;
  v_name := coalesce(nullif(left(trim(coalesce(p_person ->> 'name', '')), 80), ''), e.name);
  if v_name is null or length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Enter a name.');
  end if;
  v_active := coalesce((p_person ->> 'active')::boolean, e.active, true);
  v_email := coalesce(p_person ->> 'email', e.email);

  if (v_role = 'SUPER_ADMIN' or e.role = 'SUPER_ADMIN') and a.role <> 'SUPER_ADMIN' then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'message', 'Only the system admin can change that account.');
  end if;
  if e.id = a.id and (v_role <> e.role or not v_active) then
    return jsonb_build_object('ok', false, 'error', 'invalid',
      'message', 'You can''t change your own role or disable yourself — ask another manager.');
  end if;

  begin
    if e.id is null then
      v_id := coalesce(v_id, case when v_kind = 'driver' then 'usr-driver-' else 'usr-' end || encode(extensions.gen_random_bytes(6), 'hex'));
      insert into jsp_private.people (id, kind, name, role, active, email)
      values (v_id, v_kind, v_name, v_role, v_active, v_email);
    else
      update jsp_private.people
      set name = v_name, role = v_role, active = v_active, email = v_email, updated_at = now()
      where id = v_id;
      if v_role <> e.role or (e.active and not v_active) then
        update jsp_private.sessions set revoked_at = now() where person_id = v_id and revoked_at is null;
      end if;
    end if;
    if not exists (select 1 from jsp_private.people p where p.kind = 'staff' and p.active and jsp_private.is_admin_role(p.role)) then
      raise exception 'jsp_last_manager';
    end if;
  exception when raise_exception then
    if sqlerrm = 'jsp_last_manager' then
      return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'At least one active owner or store manager must remain.');
    end if;
    raise;
  end;

  if v_kind = 'staff' then
    perform jsp_private.publish_roster();
  end if;
  perform jsp_private.log('person_saved', true, v_id, null,
    a.name || ': ' || v_role || case when v_active then '' else ' (disabled)' end);
  return jsonb_build_object('ok', true, 'id', v_id, 'message', v_name || ' saved.');
end
$$;

/** A manager sets someone's PIN. For anyone but themselves it is temporary: changed at first sign-in. */
create or replace function public.jsp_admin_set_pin(p_session text, p_person_id text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
  t jsp_private.people;
  v_problem text;
  v_self boolean;
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  select * into t from jsp_private.people where id = p_person_id for update;
  if t.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Account not found.');
  end if;
  if t.role = 'SUPER_ADMIN' and a.role <> 'SUPER_ADMIN' then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'message', 'Only the system admin can change that PIN.');
  end if;
  v_self := t.id = a.id;
  v_problem := jsp_private.pin_problem(p_pin, t.role, t.id);
  if v_problem is not null then
    perform jsp_private.log('pin_set', false, t.id, null, 'by ' || a.name || ': ' || v_problem);
    return jsonb_build_object('ok', false, 'error', v_problem,
      'message', case when v_problem = 'taken' then 'Someone else already uses that PIN.' else jsp_private.pin_message(v_problem) end);
  end if;

  update jsp_private.people
  set pin_lookup = jsp_private.pin_lookup(p_pin), pin_set_at = now(), must_change = not v_self, updated_at = now()
  where id = t.id;
  update jsp_private.sessions set revoked_at = now()
  where person_id = t.id and revoked_at is null and (not v_self or token_hash <> jsp_private.sha(p_session));
  if t.kind = 'staff' then
    perform jsp_private.publish_roster();
  end if;
  perform jsp_private.log('pin_set', true, t.id, null, 'by ' || a.name);
  return jsonb_build_object('ok', true, 'message', case when v_self then 'Your PIN is updated.'
    else 'Temporary PIN set. ' || t.name || ' chooses their own PIN the first time they sign in.' end);
end
$$;

create or replace function public.jsp_admin_pairing_code(p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  v_code := jsp_private.random_code(8);
  insert into jsp_private.pairing_codes (code_hash, expires_at, uses_left, created_by)
  values (jsp_private.sha(v_code), v_expires, 1, a.name);
  perform jsp_private.log('pairing_code', true, a.id, null, null);
  return jsonb_build_object('ok', true, 'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expiresAt', jsp_private.iso(v_expires));
end
$$;

create or replace function public.jsp_admin_devices(p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  return jsonb_build_object('ok', true, 'devices', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'pairedAt', jsp_private.iso(d.paired_at), 'pairedBy', d.paired_by,
        'lastSeenAt', jsp_private.iso(d.last_seen_at), 'revoked', d.revoked_at is not null,
        'blocked', d.blocked_at is not null, 'locked', coalesce(d.locked_until > now(), false), 'failStreak', d.fail_streak)
        order by d.revoked_at is not null, d.paired_at desc), '[]'::jsonb)
    from jsp_private.devices d));
end
$$;

create or replace function public.jsp_admin_device(p_session text, p_device_id text, p_action text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
  d jsp_private.devices;
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  select * into d from jsp_private.devices where id = p_device_id for update;
  if d.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Device not found.');
  end if;
  if p_action = 'revoke' then
    update jsp_private.devices set revoked_at = now() where id = d.id;
    update jsp_private.sessions set revoked_at = now() where device_id = d.id and revoked_at is null;
  elsif p_action = 'unblock' then
    update jsp_private.devices set blocked_at = null, locked_until = null, fail_streak = 0 where id = d.id;
  elsif p_action = 'rename' and length(trim(coalesce(p_name, ''))) > 0 then
    update jsp_private.devices set name = left(trim(p_name), 60) where id = d.id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Unknown action.');
  end if;
  perform jsp_private.log('device_' || p_action, true, a.id, d.id, d.name);
  return jsonb_build_object('ok', true, 'message', case p_action
    when 'revoke' then '"' || d.name || '" is unpaired. It needs a new pairing code to be used again.'
    when 'unblock' then '"' || d.name || '" is unblocked.'
    else 'Device renamed.' end);
end
$$;

create or replace function public.jsp_admin_events(p_session text, p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsp_private.people;
begin
  a := jsp_private.admin_from_session(p_session);
  if a.id is null then
    return jsp_private.forbidden();
  end if;
  return jsonb_build_object('ok', true, 'events', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'at', jsp_private.iso(x.at), 'kind', x.kind, 'ok', x.ok, 'person', x.person, 'device', x.device, 'ip', x.ip, 'detail', x.detail)
        order by x.at desc), '[]'::jsonb)
    from (
      select e.at, e.kind, e.ok, p.name as person, d.name as device, e.ip, e.detail
      from jsp_private.events e
      left join jsp_private.people p on p.id = e.person_id
      left join jsp_private.devices d on d.id = e.device_id
      order by e.at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x));
end
$$;

-- ---- Sync for paired devices -------------------------------------------------

/** Rows under a key prefix, newest first — the private documents and records included. */
create or replace function public.jsp_sync_list(p_device text, p_prefix text, p_since timestamptz default null, p_limit int default null)
returns setof public.delivery_settings
language plpgsql security definer set search_path = '' as $$
begin
  perform jsp_private.require_device(p_device);
  return query
    select k.* from public.delivery_settings k
    where left(k.store_id, length(coalesce(p_prefix, ''))) = coalesce(p_prefix, '')
      and (p_since is null or k.updated_at >= p_since)
    order by k.updated_at desc
    limit p_limit;
end
$$;

/** Upsert shop documents and records. The staff list is written only by the server. */
create or replace function public.jsp_sync_put(p_device text, p_rows jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := (select c.store_prefix from jsp_private.config c where c.id = 1);
begin
  perform jsp_private.require_device(p_device);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    return false;
  end if;
  insert into public.delivery_settings (store_id, settings, updated_at)
  select distinct on (r ->> 'store_id')
    r ->> 'store_id', r -> 'settings', coalesce((r ->> 'updated_at')::timestamptz, now())
  from jsonb_array_elements(p_rows) r
  where split_part(r ->> 'store_id', '::', 1) = v_prefix
    and split_part(r ->> 'store_id', '::', 2) in ('doc', 'priv', 'rec')
    and r ->> 'store_id' <> v_prefix || '::doc::staff.roster'
    and jsonb_typeof(r -> 'settings') is not null
    and jsonb_typeof(r -> 'settings') <> 'null'
  order by r ->> 'store_id', coalesce((r ->> 'updated_at')::timestamptz, now()) desc
  on conflict (store_id) do update set settings = excluded.settings, updated_at = excluded.updated_at;
  return true;
end
$$;

-- -----------------------------------------------------------------------------
-- Emergencies (SQL editor only)
-- -----------------------------------------------------------------------------

create or replace function jsp_private.reset_pin(p_person_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pin text;
begin
  if not exists (select 1 from jsp_private.people where id = p_person_id) then
    raise exception 'No account with id %', p_person_id;
  end if;
  v_pin := jsp_private.random_pin(6);
  update jsp_private.people
  set pin_lookup = jsp_private.pin_lookup(v_pin), pin_set_at = now(), must_change = true, active = true, updated_at = now()
  where id = p_person_id;
  update jsp_private.sessions set revoked_at = now() where person_id = p_person_id and revoked_at is null;
  perform jsp_private.publish_roster();
  perform jsp_private.log('pin_reset', true, p_person_id, null, 'SQL editor');
  return v_pin;
end
$$;

create or replace function jsp_private.new_pairing_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := jsp_private.random_code(8);
begin
  insert into jsp_private.pairing_codes (code_hash, expires_at, uses_left, created_by)
  values (jsp_private.sha(v_code), now() + interval '24 hours', 5, 'Supabase SQL editor');
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
end
$$;

create or replace function jsp_private.bootstrap() returns table (step text, secret text)
language plpgsql security definer set search_path = '' as $$
declare
  p jsp_private.people;
  v_pin text;
begin
  for p in
    select * from jsp_private.people x
    where x.kind = 'staff' and x.active and jsp_private.is_admin_role(x.role) and x.pin_lookup is null
    order by x.created_at, x.id
  loop
    v_pin := jsp_private.random_pin(6);
    update jsp_private.people
    set pin_lookup = jsp_private.pin_lookup(v_pin), pin_set_at = now(), must_change = true, updated_at = now()
    where id = p.id;
    step := 'Temporary PIN for ' || p.name || ' (' || p.id || ') — change it at first sign-in';
    secret := v_pin;
    return next;
  end loop;
  perform jsp_private.publish_roster();
  step := 'Pairing code: valid 24 hours, pairs up to 5 devices';
  secret := jsp_private.new_pairing_code();
  return next;
end
$$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------

revoke all on all functions in schema jsp_private from public;
revoke all on all functions in schema jsp_private from anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'jsp_auth_status()',
    'jsp_pair_device(text, text, text)',
    'jsp_device_status(text)',
    'jsp_check_pin(text, text, boolean)',
    'jsp_session(text)',
    'jsp_sign_out(text)',
    'jsp_change_my_pin(text, text)',
    'jsp_admin_people(text)',
    'jsp_admin_save_person(text, jsonb)',
    'jsp_admin_set_pin(text, text, text)',
    'jsp_admin_pairing_code(text)',
    'jsp_admin_devices(text)',
    'jsp_admin_device(text, text, text, text)',
    'jsp_admin_events(text, int)',
    'jsp_sync_list(text, text, timestamptz, int)',
    'jsp_sync_put(text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Bring the existing staff and drivers across (names and roles only — no PINs)
-- -----------------------------------------------------------------------------

insert into jsp_private.people (id, kind, name, role, active, email)
select distinct on (m ->> 'id')
  m ->> 'id', 'staff', coalesce(nullif(trim(m ->> 'name'), ''), 'Staff member'), m ->> 'role',
  coalesce(m ->> 'status', 'ACTIVE') = 'ACTIVE', nullif(m ->> 'email', '')
from public.delivery_settings k
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(k.settings #> '{data,members}') = 'array' then k.settings #> '{data,members}' else '[]'::jsonb end) m
where k.store_id = (select c.store_prefix from jsp_private.config c where c.id = 1) || '::doc::staff.roster'
  and coalesce(m ->> 'id', '') ~ '^[A-Za-z0-9_.:-]{3,80}$'
  and m ->> 'role' in ('CASHIER', 'KITCHEN_STAFF', 'STAFF', 'SUPERVISOR', 'STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
on conflict (id) do nothing;

insert into jsp_private.people (id, kind, name, role, active, email)
select distinct on (d ->> 'id')
  d ->> 'id', 'driver', coalesce(nullif(trim(d ->> 'name'), ''), 'Driver'), 'DRIVER',
  coalesce(d ->> 'status', 'ACTIVE') = 'ACTIVE', nullif(d ->> 'email', '')
from public.delivery_settings k
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(k.settings -> 'data') = 'array' then k.settings -> 'data' else '[]'::jsonb end) d
where k.store_id = (select c.store_prefix from jsp_private.config c where c.id = 1) || '::doc::drivers'
  and coalesce(d ->> 'id', '') ~ '^[A-Za-z0-9_.:-]{3,80}$'
on conflict (id) do nothing;

-- A shop with no owner account yet gets one.
insert into jsp_private.people (id, kind, name, role, active)
select 'usr-owner-1', 'staff', 'Store Owner', 'STORE_MANAGER', true
where not exists (select 1 from jsp_private.people p where p.kind = 'staff' and p.active and jsp_private.is_admin_role(p.role))
on conflict (id) do update set active = true, role = 'STORE_MANAGER', kind = 'staff';

-- Strip the old PIN hashes from the shared driver list (the trigger does the
-- work) and re-date it so every device picks up the clean copy.
update public.delivery_settings
set settings = jsonb_set(settings, '{at}', to_jsonb(jsp_private.iso(clock_timestamp()))), updated_at = now()
where store_id = (select c.store_prefix from jsp_private.config c where c.id = 1) || '::doc::drivers'
  and jsonb_typeof(settings) = 'object';

-- -----------------------------------------------------------------------------
-- Lock the settings table: public documents readable, nothing writable directly
-- -----------------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'delivery_settings' loop
    execute format('drop policy %I on public.delivery_settings', pol.policyname);
  end loop;
end
$$;

alter table public.delivery_settings enable row level security;
create policy "jsp public shop documents are readable" on public.delivery_settings
  for select to anon, authenticated
  using (split_part(store_id, '::', 2) = 'doc');
-- The functions above run as the role running this script; make sure row
-- security never stands in their way, whichever role owns the table.
do $$
begin
  if current_user not in ('anon', 'authenticated') then
    execute format('create policy "jsp server functions" on public.delivery_settings for all to %I using (true) with check (true)', current_user);
  end if;
end
$$;
revoke insert, update, delete, truncate on public.delivery_settings from anon, authenticated;
grant select on public.delivery_settings to anon, authenticated;

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- What you need next (shown in the results panel)
-- -----------------------------------------------------------------------------
select * from jsp_private.bootstrap();
