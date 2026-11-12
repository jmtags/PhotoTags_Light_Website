-- PhotoTags Supabase one-time catch-up setup
-- Run this in the Supabase SQL Editor when setting up or repairing a database.
-- Keep this file updated whenever a new file is added under supabase/migrations.
-- Source migrations included in chronological order below.


-- ============================================================
-- Source: supabase/migrations/202609030001_photo_downloads.sql
-- ============================================================

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photobooth-downloads',
  'photobooth-downloads',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.photo_downloads (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  file_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  downloaded_at timestamptz,
  download_count integer not null default 0,
  constraint photo_downloads_code_format check (code ~ '^[A-Za-z0-9_-]{4,64}$'),
  constraint photo_downloads_file_path_format check (file_path ~ '^captures/[A-Za-z0-9/_ .-]+$'),
  constraint photo_downloads_download_count_nonnegative check (download_count >= 0),
  constraint photo_downloads_expiry_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '35 minutes'
  )
);

create index if not exists photo_downloads_code_idx on public.photo_downloads (code);
create index if not exists photo_downloads_expires_at_idx on public.photo_downloads (expires_at);

alter table public.photo_downloads enable row level security;

drop policy if exists "Android can create temporary download rows" on public.photo_downloads;
drop policy if exists "Android can upload temporary photobooth images" on storage.objects;

create or replace function public.increment_photo_download_metrics(download_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.photo_downloads
  set
    download_count = download_count + 1,
    downloaded_at = coalesce(downloaded_at, now())
  where code = download_code
    and expires_at > now();
$$;

revoke all on function public.increment_photo_download_metrics(text) from public;
grant execute on function public.increment_photo_download_metrics(text) to service_role;

create or replace function public.delete_expired_photo_download_rows()
returns table(file_path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.photo_downloads
  where expires_at <= now()
  returning photo_downloads.file_path;
end;
$$;

revoke all on function public.delete_expired_photo_download_rows() from public;
grant execute on function public.delete_expired_photo_download_rows() to service_role;

-- Cleanup note:
-- Run delete_expired_photo_download_rows() from trusted server code, then delete the
-- returned file paths from the private photobooth-downloads Storage bucket.


-- ============================================================
-- Source: supabase/migrations/202609040001_site_analytics.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.site_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  page_path text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint site_analytics_events_type check (event_type in ('site_visit', 'apk_download'))
);

create index if not exists site_analytics_events_type_idx
on public.site_analytics_events (event_type);

create index if not exists site_analytics_events_created_at_idx
on public.site_analytics_events (created_at);

alter table public.site_analytics_events enable row level security;

create or replace function public.get_site_analytics_summary()
returns table(
  visits bigint,
  downloads bigint,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  last_download_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where event_type = 'site_visit') as visits,
    count(*) filter (where event_type = 'apk_download') as downloads,
    min(created_at) filter (where event_type = 'site_visit') as first_visit_at,
    max(created_at) filter (where event_type = 'site_visit') as last_visit_at,
    max(created_at) filter (where event_type = 'apk_download') as last_download_at
  from public.site_analytics_events;
$$;

revoke all on function public.get_site_analytics_summary() from public;
grant execute on function public.get_site_analytics_summary() to service_role;


-- ============================================================
-- Source: supabase/migrations/202609060001_site_comments.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.site_comments (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  rating integer not null,
  comment_text text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint site_comments_rating_range check (rating between 1 and 5),
  constraint site_comments_status check (status in ('pending', 'approved', 'rejected')),
  constraint site_comments_display_name_length check (char_length(display_name) between 1 and 80),
  constraint site_comments_comment_text_length check (char_length(comment_text) between 3 and 1000)
);

create index if not exists site_comments_status_created_at_idx
on public.site_comments (status, created_at desc);

alter table public.site_comments enable row level security;


-- ============================================================
-- Source: supabase/migrations/202609060002_analytics_locations.sql
-- ============================================================

alter table public.site_analytics_events
add column if not exists country text,
add column if not exists region text,
add column if not exists city text,
add column if not exists latitude text,
add column if not exists longitude text,
add column if not exists timezone text,
add column if not exists postal_code text;

create index if not exists site_analytics_events_location_idx
on public.site_analytics_events (event_type, country, region, city);


-- ============================================================
-- Source: supabase/migrations/202609110001_apk_licensing.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  app_version text,
  platform text not null default 'android',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '1 day'),
  status text not null default 'trial',
  constraint devices_device_id_length check (char_length(device_id) between 3 and 200),
  constraint devices_status check (status in ('trial', 'trial_expired', 'licensed', 'blocked'))
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  plan text not null default 'pro_lifetime',
  status text not null default 'active',
  max_devices integer not null default 1,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  customer_email text,
  payment_reference text,
  constraint licenses_key_length check (char_length(license_key) between 6 and 120),
  constraint licenses_plan check (plan in ('pro_lifetime', 'pro_plus', 'business')),
  constraint licenses_status check (status in ('active', 'revoked', 'refunded', 'expired')),
  constraint licenses_max_devices_positive check (max_devices > 0)
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  activated_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  constraint license_activations_license_device_unique unique (license_id, device_id)
);

create unique index if not exists licenses_license_key_lower_idx
on public.licenses (lower(license_key));

create index if not exists devices_last_seen_at_idx
on public.devices (last_seen_at desc);

create index if not exists devices_status_idx
on public.devices (status);

create index if not exists licenses_status_idx
on public.licenses (status);

create index if not exists license_activations_device_id_idx
on public.license_activations (device_id);

create index if not exists license_activations_license_id_idx
on public.license_activations (license_id);

alter table public.devices enable row level security;
alter table public.licenses enable row level security;
alter table public.license_activations enable row level security;

