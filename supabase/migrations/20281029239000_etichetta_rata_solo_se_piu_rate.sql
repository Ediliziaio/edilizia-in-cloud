-- ════════════════════════════════════════════════════════════════════════════
-- «RiBa 1 di 4» sì, «rata 1 di 1» no
-- ════════════════════════════════════════════════════════════════════════════
-- Correzione di 20281029238000: `v_uscite_stato.etichetta_prossima_uscita`
-- valeva anche per i costi a una rata sola, e l'avviso del mattino avrebbe
-- scritto «1.300,00 € · rata 1 di 1». Un'etichetta che non dice niente è
-- rumore: si mostra solo quando le rate sono più di una.
--
-- L'importo resta quello della rata anche per i costi a rata unica: è il
-- lordo del documento, cioè quello che esce davvero dal conto. Prima l'avviso
-- diceva l'imponibile del costo, senza IVA.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
  pr.importo as importo_prossima_uscita,
  case when pr.rate_totali > 1 then pr.etichetta end as etichetta_prossima_uscita
from public.company_costs c
cross join lateral (
  select public.data_pagamento_uscita(c.trigger_evento, c.due_date, c.giorni_dilazione,
                                       c.id, c.purchase_order_id, c.order_id) as data_pagamento
) d
left join lateral (
  select sum(r.importo) as importo,
         max(t.n) as rate_totali,
         string_agg(
           (case when r.metodo = 'riba' then 'RiBa' else 'rata' end) || ' ' || r.numero || ' di ' || t.n,
           ', ' order by r.numero
         ) as etichetta
    from public.rate_fornitori r
    cross join lateral (
      select count(*) as n from public.rate_fornitori t0 where t0.company_cost_id = c.id
    ) t
   where r.company_cost_id = c.id
     and r.stato <> 'pagata'
     and r.scadenza = (select min(x.scadenza) from public.rate_fornitori x
                        where x.company_cost_id = c.id and x.stato <> 'pagata')
) pr on true;
