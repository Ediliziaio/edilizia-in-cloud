-- Margine di commessa: più veloce, e con le fatture del fornitore (19/10/2026).
--
--  1. Il costo di un ordine al fornitore nel margine è quello dei costi collegati all'ordine (le
--     fatture contabilizzate, al netto delle note di credito; anche la seconda fattura); finché non ce
--     ne sono, il suo imponibile. Prima contava sempre l'imponibile dell'ordine.
--  2. Le righe coperte dagli ordini si leggono una volta sola, in due funzioni dell'azienda di chi
--     guarda: il margine di un'azienda da utente passa da quasi 3 secondi a una frazione.
--  3. Il semaforo salvato del margine si ricalcola sulla vista di oggi, senza mandare avvisi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
-- Le righe di commessa coperte da un ordine al fornitore emesso, con quantità e valore.
create or replace function public.oda_copertura_righe()
returns table (order_item_id uuid, order_id uuid, coperta numeric, valore_oda numeric)
language sql stable security definer set search_path to 'public'
as $function$
  select poi.order_item_id, po2.order_id,
         sum(poi.quantity)::numeric,
         sum(coalesce(poi.line_total, poi.quantity * poi.unit_price * (1 - coalesce(poi.discount_percent, 0) / 100)))::numeric
    from public.purchase_order_items poi
    join public.purchase_orders po2 on po2.id = poi.purchase_order_id
   where poi.order_item_id is not null
     and po2.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     -- solo le aziende di chi guarda (il servizio le vede tutte)
     and (auth.uid() is null
          or po2.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
   group by poi.order_item_id, po2.order_id
$function$;
revoke all on function public.oda_copertura_righe() from public, anon;
grant execute on function public.oda_copertura_righe() to authenticated, service_role;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
-- Il costo di ogni ordine al fornitore emesso della commessa.
create or replace function public.marginalita_costo_oda()
returns table (order_id uuid, importo numeric)
language sql stable security definer set search_path to 'public'
as $function$
  select po.order_id,
         coalesce(cc.tot, po.subtotal)::numeric
    from public.purchase_orders po
    left join (select c.purchase_order_id, c.company_id, sum(coalesce(c.amount, 0)) as tot
                 from public.company_costs c
                where c.purchase_order_id is not null
                group by c.purchase_order_id, c.company_id) cc
           on cc.purchase_order_id = po.id and cc.company_id = po.company_id
   where po.order_id is not null
     and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and (auth.uid() is null
          or po.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
$function$;
revoke all on function public.marginalita_costo_oda() from public, anon;
grant execute on function public.marginalita_costo_oda() to authenticated, service_role;

-- La vista usa le due funzioni al posto delle letture riga per riga.
do $m$
declare v text := pg_get_viewdef('public.v_ordine_marginalita'::regclass, true);
begin
  if position('marginalita_costo_oda()' in v) > 0 then return; end if;

  if position($v$           FROM ( SELECT po_1.order_id,
                    po_1.subtotal AS importo
                   FROM purchase_orders po_1
                  WHERE po_1.order_id IS NOT NULL AND (po_1.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text]))
$v$ in v) = 0 then raise exception 'v_ordine_marginalita: parte acquisti non trovata'; end if;
  v := replace(v, $v$           FROM ( SELECT po_1.order_id,
                    po_1.subtotal AS importo
                   FROM purchase_orders po_1
                  WHERE po_1.order_id IS NOT NULL AND (po_1.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text]))
$v$, $n$           FROM ( SELECT co.order_id,
                    co.importo
                   FROM marginalita_costo_oda() co(order_id, importo)
$n$);

  if position($v$                             JOIN ( SELECT poi.order_item_id,
                                    po2.order_id,
                                    sum(poi.quantity) AS coperta,
                                    sum(COALESCE(poi.line_total, poi.quantity * poi.unit_price * (1::numeric - COALESCE(poi.discount_percent, 0::numeric) / 100::numeric))) AS valore_oda
                                   FROM purchase_order_items poi
                                     JOIN purchase_orders po2 ON po2.id = poi.purchase_order_id
                                  WHERE poi.order_item_id IS NOT NULL AND (po2.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text]))
                                  GROUP BY poi.order_item_id, po2.order_id) cop ON$v$ in v) = 0 then raise exception 'v_ordine_marginalita: parte rientri non trovata'; end if;
  v := replace(v, $v$                             JOIN ( SELECT poi.order_item_id,
                                    po2.order_id,
                                    sum(poi.quantity) AS coperta,
                                    sum(COALESCE(poi.line_total, poi.quantity * poi.unit_price * (1::numeric - COALESCE(poi.discount_percent, 0::numeric) / 100::numeric))) AS valore_oda
                                   FROM purchase_order_items poi
                                     JOIN purchase_orders po2 ON po2.id = poi.purchase_order_id
                                  WHERE poi.order_item_id IS NOT NULL AND (po2.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text]))
                                  GROUP BY poi.order_item_id, po2.order_id) cop ON$v$,
    $n$                             JOIN oda_copertura_righe() cop(order_item_id, order_id, coperta, valore_oda) ON$n$);

  if position($v$                           FROM warehouse_movements wm
                          WHERE wm.order_id IS NOT NULL AND (wm.movement_type = ANY (ARRAY['carico'::text, 'scarico'::text])) AND NOT (wm.order_item_id IS NOT NULL AND (EXISTS ( SELECT 1
                                   FROM purchase_order_items poi
                                     JOIN purchase_orders po2 ON po2.id = poi.purchase_order_id
                                  WHERE poi.order_item_id = wm.order_item_id AND po2.order_id = wm.order_id AND (po2.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text])))))