create or replace function public.register_device(
  p_device_id text,
  p_app_version text default null,
  p_platform text default 'android',
  p_trial_days integer default 1
)
returns table(
  status text,
  licensed boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices%rowtype;
  v_licensed boolean;
begin
  insert into public.devices (
    device_id,
    app_version,
    platform,
    trial_started_at,
    trial_ends_at,
    status
  )
  values (
    trim(p_device_id),
    nullif(trim(coalesce(p_app_version, '')), ''),
    coalesce(nullif(trim(coalesce(p_platform, '')), ''), 'android'),
    now(),
    now() + make_interval(days => greatest(coalesce(p_trial_days, 1), 0)),
    'trial'
  )
  on conflict (device_id) do update
  set
    last_seen_at = now(),
    app_version = coalesce(nullif(trim(coalesce(p_app_version, '')), ''), public.devices.app_version),
    platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), public.devices.platform)
  returning * into v_device;

  select exists (
    select 1
    from public.license_activations activation
    join public.licenses license on license.id = activation.license_id
    where activation.device_id = v_device.device_id
      and license.status = 'active'
      and (license.expires_at is null or license.expires_at > now())
  )
  into v_licensed;

  if v_licensed then
    update public.devices
    set status = 'licensed', last_seen_at = now()
    where device_id = v_device.device_id
    returning * into v_device;
  elsif v_device.status <> 'blocked' then
    update public.devices
    set status = case when v_device.trial_ends_at <= now() then 'trial_expired' else 'trial' end
    where device_id = v_device.device_id
    returning * into v_device;
  end if;

  return query
  select
    v_device.status,
    v_licensed,
    v_device.trial_started_at,
    v_device.trial_ends_at,
    now();
end;
$$;

create or replace function public.activate_license_for_device(
  p_license_key text,
  p_device_id text,
  p_app_version text default null,
  p_platform text default 'android'
)
returns table(
  ok boolean,
  status text,
  license_id uuid,
  plan text,
  expires_at timestamptz,
  max_devices integer,
  activated_at timestamptz,
  last_checked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.licenses%rowtype;
  v_activation public.license_activations%rowtype;
  v_activation_count integer;
begin
  insert into public.devices (device_id, app_version, platform)
  values (
    trim(p_device_id),
    nullif(trim(coalesce(p_app_version, '')), ''),
    coalesce(nullif(trim(coalesce(p_platform, '')), ''), 'android')
  )
  on conflict (device_id) do update
  set
    last_seen_at = now(),
    app_version = coalesce(nullif(trim(coalesce(p_app_version, '')), ''), public.devices.app_version),
    platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), public.devices.platform);

  select *
  into v_license
  from public.licenses
  where lower(license_key) = lower(trim(p_license_key))
  for update;

  if not found then
    return query select false, 'license_not_found'::text, null::uuid, null::text, null::timestamptz, null::integer, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_license.status <> 'active' then
    return query select false, ('license_' || v_license.status)::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_license.activated_at, null::timestamptz;
    return;
  end if;

  if v_license.expires_at is not null and v_license.expires_at <= now() then
    update public.licenses set status = 'expired' where id = v_license.id;
    return query select false, 'license_expired'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_license.activated_at, null::timestamptz;
    return;
  end if;

  select *
  into v_activation
  from public.license_activations
  where public.license_activations.license_id = v_license.id
    and public.license_activations.device_id = trim(p_device_id);

  if found then
    update public.license_activations
    set last_checked_at = now()
    where id = v_activation.id
    returning * into v_activation;

    update public.devices
    set status = 'licensed', last_seen_at = now()
    where device_id = trim(p_device_id);

    return query select true, 'licensed'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_activation.activated_at, v_activation.last_checked_at;
    return;
  end if;

  select count(*)
  into v_activation_count
  from public.license_activations
  where public.license_activations.license_id = v_license.id;

  if v_activation_count >= v_license.max_devices then
    return query select false, 'device_limit_reached'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_license.activated_at, null::timestamptz;
    return;
  end if;

  insert into public.license_activations (license_id, device_id)
  values (v_license.id, trim(p_device_id))
  returning * into v_activation;

  update public.licenses
  set activated_at = coalesce(activated_at, now())
  where id = v_license.id
  returning * into v_license;

  update public.devices
  set status = 'licensed', last_seen_at = now()
  where device_id = trim(p_device_id);

  return query select true, 'activated'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_activation.activated_at, v_activation.last_checked_at;
end;
$$;

create or replace function public.check_license_for_device(
  p_device_id text,
  p_license_key text default null,
  p_app_version text default null,
  p_platform text default 'android'
)
returns table(
  status text,
  licensed boolean,
  license_id uuid,
  plan text,
  expires_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices%rowtype;
  v_license public.licenses%rowtype;
begin
  insert into public.devices (device_id, app_version, platform)
  values (
    trim(p_device_id),
    nullif(trim(coalesce(p_app_version, '')), ''),
    coalesce(nullif(trim(coalesce(p_platform, '')), ''), 'android')
  )
  on conflict (device_id) do update
  set
    last_seen_at = now(),
    app_version = coalesce(nullif(trim(coalesce(p_app_version, '')), ''), public.devices.app_version),
    platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), public.devices.platform)
  returning * into v_device;

  select license.*
  into v_license
  from public.license_activations activation
  join public.licenses license on license.id = activation.license_id
  where activation.device_id = v_device.device_id
    and (p_license_key is null or lower(license.license_key) = lower(trim(p_license_key)))
    and license.status = 'active'
    and (license.expires_at is null or license.expires_at > now())
  order by activation.last_checked_at desc
  limit 1;

  if found then
    update public.license_activations
    set last_checked_at = now()
    where public.license_activations.license_id = v_license.id
      and public.license_activations.device_id = v_device.device_id;

    update public.devices
    set status = 'licensed', last_seen_at = now()
    where device_id = v_device.device_id
    returning * into v_device;

    return query select 'licensed'::text, true, v_license.id, v_license.plan, v_license.expires_at, v_device.trial_started_at, v_device.trial_ends_at, now();
    return;
  end if;

  if v_device.status <> 'blocked' then
    update public.devices
    set status = case when public.devices.trial_ends_at <= now() then 'trial_expired' else 'trial' end
    where device_id = v_device.device_id
    returning * into v_device;
  end if;

  return query select v_device.status, false, null::uuid, null::text, null::timestamptz, v_device.trial_started_at, v_device.trial_ends_at, now();
