-- Il riepilogo della generale dice gli stessi numeri del resto della pagina, tutti al netto dell'IVA.
-- Viene dalle simulazioni e dalla revisione del 02/11/2026:
--   · la testata di Villette Via dei Pini (4 unità vendute e pagate, 1.250.000 €) diceva «Incassato 0»,
--     il riquadro delle vendite 1.250.000 €.
--   · fatture con l'IVA e prezzi delle unità senza: generale_fatture_nette porta le fatture all'imponibile,
--     e il confronto tra incassi delle fatture e delle unità ha una base sola. generale_fatture_righe
--     resta com'è: serve al piano economico.
--   · residuo_unita: quanto manca su un'unità a compromesso o rogitata, con varianti e permute,
--     la stessa regola del pannello dell'unità.
--   · eseguito e avanzamento: una commessa a misura vale le sue misure di questo contratto, come nel SAL.
--     Manutenzione strade aveva un SAL da 149.800 € con l'eseguito a zero.
--   · generale_sintesi (Silvio): da incassare commessa per commessa, senza compensare chi ha pagato con chi no.

create or replace function public.generale_fatture_nette(p_azienda uuid, p_ordini uuid[])
returns table (order_id uuid, fatturato numeric, incassato numeric)
language sql
stable
security definer
set search_path = public
as $$
  with app as (
    select d.ordine_id as order_id, d.data_emissione as giorno,
           case when d.tipo = 'nota_credito' then -1 else 1 end * coalesce(d.imponibile_totale, d.totale_documento, 0) as fatturato,
           case when d.tipo = 'nota_credito' then 0
                when d.stato = 'pagata' then coalesce(d.imponibile_totale, d.totale_documento, 0)
                when coalesce(d.totale_documento, 0) > 0
                  then least(coalesce(d.importo_pagato, 0), d.totale_documento) * coalesce(d.imponibile_totale, d.totale_documento) / d.totale_documento
                else 0 end as incassato,
           coalesce(d.totale_documento, 0) as totale
      from public.documenti_fiscali d
     where d.company_id = p_azienda and d.deleted_at is null
       and d.ordine_id = any (p_ordini)
       and d.tipo in ('fattura', 'fattura_pa', 'nota_credito')
       and coalesce(d.stato, '') not in ('bozza', 'annullata', 'rifiutata')
  )
  select a.order_id, a.fatturato, a.incassato from app a
  union all
  select i.order_id,
         (coalesce(i.total, 0) - public.nc_collegate_importo(i.id)) * r.quota,
         case when i.status in ('paid', 'pagata') then (coalesce(i.total, 0) - public.nc_collegate_importo(i.id)) * r.quota
              else least(coalesce(i.paid_amount, 0), coalesce(i.total, 0)) * r.quota end
    from public.invoices i
    cross join lateral (select case when coalesce(i.total, 0) > 0 and i.subtotal is not null then i.subtotal / i.total else 1 end as quota) r
   where i.company_id = p_azienda
     and i.order_id = any (p_ordini)
     and i.deleted_at is null
     and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
     and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
     and not exists (select 1 from app a where a.order_id = i.order_id and a.giorno = i.issue_date and abs(a.totale - coalesce(i.total, 0)) < 0.01);
