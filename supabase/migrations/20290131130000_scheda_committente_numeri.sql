-- I numeri in testata alla scheda del committente (09/11/2026).
--
-- scheda_committente_numeri legge con i permessi di chi guarda (SECURITY INVOKER)
-- e dice, per un committente:
--   rendicontato     righe di rendiconto non in bozza;
--   da_rendicontare  righe confermate non ancora chiuse in un rendiconto;
--   da_fatturare     netto dei rendiconti chiusi senza una fattura;
--   da_incassare     fatture emesse non saldate, meno le note di credito: tutte
--                    quelle del committente, non solo quelle nate da un rendiconto;
--   scaduto          la parte di da_incassare con data_scadenza passata;
--   ritenute         trattenute a garanzia sui rendiconti non in bozza.
-- da_incassare è null («non so») per chi non può leggere le fatture.
--
-- appalto_conti_committente contava anche i rendiconti in bozza fra quelli
-- chiusi e fra le ritenute trattenute: una bozza non ha ancora trattenuto niente.

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

  select coalesce(sum(s.netto) filter (where s.documento_fiscale_id is null and s.stato <> 'fatturato'), 0),
         coalesce(sum(s.ritenuta), 0),
         count(*) filter (where s.stato = 'inviato')::integer
    into v_da_fatturare, v_ritenute, v_fermi
    from public.appalto_sal s
   where s.company_id = p_company_id and s.committente_id = p_committente_id and s.stato <> 'bozza';

  select s.numero, v_oggi - (s.inviato_at at time zone 'Europe/Rome')::date
    into v_fermo_numero, v_fermo_giorni
    from public.appalto_sal s
   where s.company_id = p_company_id and s.committente_id = p_committente_id
     and s.stato = 'inviato' and s.inviato_at is not null
   order by s.inviato_at asc limit 1;

  select exists (select 1 from public.documenti_fiscali d where d.company_id = p_company_id) into v_fatture_leggibili;

  if v_fatture_leggibili then
    with documenti as (
      select d.id, d.tipo, d.stato, d.data_scadenza,
             coalesce(d.totale_da_pagare, d.totale_documento, 0) as totale, coalesce(d.importo_pagato, 0) as pagato
        from public.documenti_fiscali d
       where d.company_id = p_company_id and d.deleted_at is null
         and d.tipo in ('fattura', 'fattura_pa', 'nota_credito')
         and d.stato not in ('bozza', 'annullata')
         and (d.anagrafica_id in (select a.id from public.anagrafiche_native a where a.cliente_id = p_committente_id)
              or d.id in (select s.documento_fiscale_id from public.appalto_sal s where s.committente_id = p_committente_id and s.documento_fiscale_id is not null))
    ), residui as (
      select case when tipo = 'nota_credito' then -greatest(totale - pagato, 0) else greatest(totale - pagato, 0) end as residuo, data_scadenza, tipo
        from documenti where stato <> 'pagata'
    )
    select coalesce(sum(residuo), 0),
           coalesce(sum(residuo) filter (where tipo <> 'nota_credito' and data_scadenza < v_oggi), 0),
           v_oggi - min(data_scadenza) filter (where tipo <> 'nota_credito' and residuo > 0 and data_scadenza < v_oggi)
      into v_da_incassare, v_scaduto, v_scaduto_giorni
      from residui;
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

-- Una bozza non è un rendiconto chiuso. Si cambia solo il pezzo: se la funzione
-- è stata toccata nel frattempo, la migrazione si ferma invece di riscriverla.
do $mig$
declare
  v_def text := pg_get_functiondef('public.appalto_conti_committente(date, date)'::regprocedure);
  v_prima text := E'where s.company_id = v_company\n       and s.periodo_al between v_dal and v_al\n       and (s.order_id is null';
  v_dopo text := E'where s.company_id = v_company\n       and s.stato <> ''bozza''\n       and s.periodo_al between v_dal and v_al\n       and (s.order_id is null';
begin
  if position(v_dopo in v_def) > 0 then
    return;
  end if;
  if position(v_prima in v_def) = 0 then
    raise exception 'appalto_conti_committente è cambiata: pezzo non trovato';
  end if;
  execute replace(v_def, v_prima, v_dopo);
end
$mig$;
