-- Revisioni leggere dei preventivi: la copia sa da chi nasce.
--
-- "Nuova revisione" duplica il preventivo e lo aggancia al padre con
-- parent_quote_id + revision_number progressivo. Nessuna macchina a stati
-- nuova: la revisione E' un preventivo normale (bozza), il legame serve a
-- mostrarlo per quello che e' e a ritrovare la storia.

alter table public.quotes
  add column if not exists parent_quote_id uuid references public.quotes(id) on delete set null;

alter table public.quotes
  add column if not exists revision_number integer;

create index if not exists idx_quotes_parent_quote_id
  on public.quotes (parent_quote_id)
  where parent_quote_id is not null;

comment on column public.quotes.parent_quote_id is
  'Preventivo da cui questa revisione e'' nata (Nuova revisione). NULL per i preventivi originali e per le copie semplici.';
comment on column public.quotes.revision_number is
  'Numero progressivo di revisione rispetto al padre (1 = prima revisione). NULL se non e'' una revisione.';
