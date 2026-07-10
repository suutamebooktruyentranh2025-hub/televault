-- TeleVault-only entitlements (crawler tables/functions unchanged).
-- Admin grants TeleVault access by updating tier on this table.

create table if not exists public.televault_entitlements (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users (id) on delete set null,
  tier text not null default 'free'
    check (tier in ('free', 'member', 'super member', 'premium member', 'admin')),
  remaining_tokens integer not null default 100
    check (remaining_tokens >= 0),
  implied_free boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint televault_entitlements_email_key unique (email)
);

create index if not exists televault_entitlements_user_id_idx
  on public.televault_entitlements (user_id);

alter table public.televault_entitlements enable row level security;

-- No policies for authenticated/anon — edge functions use service role only.

create or replace function public.televault_entitlements_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists televault_entitlements_updated_at on public.televault_entitlements;
create trigger televault_entitlements_updated_at
  before update on public.televault_entitlements
  for each row
  execute function public.televault_entitlements_set_updated_at();
