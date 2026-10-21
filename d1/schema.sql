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


-- Customer reviews are linked to a completed booking. Reviews remain pending until
-- the owner approves them, so unverified or abusive content is not published automatically.
create table if not exists reviews (
  id text primary key,
  booking_id text not null unique references bookings(id) on delete cascade,
  customer_id text not null references users(id) on delete cascade,
  customer_name text not null,
  service_type text not null,
  rating integer not null check (rating between 1 and 5),
  review_text text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at text not null default (datetime('now'))
);

create index if not exists reviews_status_created_idx on reviews(status, created_at);
create index if not exists reviews_customer_id_idx on reviews(customer_id);


-- Private in-app messages from customers about their job requests.
create table if not exists customer_feedback (
  id text primary key,
  booking_id text not null references bookings(id) on delete cascade,
  customer_id text not null references users(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  service_type text not null,
  message text not null,
  created_at text not null default (datetime('now'))
);
create index if not exists customer_feedback_customer_idx on customer_feedback(customer_id, created_at);
create index if not exists customer_feedback_booking_idx on customer_feedback(booking_id, created_at);
