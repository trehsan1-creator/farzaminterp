-- 0015 — Private source storage, safer membership helpers and task idempotency.
-- The import-source bucket is private. Storage access is server-side only.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'import-source','import-source',false,10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv','text/plain',
    'image/jpeg','image/png','image/webp'
  ]::text[]
)
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

-- Registered source identity is immutable. The only allowed promotion is
-- external reference -> verified private Storage object with identical bytes.
create or replace function public.fz_assert_source_file_immutable()
returns trigger language plpgsql set search_path = public,pg_temp as $$
declare v_promoting boolean;
begin
  v_promoting :=
    old.source_location='external_reference'
    and new.source_location='supabase_storage'
    and old.raw_preserved=false
    and new.raw_preserved=true;
  if new.company_id is distinct from old.company_id
     or new.content_sha256 is distinct from old.content_sha256
     or new.original_filename is distinct from old.original_filename
     or new.byte_size is distinct from old.byte_size
     or new.external_reference is distinct from old.external_reference then
    raise exception 'SOURCE_FILE_IMMUTABLE'
      using message='registered source identity, hash and reference cannot be modified';
  end if;
  if (new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.source_location is distinct from old.source_location)
     and not v_promoting then
    raise exception 'SOURCE_FILE_IMMUTABLE'
      using message='storage location is immutable except for verified external-reference promotion';
  end if;
  if new.raw_preserved and not old.raw_preserved then
    new.preserved_at:=coalesce(new.preserved_at,now());
  end if;
  if new.raw_preserved is distinct from old.raw_preserved and not new.raw_preserved then
    raise exception 'SOURCE_FILE_PRESERVATION_REVERSIBLE'
      using message='raw preservation cannot be revoked';
  end if;
  return new;
end;
$$;

-- Move SECURITY DEFINER membership predicates out of the exposed public RPC
-- namespace. Public invoker wrappers preserve existing RLS policy contracts.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated,service_role;

create or replace function private.fz_is_company_member(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = public,pg_temp as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id=p_company_id and m.user_id=auth.uid()
  );
$$;
create or replace function private.fz_has_role(p_company_id uuid,p_roles text[])
returns boolean language sql stable security definer
set search_path = public,pg_temp as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id=p_company_id
      and m.user_id=auth.uid()
      and m.role::text=any(p_roles)
  );
$$;
revoke execute on function private.fz_is_company_member(uuid) from public,anon;
revoke execute on function private.fz_has_role(uuid,text[]) from public,anon;
grant execute on function private.fz_is_company_member(uuid) to authenticated,service_role;
grant execute on function private.fz_has_role(uuid,text[]) to authenticated,service_role;

create or replace function public.fz_is_company_member(p_company_id uuid)
returns boolean language sql stable security invoker
set search_path = public,pg_temp as $$
  select private.fz_is_company_member(p_company_id);
$$;
create or replace function public.fz_has_role(p_company_id uuid,p_roles text[])
returns boolean language sql stable security invoker
set search_path = public,pg_temp as $$
  select private.fz_has_role(p_company_id,p_roles);
$$;
revoke execute on function public.fz_is_company_member(uuid) from public,anon;
revoke execute on function public.fz_has_role(uuid,text[]) from public,anon;
grant execute on function public.fz_is_company_member(uuid) to authenticated,service_role;
grant execute on function public.fz_has_role(uuid,text[]) to authenticated,service_role;

drop policy if exists agent_task_idempotency_no_client_access on public.agent_task_idempotency;
create policy agent_task_idempotency_no_client_access
  on public.agent_task_idempotency for all to anon,authenticated
  using (false) with check (false);

create index if not exists idx_agent_tasks_company on public.agent_tasks(company_id);
create index if not exists idx_agent_tasks_fiscal_year on public.agent_tasks(fiscal_year_id);
create index if not exists idx_agent_task_idempotency_task on public.agent_task_idempotency(task_id);
create index if not exists idx_agent_audit_fiscal_year on public.agent_audit_log(fiscal_year_id);
create index if not exists idx_agent_policy_updated_by on public.agent_policy(updated_by)
  where updated_by is not null;
create index if not exists idx_bank_opening_bank_account
  on public.bank_account_opening_balances(bank_account_id);
create index if not exists idx_inventory_movements_warehouse
  on public.inventory_movements(warehouse_id);
create index if not exists idx_inventory_movements_product_fk
  on public.inventory_movements(product_id);
create index if not exists idx_payroll_items_run on public.payroll_items(payroll_run_id);
create index if not exists idx_payroll_items_employee_fk on public.payroll_items(employee_id);
create index if not exists idx_sales_invoice_lines_product_fk
  on public.sales_invoice_lines(product_id) where product_id is not null;
create index if not exists idx_purchase_invoice_lines_product_fk
  on public.purchase_invoice_lines(product_id) where product_id is not null;

-- Keep company membership policies efficient and preserve self-service reads.
drop policy if exists company_members_select on public.company_members;
drop policy if exists company_members_insert on public.company_members;
drop policy if exists company_members_update on public.company_members;
create policy company_members_select on public.company_members
  for select using (
    user_id=(select auth.uid())
    or (select public.fz_has_role(company_id,array['owner']::text[]))
  );
create policy company_members_insert on public.company_members
  for insert with check (
    user_id=(select auth.uid())
    or (select public.fz_has_role(company_id,array['owner']::text[]))
  );
create policy company_members_update on public.company_members
  for update
  using ((select public.fz_has_role(company_id,array['owner']::text[])))
  with check ((select public.fz_has_role(company_id,array['owner']::text[])));

-- Lock the task row before reading idempotency receipts. Concurrent retries
-- now observe the first committed result rather than racing the first write.
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

grant execute on function public.fz_agent_complete_task(uuid,text,text,jsonb,text,jsonb) to service_role;
grant execute on function public.fz_agent_fail_task(uuid,text,text,text,boolean,text) to service_role;
grant execute on function public.fz_agent_needs_human_task(uuid,text,text,text,jsonb,text) to service_role;
