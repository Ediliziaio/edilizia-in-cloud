-- Chi è in sola lettura non annulla pagamenti e incassi (27/11/2026, revisione prima della
-- pubblicazione). «Segna pagata» (blocca_saldo_rapido_ricevuta) e l'annullo dallo scadenzario
-- (annulla_incasso_scadenza) escludono già la sola lettura; le due strade inverse no:
-- - riapri_pagamenti_segnati (20290628100000) chiedeva solo puo_gestire_scadenze;
-- - fattura_importata_torna_da_incassare (20290628130000) solo puo_incassare_fatture.
-- Si aggiunge `utente_sola_lettura` a entrambe; il resto è identico.

create or replace function public.riapri_pagamenti_segnati(
  p_company uuid,
  p_costi uuid[] default null,
  p_rate uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n_costi integer := 0;
  n_rate integer := 0;
  tutte boolean := p_costi is null and p_rate is null;
begin
  if auth.uid() is null then
    raise exception 'Serve un utente autenticato' using errcode = '42501';
  end if;
  if public.user_can_access_company(p_company) is not true
     or public.puo_gestire_scadenze(p_company) is not true
     or coalesce(public.utente_sola_lettura(p_company), false) then
    raise exception 'Non hai il permesso di gestire i pagamenti ai fornitori.' using errcode = '42501';
  end if;

  -- Costo segnato pagato: si tocca solo `is_paid`, e a riaprire rate e fattura ci pensa
  -- `costo_allinea_rate_fornitori`. Si riaprono soltanto i costi con un residuo scoperto:
  -- un costo pagato davvero non viene sfiorato, nemmeno se passato nell'elenco.
  with da_riaprire as (
    select distinct c.id
      from public.rate_fornitori r
      join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     where r.company_id = p_company
       and r.stato = 'pagata'
       and coalesce(c.is_paid, false)
       and c.annullato_il is null
       and private.fornitore_residuo_rata(r) > 0.005
       and (tutte or c.id = any (p_costi) or r.id = any (p_rate))
  ), riaperti as (
    update public.company_costs c
       set is_paid = false, paid_date = null
      from da_riaprire d
     where c.id = d.id and c.company_id = p_company
    returning c.id
  )
  select count(*) into n_costi from riaperti;

  -- Costo già aperto ma rata rimasta «pagata» (una rata di più, segnata da sola): la si
  -- riporta da pagare. `rate_fornitori_prima_di_salvare` toglie `pagata_il` e scrive chi
  -- l'ha fatto; `rate_fornitori_allinea_costo` riallinea scadenza e stato del costo.
  with da_riaprire as (
    select r.id
      from public.rate_fornitori r
      join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     where r.company_id = p_company
       and r.stato = 'pagata'
       and not coalesce(c.is_paid, false)
       and c.annullato_il is null
       and private.fornitore_residuo_rata(r) > 0.005
       and (tutte or c.id = any (p_costi) or r.id = any (p_rate))
  ), riaperte as (
    update public.rate_fornitori r
       set stato = 'da_pagare', pagata_il = null
      from da_riaprire d
     where r.id = d.id and r.company_id = p_company
    returning r.id
  )
  select count(*) into n_rate from riaperte;

  return n_costi + n_rate;
end
$function$;

revoke all on function public.riapri_pagamenti_segnati(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.riapri_pagamenti_segnati(uuid, uuid[], uuid[]) to authenticated, service_role;

create or replace function public.fattura_importata_torna_da_incassare(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f record;
  v_pagamento uuid;
  v_scadenza uuid;
  v_bonifico record;
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
       or not public.puo_incassare_fatture(f.company_id)
       or coalesce(public.utente_sola_lettura(f.company_id), false)) then
    raise exception 'Non hai il permesso di modificare gli incassi di questa fattura.' using errcode = '42501';
  end if;
  if f.deleted_at is not null or f.status in ('cancelled', 'credited', 'draft')
     or f.document_type in ('credit_note', 'nota_credito', 'TD04', 'TD08') then
    raise exception 'Questo documento non si incassa.' using errcode = '23514';
  end if;
  if f.external_provider is null or f.external_provider not in ('xml_import', 'primanota') then
    raise exception 'Questa fattura arriva da un gestionale collegato: l''incasso si annulla dal suo storico.' using errcode = '23514';
  end if;

  -- L'unico blocco vero: un bonifico agganciato alla scadenza, alla rata o all'incasso dallo
  -- scadenzario. Si dice quale, perché in Tesoreria lo si cerca per data e importo.
  with agganci as (
    select t.id as transaction_id
      from public.bank_transactions t
     where t.company_id = f.company_id
       and (t.linked_scadenza_id in (select s.id from public.scadenze s where s.invoice_id = f.id)
            or t.linked_installment_id in (select r.id from public.order_installments r where r.invoice_id = f.id))
    union
    select p.bank_transaction_id
      from public.prima_nota_entries p
      join public.scadenze s on s.id = p.scadenza_id
     where s.invoice_id = f.id and p.company_id = f.company_id
       and p.is_auto and p.auto_source = 'scadenzario' and p.bank_transaction_id is not null
    union
    select b.transaction_id
      from public.bank_reconciliations b
      join public.scadenze s on s.id = b.scadenza_id
     where s.invoice_id = f.id and b.unmatched_at is null and b.transaction_id is not null
  )
  select a.transaction_id, t.booking_date, t.value_date, t.amount
    into v_bonifico
    from agganci a
    left join public.bank_transactions t on t.id = a.transaction_id
   order by coalesce(t.booking_date, t.value_date) nulls last
   limit 1;
  if found then
    if v_bonifico.amount is not null then
      raise exception 'Un bonifico è agganciato a questa fattura: sgancialo da Tesoreria → movimento del % da % €, poi riprova.',
        to_char(coalesce(v_bonifico.booking_date, v_bonifico.value_date), 'DD/MM/YYYY'),
        translate(to_char(abs(v_bonifico.amount), 'FM999,999,999,990.00'), ',.', '.,')
        using errcode = '23514';
    end if;
    raise exception 'Un bonifico è agganciato alla scadenza o alla rata di questa fattura: sgancialo prima dalla Tesoreria.' using errcode = '23514';
  end if;

  -- Gli incassi registrati dallo scadenzario si tolgono qui: scadenza, prima nota, fattura, rata.
  -- Le scadenze `[DOC:` sono della fattura stessa: le chiude annulla_pagamento_importata qui sotto.
  for v_scadenza in
    select s.id from public.scadenze s
     where s.invoice_id = f.id and s.prima_nota_entry_id is not null
       and s.status in ('pagata', 'parziale')
       and coalesce(s.notes, '') not like '%[DOC:%'
     order by s.due_date nulls last, s.id
  loop
    perform public.annulla_incasso_scadenza_esegui(v_scadenza);
  end loop;

  for v_pagamento in select p.id from public.invoice_payments p where p.invoice_id = f.id loop
    perform public.annulla_pagamento_importata(v_pagamento);
  end loop;

  -- Mai una fattura «da incassare» con una scadenza ancora incassata.
  if exists (select 1 from public.scadenze s
              where s.invoice_id = f.id and s.prima_nota_entry_id is not null
                and s.status in ('pagata', 'parziale')) then
    raise exception 'Una scadenza di questa fattura risulta ancora incassata e non riesco a toglierla da qui: scrivi all''assistenza con il numero della fattura.' using errcode = '23514';
  end if;

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
