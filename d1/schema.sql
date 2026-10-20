-- Run locally with: npx wrangler d1 execute 4guard-bookings --local --file=./d1/schema.sql
-- Run in Cloudflare with: npx wrangler d1 execute 4guard-bookings --remote --file=./d1/schema.sql

create table if not exists users (
  id text primary key,
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  created_at text not null default (datetime('now'))
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at text not null,
  created_at text not null default (datetime('now'))
);

create table if not exists bookings (
  id text primary key,
  customer_id text not null references users(id) on delete cascade,
  customer_email text not null,
  customer_name text not null,
  service_type text not null,
  property_type text not null,
  preferred_date text not null,
  location text not null,
  details text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  admin_note text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists bookings_customer_id_idx on bookings(customer_id);
create index if not exists bookings_customer_email_idx on bookings(customer_email);
create index if not exists sessions_user_id_idx on sessions(user_id);
