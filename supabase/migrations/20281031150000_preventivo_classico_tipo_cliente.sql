-- Il preventivo classico sa se il cliente è privato, azienda o Pubblica Amministrazione (31/10/2026).
-- Ragione sociale, codice fiscale e partita IVA c'erano già (client_company, client_fiscal_code,
-- client_vat_number); mancavano il tipo, senza il quale un preventivo per un ente pubblico si
-- riapriva come «Azienda», e il codice univoco ufficio della fattura elettronica dell'ente.
-- Colonne nuove senza valore da calcolare: istantanee, nessuna riga riscritta.

set local lock_timeout = '3s';

alter table public.quotes add column if not exists client_tipo text;
alter table public.quotes drop constraint if exists quotes_client_tipo_check;
alter table public.quotes add constraint quotes_client_tipo_check check (client_tipo is null or client_tipo in ('privato', 'azienda', 'pa'));
alter table public.quotes add column if not exists client_codice_univoco text;

comment on column public.quotes.client_tipo is 'Privato, azienda o pa (Pubblica Amministrazione). Null = preventivo di prima: lo dicono ragione sociale e partita IVA.';
comment on column public.quotes.client_codice_univoco is 'Pubblica Amministrazione: codice univoco ufficio della fattura elettronica (6 caratteri).';
