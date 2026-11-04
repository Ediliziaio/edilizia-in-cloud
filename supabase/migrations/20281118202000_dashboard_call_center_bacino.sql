set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $mig$
declare
  v_def text := pg_get_functiondef('public.get_callcenter_coda(uuid, uuid, integer)'::regprocedure);
  v_nuova text;
begin
  if v_def like '%v_presi%' then
    return;
  end if;
  v_nuova := replace(v_def,
    'v_ris jsonb;',
    E'v_presi uuid[] := array(\n    select t.contact_id from (\n      select distinct on (cl.contact_id) cl.contact_id, cl.user_id\n        from public.call_logs cl\n       where cl.company_id = p_company_id and cl.contact_id is not null\n       order by cl.contact_id, cl.started_at desc\n    ) t where t.user_id = any (v_ops)\n  );\n  v_ris jsonb;');
  v_nuova := replace(v_nuova,
    'and coalesce(mc.call_center_id, mc.assigned_to) = any (v_ops)',
    E'and (coalesce(mc.call_center_id, mc.assigned_to) = any (v_ops)\n            or (mc.call_center_id is null and mc.assigned_to is null and mc.id = any (v_presi)))');
  if v_nuova = v_def or v_nuova not like '%mc.id = any (v_presi)%' then
    raise exception 'get_callcenter_coda: testo atteso non trovato';
  end if;
  execute v_nuova;
end $mig$;
