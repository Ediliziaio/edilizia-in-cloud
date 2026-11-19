-- Impostazioni grafiche del logo, condivise da anteprima e stampa dei documenti.
-- Nessuna anagrafica esistente viene aggiornata. RLS e grant della tabella restano attivi.
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table public.anagrafica_azienda add column if not exists pdf_logo jsonb not null default '{}'::jsonb;
alter table public.anagrafica_azienda drop constraint if exists anagrafica_azienda_pdf_logo_oggetto;
alter table public.anagrafica_azienda add constraint anagrafica_azienda_pdf_logo_oggetto
  check (jsonb_typeof(pdf_logo)='object' and pg_column_size(pdf_logo)<=2048);
comment on column public.anagrafica_azienda.pdf_logo is 'Posizione, dimensione percentuale e distanza superiore del logo della copia PDF.';
notify pgrst,'reload schema';
