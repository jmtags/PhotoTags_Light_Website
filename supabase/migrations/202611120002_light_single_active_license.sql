-- Light only: one active license per registered installation. Existing paid purchases still reconcile.
-- Apply after the Light licensing and inline QR migrations.
begin;

create or replace function public.light_activate(p_installation_id uuid,p_license_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v light_licenses%rowtype; i light_installations%rowtype; n integer;
begin
 select * into i from light_installations where id=p_installation_id for update;
 if not found or i.blocked then return jsonb_build_object('status','installation_blocked'); end if;
 if exists(select 1 from light_activations a join light_licenses l on l.id=a.license_id
  where a.installation_id=p_installation_id and l.status='active' and (l.expires_at is null or l.expires_at>now())
  and l.license_key<>upper(trim(p_license_key))) then
  return jsonb_build_object('status','light_already_licensed');
 end if;
 if exists(select 1 from light_payments where installation_id=p_installation_id and status='pending') then
  return jsonb_build_object('status','light_payment_pending');
 end if;
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
   where a.installation_id=p_installation_id and l.status='active' and (l.expires_at is null or l.expires_at>now())) then
   raise exception 'light_already_licensed';
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

create or replace function public.light_reserve_qr(p_installation_id uuid,p_plan_id text,p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p light_plans%rowtype; s light_payments%rowtype;
begin
 perform 1 from light_installations where id=p_installation_id and not blocked for update;
 if not found then raise exception 'light_installation_blocked'; end if;
 if exists(select 1 from light_activations a join light_licenses l on l.id=a.license_id
  where a.installation_id=p_installation_id and l.status='active' and (l.expires_at is null or l.expires_at>now())) then
  raise exception 'light_already_licensed';
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

revoke all on function public.light_activate(uuid,text),public.light_reserve_checkout(uuid,text,text),
 public.light_reserve_qr(uuid,text,text) from public,anon,authenticated;
grant execute on function public.light_activate(uuid,text),public.light_reserve_checkout(uuid,text,text),
 public.light_reserve_qr(uuid,text,text) to service_role;
commit;
