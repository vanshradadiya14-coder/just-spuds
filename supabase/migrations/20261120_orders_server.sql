-- =============================================================================
-- JUST SPUDS — THE SERVER OWNS ORDERS AND STOCK
-- =============================================================================
-- Run ONCE in Supabase › SQL Editor › New query › Run, AFTER
--   1. supabase/migrations/20261028_staff_security.sql has been run, and
--   2. the version of the app that ships this file is live.
-- (Older versions of the app can no longer place or read orders once this has
-- run. Pick a quiet time: orders being tracked on customers' phones right now
-- lose their live tracking, because those phones hold no tracking key.)
--
-- What changes
--  * The website's public key can no longer read or write the orders table.
--    Before this, anyone holding that key could list every customer's name,
--    phone number and address, and change any order.
--  * A customer places an order through jsp_customer_order_save. The server
--    checks it before it exists: ordering switched on, kitchen not paused,
--    phone not blocked, every item on the menu and on sale online, prices not
--    below the menu, voucher valid, delivery fee and minimum, delivery
--    distance, and stock — taken atomically, so two people cannot both buy
--    the last one. It always starts as "placed" and unpaid.
--  * The customer gets a tracking key for that order. Reading it, cancelling
--    it (only until the kitchen accepts) and leaving a review need the key.
--    "Track on another phone" works with the order number plus the phone's
--    last 4 digits or the postcode.
--  * Staff devices read and change orders and stock through functions that
--    check the device is paired.
--  * Stock counts stay readable (the menu shows "sold out"); only paired
--    devices and the order function can change them.
--  * Live updates: a small public table (order number + status, no personal
--    details) tells screens that an order changed.
--
-- Safe to run again.
-- =============================================================================

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'jsp_private') then
    raise exception 'Run supabase/migrations/20261028_staff_security.sql first.';
  end if;
end
$$;

alter table jsp_private.config add column if not exists shop_lat double precision not null default 51.8162;
alter table jsp_private.config add column if not exists shop_lng double precision not null default -0.8127;
alter table jsp_private.config add column if not exists service_fee_pence int not null default 49;
alter table jsp_private.config add column if not exists meal_deal_pence int not null default 195;

alter table public.orders add column if not exists track_token text;
update public.orders set track_token = encode(extensions.gen_random_bytes(16), 'hex') where track_token is null;

-- -----------------------------------------------------------------------------
-- "Something changed" pings — order number and status only
-- -----------------------------------------------------------------------------

create table if not exists public.order_events (
  id bigserial primary key,
  order_id text not null,
  status text not null,
  at timestamptz not null default now()
);
create index if not exists order_events_at_idx on public.order_events (at desc);

create or replace function jsp_private.order_ping() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_events (order_id, status) values (new.id, new.status);
  if random() < 0.02 then
    delete from public.order_events where at < now() - interval '2 days';
  end if;
  return new;
end
$$;

drop trigger if exists jsp_order_ping on public.orders;
create trigger jsp_order_ping
  after insert or update on public.orders
  for each row execute function jsp_private.order_ping();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

/** The data of a shared shop document (menu.products, delivery.settings …), or null. */
create or replace function jsp_private.doc(p_name text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select k.settings -> 'data'
  from public.delivery_settings k
  where k.store_id = (select c.store_prefix from jsp_private.config c where c.id = 1) || '::doc::' || p_name
$$;

/** "+44 7700 900123", "447700900123" and "07700 900123" → 07700900123. */
create or replace function jsp_private.norm_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n text := regexp_replace(coalesce(p, ''), '[\s\-().]', '', 'g');
begin
  if n like '+44%' then n := '0' || substr(n, 4);
  elsif n like '0044%' then n := '0' || substr(n, 5);
  elsif n like '44%' and length(n) >= 12 then n := '0' || substr(n, 3);
  end if;
  return n;
end
$$;

create or replace function jsp_private.metres_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function jsp_private.reject(p_message text, p_error text default 'rejected') returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'error', p_error, 'message', p_message)
$$;