end;
$$;

revoke all on function public.register_device(text, text, text, integer) from public;
revoke all on function public.activate_license_for_device(text, text, text, text) from public;
revoke all on function public.check_license_for_device(text, text, text, text) from public;

grant execute on function public.register_device(text, text, text, integer) to service_role;
grant execute on function public.activate_license_for_device(text, text, text, text) to service_role;
grant execute on function public.check_license_for_device(text, text, text, text) to service_role;


-- ============================================================
-- Source: supabase/migrations/202609120001_business_paymongo_payments.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.business_owner_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_owner_accounts_email_length check (char_length(email) between 5 and 254)
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.business_owner_accounts(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_status check (status in ('active', 'suspended', 'closed')),
  constraint businesses_business_name_length check (char_length(business_name) between 2 and 160),
  constraint businesses_owner_name_length check (char_length(owner_name) between 2 and 160),
  constraint businesses_email_length check (char_length(email) between 5 and 254)
);

create table if not exists public.business_payment_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  paymongo_public_key text,
  paymongo_secret_key_encrypted text,
  qrph_enabled boolean not null default false,
  webhook_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devices
add column if not exists business_id uuid references public.businesses(id) on delete set null,
add column if not exists paired_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create table if not exists public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint device_pairing_codes_code_length check (char_length(code) between 6 and 12)
);

create table if not exists public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  mode text not null,
  amount integer not null,
  currency text not null default 'PHP',
  status text not null default 'pending',
  paymongo_payment_id text,
  paymongo_checkout_url text,
  payment_payload jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_sessions_mode check (mode in ('photobooth', 'photo_id', 'reprint')),
  constraint payment_sessions_amount check (amount between 100 and 10000000),
  constraint payment_sessions_currency check (currency in ('PHP')),
  constraint payment_sessions_status check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled'))
);

create table if not exists public.business_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.business_owner_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists businesses_owner_user_id_idx on public.businesses (owner_user_id);
create index if not exists businesses_status_idx on public.businesses (status);
create index if not exists devices_business_id_idx on public.devices (business_id);
create index if not exists device_pairing_codes_business_id_idx on public.device_pairing_codes (business_id, expires_at desc);
create index if not exists payment_sessions_business_created_idx on public.payment_sessions (business_id, created_at desc);
create index if not exists payment_sessions_device_idx on public.payment_sessions (device_id, created_at desc);
create index if not exists payment_sessions_paymongo_payment_idx on public.payment_sessions (paymongo_payment_id);
create index if not exists business_sessions_owner_idx on public.business_sessions (owner_user_id, expires_at desc);

alter table public.business_owner_accounts enable row level security;
alter table public.businesses enable row level security;
alter table public.business_payment_settings enable row level security;
alter table public.device_pairing_codes enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.business_sessions enable row level security;

drop policy if exists businesses_owner_select on public.businesses;
create policy businesses_owner_select on public.businesses
for select to authenticated
using (owner_user_id = auth.uid());

drop policy if exists businesses_owner_update on public.businesses;
create policy businesses_owner_update on public.businesses
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists business_payment_settings_owner_select on public.business_payment_settings;
create policy business_payment_settings_owner_select on public.business_payment_settings
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = business_payment_settings.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

drop policy if exists devices_business_owner_select on public.devices;
create policy devices_business_owner_select on public.devices
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = devices.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

drop policy if exists device_pairing_codes_business_owner_select on public.device_pairing_codes;
create policy device_pairing_codes_business_owner_select on public.device_pairing_codes
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = device_pairing_codes.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

drop policy if exists payment_sessions_business_owner_select on public.payment_sessions;
create policy payment_sessions_business_owner_select on public.payment_sessions
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = payment_sessions.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_owner_accounts_touch_updated_at on public.business_owner_accounts;
create trigger business_owner_accounts_touch_updated_at
before update on public.business_owner_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists businesses_touch_updated_at on public.businesses;
create trigger businesses_touch_updated_at
before update on public.businesses
for each row execute function public.touch_updated_at();

drop trigger if exists business_payment_settings_touch_updated_at on public.business_payment_settings;
create trigger business_payment_settings_touch_updated_at
before update on public.business_payment_settings
for each row execute function public.touch_updated_at();

drop trigger if exists devices_touch_updated_at on public.devices;
create trigger devices_touch_updated_at
before update on public.devices
for each row execute function public.touch_updated_at();

drop trigger if exists payment_sessions_touch_updated_at on public.payment_sessions;
create trigger payment_sessions_touch_updated_at
before update on public.payment_sessions
for each row execute function public.touch_updated_at();


-- ============================================================
-- Source: supabase/migrations/202609170001_license_paymongo_checkout.sql
-- ============================================================

create extension if not exists pgcrypto;

alter table public.licenses
drop constraint if exists licenses_plan;

alter table public.licenses
add constraint licenses_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business', 'pro_lifetime', 'pro_plus'));

create table if not exists public.license_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(device_id) on delete cascade,
  plan text not null,
  amount integer not null,
  currency text not null default 'PHP',
  status text not null default 'pending',
  reference_number text not null unique,
  paymongo_checkout_session_id text unique,
  paymongo_checkout_url text,
  customer_email text,
  license_id uuid references public.licenses(id) on delete set null,
  payment_payload jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_payment_sessions_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business')),
  constraint license_payment_sessions_amount check (amount between 100 and 10000000),
  constraint license_payment_sessions_currency check (currency in ('PHP')),
  constraint license_payment_sessions_status check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled'))
);

