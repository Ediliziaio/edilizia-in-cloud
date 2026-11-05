-- «Riporta da incassare» riapriva la fattura anche quando l'incasso non era solo sulla fattura:
-- una scadenza pagata dallo scadenzario ha il suo movimento in prima nota e resta pagata, e
-- segnando di nuovo l'incasso si contava due volte; un bonifico agganciato alla rata o alla
-- scadenza restava collegato. In questi casi ora si rifiuta, con il motivo. Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.fattura_importata_torna_da_incassare(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f record;
  v_pagamento uuid;
begin
  select i.id, i.company_id, i.external_provider, i.document_type, i.status, i.deleted_at
    into f
    from public.invoices i
   where i.id = p_invoice_id
   for update;
  if not found then
    raise exception 'Fattura non trovata' using errcode = 'P0002';
  end if;
  if auth.uid() is not null and (
       public.user_can_access_company(f.company_id) is not true
       or not public.puo_incassare_fatture(f.company_id)) then
    raise exception 'Non hai il permesso di modificare gli incassi di questa fattura.' using errcode = '42501';
  end if;
  if f.deleted_at is not null or f.status in ('cancelled', 'credited', 'draft')
     or f.document_type in ('credit_note', 'nota_credito', 'TD04', 'TD08') then
    raise exception 'Questo documento non si incassa.' using errcode = '23514';
  end if;
  if f.external_provider is distinct from 'xml_import' then
    raise exception 'Questa fattura arriva da un gestionale collegato: l''incasso si annulla dal suo storico.' using errcode = '23514';
  end if;

  if exists (select 1 from public.scadenze s
              where s.invoice_id = f.id and s.prima_nota_entry_id is not null
                and s.status in ('pagata', 'parziale')) then
    raise exception 'Questa fattura è stata incassata dallo scadenzario: annulla prima l''incasso dallo scadenzario.' using errcode = '23514';
  end if;
  if exists (select 1 from public.bank_transactions t
              where t.linked_scadenza_id in (select s.id from public.scadenze s where s.invoice_id = f.id)
                 or t.linked_installment_id in (select r.id from public.order_installments r where r.invoice_id = f.id)) then
    raise exception 'Un bonifico è agganciato alla scadenza o alla rata di questa fattura: sgancialo prima dalla Tesoreria.' using errcode = '23514';
  end if;

  for v_pagamento in select p.id from public.invoice_payments p where p.invoice_id = f.id loop
    perform public.annulla_pagamento_importata(v_pagamento);
  end loop;

  -- storico_esterno a false: senza, una fattura senza scadenza non ne avrebbe mai una.
  update public.invoices
     set paid_amount = 0,
         payment_date = null,
         storico_esterno = false,
         status = case when status = 'paid' then 'issued' else status end,
         updated_at = now()
   where id = f.id;

  -- Anche qui e non solo nel trigger della fattura: quello ingoia gli errori, e dire «fatto»
  -- con la rata ancora incassata sarebbe falso. Copre anche la rata di una fattura in parte pagata.
  update public.order_installments
     set is_paid = false, paid_date = null
   where invoice_id = f.id and is_paid;
end;
$function$;

revoke all on function public.fattura_importata_torna_da_incassare(uuid) from public, anon;
grant execute on function public.fattura_importata_torna_da_incassare(uuid) to authenticated, service_role;