$$;
revoke all on function public.generale_fatture_nette(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.commessa_generale_riepilogo(p_generale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_generale jsonb;
  v_figlie jsonb;
  v_fatture_generale jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);

  select jsonb_build_object(
           'id', o.id, 'codice', o.order_code, 'nome', o.description, 'cliente', o.client_name,
           'cliente_id', o.customer_id, 'modello', g.modello, 'creata_il', o.created_at,
           'valore', case when v_importi then g.valore_riferimento end)
    into v_generale
    from public.orders o
    join public.commesse_generali g on g.order_id = o.id
   where o.id = p_generale_id and o.deleted_at is null;
  if v_generale is null then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;

  with figlie as (
    select o.id, o.order_code, o.description, o.status, o.work_address, o.work_start_date, o.work_end_date,
           coalesce(o.total_amount, 0) as importo,
           coalesce(o.percentuale_avanzamento, 0) as avanzamento,
           s.name as stato_nome, s.color as stato_colore,
           u.divisa_il is not null as divisa,
           coalesce((select sum(um.importo) from public.unita_movimenti um
                      where um.unita_id = u.id and um.tipo in ('caparra', 'acconto')), 0) as acconti,
           coalesce((select sum(um.importo) from public.unita_movimenti um
                      where um.unita_id = u.id and um.tipo in ('caparra', 'acconto', 'saldo')), 0) as incassi_unita,
           u.stato_vendita,
           -- Come il pannello dell'unità: prezzo con le varianti approvate, meno pagamenti e permute.
           case when u.stato_vendita in ('compromesso', 'rogitata') and u.divisa_il is null then greatest(0,
             coalesce(o.total_amount, 0)
             + coalesce((select sum(v.impatto_economico) from public.ordini_variazione v where v.order_id = o.id and v.status = 'approvato'), 0)
             - coalesce((select sum(um.importo) from public.unita_movimenti um where um.unita_id = u.id), 0)) end as residuo_unita,
           -- Come il SAL: una commessa «a misura» vale le sue misure di questo contratto, voce per voce.
           exists (select 1 from public.generale_computo k where k.figlia_id = o.id and k.generale_id = p_generale_id)
             or exists (select 1 from public.generale_misure gm where gm.figlia_id = o.id and gm.generale_id = p_generale_id) as a_misura,
           coalesce((select sum(q.valore) from (
              select sum(gm.quantita) * ep.prezzo
                     * case when ep.soggetto_ribasso then 1 - coalesce(gc.ribasso_pct, 0) / 100 else 1 end as valore
                from public.generale_misure gm
                join public.generale_elenco_prezzi ep on ep.id = gm.voce_id
                left join public.generale_contratti gc on gc.generale_id = gm.generale_id
               where gm.figlia_id = o.id and gm.generale_id = p_generale_id
               group by ep.id, ep.prezzo, ep.soggetto_ribasso, gc.ribasso_pct
              having sum(gm.quantita) > 0) q), 0) as misurato
      from public.orders o
      left join public.unita_immobiliari u on u.order_id = o.id
      left join public.order_statuses s on s.id = o.current_status_id
     where o.commessa_generale_id = p_generale_id and o.deleted_at is null
  ),
  fatture as (
    select x.order_id, sum(x.fatturato) as fatturato, sum(x.incassato) as incassato
      from public.generale_fatture_nette(v_azienda, array(select id from figlie)) x
     group by x.order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'codice', f.order_code, 'nome', f.description,
           'stato', f.status, 'stato_nome', f.stato_nome, 'stato_colore', f.stato_colore,
           'indirizzo', f.work_address, 'inizio', f.work_start_date, 'fine', f.work_end_date,
           'avanzamento', case when f.a_misura and f.importo > 0 then least(100, round(f.misurato / f.importo * 100, 1)) else f.avanzamento end,
           'divisa', f.divisa,
           'acconti', case when v_importi then f.acconti end,
           'importo', case when v_importi then f.importo end,
           'eseguito', case when v_importi then case when f.a_misura then round(f.misurato, 2) else round(f.importo * f.avanzamento / 100, 2) end end,
           'stato_vendita', f.stato_vendita,
           'residuo_unita', case when v_importi then f.residuo_unita end,
           'fatturato', case when v_importi then coalesce(ft.fatturato, 0) end,
           'incassato', case when v_importi then greatest(coalesce(ft.incassato, 0), f.incassi_unita) end,
           'costo', case when v_costi then m.consuntivo end,
           'margine', case when v_margini then m.margine end
         ) order by f.order_code nulls last, f.description), '[]'::jsonb)
    into v_figlie
    from figlie f
    left join fatture ft on ft.order_id = f.id
    left join public.v_ordine_marginalita m on m.id = f.id;

  -- Fatture registrate sulla generale stessa (es. SAL di contratto fatturato sul contratto).
  select case when v_importi then jsonb_build_object(
           'fatturato', coalesce(sum(x.fatturato), 0),
           'incassato', coalesce(sum(x.incassato), 0)) end
    into v_fatture_generale
    from public.generale_fatture_nette(v_azienda, array[p_generale_id]) x;

  return jsonb_build_object(
    'generale', v_generale,
    'figlie', v_figlie,
    'fatture_generale', v_fatture_generale,
    'permessi', jsonb_build_object('importi', v_importi, 'costi', v_costi, 'margini', v_margini)
  );
end;
$$;
revoke all on function public.commessa_generale_riepilogo(uuid) from public, anon;
grant execute on function public.commessa_generale_riepilogo(uuid) to authenticated;

