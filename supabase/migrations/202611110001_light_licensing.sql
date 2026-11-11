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
