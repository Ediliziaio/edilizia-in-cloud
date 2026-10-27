-- La marginalità calcolata commessa per commessa (27/10/2026).
--
-- Rifatta sulla definizione di oggi. Quella del 12/10 non si poteva applicare: il 18-19/10 la vista è stata
-- riscritta (rientri di magazzino tolti dagli acquisti in proporzione, ripartizioni dei costi su più commesse,
-- IVA delle squadre esterne), e sostituirla con la versione preparata allora avrebbe cancellato quel lavoro.
--
-- Il problema è rimasto: v_ordine_marginalita somma ogni tabella figlia con un GROUP BY su TUTTE le commesse di
-- tutte le aziende e poi unisce il risultato alle commesse richieste. Con security_invoker le regole RLS si
-- valutano su ogni riga sommata: anche per mostrare 15 commesse si leggono le tabelle intere (18.408 movimenti
-- di magazzino, 2.298 righe di manodopera). Misurato in produzione il 27/10/2026, amministratore con 65
-- commesse, piano freddo, 15 commesse per id:
--
--   227 ms di pianificazione + 882 ms di esecuzione   (il piano stampato è 299 kB)
--
-- Ora ogni importo è una sottoquery sulla commessa (order_id = o.id, tutte con indice), dentro una LATERAL con
-- OFFSET 0: si leggono solo le righe delle commesse richieste, ogni somma si calcola una volta per commessa, e
-- le somme delle colonne non richieste non si calcolano affatto.
--
-- Due cose non si potevano fare per commessa, e sono rimaste come erano:
--
--   · i costi ripartiti su più commesse (company_costs.allocations) tengono la commessa dentro il JSON, non in
--     una colonna indicizzabile: restano un raggruppamento unico. Sono 93 righe su 1.753 e si leggono una volta
--     per query, non una volta per commessa;
--   · marginalita_costo_oda() e oda_copertura_righe() leggono tutti gli ordini d'acquisto delle aziende di chi
--     guarda. Qui nascono le due versioni con la commessa come parametro — stesso corpo, più «and order_id =
--     p_order_id» — che la vista chiama dentro la LATERAL. Le versioni senza parametro restano: dopo questa
--     migrazione nessuno le chiama più, e si potranno togliere quando si rifà il censimento delle funzioni
--     aperte.
--
-- Stesse colonne, stessi tipi, stesso ordine, stesse regole di calcolo, security_invoker come prima: le regole
-- RLS delle tabelle valgono per chi legge. Tutti gli importi sono numeric, la somma non dipende dall'ordine
-- delle righe. Dove la vecchia dava NULL (nessuna riga figlia) la nuova dà 0 in due colonne: il risultato non
-- cambia, perché la vista le espone già tutte e due con coalesce(..., 0).
--
-- Provata il 27/10/2026 in produzione, in una transazione annullata, con la vista nuova e le due funzioni in
-- pg_temp: tutte le 759 commesse, EXCEPT nei due versi su tutte le colonne → 0 righe di differenza.
--
-- CREATE OR REPLACE VIEW tiene GRANT e dipendenze. Prende un lock esclusivo sulla vista: lock_timeout evita di
-- restare in coda dietro una lettura lunga. Rilanciabile: la vista deve essere quella censita il 27/10/2026
-- (impronta md5) oppure già quella nuova (si riconosce perché chiama le funzioni con la commessa).

set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Il testo della vista (pg_get_viewdef) dipende dal search_path: lo stesso del censimento, così le impronte si
-- confrontano alla pari.
set local search_path = "$user", public, extensions;

do $$
declare
  v_impronta text;
  v_def text;
begin
  -- Le due funzioni senza parametro sono la fonte di quelle nuove: se qualcuno le ha cambiate, le copie
  -- parametriche qui sotto non direbbero più la stessa cosa.
  select md5(p.prosrc) into v_impronta from pg_proc p where p.oid = 'public.marginalita_costo_oda()'::regprocedure;
  if v_impronta <> 'fd9622ca44e8cd4ff0264be09097e2d7' then
    raise exception 'marginalita_costo_oda() è cambiata dopo il censimento del 27/10/2026 (impronta %)', v_impronta;
  end if;
  select md5(p.prosrc) into v_impronta from pg_proc p where p.oid = 'public.oda_copertura_righe()'::regprocedure;
  if v_impronta <> '079033358e208ac6d0a1398b5137d713' then
    raise exception 'oda_copertura_righe() è cambiata dopo il censimento del 27/10/2026 (impronta %)', v_impronta;
  end if;

  v_def := pg_get_viewdef('public.v_ordine_marginalita'::regclass, true);
  v_impronta := md5(v_def);
  if v_impronta <> '36b7d6a1d65a5ec92735b52baeaa4402'
     and v_def not like '%marginalita_costo_oda(o.id)%' then
    raise exception 'La vista v_ordine_marginalita è cambiata dopo il censimento del 27/10/2026 (impronta %): rivedere prima di sostituirla', v_impronta;
  end if;
