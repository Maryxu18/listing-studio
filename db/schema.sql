-- Listing Studio schema. Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- One row per "generate" submission: the seller's input plus the AI output.
create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  input jsonb not null,
  photo_paths text[] not null,
  status text not null default 'generating', -- generating | ready | failed
  error text,
  -- [{ title, description, tags: string[], image_prompts: string[] }] x 3
  options jsonb,
  created_at timestamptz not null default now()
);

create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references generations(id) on delete cascade,
  option_index int not null,
  position int not null,
  prompt text not null,
  storage_path text,
  status text not null default 'pending', -- pending | ready | failed
  error text,
  unique (generation_id, option_index, position)
);

-- A confirmed recommendation set. Copied out of the generation so it is stable history.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  generation_id uuid references generations(id) on delete set null,
  option_index int not null,
  input jsonb not null,
  title text not null,
  description text not null,
  tags text[] not null,
  image_paths text[] not null,
  source_photo_paths text[] not null,
  etsy_status text not null default 'not_published', -- not_published | published
  etsy_listing_id text,
  etsy_url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists products_user_created_idx on products (user_id, created_at desc);
create index if not exists generations_user_idx on generations (user_id);

-- The app talks to Postgres directly as the table owner. Enabling RLS with no
-- policies keeps these tables closed to Supabase's public REST API.
alter table users enable row level security;
alter table generations enable row level security;
alter table generated_images enable row level security;
alter table products enable row level security;

-- Blob storage bucket for seller photos and generated images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "listing studio uploads" on storage.objects;
create policy "listing studio uploads" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'product-images');

-- Etsy shop connection per user (OAuth 2.0 tokens).
create table if not exists etsy_connections (
  user_id uuid primary key references users(id) on delete cascade,
  etsy_user_id bigint not null,
  shop_id bigint not null,
  shop_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table etsy_connections enable row level security;

-- etsy_status: not_published | draft | active. The old simulated flow used 'published'.
update products set etsy_status = 'not_published', etsy_listing_id = null, etsy_url = null, published_at = null
where etsy_status = 'published';
alter table products add column if not exists etsy_shop_id bigint;
