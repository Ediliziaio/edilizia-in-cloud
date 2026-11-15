-- Allegati sul movimento bancario: la contabile del bonifico, la ricevuta, il
-- modulo F24 quietanzato, un contratto. Stessa tabella e stesso contenitore
-- degli allegati di fatture, costi e F24 (fattura_allegati, fatture-allegati),
-- con una madre in più. Stesse regole di accesso: chi vede la fatturazione.

alter table public.fattura_allegati
  add column if not exists bank_transaction_id uuid references public.bank_transactions(id) on delete cascade;

create index if not exists fattura_allegati_bank_transaction_idx
  on public.fattura_allegati (bank_transaction_id) where bank_transaction_id is not null;

alter table public.fattura_allegati drop constraint if exists fattura_allegati_una_madre;
alter table public.fattura_allegati add constraint fattura_allegati_una_madre
  check (num_nonnulls(invoice_id, documento_fiscale_id, fattura_ricevuta_id, company_cost_id, f24_entry_id, bank_transaction_id) = 1);

create or replace function public.fattura_allegati_stessa_azienda()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (new.invoice_id is not null and not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.company_id = new.company_id))
     or (new.documento_fiscale_id is not null and not exists (select 1 from public.documenti_fiscali d where d.id = new.documento_fiscale_id and d.company_id = new.company_id))
     or (new.fattura_ricevuta_id is not null and not exists (select 1 from public.fatture_ricevute r where r.id = new.fattura_ricevuta_id and r.company_id = new.company_id))
     or (new.company_cost_id is not null and not exists (select 1 from public.company_costs c where c.id = new.company_cost_id and c.company_id = new.company_id))
     or (new.f24_entry_id is not null and not exists (select 1 from public.f24_entries f where f.id = new.f24_entry_id and f.company_id = new.company_id))
     or (new.bank_transaction_id is not null and not exists (select 1 from public.bank_transactions b where b.id = new.bank_transaction_id and b.company_id = new.company_id)) then
    raise exception using errcode = '42501', message = 'Il documento non è di questa azienda.';
  end if;
  return new;
end $function$;

-- La funzione di trigger non serve a nessuno come RPC.
revoke all on function public.fattura_allegati_stessa_azienda() from public, anon, authenticated;

drop trigger if exists fattura_allegati_stessa_azienda on public.fattura_allegati;
create trigger fattura_allegati_stessa_azienda
  before insert or update of company_id, invoice_id, documento_fiscale_id, fattura_ricevuta_id, company_cost_id, f24_entry_id, bank_transaction_id
  on public.fattura_allegati
  for each row execute function public.fattura_allegati_stessa_azienda();
