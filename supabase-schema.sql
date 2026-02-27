-- Run this in Supabase SQL Editor to create tables for the Deal Scanner API.

-- Products: one row per unique (title, platform)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null,
  created_at timestamptz default now(),
  unique (title, platform)
);

-- Price history: one row per price observation per product
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price numeric not null,
  created_at timestamptz default now()
);

create index if not exists price_history_product_id_idx on price_history (product_id);
create index if not exists price_history_created_at_idx on price_history (created_at);

-- RLS: enable if you want row-level security; the backend uses service role key (bypasses RLS).
-- alter table products enable row level security;
-- alter table price_history enable row level security;
