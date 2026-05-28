create extension if not exists pgcrypto;

create table if not exists public.trial_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  need text not null,
  plan_goal text not null,
  created_at timestamptz not null default now(),
  user_agent text not null default '',
  ip text not null default ''
);

alter table public.trial_leads enable row level security;

drop policy if exists "Allow public lead inserts" on public.trial_leads;
create policy "Allow public lead inserts"
on public.trial_leads
for insert
to anon
with check (
  length(trim(contact)) between 1 and 80
  and length(trim(name)) between 1 and 40
  and length(trim(need)) between 1 and 80
);

drop policy if exists "Block public lead reads" on public.trial_leads;
create policy "Block public lead reads"
on public.trial_leads
for select
to anon
using (false);
