-- L'anno fiscale della fattura viene dalla DATA della fattura, non da oggi.
--
-- invoices.invoice_year nasce con `DEFAULT EXTRACT(YEAR FROM NOW())` e nessuno
-- lo valorizza all'import: ogni fattura importata veniva marcata con l'anno in
-- cui è avvenuto l'import. Su prod: 201 fatture tutte "2026", con date reali
-- che vanno dal 2021 al 2026 (158 righe sbagliate).
--
-- Non è un dettaglio anagrafico. invoice_year regge:
--   · i report e i filtri per anno;
--   · generate_invoice_number(), che calcola il progressivo successivo con
--     `where invoice_year = p_year`: con cinque anni di documenti ammassati
--     sul 2026 la numerazione nativa parte da un numero che non c'entra;
--   · la lettura umana della lista, dove otto documenti di anni diversi
--     sembravano tutti "il numero 2 del 2026" — duplicati apparenti che
--     duplicati non erano.
--
-- Il trigger lo rende vero per SEMPRE e per QUALUNQUE scrittura (import FIC,
-- import XML, fattura nativa, AI): la data comanda.

create or replace function public.sincronizza_anno_fiscale_fattura()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.issue_date is not null then
    new.invoice_year := extract(year from new.issue_date)::int;
  end if;
  return new;
end $$;

drop trigger if exists trg_invoices_anno_fiscale on public.invoices;
create trigger trg_invoices_anno_fiscale
  before insert or update of issue_date, invoice_year on public.invoices
  for each row execute function public.sincronizza_anno_fiscale_fattura();

comment on function public.sincronizza_anno_fiscale_fattura() is
  'invoice_year sempre allineato all''anno di issue_date: il default EXTRACT(YEAR FROM NOW()) marcava le fatture importate con l''anno dell''import.';

-- Backfill: nessun dato inventato, l'anno è già scritto nella data di emissione.
update public.invoices
   set invoice_year = extract(year from issue_date)::int
 where issue_date is not null
   and invoice_year is distinct from extract(year from issue_date)::int;