$v$ in v) = 0 then raise exception 'v_ordine_marginalita: parte magazzino non trovata'; end if;
  v := replace(v, $v$                           FROM warehouse_movements wm
                          WHERE wm.order_id IS NOT NULL AND (wm.movement_type = ANY (ARRAY['carico'::text, 'scarico'::text])) AND NOT (wm.order_item_id IS NOT NULL AND (EXISTS ( SELECT 1
                                   FROM purchase_order_items poi
                                     JOIN purchase_orders po2 ON po2.id = poi.purchase_order_id
                                  WHERE poi.order_item_id = wm.order_item_id AND po2.order_id = wm.order_id AND (po2.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text])))))
$v$, $n$                           FROM warehouse_movements wm
                             LEFT JOIN oda_copertura_righe() cov(order_item_id, order_id, coperta, valore_oda) ON cov.order_item_id = wm.order_item_id AND cov.order_id = wm.order_id
                          WHERE wm.order_id IS NOT NULL AND (wm.movement_type = ANY (ARRAY['carico'::text, 'scarico'::text])) AND cov.order_item_id IS NULL
$n$);

  execute 'create or replace view public.v_ordine_marginalita with (security_invoker = true) as ' || v;
end $m$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
-- Il semaforo salvato torna uguale alla vista di oggi: solo le righe che esistono già, nessun avviso.
update public.ordine_margine_stato s
   set margine = round(v.margine, 2),
       margine_perc = round(v.margine_perc, 2),
       semaforo = case
         when v.margine_perc < 0 then 'rosso'
         when coalesce(g.marginalita_alert_enabled, true) and v.margine_perc < coalesce(g.marginalita_soglia_perc, 15) then 'giallo'
         else 'verde' end,
       soglia_perc = coalesce(g.marginalita_soglia_perc, 15),
       ultima_causa = 'ricalcolo del margine',
       valutato_at = now()
  from public.v_ordine_marginalita v
  left join public.company_governance_settings g on g.company_id = v.company_id
 where v.id = s.order_id
   and coalesce(v.preventivo_totale, 0) > 0
   and (round(v.margine_perc, 2) is distinct from s.margine_perc or round(v.margine, 2) is distinct from s.margine);
