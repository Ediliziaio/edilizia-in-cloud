-- ════════════════════════════════════════════════════════════════════════════
-- Un costo a rate scade quando scade la sua prossima rata
-- ════════════════════════════════════════════════════════════════════════════
-- Seguito di 20281029236000_rate_fornitori. Approvato da Florin il 29/10/2026:
-- «il previsionale di cassa legge le rate, così ogni RiBa conta nel mese in cui
-- la banca la addebita».
--
-- Il previsionale (`useForecastLedger`) legge le rate direttamente. Ma molti
-- altri lettori ragionano per COSTO e leggono `company_costs.due_date`: il
-- badge «Esce tra N giorni / Scaduto» nella pagina Costi (`v_uscite_stato`),
-- gli avvisi del mattino (`crea_notifiche_uscite_in_arrivo`), la previsione a
-- 90 giorni della Tesoreria, Silvio. Per tutti loro il costo Centrufficio
-- scadeva il 31/10 — la prima RiBa — per sempre: pagata quella, da novembre
-- sarebbe risultato «Scaduto» mentre la prossima RiBa è il 30/11.
--
-- La regola, una sola: un costo che ha rate porta come scadenza quella della
-- sua PROSSIMA RATA APERTA (non pagata). La tiene aggiornata il trigger delle
-- rate, a ogni cambio di stato, di pagamento o di scadenza. Così tutti i
-- lettori per costo vedono la data giusta senza cambiare.
--
-- E l'avviso dice l'importo che esce davvero: `v_uscite_stato` guadagna, in
-- coda, `importo_prossima_uscita` (lordo, la somma delle rate aperte di quel
-- giorno) e `etichetta_prossima_uscita` («RiBa 1 di 4»). L'avviso del mattino
-- li usa quando ci sono: «939,70 € · RiBa 1 di 4 il 31/10/2026» invece di
-- «3.080,98 € il 31/10/2026».
--
-- Nessuna regola d'accesso creata. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Rate → costo: pagato, e ora anche la scadenza ────────────────────────

create or replace function public.rate_fornitori_allinea_costo()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_cost       uuid := coalesce(new.company_cost_id, old.company_cost_id);
  v_aperte     integer;
  v_totali     integer;
  v_ultima     date;
  v_prossima   date;
  v_is_paid    boolean;
  v_scadenza   date;
begin
  select count(*) filter (where stato <> 'pagata'),
         count(*),
         max(pagata_il),
         min(scadenza) filter (where stato <> 'pagata')
    into v_aperte, v_totali, v_ultima, v_prossima
    from public.rate_fornitori where company_cost_id = v_cost;
  if v_totali = 0 then
    return null;
  end if;

  select is_paid, due_date into v_is_paid, v_scadenza
    from public.company_costs where id = v_cost;

  -- Il segnale dice al trigger dei costi che il cambio viene da qui, e non
  -- deve ripercuotersi sulle altre rate.
  perform set_config('rate_fornitori.da_rata', 'on', true);
  if v_aperte = 0 and not coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = true, paid_date = v_ultima, updated_at = now()
     where id = v_cost;
  elsif v_aperte > 0 and coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = false, paid_date = null, updated_at = now()
     where id = v_cost;
  end if;
  -- La scadenza del costo è quella della prossima rata aperta. Se nessuna
  -- rata aperta ha una data, la scadenza del costo resta com'è.
  if v_prossima is not null and v_prossima is distinct from v_scadenza then
    update public.company_costs
       set due_date = v_prossima, updated_at = now()
     where id = v_cost;
  end if;
  perform set_config('rate_fornitori.da_rata', 'off', true);
  return null;
end
$fn$;
revoke all on function public.rate_fornitori_allinea_costo() from public, anon, authenticated;

drop trigger if exists trg_rate_fornitori_allinea_costo on public.rate_fornitori;
create trigger trg_rate_fornitori_allinea_costo
  after insert or update of stato, pagata_il, scadenza or delete on public.rate_fornitori
  for each row execute function public.rate_fornitori_allinea_costo();

-- ── 2. I costi che hanno già le rate ────────────────────────────────────────

do $$
declare v_n integer;
begin
  perform set_config('rate_fornitori.da_rata', 'on', true);
  update public.company_costs cc
     set due_date = p.prossima, updated_at = now()
    from (
      select company_cost_id, min(scadenza) as prossima
        from public.rate_fornitori
       where stato <> 'pagata' and scadenza is not null
       group by company_cost_id
    ) p
   where p.company_cost_id = cc.id
     and cc.due_date is distinct from p.prossima;
  get diagnostics v_n = row_count;
  perform set_config('rate_fornitori.da_rata', 'off', true);
  raise notice 'Costi con la scadenza riallineata alla prossima rata: %', v_n;
