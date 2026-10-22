-- 0002: booking portal v2
--   * booking reference numbers customers can quote (e.g. 4G-7K2M9Q)
--   * the specific services requested (e.g. "Cockroaches; Rats and mice"), premises type,
--     street address, contact number and preferred time of day
--   * the date/time 4Guard actually scheduled when confirming
--   * two-way messages (4Guard can reply to a customer) with read tracking
--   * customer phone number on the account
--   * failed-login tracking used to slow down password guessing
-- Applied once by `wrangler d1 migrations apply` (tracked in the d1_migrations table).

alter table users add column phone text;

alter table bookings add column reference text;
alter table bookings add column service_options text;
alter table bookings add column premises text;
alter table bookings add column preferred_time text;
alter table bookings add column address text;
alter table bookings add column contact_phone text;
alter table bookings add column scheduled_date text;
alter table bookings add column scheduled_time text;

-- Give existing bookings a reference too.
update bookings
   set reference = '4G-' || upper(substr(hex(randomblob(3)), 1, 6))
 where reference is null;

create unique index if not exists bookings_reference_idx on bookings(reference);
create index if not exists bookings_status_created_idx on bookings(status, created_at);

alter table customer_feedback add column from_admin integer not null default 0;
alter table customer_feedback add column read_at text;

create table if not exists login_attempts (
  id integer primary key autoincrement,
  email text not null,
  created_at text not null default (datetime('now'))
);
create index if not exists login_attempts_email_idx on login_attempts(email, created_at);