/** Add (or with a negative number, take) stock for the lines of an order. Unknown counts are left alone. */
create or replace function jsp_private.restock_lines(p_lines jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store text := (select c.store_prefix from jsp_private.config c where c.id = 1);
  r record;
begin
  for r in
    select l ->> 'productId' as pid, sum(greatest(1, coalesce((l ->> 'qty')::int, 1)))::int as qty
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
    where coalesce(l ->> 'productId', '') <> ''
    group by 1
  loop
    update public.menu_stock
    set remaining_count = remaining_count + r.qty, is_sold_out = (remaining_count + r.qty) <= 0, updated_at = now()
    where id = r.pid and store_id = v_store and remaining_count is not null;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Customers
-- -----------------------------------------------------------------------------

/**
 * Place an order (no row with this id yet), or — with the order's tracking key —
 * cancel it while it is still "placed", or add a review once it is complete.
 * Nothing else a browser sends is kept.
 */
create or replace function public.jsp_customer_order_save(p_row jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsp_private.config;
  e public.orders;
  v_id text := p_row ->> 'id';
  v_short text := p_row ->> 'short_id';
  v_ip text := jsp_private.client_ip();
  v_fulfilment text := p_row ->> 'fulfilment';
  v_customer jsonb := coalesce(p_row -> 'customer', '{}'::jsonb);
  v_payment jsonb := coalesce(p_row -> 'payment', '{}'::jsonb);
  v_lines jsonb := p_row -> 'lines';
  v_phone text;
  v_settings jsonb;
  v_pause jsonb;
  v_products jsonb;
  v_extras jsonb;
  v_promos jsonb;
  v_prod jsonb;
  l jsonb;
  v_qty int;
  v_unit int;
  v_expected int := 0;
  v_subtotal int;
  v_discount int;
  v_allowed int;
  v_code text;
  v_promo jsonb;
  v_fee int;
  v_tip int;
  v_total int;
  v_radius double precision;
  v_dist double precision;
  v_details jsonb;
  v_token text;
  r record;
  v_review jsonb;
begin
  select * into cfg from jsp_private.config where id = 1;
  if v_id is null or v_id !~ '^ord-[0-9]{10,16}-[0-9]{3,8}$' then
    return jsp_private.reject('This order could not be read. Please try again.');
  end if;

  select * into e from public.orders where id = v_id for update;

  -- ---- An order that already exists: only its owner, only two things ----------
  if e.id is not null then
    if p_token is null or e.track_token is distinct from p_token then
      return jsp_private.reject('This order belongs to someone else.', 'forbidden');
    end if;
    if p_row ->> 'status' = 'cancelled' and e.status <> 'cancelled' then
      if e.status <> 'placed' then
        return jsp_private.reject('The kitchen has already started this order, so it can''t be cancelled online. Please call the shop.', 'too_late');
      end if;
      update public.orders set
        status = 'cancelled',
        eta_minutes = 0,
        cancellation = jsonb_build_object(
          'cancelledAt', jsp_private.iso(now()),
          'reason', left(coalesce(p_row #>> '{cancellation,reason}', 'Cancelled by customer'), 200),
          'refundAmount', 0,
          'refundStatus', 'not_applicable'),
        timeline = case when jsonb_typeof(p_row -> 'timeline') = 'array' and jsonb_array_length(p_row -> 'timeline') <= 40 then p_row -> 'timeline' else timeline end,
        updated_at = now()
      where id = e.id;
      perform jsp_private.restock_lines(e.lines);
      perform jsp_private.log('order_cancel', true, null, null, e.short_id);
      return jsonb_build_object('ok', true, 'token', e.track_token);
    end if;
    v_review := p_row -> 'review';
    if jsonb_typeof(v_review) = 'object' and e.review is null and e.status in ('delivered', 'collected') then
      update public.orders set
        review = jsonb_build_object(
          'rating', greatest(1, least(5, coalesce((v_review ->> 'rating')::int, 5))),
          'tags', case when jsonb_typeof(v_review -> 'tags') = 'array' and jsonb_array_length(v_review -> 'tags') <= 12 then v_review -> 'tags' else '[]'::jsonb end,
          'comment', left(coalesce(v_review ->> 'comment', ''), 1000),
          'createdAt', jsp_private.iso(now())),
        updated_at = now()
      where id = e.id;
      return jsonb_build_object('ok', true, 'token', e.track_token);
    end if;
    -- Anything else a browser sends about an existing order is ignored.
    return jsonb_build_object('ok', true, 'token', e.track_token, 'unchanged', true);
  end if;

  -- ---- A new order ------------------------------------------------------------
  if v_short is null or v_short !~ '^JS-W-[0-9]{4,6}$' then
    return jsp_private.reject('This order could not be read. Please try again.');
  end if;
  if v_fulfilment not in ('delivery', 'pickup') then
    return jsp_private.reject('Choose delivery or pick-up.');
  end if;
  if jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) = 0 then
    return jsp_private.reject('Your basket is empty.');
  end if;
  if jsonb_array_length(v_lines) > 60 then
    return jsp_private.reject('That basket is too large to order online. Please call the shop.');
  end if;

  v_settings := jsp_private.doc('delivery.settings');
  if coalesce((v_settings ->> 'isOnlineOrderingEnabled')::boolean, false) is not true then
    return jsp_private.reject(coalesce(nullif(v_settings ->> 'orderingPausedMessage', ''), 'Online ordering is not available right now.'), 'closed');
  end if;
  v_pause := jsp_private.doc('kitchen.pause');
  if coalesce((v_pause ->> 'isPaused')::boolean, false) and coalesce((p_row ->> 'is_scheduled')::boolean, false) is not true
     and (coalesce(v_pause ->> 'resumeAt', 'manual') = 'manual' or (v_pause ->> 'resumeAt')::timestamptz > now()) then
    return jsp_private.reject('The kitchen has paused new orders for a moment. ' || coalesce(v_pause ->> 'reasonText', 'Please try again shortly.'), 'closed');
  end if;

  if length(trim(coalesce(v_customer ->> 'name', ''))) < 2 then
    return jsp_private.reject('Please enter your name.');
  end if;
  v_phone := jsp_private.norm_phone(v_customer ->> 'phone');
  if v_phone !~ '^0[1237][0-9]{8,9}$' then
    return jsp_private.reject('Please enter a valid UK phone number.');
  end if;
  if coalesce(jsp_private.doc('blacklist.hashes'), '[]'::jsonb) ? jsp_private.sha('just-spuds-blacklist:' || v_phone) then
    return jsp_private.reject('This phone number is flagged for phone/counter verification. Please call the shop or visit our Market Square counter.', 'blocked');
  end if;
  if (select count(*) from jsp_private.events x where x.kind = 'order_place' and x.at > now() - interval '30 minutes' and x.detail = v_phone) >= 6
     or (v_ip is not null and (select count(*) from jsp_private.events x where x.kind = 'order_place' and x.at > now() - interval '30 minutes' and x.ip = v_ip) >= 20) then
    return jsp_private.reject('Too many orders in a short time. Please call the shop to place this one.', 'rate');
  end if;

  -- Re-price from the shop's own menu: an item must be on the online menu, and
  -- may never cost less than the menu says.
  v_products := jsp_private.doc('menu.products');
  if jsonb_typeof(v_products) is distinct from 'array' then
    return jsp_private.reject('The menu is being updated. Please try again in a minute.', 'closed');
  end if;
  v_extras := coalesce(jsp_private.doc('menu.extras'), '[]'::jsonb);
  for l in select * from jsonb_array_elements(v_lines) loop
    v_qty := coalesce((l ->> 'qty')::int, 1);
    if v_qty < 1 or v_qty > 50 then
      return jsp_private.reject('Please check the quantities in your basket.');
    end if;
    if l ? 'priceOverridePence' then
      return jsp_private.reject('This basket can''t be ordered online. Please refresh the page and try again.');
    end if;
    select p into v_prod from jsonb_array_elements(v_products) p where p ->> 'id' = l ->> 'productId' limit 1;
    if v_prod is null then
      return jsp_private.reject('"' || coalesce(l ->> 'name', 'An item') || '" is no longer on the menu. Please update your basket.');
    end if;
    if v_prod ->> 'available' = 'false' or v_prod ->> 'channelVisibility' = 'in_store_only' then
      return jsp_private.reject('"' || coalesce(v_prod ->> 'name', 'An item') || '" can''t be ordered online right now. Please update your basket.');
    end if;
    v_unit := coalesce((v_prod ->> 'price')::int, 0);
    if v_prod ->> 'category' = 'SPUDS' and jsonb_typeof(l -> 'extras') = 'array' then
      v_unit := v_unit + coalesce((
        select sum(coalesce((x ->> 'price')::int, 0))
        from jsonb_array_elements_text(l -> 'extras') chosen
        join jsonb_array_elements(v_extras) x on x ->> 'id' = chosen), 0);
    end if;
    if coalesce((l ->> 'meal')::boolean, false) then
      v_unit := v_unit + cfg.meal_deal_pence;
    end if;
    v_expected := v_expected + v_unit * v_qty;
  end loop;

  v_subtotal := coalesce((v_payment ->> 'subtotal')::int, 0);
  if v_subtotal + 1 < v_expected then
    return jsp_private.reject('Prices have changed since you opened the menu. Please refresh the page and check your basket.', 'price');
  end if;

  -- Voucher: a shop promotion from the published list, or a Spud Club reward
  -- (kept on the customer's device, so capped here by what that reward is worth).
  v_discount := greatest(0, coalesce((v_payment ->> 'discount')::int, 0));
  if v_discount > 0 then
    v_code := upper(trim(coalesce(v_payment ->> 'promoCode', '')));
    select p into v_promo from jsonb_array_elements(coalesce(jsp_private.doc('menu.promos'), '[]'::jsonb)) p
      where upper(p ->> 'code') = v_code and coalesce((p ->> 'active')::boolean, true)
        and (nullif(p ->> 'expiresAt', '') is null or (p ->> 'expiresAt')::timestamptz > now())
      limit 1;
    if v_promo is not null then
      if v_subtotal < coalesce((v_promo ->> 'minOrderPence')::int, 0) then
        return jsp_private.reject('Voucher ' || v_code || ' needs a bigger basket. Remove the voucher to continue.', 'price');
      end if;
      v_allowed := case when coalesce((v_promo ->> 'discountPercent')::numeric, 0) > 0
        then round(v_subtotal * (v_promo ->> 'discountPercent')::numeric / 100)::int
        else least(coalesce((v_promo ->> 'discountPence')::int, 0), v_subtotal) end;
    else
      v_allowed := case split_part(v_code, '-', 1)
        when 'EXTRACHEESE' then 100 when 'FREESIDE' then 150 when 'FREEDRINK' then 275 when 'FREESPUD' then 650 else -1 end;
      if v_allowed < 0 or v_code !~ '^[A-Z]+-[A-Z0-9]{4,10}$' then
        return jsp_private.reject('Voucher ' || v_code || ' is no longer valid. Remove the voucher to continue.', 'price');
      end if;
    end if;
    if v_discount > v_allowed + 1 then
      return jsp_private.reject('That voucher is worth less than the discount shown. Please refresh the page and try again.', 'price');
    end if;
  end if;

  v_fee := 0;
  if v_fulfilment = 'delivery' then
    if upper(regexp_replace(coalesce(v_customer ->> 'postcode', ''), '[^A-Za-z0-9]', '', 'g')) !~ '^HP(17|18|19|20|21|22)[0-9][A-Z]{2}$' then
      return jsp_private.reject('Sorry, we only deliver to Aylesbury postcodes (HP17–HP22). Store Pick Up at Market Square is available!', 'area');
    end if;
    if length(trim(coalesce(v_customer ->> 'streetAddress', ''))) < 5 then
      return jsp_private.reject('Please enter your house/flat number and street name.');
    end if;
    if v_subtotal < coalesce((v_settings ->> 'minOrderPence')::int, 0) then
      return jsp_private.reject('Minimum delivery order is £' || to_char(coalesce((v_settings ->> 'minOrderPence')::int, 0) / 100.0, 'FM990.00') || '. Please add more items.', 'price');
    end if;
    if jsonb_typeof(v_customer -> 'latitude') = 'number' and jsonb_typeof(v_customer -> 'longitude') = 'number' then
      v_radius := coalesce((v_settings ->> 'deliveryRadiusMetres')::double precision, 5000);
      v_dist := jsp_private.metres_between(cfg.shop_lat, cfg.shop_lng, (v_customer ->> 'latitude')::double precision, (v_customer ->> 'longitude')::double precision);
      if v_dist > v_radius then
        return jsp_private.reject('Sorry — that address is about ' || to_char(v_dist / 1000, 'FM990.0') || ' km from the shop and we deliver up to ' || to_char(v_radius / 1000, 'FM990.0') || ' km. Store Pick Up at Market Square is available!', 'area');
      end if;
    end if;
    v_fee := case when v_subtotal >= coalesce((v_settings ->> 'freeDeliveryThresholdPence')::int, 2147483647) then 0
                  else coalesce((v_settings ->> 'deliveryFeePence')::int, 0) end;
  end if;
  v_tip := greatest(0, coalesce((v_payment ->> 'tip')::int, 0));
  v_total := greatest(0, v_subtotal - v_discount) + v_fee + cfg.service_fee_pence + v_tip;
  if coalesce((v_payment ->> 'total')::int, 0) + 1 < v_total then
    return jsp_private.reject('The total has changed since you opened the menu. Please refresh the page and check your basket.', 'price');
  end if;

  -- Take the stock and create the order together: if anything is short, nothing is taken.
  begin
    for r in
      select x ->> 'productId' as pid, max(x ->> 'name') as name, sum(greatest(1, coalesce((x ->> 'qty')::int, 1)))::int as qty
      from jsonb_array_elements(v_lines) x group by 1
    loop
      update public.menu_stock
      set remaining_count = remaining_count - r.qty, is_sold_out = (remaining_count - r.qty) <= 0, updated_at = now()
      where id = r.pid and store_id = cfg.store_prefix and remaining_count is not null and remaining_count >= r.qty;
      if not found and exists (select 1 from public.menu_stock s where s.id = r.pid and s.store_id = cfg.store_prefix and s.remaining_count is not null) then
        raise exception 'jsp_sold_out:%', coalesce(r.name, 'An item');
      end if;
    end loop;

    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    -- A browser cannot mark its own order as a training order, paid, or assigned.
    v_details := p_row -> 'delivery_details';
    if jsonb_typeof(v_details) = 'object' and jsonb_typeof(v_details -> '_x') = 'object' then
      v_details := jsonb_set(v_details, '{_x}', (v_details -> '_x') - 'isTest' - 'manualOverrides' - 'adminNotes');
    end if;
    insert into public.orders (
      id, short_id, store_id, status, fulfilment, customer, lines, payment,
      estimated_delivery_time, eta_minutes, is_scheduled, scheduled_for, kitchen_notes,
      driver, delivery_details, cancellation, review, timeline, created_at, updated_at, track_token)
    values (
      v_id, v_short, cfg.store_prefix, 'placed', v_fulfilment,
      v_customer || jsonb_build_object('phone', v_customer ->> 'phone', 'name', left(trim(v_customer ->> 'name'), 80)),
      v_lines,
      (v_payment - 'paidAt' - 'takenBy' - 'paidNote' - 'splitDetails' - 'manualAdjustment')
        || jsonb_build_object('status', case when v_fulfilment = 'delivery' then 'pending_delivery' else 'pending_store' end,
                              'deliveryFee', v_fee, 'serviceFee', cfg.service_fee_pence, 'total', greatest(v_total, coalesce((v_payment ->> 'total')::int, 0))),
      left(p_row ->> 'estimated_delivery_time', 80),
      least(180, greatest(0, coalesce((p_row ->> 'eta_minutes')::int, 25))),
      coalesce((p_row ->> 'is_scheduled')::boolean, false),
      left(p_row ->> 'scheduled_for', 80),
      left(p_row ->> 'kitchen_notes', 500),
      null, v_details, null, null,
      case when jsonb_typeof(p_row -> 'timeline') = 'array' and jsonb_array_length(p_row -> 'timeline') <= 5 then p_row -> 'timeline' else '[]'::jsonb end,
      now(), now(), v_token);
  exception when raise_exception then
    if sqlerrm like 'jsp_sold_out:%' then
      return jsp_private.reject('Sorry, "' || substr(sqlerrm, 14) || '" has just sold out. Please update your basket.', 'stock');
    end if;
    raise;
  end;

  perform jsp_private.log('order_place', true, null, null, v_phone);
  return jsonb_build_object('ok', true, 'token', v_token, 'id', v_id);
end
$$;

/** The customer's own orders: each needs its tracking key. */
create or replace function public.jsp_customer_orders(p_refs jsonb) returns setof public.orders
language sql stable security definer set search_path = '' as $$
  select o.*
  from public.orders o
  join jsonb_array_elements(case when jsonb_typeof(p_refs) = 'array' then p_refs else '[]'::jsonb end) r
    on r ->> 'id' = o.id and r ->> 'token' = o.track_token
  limit 60
$$;

/** Track on another phone: the order number plus the phone's last 4+ digits, the postcode or the email. */
create or replace function public.jsp_track_lookup(p_ref text, p_verify text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := jsp_private.client_ip();
  v_ref text := trim(coalesce(p_ref, ''));
  v_in text := lower(regexp_replace(coalesce(p_verify, ''), '\s', '', 'g'));
  v_digits text := regexp_replace(coalesce(p_verify, ''), '[^0-9]', '', 'g');
  o public.orders;
begin
  if (select count(*) from jsp_private.events x where x.kind = 'track' and not x.ok and x.at > now() - interval '15 minutes' and x.ip is not distinct from v_ip) >= 10 then
    return jsp_private.reject('Too many tries. Please wait 15 minutes, or call the shop.', 'rate');
  end if;
  -- The full number (JS-W-71934), or just the digits a customer reads off the receipt.
  select * into o from public.orders
  where id = v_ref or upper(short_id) = upper(v_ref) or (v_ref ~ '^[0-9]{4,6}$' and short_id ~ ('^JS-[A-Z]-' || v_ref || '$'))
  order by created_at desc limit 1;
  if o.id is not null and (
       (length(v_digits) >= 4 and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '[^0-9]', '', 'g'), length(v_digits)) = v_digits and v_digits = regexp_replace(v_in, '[^0-9]', '', 'g') and v_in ~ '^[0-9+]+$')
    or (length(v_in) >= 5 and lower(regexp_replace(coalesce(o.customer ->> 'postcode', ''), '\s', '', 'g')) = v_in)
    or (position('@' in v_in) > 1 and lower(trim(coalesce(o.customer ->> 'email', ''))) = v_in)) then
    perform jsp_private.log('track', true, null, null, o.short_id);
    return jsonb_build_object('ok', true, 'id', o.id, 'token', o.track_token);
  end if;
  perform jsp_private.log('track', false, null, null, left(v_ref, 40));
  return jsp_private.reject('We couldn''t match that order number with that phone number or postcode. Please check both and try again.', 'not_found');
end
$$;

-- -----------------------------------------------------------------------------
-- Paired staff devices
-- -----------------------------------------------------------------------------

create or replace function public.jsp_orders_list(p_device text, p_since timestamptz default null, p_limit int default 500, p_ids text[] default null)
returns setof public.orders
language plpgsql security definer set search_path = '' as $$
begin
  perform jsp_private.require_device(p_device);
  return query
    select o.* from public.orders o
    where o.store_id = (select c.store_prefix from jsp_private.config c where c.id = 1)
      and (p_since is null or o.created_at >= p_since)
      and (p_ids is null or o.id = any (p_ids))
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 2000);
end
$$;

/** Upsert whole orders from a paired device. An older copy never overwrites a newer one. */
create or replace function public.jsp_orders_put(p_device text, p_rows jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_store text := (select c.store_prefix from jsp_private.config c where c.id = 1);
begin
  perform jsp_private.require_device(p_device);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    return false;
  end if;
  insert into public.orders (
    id, short_id, store_id, status, fulfilment, customer, lines, payment,
    estimated_delivery_time, eta_minutes, is_scheduled, scheduled_for, kitchen_notes,
    driver, delivery_details, cancellation, review, timeline, created_at, updated_at, track_token)
  select distinct on (x.id)
    x.id, x.short_id, v_store, x.status, x.fulfilment, coalesce(x.customer, '{}'::jsonb), coalesce(x.lines, '[]'::jsonb), coalesce(x.payment, '{}'::jsonb),
    x.estimated_delivery_time, x.eta_minutes, coalesce(x.is_scheduled, false), x.scheduled_for, x.kitchen_notes,
    x.driver, x.delivery_details, x.cancellation, x.review, coalesce(x.timeline, '[]'::jsonb),
    coalesce(x.created_at, now()), coalesce(x.updated_at, now()), encode(extensions.gen_random_bytes(16), 'hex')
  from jsonb_populate_recordset(null::public.orders, p_rows) x
  where x.id is not null and x.short_id is not null and x.status is not null and x.fulfilment is not null
  order by x.id, x.updated_at desc nulls last
  on conflict (id) do update set
    short_id = excluded.short_id, status = excluded.status, fulfilment = excluded.fulfilment,
    customer = excluded.customer, lines = excluded.lines, payment = excluded.payment,
    estimated_delivery_time = excluded.estimated_delivery_time, eta_minutes = excluded.eta_minutes,
    is_scheduled = excluded.is_scheduled, scheduled_for = excluded.scheduled_for, kitchen_notes = excluded.kitchen_notes,
    driver = excluded.driver, delivery_details = excluded.delivery_details, cancellation = excluded.cancellation,
    review = coalesce(excluded.review, public.orders.review), timeline = excluded.timeline, updated_at = excluded.updated_at
  where public.orders.updated_at <= excluded.updated_at;
  return true;
end
$$;

create or replace function public.jsp_stock_put(p_device text, p_rows jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_store text := (select c.store_prefix from jsp_private.config c where c.id = 1);
begin
  perform jsp_private.require_device(p_device);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    return false;
  end if;
  insert into public.menu_stock (id, store_id, remaining_count, is_sold_out, is_available, updated_at)
  select distinct on (r ->> 'id')
    r ->> 'id', v_store, greatest(0, (r ->> 'remaining_count')::int), (r ->> 'remaining_count')::int <= 0, true,
    coalesce((r ->> 'updated_at')::timestamptz, now())
  from jsonb_array_elements(p_rows) r
  where coalesce(r ->> 'id', '') <> '' and (r ->> 'remaining_count') ~ '^-?[0-9]+$'
  order by r ->> 'id'
  on conflict (id, store_id) do update set
    remaining_count = excluded.remaining_count, is_sold_out = excluded.is_sold_out, updated_at = excluded.updated_at;
  return true;
end
$$;

/** Tells the app which server features are on. */
create or replace function public.jsp_auth_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', true, 'version', 2, 'orders', true)
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
    'jsp_customer_order_save(jsonb, text)',
    'jsp_customer_orders(jsonb)',
    'jsp_track_lookup(text, text)',
    'jsp_orders_list(text, timestamptz, int, text[])',
    'jsp_orders_put(text, jsonb)',
    'jsp_stock_put(text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Lock the tables
-- -----------------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in select tablename, policyname from pg_policies
             where schemaname = 'public' and tablename in ('orders', 'menu_stock', 'order_events') loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
  if current_user not in ('anon', 'authenticated') then
    execute format('create policy "jsp server functions" on public.orders for all to %I using (true) with check (true)', current_user);
    execute format('create policy "jsp server functions" on public.menu_stock for all to %I using (true) with check (true)', current_user);
    execute format('create policy "jsp server functions" on public.order_events for all to %I using (true) with check (true)', current_user);
  end if;
end
$$;

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;

alter table public.menu_stock enable row level security;
create policy "jsp stock counts are readable" on public.menu_stock for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.menu_stock from anon, authenticated;
grant select on public.menu_stock to anon, authenticated;

alter table public.order_events enable row level security;
create policy "jsp order pings are readable" on public.order_events for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.order_events from anon, authenticated;
grant select on public.order_events to anon, authenticated;

-- Live updates for the pings (Supabase only; harmless where there is no publication).
do $$
begin
  alter publication supabase_realtime add table public.order_events;
exception when others then
  null;
end
$$;

notify pgrst, 'reload schema';

select 'Orders and stock are now behind server checks.' as result,
       (select count(*) from public.orders) as orders_kept,
       (select count(*) from public.menu_stock) as stock_rows;