end $$;

-- Gli ordini d'acquisto di UNA commessa: lo stesso corpo di marginalita_costo_oda(), con la commessa come
-- parametro, così la vista non legge gli ordini di tutte le commesse per sommare quelli di una.
CREATE OR REPLACE FUNCTION public.marginalita_costo_oda(p_order_id uuid)
 RETURNS TABLE(order_id uuid, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select po.order_id,
         coalesce(cc.tot, po.subtotal)::numeric
    from public.purchase_orders po
    left join (select c.purchase_order_id, c.company_id, sum(coalesce(c.amount, 0)) as tot
                 from public.company_costs c
                where c.purchase_order_id is not null
                group by c.purchase_order_id, c.company_id) cc
           on cc.purchase_order_id = po.id and cc.company_id = po.company_id
   where po.order_id = p_order_id
     and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and (auth.uid() is null
          or po.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
$function$;

-- Le righe di commessa coperte da un ordine d'acquisto, per UNA commessa.
CREATE OR REPLACE FUNCTION public.oda_copertura_righe(p_order_id uuid)
 RETURNS TABLE(order_item_id uuid, order_id uuid, coperta numeric, valore_oda numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select poi.order_item_id, po2.order_id,
         sum(poi.quantity)::numeric,
         sum(coalesce(poi.line_total, poi.quantity * poi.unit_price * (1 - coalesce(poi.discount_percent, 0) / 100)))::numeric
    from public.purchase_order_items poi
    join public.purchase_orders po2 on po2.id = poi.purchase_order_id
   where poi.order_item_id is not null
     and po2.order_id = p_order_id
     and po2.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     -- solo le aziende di chi guarda (il servizio le vede tutte)
     and (auth.uid() is null
          or po2.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
   group by poi.order_item_id, po2.order_id
$function$;

-- Chi le chiama: solo la vista, dal service role e dagli utenti attraverso di lei.
revoke all on function public.marginalita_costo_oda(uuid) from public;
revoke all on function public.oda_copertura_righe(uuid) from public;
grant execute on function public.marginalita_costo_oda(uuid) to authenticated, service_role;
grant execute on function public.oda_copertura_righe(uuid) to authenticated, service_role;

create or replace view public.v_ordine_marginalita
with (security_invoker = true) as
select o.id,
    o.company_id,
    o.order_code,
    o.description,
    o.total_amount as preventivo_contratto,
    coalesce(k.variazioni_approvate, 0::numeric) as variazioni_approvate,
    o.total_amount + coalesce(k.variazioni_approvate, 0::numeric) as preventivo_totale,
    o.work_start_date,
    o.work_end_date,
    o.created_at,
    coalesce((c.first_name || ' '::text) || c.last_name, ''::text) as cliente_nome,
    coalesce(k.costo_acquisti, 0::numeric) as costo_acquisti,
    coalesce(k.costo_errori, 0::numeric) as costo_errori,
    coalesce(k.costo_acquisti, 0::numeric) + coalesce(k.costo_materiali_magazzino, 0::numeric)
      + coalesce(k.costo_errori, 0::numeric) + coalesce(k.costo_manodopera, 0::numeric)
      + coalesce(k.costo_provvigioni, 0::numeric) + coalesce(k.costo_diretto, 0::numeric)
      + coalesce(k.costo_rimborsi_km, 0::numeric) as consuntivo,
    o.total_amount + coalesce(k.variazioni_approvate, 0::numeric)
      - (coalesce(k.costo_acquisti, 0::numeric) + coalesce(k.costo_materiali_magazzino, 0::numeric)
         + coalesce(k.costo_errori, 0::numeric) + coalesce(k.costo_manodopera, 0::numeric)
         + coalesce(k.costo_provvigioni, 0::numeric) + coalesce(k.costo_diretto, 0::numeric)
         + coalesce(k.costo_rimborsi_km, 0::numeric)) as margine,
    case
      when (o.total_amount + coalesce(k.variazioni_approvate, 0::numeric)) > 0::numeric then
        round((o.total_amount + coalesce(k.variazioni_approvate, 0::numeric)
               - (coalesce(k.costo_acquisti, 0::numeric) + coalesce(k.costo_materiali_magazzino, 0::numeric)
                  + coalesce(k.costo_errori, 0::numeric) + coalesce(k.costo_manodopera, 0::numeric)
                  + coalesce(k.costo_provvigioni, 0::numeric) + coalesce(k.costo_diretto, 0::numeric)
                  + coalesce(k.costo_rimborsi_km, 0::numeric)))
              / (o.total_amount + coalesce(k.variazioni_approvate, 0::numeric)) * 100::numeric, 1)
      else 0::numeric
    end as margine_perc,
    coalesce(k.costo_manodopera, 0::numeric) as costo_manodopera,
    coalesce(k.costo_provvigioni, 0::numeric) as costo_provvigioni,
    coalesce(k.costo_diretto, 0::numeric) as costo_diretto,
    coalesce(k.costo_materiali_magazzino, 0::numeric) as costo_materiali_magazzino,
    coalesce(k.movimenti_magazzino_senza_costo, 0::bigint) as movimenti_magazzino_senza_costo,
    coalesce(o.percentuale_avanzamento::numeric, 0::numeric) as percentuale_avanzamento,
    coalesce(k.costo_rimborsi_km, 0::numeric) as costo_rimborsi_km,
    coalesce(k.rimborsi_km_da_approvare, 0::numeric) as rimborsi_km_da_approvare,
    coalesce(k.numero_rimborsi_da_approvare, 0::bigint) as numero_rimborsi_km_da_approvare
  from orders o
  left join profiles c on c.id = o.customer_id
  -- I costi ripartiti su più commesse (company_costs.allocations): la commessa sta dentro il JSON, non in una
  -- colonna indicizzabile, quindi questa parte resta un raggruppamento unico. Sono 93 righe su 1.753: si leggono
  -- una volta per query, non una volta per commessa.
  left join (
    select ripartite.order_id, sum(ripartite.importo) as costo_ripartito
      from (select case
                     when (a.value ->> 'order_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                       then (a.value ->> 'order_id')::uuid
                     else null::uuid
                   end as order_id,
                   cc_1.amount * case
                                   when (a.value ->> 'pct') ~ '^[0-9]+(\.[0-9]+)?$' then (a.value ->> 'pct')::numeric
                                   else 0::numeric
                                 end / 100::numeric as importo
              from company_costs cc_1
              cross join lateral jsonb_array_elements(cc_1.allocations) a(value)
             where jsonb_typeof(cc_1.allocations) = 'array'
               and jsonb_array_length(cc_1.allocations) > 0
               and cc_1.purchase_order_id is null
               and cc_1.order_external_team_id is null) ripartite
     group by ripartite.order_id) rip on rip.order_id = o.id
  cross join lateral (
    select
      -- Varianti approvate.
      (select sum(ov.impatto_economico)
         from ordini_variazione ov
        where ov.order_id = o.id and ov.status = 'approvato'::text) as variazioni_approvate,
      -- Ordini d'acquisto partiti, meno i rientri di magazzino sulle righe già coperte da un ordine.
      (select sum(a.importo)
         from (select co.importo
                 from marginalita_costo_oda(o.id) co(order_id, importo)
               union all
               select (- k2.valore_oda) * least(1::numeric, k2.rientrato / nullif(greatest(k2.scaricato, k2.coperta, k2.rientrato), 0::numeric)) as importo
                 from (select wm.order_item_id,
                              sum(case
                                    when wm.movement_type = 'scarico'::text then wm.quantity::numeric
                                    when wm.movement_type = 'carico'::text and wm.rientro_commessa and coalesce(wm.notes, ''::text) like 'Divisione tra le fasi:%'::text then (- wm.quantity)::numeric
                                    else 0::numeric
                                  end) as scaricato,
                              sum(case
                                    when wm.movement_type = 'carico'::text and wm.rientro_commessa and coalesce(wm.notes, ''::text) not like 'Divisione tra le fasi:%'::text then wm.quantity::numeric
                                    else 0::numeric
                                  end) as rientrato,
                              cop.coperta,
                              cop.valore_oda
                         from warehouse_movements wm
                         join oda_copertura_righe(o.id) cop(order_item_id, order_id, coperta, valore_oda)
                           on cop.order_item_id = wm.order_item_id and cop.order_id = wm.order_id
                        where wm.order_id = o.id
                          and (wm.movement_type = any (array['carico'::text, 'scarico'::text]))
                        group by wm.order_item_id, cop.coperta, cop.valore_oda
                       having sum(case when wm.movement_type = 'carico'::text and wm.rientro_commessa then 1 else 0 end) > 0) k2) a) as costo_acquisti,
      -- Materiale di magazzino non già coperto da un ordine d'acquisto.
      (select greatest(sum(x.costo), 0::numeric)
         from (select u.costo -
                      case
                        when u.netto > 0::numeric and u.da_oda > 0::numeric then least(u.da_oda, u.netto) * u.costo / u.netto
                        else 0::numeric
                      end as costo
                 from (select wm.stock_item_id,
                              sum(case
                                    when wm.movement_type = 'scarico'::text then wm.quantity::numeric * coalesce(wm.unit_cost, 0::numeric)
                                    when wm.movement_type = 'carico'::text and wm.rientro_commessa then (- wm.quantity)::numeric * coalesce(wm.unit_cost, 0::numeric)
                                    else 0::numeric
                                  end) as costo,
                              sum(case
                                    when wm.movement_type = 'scarico'::text then wm.quantity::numeric
                                    when wm.movement_type = 'carico'::text and wm.rientro_commessa then (- wm.quantity)::numeric
                                    else 0::numeric
                                  end) as netto,
                              sum(case
                                    when wm.movement_type = 'carico'::text and not coalesce(wm.rientro_commessa, false) and wm.order_item_id is null then wm.quantity::numeric
                                    else 0::numeric
                                  end) as da_oda
                         from warehouse_movements wm
                         left join oda_copertura_righe(o.id) cov(order_item_id, order_id, coperta, valore_oda)
                           on cov.order_item_id = wm.order_item_id and cov.order_id = wm.order_id
                        where wm.order_id = o.id
                          and (wm.movement_type = any (array['carico'::text, 'scarico'::text]))
                          and cov.order_item_id is null
                        group by wm.stock_item_id) u) x) as costo_materiali_magazzino,
      (select count(*) filter (where wm.movement_type = 'scarico'::text and coalesce(wm.unit_cost, 0::numeric) <= 0::numeric)::bigint
         from warehouse_movements wm
         left join oda_copertura_righe(o.id) cov(order_item_id, order_id, coperta, valore_oda)
           on cov.order_item_id = wm.order_item_id and cov.order_id = wm.order_id
        where wm.order_id = o.id
          and (wm.movement_type = any (array['carico'::text, 'scarico'::text]))
          and cov.order_item_id is null) as movimenti_magazzino_senza_costo,
      -- Errori di cantiere.
      (select sum(oe.amount) from order_errors oe where oe.order_id = o.id) as costo_errori,
      -- Manodopera: dipendenti e squadre esterne (al netto dell'IVA).
      (select sum(x.total_cost)
         from (select oe.total_cost from order_employees oe where oe.order_id = o.id
               union all
               select ot.total_cost / (1::numeric + coalesce(ot.vat_rate, 22::numeric) / 100::numeric)
                 from order_external_teams ot where ot.order_id = o.id) x) as costo_manodopera,
      -- Provvigioni nette.
      (select sum(greatest(greatest(osp.commission_amount, 0::numeric) - greatest(osp.deduction_amount, 0::numeric), 0::numeric))
         from order_salespeople osp
        where osp.order_id = o.id) as costo_provvigioni,
      -- Costi diretti: quelli di questa commessa, più la sua parte di quelli ripartiti.
      (select coalesce((select sum(cc_1.amount)
                          from company_costs cc_1
                         where cc_1.order_id = o.id
                           and cc_1.purchase_order_id is null
                           and cc_1.order_external_team_id is null
                           and (cc_1.allocations is null
                                or jsonb_typeof(cc_1.allocations) <> 'array'::text
                                or jsonb_array_length(cc_1.allocations) = 0)), 0::numeric)
                + coalesce(rip.costo_ripartito, 0::numeric)) as costo_diretto,
      -- Rimborsi chilometrici.
      (select sum(r.importo) filter (where r.stato = any (array['approvato'::text, 'rimborsato'::text]))
         from hr_rimborsi_km r
        where r.order_id = o.id and r.stato <> 'annullato'::text) as costo_rimborsi_km,
      (select sum(r.importo) filter (where r.stato = any (array['da_confermare'::text, 'da_rimborsare'::text]))
         from hr_rimborsi_km r
        where r.order_id = o.id and r.stato <> 'annullato'::text) as rimborsi_km_da_approvare,
      (select count(*) filter (where r.stato = any (array['da_confermare'::text, 'da_rimborsare'::text]))
         from hr_rimborsi_km r
        where r.order_id = o.id and r.stato <> 'annullato'::text) as numero_rimborsi_da_approvare
    offset 0
  ) k
;
