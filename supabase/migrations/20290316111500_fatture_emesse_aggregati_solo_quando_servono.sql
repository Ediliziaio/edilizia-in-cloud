-- Gli aggregati restituiscono sempre una riga: LEFT LATERAL permette al planner
-- di ometterli da COUNT e filtri che non li usano. Con CROSS LATERAL anche il
-- solo conteggio rileggeva le commesse con le loro RLS per tutte le fatture.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.documenti_fiscali_elenco_operativo
with (security_invoker = true) as
select e.*,
  coalesce(d.note_interne, i.note_interne) as note_interne,
  coalesce(d.metodo_pagamento_nome, d.metodo_pagamento_codice, i.payment_method) as metodo_pagamento_nome,
  coalesce(d.ordine_id, i.order_id) as ordine_id,
  coalesce(d.pdf_url, i.pdf_url) as pdf_url,
  coalesce(d.scadenze_pagamento, '[]'::jsonb) as scadenze_pagamento,
  coalesce(d.allegati, '[]'::jsonb) as allegati,
  s.stornato,
  round(e.totale_da_pagare - e.importo_pagato - s.stornato, 2) as elenco_residuo,
  r.prossima as elenco_prossima_scadenza,
  case
    when e.stato in ('bozza', 'annullata', 'stornata') or e.tipo in ('nota_credito','ddt','preventivo') then 'non_previsto'
    when round(e.totale_da_pagare - e.importo_pagato - s.stornato, 2) <= 0 then 'incassata'
    when e.importo_pagato > 0 then 'parziale'
    else 'da_incassare'
  end as elenco_incasso,
  (coalesce(nullif(btrim(e.note_documento), ''), nullif(btrim(coalesce(d.note_interne, i.note_interne)), '')) is not null) as elenco_con_note,
  a.conteggio + case when jsonb_typeof(d.allegati) = 'array' then jsonb_array_length(d.allegati) else 0 end as elenco_allegati,
  coalesce(c.commesse, '[]'::jsonb) as commesse,
  coalesce(c.testo, '') as elenco_commesse
from public.documenti_fiscali_elenco_con_importate e
left join public.documenti_fiscali d on e.origine = 'nativa' and d.id = e.id and d.company_id = e.company_id
left join public.invoices i on e.origine = 'importata' and i.id = e.id and i.company_id = e.company_id
left join lateral (
  -- Stessa regola di documento_stornato_totale/stornatoDellaFattura.
  -- Le importate sono GIA' normalizzate nell'hub: non sottrarre due volte.
  select coalesce(sum(abs(coalesce(nc.totale_da_pagare, nc.totale_documento, 0))), 0) as stornato
  from public.documenti_fiscali nc
  where e.origine = 'nativa' and nc.company_id = e.company_id
    and nc.documento_correlato_id = e.id and nc.tipo = 'nota_credito'
    and nc.stato not in ('bozza', 'annullata', 'rifiutata')
    and upper(coalesce(nc.sdi_stato, '')) <> 'NS' and nc.deleted_at is null
) s on true
left join lateral (
  select count(*)::integer as conteggio from public.fattura_allegati fa
  where fa.company_id = e.company_id and (
    (e.origine = 'nativa' and fa.documento_fiscale_id = e.id) or
    (e.origine = 'importata' and fa.invoice_id = e.id))
) a on true
left join lateral (
  select jsonb_agg(jsonb_build_object('id', o.id, 'codice', o.order_code, 'descrizione', o.description) order by o.order_code, o.id) as commesse,
    string_agg(concat_ws(' ', o.order_code, o.description), ' ' order by o.order_code, o.id) as testo
  from (
    select coalesce(d.ordine_id, i.order_id) as id
    where coalesce(d.ordine_id, i.order_id) is not null
    union
    select fo.ordine_id from public.fattura_ordine fo
    where e.origine = 'nativa' and fo.company_id = e.company_id and fo.fattura_id = e.id
  ) collegata
  join public.orders o on o.id = collegata.id and o.company_id = e.company_id and o.deleted_at is null
) c on true
left join lateral (
  -- L'import conserva le rate nel formato scadenza/pagata_il; il nativo usa
  -- data_scadenza/pagato. Nessuna ripartizione degli incassi viene riscritta.
  select case
    when e.origine = 'nativa' and jsonb_array_length(case when jsonb_typeof(d.scadenze_pagamento) = 'array' then d.scadenze_pagamento else '[]'::jsonb end) > 0 then
      (select min(case when pg_input_is_valid(rata->>'data_scadenza', 'date') then (rata->>'data_scadenza')::date end) from jsonb_array_elements(d.scadenze_pagamento) rata
       where coalesce(rata->>'pagato', 'false') <> 'true' and rata->>'data_scadenza' ~ '^\d{4}-\d{2}-\d{2}$')
    when e.origine = 'importata' and jsonb_array_length(case when jsonb_typeof(i.piano_pagamento) = 'array' then i.piano_pagamento else '[]'::jsonb end) > 0 then
      (select min(case when pg_input_is_valid(rata->>'scadenza', 'date') then (rata->>'scadenza')::date end) from jsonb_array_elements(i.piano_pagamento) rata
       where nullif(rata->>'pagata_il', '') is null and rata->>'scadenza' ~ '^\d{4}-\d{2}-\d{2}$')
    else e.data_scadenza
  end as prossima
) r on true;

comment on view public.documenti_fiscali_elenco_operativo is
  'Fatture emesse: note, allegati, commesse e incassi aggregati; security_invoker, nessuna scrittura o duplicazione delle righe.';
revoke all on public.documenti_fiscali_elenco_operativo from public, anon;
grant select on public.documenti_fiscali_elenco_operativo to authenticated, service_role;