create index if not exists license_payment_sessions_device_idx
on public.license_payment_sessions (device_id, created_at desc);

create index if not exists license_payment_sessions_status_idx
on public.license_payment_sessions (status, created_at desc);

create index if not exists license_payment_sessions_paymongo_idx
on public.license_payment_sessions (paymongo_checkout_session_id);

alter table public.license_payment_sessions enable row level security;

drop trigger if exists license_payment_sessions_touch_updated_at on public.license_payment_sessions;
create trigger license_payment_sessions_touch_updated_at
before update on public.license_payment_sessions
for each row execute function public.touch_updated_at();


-- ============================================================
-- Source: supabase/migrations/202609170002_launch_license_pricing.sql
-- ============================================================

create table if not exists public.license_plan_settings (
  id text primary key,
  name text not null,
  description text,
  amount integer not null,
  currency text not null default 'PHP',
  duration_days integer,
  max_devices integer not null default 1,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_plan_settings_amount check (amount between 100 and 10000000),
  constraint license_plan_settings_currency check (currency in ('PHP')),
  constraint license_plan_settings_duration check (duration_days is null or duration_days > 0),
  constraint license_plan_settings_max_devices check (max_devices > 0)
);

insert into public.license_plan_settings (
  id,
  name,
  description,
  amount,
  currency,
  duration_days,
  max_devices,
  features,
  active,
  sort_order
)
values
  (
    'weekly',
    'Weekly',
    'Launch pricing for short event use.',
    15000,
    'PHP',
    7,
    1,
    '["1 Android device", "7 days access", "Photobooth and ID photo modes", "QR download support"]'::jsonb,
    true,
    10
  ),
  (
    'monthly',
    'Monthly',
    'Launch pricing for regular PhotoTags use.',
    30000,
    'PHP',
    30,
    1,
    '["1 Android device", "30 days access", "All current PhotoTags tools", "Templates and branding"]'::jsonb,
    true,
    20
  ),
  (
    'lifetime',
    'Lifetime',
    'Launch pricing for one device with no expiry.',
    100000,
    'PHP',
    null,
    1,
    '["1 Android device", "No expiry", "All current PhotoTags tools", "Future license checks supported"]'::jsonb,
    true,
    30
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  amount = excluded.amount,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  max_devices = excluded.max_devices,
  features = excluded.features,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.licenses
drop constraint if exists licenses_plan;

alter table public.licenses
add constraint licenses_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business', 'pro_lifetime', 'pro_plus'));

alter table public.license_payment_sessions
drop constraint if exists license_payment_sessions_plan;

alter table public.license_payment_sessions
add constraint license_payment_sessions_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business'));

alter table public.license_plan_settings enable row level security;

drop trigger if exists license_plan_settings_touch_updated_at on public.license_plan_settings;
create trigger license_plan_settings_touch_updated_at
before update on public.license_plan_settings
for each row execute function public.touch_updated_at();


-- ============================================================
-- Source: supabase/migrations/202609170003_license_payment_agreement.sql
-- ============================================================

alter table public.license_payment_sessions
add column if not exists agreement_accepted_at timestamptz,
add column if not exists agreement_terms_version text,
add column if not exists agreement_privacy_version text,
add column if not exists agreement_refund_version text,
add column if not exists agreement_ip text,
add column if not exists agreement_user_agent text;

create index if not exists license_payment_sessions_agreement_idx
on public.license_payment_sessions (agreement_accepted_at desc);


-- ============================================================
-- Source: supabase/migrations/202610060001_device_transaction_sync.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  transaction_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  mode text not null,
  payment_method text not null,
  status text not null,
  amount_centavos integer not null,
  voucher_code text,
  prints_used integer not null default 0,
  note text,
  raw_payload jsonb,
  constraint transactions_transaction_id_length check (char_length(transaction_id) between 1 and 200),
  constraint transactions_device_transaction_unique unique (device_id, transaction_id),
  constraint transactions_mode check (mode in ('Photobooth', 'ID Photo', 'Receiptbooth')),
  constraint transactions_payment_method check (payment_method in ('coin', 'voucher')),
  constraint transactions_status check (status in ('completed', 'failed')),
  constraint transactions_amount_centavos check (amount_centavos between 0 and 10000000),
  constraint transactions_prints_used check (prints_used between 0 and 10000),
  constraint transactions_voucher_code_length check (voucher_code is null or char_length(voucher_code) <= 120),
  constraint transactions_note_length check (note is null or char_length(note) <= 1000)
);

create index if not exists transactions_business_occurred_idx
on public.transactions (business_id, occurred_at desc);

create index if not exists transactions_device_occurred_idx
on public.transactions (device_id, occurred_at desc);

create index if not exists transactions_business_filters_idx
on public.transactions (business_id, mode, payment_method, status, occurred_at desc);

alter table public.transactions enable row level security;

drop policy if exists transactions_business_owner_select on public.transactions;
create policy transactions_business_owner_select on public.transactions
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = transactions.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);


-- ============================================================
-- Source: supabase/migrations/202610130001_photo_storage_retention.sql
-- ============================================================

alter table public.photo_downloads
add column if not exists cleanup_after timestamptz;

update public.photo_downloads
set cleanup_after = created_at + interval '24 hours'
where cleanup_after is null;

alter table public.photo_downloads
alter column cleanup_after set default (now() + interval '24 hours'),
alter column cleanup_after set not null;

create index if not exists photo_downloads_cleanup_after_idx
on public.photo_downloads (cleanup_after);

