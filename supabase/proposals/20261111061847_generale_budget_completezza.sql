-- Local hardening, applied after the native general-project migrations (20281031).
-- Kept as a proposal because the repository's historical migrations use future timestamps.
-- Existing RLS and approval authorization remain authoritative. No new exposed table or definer.
create or replace function public.generale_budget_completo_guardia()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.stato = 'approvata' and old.stato is distinct from 'approvata' then
    if not exists (select 1 from public.generale_piano_voci where versione_id = new.id and importo > 0)
       or exists (select 1 from public.generale_piano_voci where versione_id = new.id and (
         nullif(btrim(descrizione), '') is null or importo < 0
         or position('[EIC:DA_STIMARE]' in coalesce(nota, '')) > 0
         or (importo > 0 and mese is null)
         or coalesce(nota, '') ~ '[1-9][0-9]* voci da correggere escluse')) then
      raise exception 'Budget incompleto: completa stime, descrizioni e calendario prima di approvare.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.generale_budget_completo_guardia() from public;
drop trigger if exists generale_budget_completo_guardia on public.generale_piano_versioni;
create trigger generale_budget_completo_guardia before update of stato on public.generale_piano_versioni
for each row execute function public.generale_budget_completo_guardia();

-- The source marker is immutable provenance at the row level, including across copied revisions.
create unique index if not exists generale_piano_fonte_unica
on public.generale_piano_voci (versione_id, (substring(nota from '\[EIC-BP:[a-f0-9]{64}:[^]]+:[0-9]+\]')))
where nota like '%[EIC-BP:%';

create or replace function public.fattura_riga_ordine_azienda_guardia()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(new.righe) = 'array' and exists (
    select 1 from jsonb_array_elements(new.righe) r
    where nullif(r->>'purchase_order_item_id', '') is not null and not exists (
      select 1 from public.purchase_order_items i where i.id::text = r->>'purchase_order_item_id' and i.company_id = new.company_id)) then
    raise exception 'La riga di ordine non appartiene alla società della fattura.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.fattura_riga_ordine_azienda_guardia() from public;
drop trigger if exists fattura_riga_ordine_azienda_guardia on public.fatture_ricevute;
create trigger fattura_riga_ordine_azienda_guardia before insert or update of righe, company_id on public.fatture_ricevute
for each row execute function public.fattura_riga_ordine_azienda_guardia();
