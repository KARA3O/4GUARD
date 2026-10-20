-- Run this entire file in Supabase Dashboard → SQL Editor.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  customer_email text not null,
  customer_name text not null,
  service_type text not null,
  property_type text not null,
  preferred_date date not null,
  location text not null,
  details text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings enable row level security;

create policy "Customers create their own bookings" on public.bookings for insert to authenticated with check (auth.uid() = customer_id);
create policy "Customers view their own bookings" on public.bookings for select to authenticated using (auth.uid() = customer_id);

-- The owner email is intentionally checked in the database, not merely hidden in the UI.
create policy "Owner manages all bookings" on public.bookings for all to authenticated using (lower(auth.jwt() ->> 'email') = 'guardddmt@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'guardddmt@gmail.com');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();