-- Metadata must only be removed after the Storage API confirms object deletion.
drop function if exists public.delete_expired_photo_download_rows();

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'cleanup-phototags-photos-hourly';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'cleanup-phototags-photos-hourly',
  '17 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'phototags_project_url'
      ) || '/functions/v1/cleanup-photo-downloads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'phototags_photo_cleanup_secret'
        )
      ),
      body := jsonb_build_object('scheduledAt', now()),
      timeout_milliseconds := 10000
    );
  $job$
);


-- ============================================================
-- Source: supabase/migrations/202610130002_animated_gif_downloads.sql
-- ============================================================

alter table public.photo_downloads
add column if not exists gif_file_path text;

alter table public.photo_downloads
drop constraint if exists photo_downloads_gif_file_path_format;

alter table public.photo_downloads
add constraint photo_downloads_gif_file_path_format check (
  gif_file_path is null
  or gif_file_path ~ '^captures/[A-Za-z0-9/_ .-]+[.]gif$'
);

update storage.buckets
set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'photobooth-downloads';

-- Source: supabase/migrations/202610180001_native_business_qrph.sql
-- Native QR Ph payments; apply before deploying the API update.
alter table public.devices add column if not exists payment_token_hash text;
alter table public.business_payment_settings
  add column if not exists webhook_secret_encrypted text;
alter table public.payment_sessions
  add column if not exists request_id uuid,
  add column if not exists qr_image_url text,
  add column if not exists payment_flow text not null default 'checkout';
create unique index if not exists payment_sessions_request_idx
  on public.payment_sessions (business_id, device_id, request_id) where request_id is not null;
alter table public.payment_sessions drop constraint if exists payment_sessions_mode;
alter table public.payment_sessions add constraint payment_sessions_mode
  check (mode in ('photobooth', 'photo_id', 'receiptbooth', 'reprint'));

-- Allow Android's QR Ph transaction journal to use the existing sync path.
begin;
alter table public.transactions drop constraint if exists transactions_payment_method;
alter table public.transactions add constraint transactions_payment_method
  check (payment_method in ('coin', 'voucher', 'qrph'));
commit;

-- Source: supabase/migrations/202611040001_reprint_transaction_tracking.sql
-- Additive reprint journal and business-scoped reporting. No history is invented.
begin;
alter table public.transactions
  add column if not exists copies_requested integer,
  add column if not exists print_status text,
  add column if not exists original_transaction_id text,
  add column if not exists source_mode text;
alter table public.transactions drop constraint if exists transactions_mode;
alter table public.transactions add constraint transactions_mode
  check (mode in ('Photobooth', 'ID Photo', 'Receiptbooth', 'Reprint'));
alter table public.transactions drop constraint if exists transactions_payment_method;
alter table public.transactions add constraint transactions_payment_method
  check (payment_method in ('coin', 'voucher', 'qrph', 'none'));
alter table public.transactions drop constraint if exists transactions_reprint_metadata;
alter table public.transactions add constraint transactions_reprint_metadata check (
  (copies_requested is null or copies_requested between 1 and 10)
  and (print_status is null or print_status in ('submitted', 'partial', 'failed', 'unknown'))
  and ((copies_requested is null) = (print_status is null))
  and (mode <> 'Reprint' or (copies_requested is not null and print_status is not null))
  and (copies_requested is null or prints_used <= copies_requested)
  and (print_status is distinct from 'submitted' or prints_used = copies_requested)
  and (print_status is distinct from 'partial' or prints_used between 1 and copies_requested - 1)
  and (print_status is distinct from 'failed' or prints_used = 0)
  and (original_transaction_id is null or char_length(btrim(original_transaction_id)) between 1 and 200)
  and (source_mode is null or source_mode in ('Photobooth', 'ID Photo', 'Receiptbooth'))
  and (payment_method <> 'none' or (mode = 'Reprint' and amount_centavos = 0 and voucher_code is null))
  and (mode <> 'Reprint' or
    (amount_centavos > 0 and status = 'completed') or
    (amount_centavos = 0 and status = case when prints_used > 0 then 'completed' else 'failed' end))
);

