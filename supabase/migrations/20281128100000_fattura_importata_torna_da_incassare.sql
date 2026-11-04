-- Una fattura emessa importata da XML si poteva segnare incassata, ma non tornare indietro:
-- lo storico arriva già «pagato» senza righe in invoice_payments, quindi non c'era niente da
-- annullare, e il pulsante «Segna pagata» restava nascosto. Idempotente, nessun dato toccato.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La rata della commessa segue la fattura in tutte e due le direzioni, e prende la data vera
-- dell'incasso. Prima prendeva sempre la data di oggi e, annullato l'incasso, restava incassata.
create or replace function public.incassa_rata_da_fattura_pagata()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _pagata_prima boolean;
  _pagata_ora boolean;
begin
  -- "Pagata" senza fidarsi di un solo campo: alcuni provider aggiornano lo
  -- stato, altri solo l'importo incassato. Tolleranza di un centesimo.
  _pagata_ora := (
    (coalesce(new.paid_amount, 0) >= coalesce(new.total, 0) - 0.01 and coalesce(new.total, 0) > 0)
    or lower(coalesce(new.status::text, '')) in ('paid', 'pagata', 'incassata')
  );
  _pagata_prima := (
    (coalesce(old.paid_amount, 0) >= coalesce(old.total, 0) - 0.01 and coalesce(old.total, 0) > 0)
    or lower(coalesce(old.status::text, '')) in ('paid', 'pagata', 'incassata')
  );

  if _pagata_ora and not _pagata_prima then
    update public.order_installments
       set is_paid   = true,
           paid_date = coalesce(paid_date, new.payment_date, (now() at time zone 'Europe/Rome')::date)
     where invoice_id = new.id
       and is_paid = false;
  elsif _pagata_prima and not _pagata_ora and new.external_provider = 'xml_import' then
    -- Solo da XML: lo stato degli altri gestionali può oscillare a ogni allineamento.
    update public.order_installments
       set is_paid = false, paid_date = null
     where invoice_id = new.id
       and is_paid = true;
  end if;

  return new;
exception when others then
  raise log 'incassa_rata_da_fattura_pagata error: %', sqlerrm;
  return new;
end;
$function$;

-- «Non è ancora incassata»: toglie gli incassi registrati (liberando l'eventuale bonifico) e il
-- pagato arrivato con l'import. Solo da XML: per gli altri gestionali il dato torna da là.
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
     or f.document_type in ('credit_note', 'nota_credito') then
    raise exception 'Questo documento non si incassa.' using errcode = '23514';
  end if;
  if f.external_provider is distinct from 'xml_import' then
    raise exception 'Questa fattura arriva da un gestionale collegato: l''incasso si annulla dal suo storico.' using errcode = '23514';
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
end;
$function$;

revoke all on function public.fattura_importata_torna_da_incassare(uuid) from public, anon;
grant execute on function public.fattura_importata_torna_da_incassare(uuid) to authenticated, service_role;
