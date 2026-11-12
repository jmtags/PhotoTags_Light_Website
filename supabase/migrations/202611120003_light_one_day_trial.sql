-- Light-only one-time 24-hour trials; no APK data or payment behavior changes.
begin;
create table if not exists public.light_trials (
 installation_id uuid primary key references public.light_installations(id),
 started_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 check(expires_at=started_at+interval '24 hours')
);
alter table public.light_trials enable row level security;
revoke all on public.light_trials from anon,authenticated;
grant select,insert on public.light_trials to service_role;
create or replace function public.light_start_trial(p_installation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t light_trials%rowtype;
begin
 perform 1 from light_installations where id=p_installation_id and not blocked for update;
 if not found then raise exception 'light_installation_blocked'; end if;
 if exists(select 1 from light_activations a join light_licenses l on l.id=a.license_id where a.installation_id=p_installation_id
  and l.status='active' and (l.expires_at is null or l.expires_at>now())) then raise exception 'light_already_licensed'; end if;
 insert into light_trials(installation_id) values(p_installation_id) on conflict(installation_id) do nothing;
 select * into t from light_trials where installation_id=p_installation_id;
 return jsonb_build_object('status',case when t.expires_at>now() then 'trial_active' else 'trial_expired' end,'expiresAt',t.expires_at);
end $$;
revoke all on function public.light_start_trial(uuid) from public,anon,authenticated;
grant execute on function public.light_start_trial(uuid) to service_role;
commit;
