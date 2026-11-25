-- 0014 — Durable PIP agent task queue, audit trail and proposal policy.
-- Agent actions are limited to task orchestration. Class-C financial operations
-- remain outside the Agent API and require the authenticated ERP web surface.

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid references public.fiscal_years(id) on delete restrict,
  source_key text,
  type text not null check (type in ('reconcile','report','extract','review','notify')),
  title text not null check (length(btrim(title)) > 0),
  payload jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  status text not null default 'open'
    check (status in ('open','in_progress','waiting_for_human','done','failed')),
  due_at timestamptz,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  next_attempt_at timestamptz,
  last_error text,
  result jsonb,
  summary text,
  artifacts jsonb not null default '[]'::jsonb,
  human_request jsonb,
  created_by text not null default 'system:rule',
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,source_key),
  check (
    (status='in_progress' and claimed_by is not null and lease_expires_at is not null)
    or (status<>'in_progress' and claimed_by is null and lease_expires_at is null)
  )
);
create index if not exists idx_agent_tasks_open_queue
  on public.agent_tasks(created_at asc,priority desc) where status='open';
create index if not exists idx_agent_tasks_due
  on public.agent_tasks(due_at) where status in ('open','in_progress');
create index if not exists idx_agent_tasks_lease
  on public.agent_tasks(lease_expires_at) where status='in_progress';