create or replace function public.generale_sintesi(p_g jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  r jsonb := nullif(p_g -> 'riepilogo', 'null'::jsonb);
  v_permessi jsonb := coalesce(p_g -> 'riepilogo' -> 'permessi', '{}'::jsonb);
  v_importi boolean := coalesce((v_permessi ->> 'importi')::boolean, false);
  v_costi boolean := coalesce((v_permessi ->> 'costi')::boolean, false);
  v_margini boolean := coalesce((v_permessi ->> 'margini')::boolean, false);
  v_figlie jsonb := coalesce(r -> 'figlie', '[]'::jsonb);
  v_n integer := jsonb_array_length(coalesce(r -> 'figlie', '[]'::jsonb));
  v_valore numeric := nullif(r -> 'generale' ->> 'valore', '')::numeric;
  v_fg jsonb := r -> 'fatture_generale';
  t record;
  v_sul_contratto numeric := greatest(0, coalesce((v_fg ->> 'fatturato')::numeric, 0) - coalesce((v_fg ->> 'incassato')::numeric, 0));
  v record;
  p jsonb := nullif(p_g -> 'piano', 'null'::jsonb);
  v_elenco jsonb := nullif(p_g -> 'unita', 'null'::jsonb);
  v_vendite jsonb;
  v_piano jsonb;
begin
  if r is null then
    return null;
  end if;

  select round(sum((f ->> 'importo')::numeric), 2) as assegnato,
         round(sum((f ->> 'eseguito')::numeric), 2) as eseguito,
         round(sum((f ->> 'fatturato')::numeric) + coalesce((v_fg ->> 'fatturato')::numeric, 0), 2) as fatturato,
         round(sum((f ->> 'incassato')::numeric) + coalesce((v_fg ->> 'incassato')::numeric, 0), 2) as incassato,
         round(sum(coalesce((f ->> 'costo')::numeric, 0)), 2) as costo,
         round(sum(coalesce((f ->> 'margine')::numeric, 0)), 2) as margine,
         round(sum(greatest(0, coalesce((f ->> 'fatturato')::numeric, 0) - coalesce((f ->> 'incassato')::numeric, 0))), 2) as sul_fatturato,
         round(sum(greatest(coalesce((f ->> 'fatturato')::numeric, 0) - coalesce((f ->> 'incassato')::numeric, 0), coalesce((f ->> 'residuo_unita')::numeric, 0), 0)), 2) as da_incassare,
         sum(greatest(0, coalesce((f ->> 'importo')::numeric, 0))) as peso,
         sum(coalesce((f ->> 'avanzamento')::numeric, 0) * greatest(0, coalesce((f ->> 'importo')::numeric, 0))) as avanz_pesato,
         avg(coalesce((f ->> 'avanzamento')::numeric, 0)) as avanz_medio,
         count(*) filter (where coalesce((f ->> 'divisa')::boolean, false) = false
                            and (f ->> 'margine')::numeric < 0) as in_perdita
    into t
    from jsonb_array_elements(v_figlie) f;

  if v_n = 0 then
    t.assegnato := 0; t.eseguito := 0;
    t.fatturato := coalesce((v_fg ->> 'fatturato')::numeric, 0);
    t.incassato := coalesce((v_fg ->> 'incassato')::numeric, 0);
  end if;

  if v_elenco is not null then
    with u as (
      select f -> 'unita' as s,
             coalesce(f -> 'unita' ->> 'stato', 'libera') as stato,
             case when jsonb_typeof(f -> 'unita') = 'object' then (f -> 'unita' ->> 'prezzo_listino')::numeric
                  when (f ->> 'importo')::numeric > 0 then (f ->> 'importo')::numeric end as listino,
             (f -> 'unita' ->> 'prezzo_trattato')::numeric as trattato,
             (f -> 'unita' ->> 'prezzo_rogito')::numeric as rogito,
             (select coalesce(sum((m ->> 'importo')::numeric), 0) from jsonb_array_elements(coalesce(f -> 'unita' -> 'movimenti', '[]'::jsonb)) m
               where m ->> 'tipo' in ('caparra', 'acconto', 'saldo')) as incassato,
             (select coalesce(sum((m ->> 'importo')::numeric), 0) from jsonb_array_elements(coalesce(f -> 'unita' -> 'movimenti', '[]'::jsonb)) m
               where m ->> 'tipo' = 'permuta') as permute
        from jsonb_array_elements(coalesce(v_elenco -> 'figlie', '[]'::jsonb)) f
       where nullif(f -> 'unita' ->> 'divisa_il', '') is null
    ),
    c as (
      select u.*, coalesce(u.rogito, u.trattato, u.listino) as prezzo from u
    )
    select count(*) as unita,
           count(*) filter (where stato in ('compromesso', 'rogitata')) as vendute,
           count(*) filter (where stato = 'rogitata') as rogitate,
           count(*) filter (where stato = 'prenotata') as prenotate,
           count(*) filter (where stato = 'libera') as libere,
           round(coalesce(sum(prezzo) filter (where stato in ('compromesso', 'rogitata')), 0), 2) as venduto,
           round(coalesce(sum(coalesce(trattato, listino)) filter (where stato = 'prenotata'), 0), 2) as prenotato,
           round(coalesce(sum(listino) filter (where stato = 'libera'), 0), 2) as in_vendita,
           round(coalesce(sum(incassato), 0), 2) as incassato,
           round(coalesce(sum(permute), 0), 2) as permute,
           round(coalesce(sum(greatest(0, prezzo - incassato - permute)) filter (where stato in ('compromesso', 'rogitata')), 0), 2) as da_incassare
      into v
      from c;
    v_vendite := jsonb_build_object(
      'unita', v.unita, 'vendute', v.vendute, 'di_cui_rogitate', v.rogitate,
      'prenotate', v.prenotate, 'libere', v.libere,
      'venduto_eur', case when v_importi then v.venduto end,
      'prenotato_eur', case when v_importi then v.prenotato end,
      'in_vendita_a_listino_eur', case when v_importi then v.in_vendita end,
      'incassato_dalle_vendite_eur', case when v_importi then v.incassato end,
      'permute_eur', case when v_importi then v.permute end,
      'da_incassare_sulle_vendite_eur', case when v_importi then v.da_incassare end);
  end if;

  if p is not null then
    v_piano := jsonb_build_object(
      'versione', 'n. ' || (p ->> 'versione_numero') || ' (' || (p ->> 'versione_stato') || ')',
      'ricavi_previsti_eur', (p ->> 'ricavi_previsti')::numeric,
      'costi_previsti_eur', (p ->> 'costi_previsti')::numeric,
      'margine_previsto_eur', (p ->> 'ricavi_previsti')::numeric - (p ->> 'costi_previsti')::numeric,
      'ricavi_stima_finale_eur', (p ->> 'ricavi_stima')::numeric,
      'costi_stima_finale_eur', (p ->> 'costi_stima')::numeric,
      'margine_a_finire_eur', (p ->> 'ricavi_stima')::numeric - (p ->> 'costi_stima')::numeric,
      'capitale_impegnato_oggi_eur', (p ->> 'capitale_investito')::numeric,
      'capitale_massimo_previsto_eur', (p ->> 'capitale_massimo_previsto')::numeric);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'commesse_dentro', v_n,
    'valore_aggiornato_eur', case when v_importi then v_valore end,
    'assegnato_alle_commesse_eur', case when v_importi then t.assegnato end,
    'da_assegnare_eur', case when v_importi and v_valore is not null then round(v_valore - t.assegnato, 2) end,
    'eseguito_eur', case when v_importi then t.eseguito end,
    'da_eseguire_eur', case when v_importi then round(greatest(0, coalesce(v_valore, t.assegnato) - t.eseguito), 2) end,
    'fatturato_eur', case when v_importi then t.fatturato end,
    'incassato_eur', case when v_importi then t.incassato end,
    'da_incassare_sul_fatturato_eur', case when v_importi then round(coalesce(t.sul_fatturato, 0) + v_sul_contratto, 2) end,
    'da_incassare_eur', case when v_importi then round(coalesce(t.da_incassare, 0) + v_sul_contratto, 2) end,
    'costi_registrati_eur', case when v_costi and v_n > 0 then t.costo end,
    'margine_attuale_commesse_eur', case when v_margini and v_n > 0 then t.margine end,
    'commesse_in_perdita', case when v_margini then t.in_perdita end,
    'avanzamento_pct', case when v_n = 0 then 0
                            when t.peso > 0 then round(t.avanz_pesato / t.peso, 1)
                            else round(t.avanz_medio, 1) end,
    'vendite', v_vendite,
    'piano_economico', v_piano));
end;
$$;
