-- L'ordine dei capitoli e le pagine libere nel documento degli otto moduli edili.
--
-- I Serramenti e il Fotovoltaico permettevano già di riordinare le pagine del
-- preventivo; i moduli edili no: i capitoli uscivano sempre nello stesso ordine
-- e non si poteva aggiungere una pagina propria (certificazioni, showroom, un
-- lavoro di cui si va fieri).
--
-- pdf_ordine_capitoli: [{ "chiave": "chiSiamo", "visibile": true }, …].
--   NULL = l'ordine di serie. Chiavi sconosciute si ignorano, quelle mancanti
--   prendono il loro posto di serie (src/components/preventivi/pdf/ordineCapitoli.ts).
-- pdf_pagine_libere: [{ "id", "occhiello", "titolo", "testoHtml", "fotoUrl", "didascalia" }].

do $$
declare t text;
begin
  foreach t in array array[
    'rst_template_pdf', 'bgn_template_pdf', 'tet_template_pdf', 'clm_template_pdf',
    'ele_template_pdf', 'idr_template_pdf', 'pav_template_pdf', 'pis_template_pdf'
  ] loop
    execute format('alter table public.%I add column if not exists pdf_ordine_capitoli jsonb', t);
    execute format('alter table public.%I add column if not exists pdf_pagine_libere jsonb not null default ''[]''::jsonb', t);
    execute format(
      'comment on column public.%I.pdf_ordine_capitoli is %L', t,
      'Ordine e visibilità dei capitoli del PDF: [{chiave, visibile}]. NULL = ordine di serie.');
    execute format(
      'comment on column public.%I.pdf_pagine_libere is %L', t,
      'Pagine scritte dall''azienda nel PDF: [{id, occhiello, titolo, testoHtml, fotoUrl, didascalia}].');
  end loop;
end $$;
