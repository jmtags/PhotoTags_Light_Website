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
