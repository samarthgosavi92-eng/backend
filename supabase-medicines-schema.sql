-- Run this in Supabase SQL Editor for DealScan (medicine price comparison).

-- Table: medicines
-- Stores each price observation: medicine name, site, price, timestamp.
create table if not exists medicines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site text not null,
  price numeric not null,
  created_at timestamp with time zone default now()
);

create index if not exists medicines_name_idx on medicines (name);
create index if not exists medicines_created_at_idx on medicines (created_at);