create trigger agent_tasks_touch_updated_at before update on public.agent_tasks
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.agent_task_idempotency (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete restrict,
  operation text not null check (operation in ('complete','fail','needs-human')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  unique(task_id,operation,idempotency_key)
);
create index if not exists idx_agent_task_idempotency_expiry
  on public.agent_task_idempotency(expires_at);

create table if not exists public.agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete restrict,
  fiscal_year_id uuid references public.fiscal_years(id) on delete restrict,
  actor_type text not null check (actor_type in ('agent','human','system','anonymous')),
  actor_id text,
  actor_key_id text,
  request_id text not null,
  action text not null,
  http_method text,
  route text,
  status_code integer,
  target_type text,
  target_id text,
  idempotency_key text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_audit_company_time
  on public.agent_audit_log(company_id,created_at desc);
create index if not exists idx_agent_audit_request
  on public.agent_audit_log(request_id);
create index if not exists idx_agent_audit_actor
  on public.agent_audit_log(actor_key_id,created_at desc);

create or replace function public.fz_agent_audit_append_only()
returns trigger language plpgsql set search_path = public,pg_temp as $$
begin
  raise exception 'AGENT_AUDIT_APPEND_ONLY'
    using message='agent audit records cannot be changed or deleted';
end;
$$;
drop trigger if exists agent_audit_append_only on public.agent_audit_log;
create trigger agent_audit_append_only before update or delete on public.agent_audit_log
  for each row execute function public.fz_agent_audit_append_only();

create table if not exists public.agent_policy (
  company_id uuid primary key references public.companies(id) on delete restrict,
  max_proposals_per_day integer not null default 200
    check (max_proposals_per_day between 1 and 5000),
  max_proposal_amount_rial numeric(20,0)
    check (max_proposal_amount_rial is null or max_proposal_amount_rial > 0),
  allowed_accounts uuid[] not null default '{}'::uuid[],
  blocked_counterparties uuid[] not null default '{}'::uuid[],
  auto_accept_extraction boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger agent_policy_touch_updated_at before update on public.agent_policy
  for each row execute function public.fz_touch_updated_at();

alter table public.agent_tasks enable row level security;
alter table public.agent_task_idempotency enable row level security;
alter table public.agent_audit_log enable row level security;
alter table public.agent_policy enable row level security;

grant select,insert,update on public.agent_tasks to authenticated,service_role;
grant select,insert on public.agent_audit_log to authenticated,service_role;
grant select,insert,update on public.agent_policy to authenticated,service_role;
grant select,insert,update,delete on public.agent_task_idempotency to service_role;

drop policy if exists agent_tasks_select on public.agent_tasks;
create policy agent_tasks_select on public.agent_tasks
  for select to authenticated using (public.fz_is_company_member(company_id));
drop policy if exists agent_tasks_insert on public.agent_tasks;
create policy agent_tasks_insert on public.agent_tasks
  for insert to authenticated with check (
    public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner','accountant']::text[])
  );
drop policy if exists agent_tasks_update on public.agent_tasks;
create policy agent_tasks_update on public.agent_tasks
  for update to authenticated
  using (public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner','accountant']::text[]))
  with check (public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner','accountant']::text[]));

drop policy if exists agent_audit_log_select on public.agent_audit_log;
create policy agent_audit_log_select on public.agent_audit_log
  for select to authenticated using (
    company_id is not null
    and public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner','accountant']::text[])
  );

drop policy if exists agent_policy_select on public.agent_policy;
create policy agent_policy_select on public.agent_policy
  for select to authenticated using (
    public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner']::text[])
  );
drop policy if exists agent_policy_insert on public.agent_policy;
create policy agent_policy_insert on public.agent_policy
  for insert to authenticated with check (
    public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner']::text[])
  );
drop policy if exists agent_policy_update on public.agent_policy;
create policy agent_policy_update on public.agent_policy
  for update to authenticated
  using (public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner']::text[]))
  with check (public.fz_is_company_member(company_id)
    and public.fz_has_role(company_id,array['owner']::text[]));

create or replace function public.fz_agent_claim_task(
  p_task_id uuid,p_agent text,p_lease_seconds integer default 1800
) returns jsonb language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_row jsonb;
begin
  if p_agent is null or length(btrim(p_agent))=0 then raise exception 'AGENT_ID_REQUIRED'; end if;
  update public.agent_tasks t
  set status='in_progress',claimed_by=p_agent,claimed_at=now(),
      lease_expires_at=now()+make_interval(secs=>least(3600,greatest(60,coalesce(p_lease_seconds,1800)))),
      attempt_count=attempt_count+1,next_attempt_at=null
  where t.id=p_task_id and t.status='open'
    and (t.next_attempt_at is null or t.next_attempt_at<=now())
  returning to_jsonb(t) into v_row;
  return v_row;
end;
$$;

create or replace function public.fz_agent_heartbeat_task(
  p_task_id uuid,p_agent text,p_lease_seconds integer default 1800
) returns jsonb language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_row jsonb;
begin
  update public.agent_tasks t
  set lease_expires_at=now()+make_interval(secs=>least(3600,greatest(60,coalesce(p_lease_seconds,1800))))
  where t.id=p_task_id and t.status='in_progress'
    and t.claimed_by=p_agent and t.lease_expires_at>now()
  returning jsonb_build_object('id',t.id,'lease_expires_at',t.lease_expires_at) into v_row;
  return v_row;
end;
$$;

create or replace function public.fz_agent_release_task(p_task_id uuid,p_agent text)
returns jsonb language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_row jsonb;
begin
  update public.agent_tasks t
  set status='open',claimed_by=null,claimed_at=null,lease_expires_at=null,next_attempt_at=null
  where t.id=p_task_id and t.status='in_progress'
    and t.claimed_by=p_agent and t.lease_expires_at>now()
  returning jsonb_build_object('id',t.id,'status',t.status,'attempt_count',t.attempt_count) into v_row;
  return v_row;
end;
$$;

create or replace function public.fz_agent_complete_task(
  p_task_id uuid,p_agent text,p_idempotency_key text,
  p_result jsonb,p_summary text default null,p_artifacts jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_task public.agent_tasks%rowtype; v_response jsonb;
begin
  select * into v_task from public.agent_tasks where id=p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  select response into v_response from public.agent_task_idempotency
  where task_id=p_task_id and operation='complete'
    and idempotency_key=p_idempotency_key and expires_at>now();
  if found then return v_response; end if;
  if v_task.status<>'in_progress' or v_task.claimed_by is distinct from p_agent
     or v_task.lease_expires_at is null or v_task.lease_expires_at<=now() then
    raise exception 'TASK_NOT_OWNED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key))<8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'TASK_RESULT_INVALID'; end if;
  v_response:=jsonb_build_object('id',v_task.id,'status','done','completed_at',now(),'result',p_result);
  update public.agent_tasks set status='done',result=p_result,summary=p_summary,
    artifacts=coalesce(p_artifacts,'[]'::jsonb),completed_at=now(),
    claimed_by=null,claimed_at=null,lease_expires_at=null where id=p_task_id;
  insert into public.agent_task_idempotency(task_id,operation,idempotency_key,response)
  values(p_task_id,'complete',p_idempotency_key,v_response)
  on conflict(task_id,operation,idempotency_key) do nothing;
  return v_response;
end;
$$;

create or replace function public.fz_agent_fail_task(
  p_task_id uuid,p_agent text,p_idempotency_key text,p_reason text,
  p_retryable boolean default true,p_error_code text default null
) returns jsonb language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_task public.agent_tasks%rowtype; v_response jsonb; v_next timestamptz;
begin
  select * into v_task from public.agent_tasks where id=p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  select response into v_response from public.agent_task_idempotency
  where task_id=p_task_id and operation='fail'
    and idempotency_key=p_idempotency_key and expires_at>now();
  if found then return v_response; end if;
  if v_task.status<>'in_progress' or v_task.claimed_by is distinct from p_agent
     or v_task.lease_expires_at is null or v_task.lease_expires_at<=now() then
    raise exception 'TASK_NOT_OWNED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key))<8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if coalesce(p_retryable,true) and v_task.attempt_count<v_task.max_attempts then
    v_next:=now()+make_interval(mins=>least(60,power(2,v_task.attempt_count)::integer));
    update public.agent_tasks set status='open',claimed_by=null,claimed_at=null,
      lease_expires_at=null,next_attempt_at=v_next,last_error=left(coalesce(p_reason,'خطای نامشخص'),2000)
    where id=p_task_id;
    v_response:=jsonb_build_object('id',v_task.id,'status','open',
      'attempt_count',v_task.attempt_count,'next_attempt_at',v_next,'next_action','retry');
  else
    update public.agent_tasks set status='failed',claimed_by=null,claimed_at=null,
      lease_expires_at=null,failed_at=now(),next_attempt_at=null,
      last_error=left(coalesce(p_reason,'خطای نامشخص'),2000)
    where id=p_task_id;
    v_response:=jsonb_build_object('id',v_task.id,'status','failed',
      'failed_at',now(),'attempt_count',v_task.attempt_count,'next_action','escalate');
  end if;
  insert into public.agent_task_idempotency(task_id,operation,idempotency_key,response)
  values(p_task_id,'fail',p_idempotency_key,v_response)
  on conflict(task_id,operation,idempotency_key) do nothing;
  return v_response;
end;
$$;

create or replace function public.fz_agent_needs_human_task(
  p_task_id uuid,p_agent text,p_question text,p_channel text,
  p_context jsonb default '{}'::jsonb,p_idempotency_key text default null
) returns jsonb language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_task public.agent_tasks%rowtype; v_response jsonb;
begin
  select * into v_task from public.agent_tasks where id=p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if p_idempotency_key is not null then
    select response into v_response from public.agent_task_idempotency
    where task_id=p_task_id and operation='needs-human'
      and idempotency_key=p_idempotency_key and expires_at>now();
    if found then return v_response; end if;
  end if;
  if v_task.status<>'in_progress' or v_task.claimed_by is distinct from p_agent
     or v_task.lease_expires_at is null or v_task.lease_expires_at<=now() then
    raise exception 'TASK_NOT_OWNED';
  end if;
  if p_question is null or length(btrim(p_question))=0 then raise exception 'HUMAN_QUESTION_REQUIRED'; end if;
  if p_channel not in ('telegram','web') then raise exception 'INVALID_HUMAN_CHANNEL'; end if;
  update public.agent_tasks set status='waiting_for_human',claimed_by=null,
    claimed_at=null,lease_expires_at=null,
    human_request=jsonb_build_object('question',p_question,'channel',p_channel,'context',coalesce(p_context,'{}'::jsonb))
  where id=p_task_id;
  v_response:=jsonb_build_object('id',p_task_id,'status','waiting_for_human','lease_expires_at',null);
  if p_idempotency_key is not null then
    insert into public.agent_task_idempotency(task_id,operation,idempotency_key,response)
    values(p_task_id,'needs-human',p_idempotency_key,v_response)
    on conflict(task_id,operation,idempotency_key) do nothing;
  end if;
  return v_response;
end;
$$;

create or replace function public.fz_agent_reap_stale_tasks()
returns integer language plpgsql security definer
set search_path = public,pg_temp as $$
declare v_count integer;
begin
  update public.agent_tasks set status='open',claimed_by=null,claimed_at=null,lease_expires_at=null
  where status='in_progress' and lease_expires_at<now();
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

insert into public.agent_policy(company_id)
select id from public.companies where code='ATI-FARZAM'
on conflict(company_id) do nothing;

insert into public.agent_tasks(company_id,fiscal_year_id,source_key,type,title,payload,priority,created_by)
select c.id,fy.id,'foundation:reconcile-1405','reconcile',
  'بازبینی افتتاحیه و گردش بانکی سال ۱۴۰۵',
  jsonb_build_object('fiscal_year','1405','scope','opening_balances','requires_human_review',true),
  10,'system:foundation'
from public.companies c join public.fiscal_years fy
  on fy.company_id=c.id and fy.label='1405'
where c.code='ATI-FARZAM'
on conflict(company_id,source_key) do nothing;

insert into public.agent_tasks(company_id,fiscal_year_id,source_key,type,title,payload,priority,created_by)
select c.id,fy.id,'foundation:report-1405','report',
  'تهیه گزارش وضعیت مالی و موارد باز سال ۱۴۰۵',
  jsonb_build_object('fiscal_year','1405','include','cash,receivables,payables,exceptions','draft_only',true),
  5,'system:foundation'
from public.companies c join public.fiscal_years fy
  on fy.company_id=c.id and fy.label='1405'
where c.code='ATI-FARZAM'
on conflict(company_id,source_key) do nothing;

-- Keep SECURITY DEFINER RPCs server-side. Membership predicates are the
-- only public helpers intentionally callable from authenticated RLS policies.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname not in ('fz_is_company_member','fz_has_role')
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',r.signature);
    execute format('grant execute on function %s to service_role',r.signature);
  end loop;
end;
$$;

revoke execute on function public.fz_is_company_member(uuid) from public,anon;
revoke execute on function public.fz_has_role(uuid,text[]) from public,anon;
grant execute on function public.fz_is_company_member(uuid) to authenticated,service_role;
grant execute on function public.fz_has_role(uuid,text[]) to authenticated,service_role;