end $$;

-- ── 3. Lo stato delle uscite sa quanto esce davvero ─────────────────────────
-- Stesse colonne di prima, nello stesso ordine; in coda le due nuove.

create or replace view public.v_uscite_stato
with (security_invoker = on) as
select
  c.id,
  c.company_id,
  c.name,
  c.category,
  c.amount,
  c.vat_rate,
  c.is_paid,
  c.paid_date,
  c.due_date,
  c.supplier_id,
  c.order_id,
  c.purchase_order_id,
  c.trigger_evento,
  c.giorni_dilazione,
  c.giorni_preavviso,
  d.data_pagamento,
  d.data_pagamento - current_date as giorni_al_pagamento,
  case
    when c.is_paid then 'pagata'::text
    when d.data_pagamento is null then 'senza_data'::text
    when d.data_pagamento <= current_date then 'scaduta'::text
    when d.data_pagamento <= (current_date + c.giorni_preavviso) then 'preavviso'::text
    else 'ok'::text
  end as stato_uscita,
  -- Per un costo a rate: quanto esce davvero quel giorno (lordo, dalle rate) e
  -- quale rata è. NULL per i costi senza rate, che escono interi.
  pr.importo as importo_prossima_uscita,
  pr.etichetta as etichetta_prossima_uscita
from public.company_costs c
cross join lateral (
  select public.data_pagamento_uscita(c.trigger_evento, c.due_date, c.giorni_dilazione,
                                       c.id, c.purchase_order_id, c.order_id) as data_pagamento
) d
left join lateral (
  select sum(r.importo) as importo,
         string_agg(
           (case when r.metodo = 'riba' then 'RiBa' else 'rata' end) || ' ' || r.numero || ' di ' ||
           (select count(*) from public.rate_fornitori t where t.company_cost_id = c.id),
           ', ' order by r.numero
         ) as etichetta
    from public.rate_fornitori r
   where r.company_cost_id = c.id
     and r.stato <> 'pagata'
     and r.scadenza = (select min(x.scadenza) from public.rate_fornitori x
                        where x.company_cost_id = c.id and x.stato <> 'pagata')
) pr on true;

-- ── 4. L'avviso del mattino dice l'importo della rata ───────────────────────

do $migrazione$
declare
  v_def   text;
  v_nuova text;
  v_conta int;
begin
  v_def := pg_get_functiondef('public.crea_notifiche_uscite_in_arrivo'::regproc);
  if position('importo_prossima_uscita' in v_def) > 0 then
    raise notice 'crea_notifiche_uscite_in_arrivo: già corretta';
    return;
  end if;

  select count(*) into v_conta
    from regexp_matches(v_def, $re$' · ' \|\| to_char\(u\.amount, 'FM999G999G990D00'\) \|\| ' € $re$, 'g');
  if v_conta <> 2 then
    raise exception 'crea_notifiche_uscite_in_arrivo: importo trovato % volte, atteso 2', v_conta;
  end if;

  v_nuova := regexp_replace(
    v_def,
    $re$' · ' \|\| to_char\(u\.amount, 'FM999G999G990D00'\) \|\| ' € $re$,
    $sost$' · ' || to_char(coalesce(u.importo_prossima_uscita, u.amount), 'FM999G999G990D00') || ' €' || coalesce(' · ' || u.etichetta_prossima_uscita, '') || ' $sost$,
    'g');
  if v_nuova = v_def then
    raise exception 'crea_notifiche_uscite_in_arrivo: nessuna sostituzione';
  end if;
  execute v_nuova;
end
$migrazione$;

-- ── 5. Controllo ────────────────────────────────────────────────────────────

do $$
declare v_storti int;
begin
  -- Ogni costo con una rata aperta datata scade alla prima di queste.
  select count(*) into v_storti
    from public.company_costs cc
    join (
      select company_cost_id, min(scadenza) as prossima
        from public.rate_fornitori
       where stato <> 'pagata' and scadenza is not null
       group by company_cost_id
    ) p on p.company_cost_id = cc.id
   where cc.due_date is distinct from p.prossima;
  if v_storti > 0 then
    raise exception '% costi non scadono alla loro prossima rata', v_storti;
  end if;
end $$;