create or replace function public.business_transaction_report(
  p_business_id uuid,
  p_date_from date default null, p_date_to date default null,
  p_device_id text default null, p_mode text default null,
  p_payment_method text default null, p_status text default null,
  p_page integer default 1, p_page_size integer default 50
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_business_id is null or p_page is null or p_page < 1 or p_page > 1000000
     or p_page_size is null or p_page_size < 1 or p_page_size > 100
     or (p_date_from is not null and p_date_to is not null and p_date_from > p_date_to)
     or (p_mode is not null and p_mode not in ('Photobooth', 'ID Photo', 'Receiptbooth', 'Reprint'))
     or (p_payment_method is not null and p_payment_method not in ('coin', 'voucher', 'qrph', 'none'))
     or (p_status is not null and p_status not in ('completed', 'failed')) then
    raise exception 'invalid_report_filters';
  end if;
  return (
    with filtered as materialized (
      select t.* from public.transactions t
      where t.business_id = p_business_id
        and (p_date_from is null or t.occurred_at >= (p_date_from::timestamp at time zone 'Asia/Manila'))
        and (p_date_to is null or t.occurred_at < ((p_date_to + 1)::timestamp at time zone 'Asia/Manila'))
        and (p_device_id is null or t.device_id = p_device_id)
        and (p_mode is null or t.mode = p_mode)
        and (p_payment_method is null or t.payment_method = p_payment_method)
        and (p_status is null or t.status = p_status)
    ), totals as (
      select count(*) as total,
        jsonb_build_object(
          'recordedRevenueCentavos', coalesce(sum(amount_centavos) filter (where status = 'completed'), 0),
          'completedTransactions', count(*) filter (where status = 'completed'),
          'coinPayments', count(*) filter (where payment_method = 'coin' and status = 'completed'),
          'voucherPayments', count(*) filter (where payment_method = 'voucher' and status = 'completed'),
          'qrphPayments', count(*) filter (where payment_method = 'qrph' and status = 'completed'),
          'failedVoucherAttempts', count(*) filter (where payment_method = 'voucher' and status = 'failed'),
          'receiptboothCopiesRecorded', coalesce(sum(prints_used) filter (where mode = 'Receiptbooth' and status = 'completed'), 0),
          'reprintBatches', count(*) filter (where mode = 'Reprint'),
          'reprintCopiesSent', coalesce(sum(prints_used) filter (where mode = 'Reprint'), 0),
          'reprintCopiesRequested', coalesce(sum(copies_requested) filter (where mode = 'Reprint'), 0),
          'freeAdminReprintBatches', count(*) filter (where mode = 'Reprint' and payment_method = 'none'),
          'paidReprintRevenueCentavos', coalesce(sum(amount_centavos) filter (where mode = 'Reprint' and status = 'completed' and amount_centavos > 0), 0),
          'failedReprintBatches', count(*) filter (where mode = 'Reprint' and print_status = 'failed'),
          'partialReprintBatches', count(*) filter (where mode = 'Reprint' and print_status = 'partial'),
          'unknownReprintBatches', count(*) filter (where mode = 'Reprint' and print_status = 'unknown')
        ) as summary
      from filtered
    ), page_rows as (
      select id, device_id, transaction_id, occurred_at, received_at, mode, payment_method,
        status, amount_centavos, voucher_code, prints_used, note, copies_requested,
        print_status, original_transaction_id, source_mode
      from filtered order by occurred_at desc, id desc
      limit p_page_size offset ((p_page::bigint - 1) * p_page_size)
    )
    select jsonb_build_object(
      'transactions', coalesce((select jsonb_agg(to_jsonb(r) order by r.occurred_at desc, r.id desc) from page_rows r), '[]'::jsonb),
      'summary', totals.summary, 'total', totals.total,
      'page', p_page, 'pageSize', p_page_size,
      'hasMore', totals.total > p_page::bigint * p_page_size,
      'reportingTimezone', 'Asia/Manila', 'asOf', transaction_timestamp()
    ) from totals
  );
end;
$$;
-- The server supplies the authenticated business ID. Never expose this RPC to clients.
revoke all on function public.business_transaction_report(uuid, date, date, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.business_transaction_report(uuid, date, date, text, text, text, text, integer, integer) to service_role;
commit;


-- PhotoTags Light: independent, additive installation licensing.
-- PhotoTags Light only. No APK tables, RPCs, policies, or records are changed.
begin;
create table if not exists public.light_plans (
  id text primary key, name text not null, amount integer not null default 0 check(amount >= 0),
  currency text not null default 'PHP' check(currency = 'PHP'),
  duration_days integer check(duration_days between 1 and 36500),
  max_installations integer not null default 1 check(max_installations between 1 and 1000),
  active boolean not null default false, created_at timestamptz not null default now()
);
insert into public.light_plans(id,name,duration_days) values
 ('weekly','Light Weekly',7),('monthly','Light Monthly',30),('lifetime','Light Lifetime',null)
on conflict(id) do nothing;
create table if not exists public.light_installations (
  id uuid primary key, public_key jsonb not null, key_hash text not null unique,
  name text not null, platform text not null, app_version text not null default '',
  blocked boolean not null default false, created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), last_permit_expires_at timestamptz
);
create table if not exists public.light_licenses (
  id uuid primary key default gen_random_uuid(), license_key text not null unique,
  plan_id text not null references public.light_plans(id),
  status text not null default 'active' check(status in ('active','revoked','refunded')),
  max_installations integer not null check(max_installations between 1 and 1000),
  customer_email text, expires_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.light_activations (
  installation_id uuid primary key references public.light_installations(id),
  license_id uuid not null references public.light_licenses(id), activated_at timestamptz not null default now()
);
create index if not exists light_activations_license_idx on public.light_activations(license_id);
create table if not exists public.light_auth_nonces (
  id uuid primary key, expires_at timestamptz not null
);
create table if not exists public.light_payments (
  id uuid primary key default gen_random_uuid(), installation_id uuid not null references public.light_installations(id),
  plan_id text not null references public.light_plans(id), amount integer not null check(amount >= 100),
  currency text not null check(currency = 'PHP'), duration_days integer,
  max_installations integer not null, customer_email text not null,
  reference_number text not null unique, checkout_id text unique, checkout_url text,
  status text not null default 'pending' check(status in ('pending','paid','failed')),
  license_id uuid references public.light_licenses(id),
  agreement_version text not null, agreement_accepted_at timestamptz not null,
  created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.light_audit (
  id bigint generated always as identity primary key, action text not null,
  subject text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.light_plans enable row level security;
alter table public.light_installations enable row level security;
alter table public.light_licenses enable row level security;
alter table public.light_activations enable row level security;
alter table public.light_auth_nonces enable row level security;
alter table public.light_payments enable row level security;
alter table public.light_audit enable row level security;
revoke all on public.light_plans, public.light_installations, public.light_licenses,
 public.light_activations, public.light_auth_nonces, public.light_payments, public.light_audit from anon, authenticated;
grant all on public.light_plans, public.light_installations, public.light_licenses,
 public.light_activations, public.light_auth_nonces, public.light_payments, public.light_audit to service_role;
grant usage, select on sequence public.light_audit_id_seq to service_role;

create or replace function public.light_use_nonce(p_id uuid, p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 delete from light_auth_nonces where expires_at < now();
 insert into light_auth_nonces values(p_id,p_expires_at) on conflict do nothing;
 return found;
end $$;

create or replace function public.light_register(p_id uuid,p_public_key jsonb,p_key_hash text,p_name text,p_platform text,p_app_version text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v light_installations%rowtype;
begin
 insert into light_installations(id,public_key,key_hash,name,platform,app_version)
 values(p_id,p_public_key,p_key_hash,left(p_name,80),left(p_platform,80),left(p_app_version,40))
 on conflict(id) do nothing;
 select * into v from light_installations where id=p_id for update;
 if v.key_hash<>p_key_hash then return jsonb_build_object('status','installation_key_mismatch'); end if;
 if v.blocked then return jsonb_build_object('status','installation_blocked'); end if;
 update light_installations set last_seen_at=now(),name=left(p_name,80),platform=left(p_platform,80),app_version=left(p_app_version,40) where id=p_id;
 return jsonb_build_object('status','registered');
end $$;

create or replace function public.light_activate(p_installation_id uuid,p_license_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v light_licenses%rowtype; i light_installations%rowtype; n integer;
begin
 select * into i from light_installations where id=p_installation_id for update;
 if not found or i.blocked then return jsonb_build_object('status','installation_blocked'); end if;
 select * into v from light_licenses where license_key=upper(trim(p_license_key)) for update;
 if not found then return jsonb_build_object('status','light_license_not_found'); end if;
 if v.status<>'active' or (v.expires_at is not null and v.expires_at<=now()) then
  return jsonb_build_object('status','license_inactive');
 end if;
 if not exists(select 1 from light_activations where installation_id=p_installation_id and license_id=v.id) then
  select count(*) into n from light_activations where license_id=v.id;
  if n>=v.max_installations then return jsonb_build_object('status','installation_limit_reached'); end if;
 end if;
 insert into light_activations(installation_id,license_id) values(p_installation_id,v.id)
 on conflict(installation_id) do update set license_id=excluded.license_id,activated_at=now();
 insert into light_audit(action,subject,details) values('activate',p_installation_id::text,jsonb_build_object('licenseId',v.id));
 return jsonb_build_object('status','licensed');
end $$;

create or replace function public.light_reserve_checkout(p_installation_id uuid,p_plan_id text,p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p light_plans%rowtype; s light_payments%rowtype;
begin
 perform 1 from light_installations where id=p_installation_id and not blocked for update;
 if not found then raise exception 'light_installation_blocked'; end if;
 if exists(select 1 from light_activations a join light_licenses l on l.id=a.license_id
   where a.installation_id=p_installation_id and l.status='active' and l.expires_at is null) then
   raise exception 'light_lifetime_already_active';
 end if;
 select * into p from light_plans where id=p_plan_id and active and amount>=100;
 if not found then raise exception 'light_plan_unavailable'; end if;
 select * into s from light_payments where installation_id=p_installation_id and plan_id=p_plan_id
  and status='pending' order by created_at desc limit 1;
 if found then return jsonb_build_object('owner',false,'session',to_jsonb(s)); end if;
 insert into light_payments(installation_id,plan_id,amount,currency,duration_days,max_installations,customer_email,
  reference_number,agreement_version,agreement_accepted_at)
 values(p_installation_id,p.id,p.amount,p.currency,p.duration_days,p.max_installations,p_email,
  'PTL-'||gen_random_uuid()::text,'light-2026-11-11',now()) returning * into s;
 return jsonb_build_object('owner',true,'session',to_jsonb(s));
end $$;

-- All payment provisioning is atomic and idempotent. Provider data is verified by the Light API first.
create or replace function public.light_attach_checkout(p_id uuid,p_checkout_id text,p_url text)
returns void language plpgsql security definer set search_path=public as $$
declare s light_payments%rowtype;
begin
 select * into s from light_payments where id=p_id for update;
 if not found then raise exception 'light_payment_not_found'; end if;
 if s.checkout_id is not null and s.checkout_id<>p_checkout_id then raise exception 'light_checkout_already_attached'; end if;
 update light_payments set checkout_id=p_checkout_id,checkout_url=p_url where id=p_id;
 insert into light_audit(action,subject,details) values('checkout_recovered',p_id::text,jsonb_build_object('checkoutId',p_checkout_id));
end $$;

create or replace function public.light_fulfill_payment(p_payment_id uuid,p_checkout_id text,p_amount integer,p_currency text,p_reference text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v light_payments%rowtype; l uuid; expiry timestamptz; base_time timestamptz:=now();
begin
 select * into v from light_payments where id=p_payment_id for update;
 if not found then raise exception 'light_payment_not_found'; end if;
 if v.checkout_id is distinct from p_checkout_id or v.amount<>p_amount or v.currency<>p_currency
  or v.reference_number<>p_reference then raise exception 'light_payment_mismatch'; end if;
 if v.status='paid' and v.license_id is not null then return v.license_id; end if;
 -- Serialize purchases and activation changes for this installation.
 perform 1 from light_installations where id=v.installation_id for update;
 select greatest(now(),coalesce(x.expires_at,now())) into base_time
 from light_activations a join light_licenses x on x.id=a.license_id
 where a.installation_id=v.installation_id and x.status='active';
 base_time:=coalesce(base_time,now());
 expiry:=case when v.duration_days is null then null else base_time+make_interval(days=>v.duration_days) end;
 insert into light_licenses(license_key,plan_id,max_installations,customer_email,expires_at)
 values('PTL-'||upper(replace(gen_random_uuid()::text,'-','')),v.plan_id,v.max_installations,v.customer_email,expiry)
 returning id into l;
 if not (select blocked from light_installations where id=v.installation_id) then
  insert into light_activations(installation_id,license_id) values(v.installation_id,l)
  on conflict(installation_id) do update set license_id=excluded.license_id,activated_at=now();
 end if;
 update light_payments set status='paid',license_id=l,paid_at=now() where id=v.id;
 insert into light_audit(action,subject,details) values('payment_paid',v.id::text,jsonb_build_object('licenseId',l));
 return l;
end $$;

-- Administrative mutations are restricted to this product and recorded.
create or replace function public.light_admin_action(p_action text,p_id text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l light_licenses%rowtype; p light_plans%rowtype;
begin
 if p_action='create_license' then
  select * into p from light_plans where id=p_values->>'planId';
  if not found then raise exception 'light_plan_not_found'; end if;
  insert into light_licenses(license_key,plan_id,max_installations,customer_email,expires_at)
  values('PTL-'||upper(replace(gen_random_uuid()::text,'-','')),p.id,p.max_installations,
   nullif(p_values->>'email',''),case when p.duration_days is null then null else now()+make_interval(days=>p.duration_days) end)
  returning * into l;
  p_id:=l.id::text;
 elsif p_action='set_license_status' then
  update light_licenses set status=p_values->>'status' where id=p_id::uuid;
  if not found then raise exception 'light_license_not_found'; end if;
 elsif p_action='set_installation_blocked' then
  update light_installations set blocked=(p_values->>'blocked')::boolean where id=p_id::uuid;
  if not found then raise exception 'light_installation_not_found'; end if;
 elsif p_action='release_installation' then
  -- Prevent the old installation from checking in to regain the released seat.
  perform 1 from light_installations where id=p_id::uuid for update;
  if not found then raise exception 'light_installation_not_found'; end if;
  update light_installations set blocked=true where id=p_id::uuid;
  delete from light_activations where installation_id=p_id::uuid;
 elsif p_action='update_plan' then
  update light_plans set name=p_values->>'name',amount=(p_values->>'amount')::integer,
   duration_days=nullif(p_values->>'durationDays','')::integer,
   max_installations=(p_values->>'maxInstallations')::integer,active=(p_values->>'active')::boolean
  where id=p_id;
  if not found then raise exception 'light_plan_not_found'; end if;
 else raise exception 'light_action_invalid'; end if;
 insert into light_audit(action,subject,details) values(p_action,p_id,p_values);
 return jsonb_build_object('status','saved','licenseKey',l.license_key);
end $$;

revoke all on function public.light_use_nonce(uuid,timestamptz),public.light_register(uuid,jsonb,text,text,text,text),
 public.light_activate(uuid,text),public.light_reserve_checkout(uuid,text,text),public.light_attach_checkout(uuid,text,text),public.light_fulfill_payment(uuid,text,integer,text,text),public.light_admin_action(text,text,jsonb) from public;
grant execute on function public.light_use_nonce(uuid,timestamptz),public.light_register(uuid,jsonb,text,text,text,text),
 public.light_activate(uuid,text),public.light_reserve_checkout(uuid,text,text),public.light_attach_checkout(uuid,text,text),public.light_fulfill_payment(uuid,text,integer,text,text),public.light_admin_action(text,text,jsonb) to service_role;
commit;


-- Light-only QR payment support. Apply after 202611110001_light_licensing.sql.
begin;
alter table public.light_payments add column if not exists payment_intent_id text unique;
alter table public.light_payments add column if not exists qr_image_url text;
alter table public.light_payments add column if not exists qr_expires_at timestamptz;

create or replace function public.light_reserve_qr(p_installation_id uuid,p_plan_id text,p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p light_plans%rowtype; s light_payments%rowtype;
begin
 perform 1 from light_installations where id=p_installation_id and not blocked for update;
 if not found then raise exception 'light_installation_blocked'; end if;
 if exists(select 1 from light_activations a join light_licenses l on l.id=a.license_id
  where a.installation_id=p_installation_id and l.status='active' and l.expires_at is null) then
  raise exception 'light_lifetime_already_active';
 end if;
 select * into p from light_plans where id=p_plan_id and active and amount>=100;
 if not found then raise exception 'light_plan_unavailable'; end if;
 select * into s from light_payments where installation_id=p_installation_id and status='pending'
  order by created_at desc limit 1;
 if found then
  if s.plan_id<>p_plan_id then raise exception 'light_other_payment_pending'; end if;
  return jsonb_build_object('owner',false,'session',to_jsonb(s));
 end if;
 insert into light_payments(installation_id,plan_id,amount,currency,duration_days,max_installations,customer_email,
  reference_number,agreement_version,agreement_accepted_at)
 values(p_installation_id,p.id,p.amount,p.currency,p.duration_days,p.max_installations,p_email,
  'PTL-'||gen_random_uuid()::text,'light-2026-11-11',now()) returning * into s;
 return jsonb_build_object('owner',true,'session',to_jsonb(s));
end $$;

create or replace function public.light_attach_qr_intent(p_id uuid,p_intent_id text)
returns void language plpgsql security definer set search_path=public as $$
declare s light_payments%rowtype;
begin
 select * into s from light_payments where id=p_id for update;
 if not found then raise exception 'light_payment_not_found'; end if;
 if p_intent_id !~ '^pi_[A-Za-z0-9_]+$' or s.checkout_id is not null or
  (s.payment_intent_id is not null and s.payment_intent_id<>p_intent_id) then
  raise exception 'light_payment_mismatch';
 end if;
 update light_payments set payment_intent_id=p_intent_id where id=p_id;
end $$;

create or replace function public.light_fulfill_qr(p_payment_id uuid,p_intent_id text,p_amount integer,p_currency text,p_reference text)
returns uuid language plpgsql security definer set search_path=public as $$
declare s light_payments%rowtype;
begin
 select * into s from light_payments where id=p_payment_id for update;
 if not found or s.payment_intent_id is null or s.payment_intent_id is distinct from p_intent_id or s.checkout_id is not null then
  raise exception 'light_payment_mismatch';
 end if;
 -- Reuse only the isolated Light provisioning transaction and renewal rules.
 return light_fulfill_payment(p_payment_id,s.checkout_id,p_amount,p_currency,p_reference);
end $$;

revoke all on function public.light_reserve_qr(uuid,text,text),public.light_attach_qr_intent(uuid,text),
 public.light_fulfill_qr(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.light_reserve_qr(uuid,text,text),public.light_attach_qr_intent(uuid,text),
 public.light_fulfill_qr(uuid,text,integer,text,text) to service_role;
commit;
