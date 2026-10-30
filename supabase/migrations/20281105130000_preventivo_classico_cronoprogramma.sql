-- Il cronoprogramma nel preventivo classico (31/10/2026), come nei preventivatori edili: le fasi del
-- cantiere e quanto durano, scritte su QUESTO preventivo ({ fase, durata, descrizione }, come
-- rst_progetti.cronoprogramma). Il PDF le stampa nella pagina «Cronoprogramma».
-- Colonna nuova senza valore da calcolare: istantanea, nessuna riga riscritta.

set local lock_timeout = '3s';

alter table public.quotes add column if not exists cronoprogramma jsonb;
alter table public.quotes drop constraint if exists quotes_cronoprogramma_check;
alter table public.quotes add constraint quotes_cronoprogramma_check
  check (cronoprogramma is null or (jsonb_typeof(cronoprogramma) = 'array' and jsonb_array_length(cronoprogramma) <= 20));

comment on column public.quotes.cronoprogramma is 'Le fasi del cantiere di questo preventivo: [{fase, durata, descrizione}]. Null = quelle del modello.';
