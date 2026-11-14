-- Fase 5 del piano anomalie (14/11/2026) — fatture emesse importate «pagate» senza incasso.
--
-- Verifica sui dati del 14/11 (sola lettura): l'import da XML (importa-fattura-attiva-xml) le crea sempre
-- «issued» con pagato 0. Le 344 «paid» senza alcun incasso registrato sono state segnate così dopo:
-- 253 di un'azienda (187 come storico 2025, 66 del 2026 fino al 31/08, su indicazione del titolare del
-- 04/11, data di pagamento = scadenza) e 91 di un'altra, importate con la chiave di servizio il 04/11
-- con la data di pagamento già scritta. Nessuna ha un incasso in invoice_payments, una scadenza incassata
-- dallo scadenzario (prima nota) o un bonifico abbinato: il «pagato» non ha prova.
--
-- 1. fatture_importate_senza_incasso(azienda): quali sono, per mostrarle come tali (security invoker:
--    ognuno vede solo ciò che le sue regole gli fanno leggere).
-- 2. Un'importata da XML non nasce più pagata senza la data dell'incasso.
-- Nessuna riga scritta: riportarle da incassare resta una scelta di chi le guarda.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.fatture_importate_senza_incasso(p_company_id uuid)
returns table (invoice_id uuid, pagato numeric, data_pagamento date, storico boolean)
language sql stable security invoker set search_path = public as $$
  select i.id, i.paid_amount, i.payment_date, coalesce(i.storico_esterno, false)
    from public.invoices i
   where i.company_id = p_company_id
     and i.external_provider = 'xml_import'
     and i.deleted_at is null
     and coalesce(i.paid_amount, 0) > 0
     and coalesce(i.status, '') not in ('cancelled', 'credited', 'draft')
     and coalesce(i.document_type, '') not in ('credit_note', 'nota_credito', 'TD04', 'TD08')
     and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id)
     and not exists (select 1 from public.scadenze s where s.invoice_id = i.id and s.prima_nota_entry_id is not null)
     and not exists (select 1 from public.bank_transactions t
                      where t.linked_scadenza_id in (select s.id from public.scadenze s where s.invoice_id = i.id)
                         or t.linked_installment_id in (select r.id from public.order_installments r where r.invoice_id = i.id))
$$;
revoke all on function public.fatture_importate_senza_incasso(uuid) from public, anon;
grant execute on function public.fatture_importate_senza_incasso(uuid) to authenticated, service_role;

create or replace function public.emessa_xml_non_nasce_pagata()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.external_provider = 'xml_import'
     and (new.status = 'paid' or coalesce(new.paid_amount, 0) > 0)
     and new.payment_date is null then
    raise exception 'Una fattura importata da XML non nasce pagata senza la data dell''incasso: importala da incassare e registra l''incasso.'
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.emessa_xml_non_nasce_pagata() from public, anon, authenticated;

drop trigger if exists trg_emessa_xml_non_nasce_pagata on public.invoices;
create trigger trg_emessa_xml_non_nasce_pagata before insert on public.invoices
  for each row execute function public.emessa_xml_non_nasce_pagata();
