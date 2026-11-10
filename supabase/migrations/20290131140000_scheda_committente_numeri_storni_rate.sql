-- I numeri della scheda committente, corretti dopo la revisione (10/11/2026).
--
-- Note di credito: il residuo di una fattura è totale − pagato −
-- documento_stornato_totale(id), come nei trigger; si tolgono a parte solo le
-- note non collegate a una fattura. Fuori anche le fatture stornate e rifiutate.
-- Scaduto per rata: dove la fattura ha le righe di Scadenzario, conta solo la
-- parte delle rate passate. Da fatturare: un rendiconto agganciato a una fattura
-- ancora in bozza resta da fatturare. Fatture: «non so» senza il permesso sulla
-- fatturazione. Rendiconti: solo quelli delle commesse visibili, più i cumulativi,
-- come appalto_conti_committente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.scheda_committente_numeri(p_committente_id uuid, p_company_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_commesse uuid[];
  v_rendicontato numeric; v_da_rendicontare numeric;
  v_da_fatturare numeric; v_ritenute numeric;
  v_fermi integer; v_fermo_numero integer; v_fermo_giorni integer;
  v_da_incassare numeric; v_scaduto numeric; v_scaduto_giorni integer;
  v_fatture_leggibili boolean;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', p_company_id) then
    raise exception 'Non puoi vedere i numeri di questo committente' using errcode = '42501';
  end if;

  select coalesce(array_agg(o.id), '{}') into v_commesse
    from public.orders o
   where o.customer_id = p_committente_id and o.company_id = p_company_id and o.deleted_at is null;

  select coalesce(sum(r.importo) filter (where r.stato <> 'bozza'), 0),
         coalesce(sum(r.importo) filter (where r.stato = 'confermata'), 0)
    into v_rendicontato, v_da_rendicontare
    from public.appalto_rendiconto_righe r
   where r.order_id = any (v_commesse);

  -- Una fattura agganciata ma ancora in bozza non ha fatturato niente: conta lo stato, che diventa
  -- «fatturato» all'emissione. Solo i rendiconti delle commesse che chi guarda vede, più i cumulativi.
  select coalesce(sum(s.netto) filter (where s.stato <> 'fatturato'), 0),
         coalesce(sum(s.ritenuta), 0),
         count(*) filter (where s.stato = 'inviato')::integer
    into v_da_fatturare, v_ritenute, v_fermi
    from public.appalto_sal s
   where s.company_id = p_company_id and s.committente_id = p_committente_id and s.stato <> 'bozza'
     and (s.order_id is null or s.order_id = any (v_commesse));

  select s.numero, v_oggi - (s.inviato_at at time zone 'Europe/Rome')::date
    into v_fermo_numero, v_fermo_giorni
    from public.appalto_sal s
   where s.company_id = p_company_id and s.committente_id = p_committente_id
     and s.stato = 'inviato' and s.inviato_at is not null
     and (s.order_id is null or s.order_id = any (v_commesse))
   order by s.inviato_at asc limit 1;

  -- Senza il permesso sulla fatturazione si leggono solo le fatture delle commesse visibili: un totale
  -- parziale presentato come intero. Meglio «non so».
  v_fatture_leggibili := public.utente_super_admin() or p_company_id = any (public.aziende_con_uno_dei_permessi(array['can_view_billing']));

  if v_fatture_leggibili then
    with fatture as (
      -- Il residuo come lo calcolano i trigger: totale − pagato − note di credito collegate.
      select d.id, d.data_scadenza,
             greatest(coalesce(d.totale_da_pagare, d.totale_documento, 0) - coalesce(d.importo_pagato, 0) - public.documento_stornato_totale(d.id), 0) as residuo
        from public.documenti_fiscali d
       where d.company_id = p_company_id and d.deleted_at is null
         and d.tipo in ('fattura', 'fattura_pa')
         and d.stato not in ('bozza', 'annullata', 'rifiutata', 'stornata', 'pagata')
         and (d.anagrafica_id in (select a.id from public.anagrafiche_native a where a.cliente_id = p_committente_id)
              or d.id in (select s.documento_fiscale_id from public.appalto_sal s where s.committente_id = p_committente_id and s.documento_fiscale_id is not null))
    ), note_libere as (
      -- Solo le note di credito non collegate a una fattura: quelle collegate sono già nel residuo.
      select greatest(abs(coalesce(d.totale_da_pagare, d.totale_documento, 0)) - abs(coalesce(d.importo_pagato, 0)), 0) as credito
        from public.documenti_fiscali d
       where d.company_id = p_company_id and d.deleted_at is null and d.tipo = 'nota_credito'
         and d.documento_correlato_id is null
         and d.stato not in ('bozza', 'annullata', 'rifiutata')
         and upper(coalesce(d.sdi_stato, '')) <> 'NS'
         and d.anagrafica_id in (select a.id from public.anagrafiche_native a where a.cliente_id = p_committente_id)
    ), rate as (
      -- Una fattura a rate è scaduta solo per le rate passate (Scadenzario, una riga per rata).
      select f.id, sum(greatest(sc.amount - coalesce(sc.paid_amount, 0), 0)) filter (where sc.due_date < v_oggi) as scaduto,
             min(sc.due_date) filter (where sc.due_date < v_oggi and sc.amount - coalesce(sc.paid_amount, 0) > 0.005) as dal,
             count(sc.*) as righe
        from fatture f
        left join public.scadenze sc on sc.company_id = p_company_id and sc.notes like '%[DOC:' || f.id::text || ']%' and sc.status <> 'annullata'
       group by f.id
    ), per_fattura as (
      select f.residuo,
             case when r.righe > 0 then least(coalesce(r.scaduto, 0), f.residuo)
                  when f.data_scadenza < v_oggi then f.residuo else 0 end as scaduto,
             case when r.righe > 0 then r.dal when f.data_scadenza < v_oggi and f.residuo > 0 then f.data_scadenza end as dal
        from fatture f join rate r on r.id = f.id
    )
    select coalesce((select sum(residuo) from per_fattura), 0) - coalesce((select sum(credito) from note_libere), 0),
           coalesce((select sum(scaduto) from per_fattura), 0),
           v_oggi - (select min(dal) from per_fattura where scaduto > 0)
      into v_da_incassare, v_scaduto, v_scaduto_giorni;
  end if;

  return jsonb_build_object(
    'rendicontato', v_rendicontato,
    'da_rendicontare', v_da_rendicontare,
    'da_fatturare', v_da_fatturare,
    'ritenute', v_ritenute,
    'da_incassare', case when v_fatture_leggibili then v_da_incassare end,
    'scaduto', case when v_fatture_leggibili then v_scaduto end,
    'scaduto_giorni', v_scaduto_giorni,
    'rendiconti_in_attesa', v_fermi,
    'rendiconto_fermo_numero', v_fermo_numero,
    'rendiconto_fermo_giorni', v_fermo_giorni
  );
end
$$;

revoke all on function public.scheda_committente_numeri(uuid, uuid) from public, anon;
grant execute on function public.scheda_committente_numeri(uuid, uuid) to authenticated, service_role;
