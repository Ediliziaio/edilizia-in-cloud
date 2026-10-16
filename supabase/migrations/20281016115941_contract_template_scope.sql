-- Contract organization templates are not executable work-site phases.
alter table public.work_phase_templates add column template_scope text not null default 'cantiere' check(template_scope in ('cantiere','contratto'));

create or replace function public.create_contract_intervention(p_company_id uuid,p_contract_id uuid,p_id uuid,p_dati jsonb,p_template_id uuid default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_parent public.orders%rowtype; v_fasi jsonb; v_status uuid; v_existing public.orders%rowtype;
begin
  if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company_id) then
    raise exception 'Non hai il permesso di creare interventi.' using errcode='42501'; end if;
  select * into v_parent from public.orders where id=p_contract_id and company_id=p_company_id and workflow_kind='contratto' for update;
  if not found then raise exception 'Contratto non disponibile.' using errcode='42501'; end if;
  select * into v_existing from public.orders where id=p_id;
  if found then
    if v_existing.company_id=p_company_id and v_existing.parent_contract_id=p_contract_id and v_existing.workflow_kind='intervento' then return p_id; end if;
    raise exception 'Identificativo già utilizzato.' using errcode='23505';
  end if;
  if length(btrim(coalesce(p_dati->>'description',''))) not between 3 and 500
    or length(btrim(coalesce(p_dati->>'reference',''))) not between 1 and 160
    or length(btrim(coalesce(p_dati->>'place',''))) not between 3 and 1000 then
    raise exception 'Indica riferimento ordine, descrizione e luogo dell’intervento.' using errcode='22023'; end if;
  if nullif(p_dati->>'end','')::date < nullif(p_dati->>'start','')::date then
    raise exception 'La fine precede l’inizio.' using errcode='22023'; end if;
  if p_template_id is not null then
    if not exists(select 1 from public.work_phase_templates where id=p_template_id and company_id=p_company_id and template_scope='cantiere') then
      raise exception 'Standard non disponibile per questa azienda.' using errcode='42501'; end if;
    select jsonb_agg(jsonb_build_object('nome',f.name,'sottofasi',coalesce((
      select jsonb_agg(jsonb_build_object('nome',s.name,'peso',s.peso) order by s.position)
      from public.work_phase_template_subphases s where s.template_phase_id=f.id and s.company_id=p_company_id
    ),'[]'::jsonb)) order by f.position) into v_fasi
    from public.work_phase_template_phases f where f.template_id=p_template_id and f.company_id=p_company_id;
    if v_fasi is null then raise exception 'Lo standard non contiene fasi.' using errcode='22023'; end if;
  end if;
  select id into v_status from public.order_statuses where company_id=p_company_id and lower(name)='da verificare' limit 1;
  insert into public.orders(id,company_id,description,order_code,workflow_kind,parent_contract_id,intervention_reference,
    customer_id,created_by,total_amount,vat_rate,payment_type,status,current_status_id,work_address,indirizzo_lavori,
    work_start_date,work_end_date,internal_notes)
  values(p_id,p_company_id,btrim(p_dati->>'description'),'INT-'||left(p_id::text,8),'intervento',p_contract_id,btrim(p_dati->>'reference'),
    v_parent.customer_id,auth.uid(),0,null,null,'bozza',v_status,btrim(p_dati->>'place'),btrim(p_dati->>'place'),
    nullif(p_dati->>'start','')::date,nullif(p_dati->>'end','')::date,
    'Intervento operativo del contratto '||coalesce(v_parent.order_code,v_parent.id::text)||'. Importi, IVA e pagamenti si gestiscono sul contratto: nessun ricavo duplicato. Quantità e risorse da confermare.');
  if v_fasi is not null then perform public.aggiungi_fasi_commessa(p_id,v_fasi); end if;
  return p_id;
end; $$;
