-- ════════════════════════════════════════════════════════════════════════════
-- Un acconto collegato all'ODA non abbassa il costo della commessa
-- ════════════════════════════════════════════════════════════════════════════
-- Approvato da Florin il 29/10/2026 («sì, correggili»), dopo l'analisi del
-- conto economico della commessa.
--
-- Il costo di un ordine d'acquisto nel margine (`marginalita_costo_oda`) era
-- «se all'ODA è collegato un costo conta il costo, altrimenti l'ODA». Ma il
-- primo costo collegato può essere un ACCONTO:
--   · la prima fattura agganciata all'ODA sostituisce l'importo del costo nato
--     alla ricezione (`contabilizza_fattura_ricevuta`): con una fattura
--     d'acconto del 30% il costo diventa il 30%;
--   · un acconto registrato a mano con l'ODA ferma il costo della ricezione
--     (idempotenza di `crea_costo_da_ricezione_oda`).
-- In tutti e due i casi il margine saliva finché non arrivava il saldo: ODA da
-- 10.000 €, acconto da 3.000 € → 7.000 € di costo spariti dalla commessa.
--
-- La regola nuova: il costo dell'ODA è il PIÙ ALTO tra il valore dell'ordine e
-- quanto è stato fatturato, meno le note di credito.
--   · nessun costo collegato            → il valore dell'ordine (come prima);
--   · acconto, o fatture sotto l'ordine → il valore dell'ordine: è l'impegno;
--   · acconto + saldo = ordine          → lo stesso numero;
--   · fatture sopra l'ordine (extra)    → il fatturato (come prima);
--   · nota di credito                   → riduce, come prima. Il costo del
--     registro è già al netto delle note: si rimettono per confrontare il
--     fatturato con l'ordine, e si tolgono dopo.
-- Cosa non vede: una fattura finale più bassa dell'ordine senza nota di
-- credito (uno sconto in fattura) resta al valore dell'ordine. Meglio un costo
-- prudente che uno sparito.
--
-- Misurata il 29/10/2026 su tutti i 227 ODA di produzione (181 con costi
-- collegati, nessuna nota di credito): 0 importi cambiano. La correzione
-- protegge i flussi acconto/saldo che arrivano, non riscrive il passato.
--
-- Stesse firme e stessi tipi: la vista v_ordine_marginalita non si tocca. Si
-- aggiorna anche la versione senza parametro, perché le due restino lo stesso
-- corpo. La versione con la commessa era eseguibile da anon: chiusa (la vista
-- che la chiama non è leggibile da anon). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.marginalita_costo_oda(p_order_id uuid)
 RETURNS TABLE(order_id uuid, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select po.order_id,
         (case
            when cc.tot is null then po.subtotal
            else greatest(0, greatest(coalesce(po.subtotal, 0), cc.tot + coalesce(nc.tot, 0)) - coalesce(nc.tot, 0))
          end)::numeric
    from public.purchase_orders po
    left join (select c.purchase_order_id, c.company_id, sum(coalesce(c.amount, 0)) as tot
                 from public.company_costs c
                where c.purchase_order_id is not null
                group by c.purchase_order_id, c.company_id) cc
           on cc.purchase_order_id = po.id and cc.company_id = po.company_id
    -- le note di credito già tolte dai costi dell'ordine
    left join (select c.purchase_order_id, c.company_id, sum(abs(coalesce(fr.imponibile_totale, 0))) as tot
                 from public.fatture_ricevute fr
                 join public.company_costs c on c.id = fr.company_cost_id and c.company_id = fr.company_id
                where c.purchase_order_id is not null
                  and fr.tipo_documento in ('TD04', 'passive_credit_note')
                group by c.purchase_order_id, c.company_id) nc
           on nc.purchase_order_id = po.id and nc.company_id = po.company_id
   where po.order_id = p_order_id
     and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and (auth.uid() is null
          or po.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
$function$;

CREATE OR REPLACE FUNCTION public.marginalita_costo_oda()
 RETURNS TABLE(order_id uuid, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select po.order_id,
         (case
            when cc.tot is null then po.subtotal
            else greatest(0, greatest(coalesce(po.subtotal, 0), cc.tot + coalesce(nc.tot, 0)) - coalesce(nc.tot, 0))
          end)::numeric
    from public.purchase_orders po
    left join (select c.purchase_order_id, c.company_id, sum(coalesce(c.amount, 0)) as tot
                 from public.company_costs c
                where c.purchase_order_id is not null
                group by c.purchase_order_id, c.company_id) cc
           on cc.purchase_order_id = po.id and cc.company_id = po.company_id
    left join (select c.purchase_order_id, c.company_id, sum(abs(coalesce(fr.imponibile_totale, 0))) as tot
                 from public.fatture_ricevute fr
                 join public.company_costs c on c.id = fr.company_cost_id and c.company_id = fr.company_id
                where c.purchase_order_id is not null
                  and fr.tipo_documento in ('TD04', 'passive_credit_note')
                group by c.purchase_order_id, c.company_id) nc
           on nc.purchase_order_id = po.id and nc.company_id = po.company_id
   where po.order_id is not null
     and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and (auth.uid() is null
          or po.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
$function$;

revoke all on function public.marginalita_costo_oda(uuid) from public, anon;
revoke all on function public.marginalita_costo_oda() from public, anon;
