-- Isolated PhotoTags LRB usage: no photo, IP, device-ID or APK data collection.
begin;
create table if not exists public.light_usage_devices (
 installation_id uuid primary key references public.light_installations(id),
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 total_views bigint not null default 0 check(total_views>=0),
 device jsonb not null default '{}', camera jsonb not null default '{}', printer jsonb not null default '{}',
 app_mode text not null default 'settings' check(app_mode in ('settings','kiosk'))
);
create table if not exists public.light_usage_visits (
 installation_id uuid not null references public.light_installations(id), visit_id uuid not null,
 viewed_at timestamptz not null default now(), primary key(installation_id,visit_id)
);
create table if not exists public.light_usage_daily (
 installation_id uuid not null references public.light_installations(id), day date not null,
 views bigint not null default 0 check(views>=0), primary key(installation_id,day)
);
create index if not exists light_usage_last_seen on public.light_usage_devices(last_seen_at desc);
create index if not exists light_usage_daily_day on public.light_usage_daily(day);
alter table public.light_usage_devices enable row level security;
alter table public.light_usage_visits enable row level security;
alter table public.light_usage_daily enable row level security;
revoke all on public.light_usage_devices,public.light_usage_visits,public.light_usage_daily from anon,authenticated;
grant select,insert,update on public.light_usage_devices,public.light_usage_visits,public.light_usage_daily to service_role;
create or replace function public.light_report_usage(p_installation_id uuid,p_visit_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare added integer; today date:=timezone('Asia/Manila',now())::date;
begin
 perform 1 from light_installations where id=p_installation_id and not blocked for update;
 if not found then raise exception 'light_installation_blocked'; end if;
 if p_visit_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>4000 then raise exception 'invalid_light_usage'; end if;
 insert into light_usage_visits(installation_id,visit_id) values(p_installation_id,p_visit_id) on conflict do nothing;
 get diagnostics added=row_count;
 insert into light_usage_devices(installation_id,total_views,device,camera,printer,app_mode)
 values(p_installation_id,added,coalesce(p_data->'device','{}'),coalesce(p_data->'camera','{}'),coalesce(p_data->'printer','{}'),coalesce(p_data->>'mode','settings'))
 on conflict(installation_id) do update set last_seen_at=now(),total_views=light_usage_devices.total_views+added,
 device=excluded.device,camera=light_usage_devices.camera||excluded.camera,printer=excluded.printer,app_mode=excluded.app_mode;
 insert into light_usage_daily(installation_id,day,views) values(p_installation_id,today,added)
 on conflict(installation_id,day) do update set views=light_usage_daily.views+added;
 return jsonb_build_object('status','recorded');
end $$;
create or replace function public.light_usage_admin(p_offset integer default 0,p_search text default '')
returns jsonb language sql security definer set search_path=public as $$
 with clock as (select timezone('Asia/Manila',now())::date today),
 filtered as (
  select u.*,i.name,i.blocked,
   case when i.blocked then 'Blocked' when l.status='active' and (l.expires_at is null or l.expires_at>now()) then 'Paid'
    when t.expires_at>now() then 'Trial' when l.expires_at<=now() or t.expires_at<=now() then 'Expired' else 'Unlicensed' end license_status,
   case when l.status='active' and (l.expires_at is null or l.expires_at>now()) then l.plan_id when t.expires_at>now() then 'trial' else null end plan,
   (not i.blocked and u.last_seen_at>now()-interval '5 minutes') online
  from light_usage_devices u join light_installations i on i.id=u.installation_id
  left join light_activations a on a.installation_id=i.id left join light_licenses l on l.id=a.license_id
  left join light_trials t on t.installation_id=i.id
  where p_search='' or position(lower(left(p_search,80)) in lower(concat_ws(' ',i.name,i.id::text,u.device::text,u.camera::text,u.printer::text)))>0
 ), recent as (select * from filtered order by last_seen_at desc,installation_id limit 50 offset greatest(0,least(coalesce(p_offset,0),1000000))),
 days as (select today-g as day from clock,generate_series(0,29) g),
 daily as (select d.day,coalesce(sum(u.views),0) views,count(u.installation_id) active from days d left join light_usage_daily u on u.day=d.day group by d.day)
 select jsonb_build_object('available',true,'generatedAt',now(),'timeZone','Asia/Manila',
 'summary',jsonb_build_object(
  'pageViews',(select coalesce(sum(total_views),0) from light_usage_devices),
  'uniqueInstallations',(select count(*) from light_usage_devices),
  'activeNow',(select count(*) from light_usage_devices u join light_installations i on i.id=u.installation_id where not i.blocked and u.last_seen_at>now()-interval '5 minutes'),
  'activeToday',(select count(*) from light_usage_daily,clock where day=today),
  'viewsToday',(select coalesce(sum(views),0) from light_usage_daily,clock where day=today),
  'views30Days',(select coalesce(sum(views),0) from light_usage_daily,clock where day>=today-29),
  'active30Days',(select count(distinct installation_id) from light_usage_daily,clock where day>=today-29)),
 'daily',(select coalesce(jsonb_agg(to_jsonb(daily) order by day),'[]') from daily),
 'platforms',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from (select coalesce(nullif(device->>'os',''),'Unknown') name,count(*) count from light_usage_devices group by 1 order by 2 desc) p),
 'devices',(select coalesce(jsonb_agg(to_jsonb(recent) order by last_seen_at desc),'[]') from recent),
 'totalDevices',(select count(*) from filtered),'offset',greatest(0,coalesce(p_offset,0)));
$$;
revoke all on function public.light_report_usage(uuid,uuid,jsonb),public.light_usage_admin(integer,text) from public,anon,authenticated;
grant execute on function public.light_report_usage(uuid,uuid,jsonb),public.light_usage_admin(integer,text) to service_role;
commit;
