-- JUST SPUDS AYLESBURY - SUPABASE DATABASE SCHEMA
-- Run this in your Supabase project: SQL Editor -> New Query -> Run

-- 1. ORDERS TABLE
create table if not exists public.orders (
  id text primary key,
  short_id text not null,
  store_id text not null default 'just_spuds',
  status text not null default 'placed',
  fulfilment text not null default 'delivery',
  customer jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  payment jsonb not null default '{}'::jsonb,
  estimated_delivery_time text,
  eta_minutes integer default 25,
  is_scheduled boolean default false,
  scheduled_for text,
  kitchen_notes text,
  driver jsonb,
  delivery_details jsonb default '{}'::jsonb,
  cancellation jsonb,
  review jsonb,
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for speedy queries by store and date
create index if not exists idx_orders_store_created on public.orders (store_id, created_at desc);
create index if not exists idx_orders_status on public.orders (status);

-- 2. MENU STOCK / AVAILABILITY TABLE
create table if not exists public.menu_stock (
  id text not null,
  store_id text not null default 'just_spuds',
  is_available boolean not null default true,
  is_sold_out boolean not null default false,
  remaining_count integer,
  updated_at timestamptz not null default now(),
  primary key (id, store_id)
);

-- 3. DELIVERY SETTINGS TABLE
create table if not exists public.delivery_settings (
  store_id text primary key default 'just_spuds',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 4. ENABLE ROW LEVEL SECURITY (RLS)
alter table public.orders enable row level security;
alter table public.menu_stock enable row level security;
alter table public.delivery_settings enable row level security;

-- Permissive policies for takeaway website anon client
create policy "Allow anon read orders" on public.orders for select using (true);
create policy "Allow anon insert orders" on public.orders for insert with check (true);
create policy "Allow anon update orders" on public.orders for update using (true);

create policy "Allow anon read menu_stock" on public.menu_stock for select using (true);
create policy "Allow anon upsert menu_stock" on public.menu_stock for all using (true);

create policy "Allow anon read delivery_settings" on public.delivery_settings for select using (true);
create policy "Allow anon upsert delivery_settings" on public.delivery_settings for all using (true);

-- 5. ENABLE REALTIME BROADCASTING
-- This makes Supabase push live updates to Kitchen Display Screen & Customer trackers
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.menu_stock;
alter publication supabase_realtime add table public.delivery_settings;
