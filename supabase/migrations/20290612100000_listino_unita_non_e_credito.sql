-- Il listino di un'unità ancora in vendita non è un credito (URBAN VISION, 26/11/2026).
--
-- Nello Scadenzario di URBAN VISION comparivano 44 righe «da incassare» per
-- 11.556.600 € — il listino ivato delle 44 unità delle tre operazioni — senza
-- data e senza acquirente. Nessuno ha venduto niente: le unità nascono
-- `stato_vendita = 'libera'` e la loro commessa nasce con lo stato predefinito
-- dell'azienda («Contratto Firmato») e col listino come `total_amount`.
--
-- `rate_da_incassare` ha tre fonti; la terza è lo «scoperto»: la parte del
-- totale della commessa che nessuna rata copre. Per una commessa senza piano
-- lo scoperto è il totale intero, e per un'unità il totale è il listino.
-- L'elenco delle commesse già non lo conta (`unitaInVendita` in
-- `useCommesseGenerali.ts`, main `02fee1086` del 14/11/2026): lo stesso vale
-- qui, così Scadenzario, cruscotto e previsionale di cassa dicono la stessa cosa.
--
-- Resta dentro ciò che qualcuno ha **pianificato** a mano su quell'unità (una
-- caparra, un saldo previsto al rogito con la sua data): è una previsione
-- voluta, non il listino preso per un credito.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.rate_da_incassare(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (
    select o.id,
           case when o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura'
             then coalesce((select sum(c.credito_lordo) from public.commessa_documenti_credito(p_company) c where c.order_id=o.id),0)
             else round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' and o.financing_cost_mode is distinct from 'separato' then coalesce(o.financing_cost, 0) else 0 end - round(coalesce((select sum(um.importo) from public.unita_movimenti um join public.unita_immobiliari ui on ui.id=um.unita_id where ui.order_id=o.id and ui.company_id=o.company_id and um.tipo='permuta' and um.stornato_at is null),0)*(1+coalesce(o.vat_rate,22)/100),2) end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company)),
  incassato as (select x.order_id, sum(x.importo) as i from public.rate_incassi(p_company) x group by x.order_id),
  righe as (
    select r.order_id, r.installment_id, r.expected_date,
           greatest(0, r.importo - coalesce((select q.incassato+q.non_esigibile from private.quote_fattura_rate(d.id) q where q.rata_id=r.installment_id),d.importo_pagato,0)
                     - case when d.id is null then 0 else public.documento_stornato_totale(d.id) end) as residuo,
           r.type = 'financing' as finanziamento
      from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
     where not r.is_paid and not exists(select 1 from public.orders oo where oo.id=r.order_id and oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura')
    union all
    select c.order_id,coalesce(c.documento_id,c.invoice_id),c.scadenza,greatest(0,c.credito_lordo-c.pagato_lordo),false
      from public.commessa_documenti_credito(p_company) c join public.orders oo on oo.id=c.order_id
     where oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura'
    union all
    -- La parte del totale che nessuna rata copre: piano senza saldo, variante dopo il saldo pagato,
    -- o commessa senza alcun piano (deve tutto il suo totale).
    -- Mai per un'unità ancora in vendita: il suo totale è il listino, non un credito.
    select s.order_id, null::uuid, null::date, s.scoperto, false
      from (select o.id as order_id, round(o.totale - coalesce(sum(r.importo), 0), 2) as scoperto
              from o left join r on r.order_id = o.id
             group by o.id, o.totale) s
     where s.scoperto > 0
       and not exists(select 1 from public.unita_immobiliari ui
                       where ui.order_id = s.order_id and ui.company_id = p_company
                         and ui.stato_vendita::text in ('libera','prenotata'))
  ),
  ordinate as (
    select righe.*,
           sum(righe.residuo) over (partition by righe.order_id
                                    order by righe.expected_date nulls last, righe.installment_id nulls last
                                    rows unbounded preceding) as cumulato
      from righe
  )
  -- Mai oltre il totale meno l'incassato: l'eccedenza del piano si toglie dalle rate più lontane.
  select ord.order_id, ord.installment_id, ord.expected_date,
         greatest(0, least(ord.residuo, greatest(0, o.totale - coalesce(inc.i, 0)) - (ord.cumulato - ord.residuo))),
         ord.finanziamento
    from ordinate ord
    join o on o.id = ord.order_id
    left join incassato inc on inc.order_id = ord.order_id
$function$;
