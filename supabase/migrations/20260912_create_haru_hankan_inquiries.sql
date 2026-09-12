create table public.haru_hankan_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  contact text not null check (char_length(contact) between 5 and 150),
  inquiry_type text not null check (inquiry_type in ('landing_page','logo_branding','cardpilot','other')),
  message text not null default '' check (char_length(message) <= 1000),
  privacy_consent boolean not null check (privacy_consent = true),
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);

create index haru_hankan_inquiries_created_at_idx
  on public.haru_hankan_inquiries (created_at desc);

alter table public.haru_hankan_inquiries enable row level security;
revoke all on table public.haru_hankan_inquiries from anon, authenticated;

create table public.haru_hankan_inquiry_rate_limits (
  fingerprint_hash text primary key check (char_length(fingerprint_hash) = 64),
  request_count integer not null default 1 check (request_count > 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.haru_hankan_inquiry_rate_limits enable row level security;
revoke all on table public.haru_hankan_inquiry_rate_limits from anon, authenticated;

create or replace function public.allow_haru_hankan_inquiry(p_fingerprint_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  window_start timestamptz;
begin
  if p_fingerprint_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  delete from public.haru_hankan_inquiry_rate_limits
    where updated_at < now() - interval '24 hours';

  insert into public.haru_hankan_inquiry_rate_limits
    (fingerprint_hash, request_count, window_started_at, updated_at)
  values (p_fingerprint_hash, 1, now(), now())
  on conflict (fingerprint_hash) do update
    set request_count = case
      when public.haru_hankan_inquiry_rate_limits.window_started_at < now() - interval '10 minutes' then 1
      else public.haru_hankan_inquiry_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.haru_hankan_inquiry_rate_limits.window_started_at < now() - interval '10 minutes' then now()
      else public.haru_hankan_inquiry_rate_limits.window_started_at
    end,
    updated_at = now()
  returning request_count, window_started_at into current_count, window_start;

  return current_count <= 3;
end;
$$;

revoke all on function public.allow_haru_hankan_inquiry(text) from public, anon, authenticated;
grant execute on function public.allow_haru_hankan_inquiry(text) to service_role;
