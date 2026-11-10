-- ============================================================================
-- Correzione di 20290213190000 (voci_abbina_listino), stesso giorno.
-- product_aliases.alias_normalized è una colonna calcolata (lower(trim(alias_text))):
-- la prima versione la scriveva e il database la rifiutava. Trovato nella prova
-- in transazione annullata, prima che qualcuno la usasse. Ora si scrive la
-- chiave in alias_text.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.voci_abbina_listino(p_order uuid, p_abbinamenti jsonb, p_ricorda boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_azienda uuid;
  r jsonb;
  v_voce uuid;
  v_tariffa uuid;
  v_chiave text;
  v_descrizione text;
  n_collegate int := 0;
  n_scollegate int := 0;
  n_ricordate int := 0;
begin
  if p_abbinamenti is null or jsonb_typeof(p_abbinamenti) <> 'array' then
    raise exception using errcode = '22023', message = 'Gli abbinamenti non sono un elenco.';
  end if;
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null then
    raise exception using errcode = '42501', message = 'Commessa non trovata.';
  end if;
  if not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
          and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)) then
    raise exception using errcode = '42501',
      message = 'Per collegare le voci al listino servono i permessi sulle commesse e sui costi.';
  end if;

  for r in select value from jsonb_array_elements(p_abbinamenti) loop
    v_voce := nullif(r->>'voce_id', '')::uuid;
    v_tariffa := nullif(r->>'tariffa_id', '')::uuid;
    v_chiave := nullif(trim(left(lower(trim(r->>'chiave')), 300)), '');

    select v.descrizione into v_descrizione
      from public.order_work_phase_voci v
     where v.id = v_voce and v.order_id = p_order
     for update;
    if not found then
      raise exception using errcode = '22023', message = 'Una voce non è di questa commessa.';
    end if;

    if v_tariffa is not null and not exists (
      select 1 from public.tariffe_aziendali t
       where t.id = v_tariffa and t.company_id = v_azienda
         and t.external_team_id is null and t.subappaltatore_id is null) then
      raise exception using errcode = '22023',
        message = 'Si collega solo a una voce del listino dell''azienda, non a una voce propria di una ditta.';
    end if;

    update public.order_work_phase_voci set tariffa_id = v_tariffa
     where id = v_voce and tariffa_id is distinct from v_tariffa;
    if v_tariffa is null then n_scollegate := n_scollegate + 1; else n_collegate := n_collegate + 1; end if;

    if p_ricorda and v_tariffa is not null and v_chiave is not null then
      delete from public.product_aliases a
       where a.company_id = v_azienda and a.alias_normalized = v_chiave
         and a.learned_from = 'voce_computo' and a.tariffa_id is distinct from v_tariffa;
      -- alias_normalized è calcolata dal database (lower(trim(alias_text))): il testo È la chiave.
      insert into public.product_aliases (company_id, alias_text, tariffa_id, confidence, learned_from, use_count, last_used_at, created_by)
      values (v_azienda, v_chiave, v_tariffa, 1, 'voce_computo', 1, now(), auth.uid())
      on conflict (company_id, alias_normalized, tariffa_id) where tariffa_id is not null
      do update set use_count = public.product_aliases.use_count + 1, last_used_at = now();
      n_ricordate := n_ricordate + 1;
    end if;
  end loop;

  return jsonb_build_object('collegate', n_collegate, 'scollegate', n_scollegate, 'ricordate', n_ricordate);
end;
$$;
revoke all on function public.voci_abbina_listino(uuid, jsonb, boolean) from public, anon;
grant execute on function public.voci_abbina_listino(uuid, jsonb, boolean) to authenticated, service_role;
