-- Liste contatti DINAMICHE: la lista salva i FILTRI, non i membri.
--
-- Le liste opportunità hanno filters jsonb da sempre; quelle contatti erano
-- solo statiche (membri materializzati a mano, mai aggiornati da soli).
-- Con questa colonna una lista può essere "la query": i contatti che
-- matchano entrano ed escono da soli, niente membri da mantenere.
-- null = lista statica classica a membri, comportamento invariato.

alter table public.marketing_contact_lists
  add column if not exists filters jsonb;

comment on column public.marketing_contact_lists.filters is
  'Filtri ContactFilters (groups/rules del ContactFiltersSheet) per liste dinamiche: aprirla applica i filtri alla vista contatti. null = lista statica a membri.';
