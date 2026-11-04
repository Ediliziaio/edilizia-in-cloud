-- Uscite senza fattura e allegati su costi e F24 (richiesta di un cliente, vale per tutti).
-- La richiesta era una «fattura fittizia»: qui è un documento di spesa interno, cioè un costo senza_fattura
-- col suo riferimento, il mese di competenza e più allegati. Non passa da fatture_ricevute: così resta
-- fuori dal registro IVA e dagli export per costruzione, invece di doverlo escludere da ogni lettore.
-- Gli allegati dei costi e degli F24 stanno in fattura_allegati e seguono i suoi permessi (fatturazione).
-- Tabelle esistenti: solo colonne nullable e check sostituito. Nessuna riga scritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.company_costs
  add column if not exists documento_riferimento text,
  add column if not exists documento_data date,
  add column if not exists mese_competenza date,
  add column if not exists mezzo_id uuid references public.mezzi(id) on delete set null;
create index if not exists company_costs_mezzo on public.company_costs (mezzo_id) where mezzo_id is not null;

create or replace function public.company_cost_mezzo_stessa_azienda()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.mezzo_id is not null and not exists (select 1 from public.mezzi m where m.id = new.mezzo_id and m.company_id = new.company_id) then
    raise exception 'Il mezzo appartiene a un''altra azienda.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.company_cost_mezzo_stessa_azienda() from public, anon, authenticated;
drop trigger if exists company_cost_mezzo_stessa_azienda on public.company_costs;
create trigger company_cost_mezzo_stessa_azienda before insert or update of mezzo_id, company_id on public.company_costs
  for each row execute function public.company_cost_mezzo_stessa_azienda();

alter table public.fattura_allegati
  add column if not exists company_cost_id uuid references public.company_costs(id) on delete cascade,
  add column if not exists f24_entry_id uuid references public.f24_entries(id) on delete cascade;
create index if not exists fattura_allegati_costo_idx on public.fattura_allegati (company_cost_id) where company_cost_id is not null;
create index if not exists fattura_allegati_f24_idx on public.fattura_allegati (f24_entry_id) where f24_entry_id is not null;

alter table public.fattura_allegati drop constraint if exists fattura_allegati_una_madre;
alter table public.fattura_allegati add constraint fattura_allegati_una_madre
  check (num_nonnulls(invoice_id, documento_fiscale_id, fattura_ricevuta_id, company_cost_id, f24_entry_id) = 1) not valid;
alter table public.fattura_allegati validate constraint fattura_allegati_una_madre;

create or replace function public.fattura_allegati_stessa_azienda()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if (new.invoice_id is not null and not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.company_id = new.company_id))
     or (new.documento_fiscale_id is not null and not exists (select 1 from public.documenti_fiscali d where d.id = new.documento_fiscale_id and d.company_id = new.company_id))
     or (new.fattura_ricevuta_id is not null and not exists (select 1 from public.fatture_ricevute r where r.id = new.fattura_ricevuta_id and r.company_id = new.company_id))
     or (new.company_cost_id is not null and not exists (select 1 from public.company_costs c where c.id = new.company_cost_id and c.company_id = new.company_id))
     or (new.f24_entry_id is not null and not exists (select 1 from public.f24_entries f where f.id = new.f24_entry_id and f.company_id = new.company_id)) then
    raise exception using errcode = '42501', message = 'Il documento non è di questa azienda.';
  end if;
  return new;
end $function$;

drop trigger if exists fattura_allegati_stessa_azienda on public.fattura_allegati;
create trigger fattura_allegati_stessa_azienda before insert or update of company_id, invoice_id, documento_fiscale_id, fattura_ricevuta_id, company_cost_id, f24_entry_id
  on public.fattura_allegati for each row execute function public.fattura_allegati_stessa_azienda();
