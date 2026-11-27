-- 27/11/2026: controlli finali dopo la riapertura delle rate segnate pagate.
--
-- 1. Un UPDATE senza utente non può più segnare pagati più di 20 costi in un colpo.
--    Il 04/11 alle 08:43:58 un unico passaggio, senza utente, ha acceso `is_paid` su 365 costi:
--    il trigger ha messo rate e fatture a «pagata» senza alcun pagamento in prima nota, e per tre
--    settimane la riconciliazione delle distinte RiBa non ha trovato niente a cui attaccarsi.
--    Segnare pagato a mano resta possibile, anche in blocco, a chi lo fa da utente (auth.uid()
--    valorizzato: pagine, Silvio, azioni in blocco). Si ferma solo la scrittura anonima in massa:
--    SQL, service role, script. Se è voluta, si dichiara nella transazione:
--      select set_config('eic.pagati_in_blocco', 'on', true);
--    Nessuna strada legittima senza utente segna pagati più costi nella stessa istruzione:
--    bank-auto-reconcile, distinte RiBa e registra_pagamento_costo lavorano un costo alla volta.
--
-- 2. «Riporta da incassare» (20290628110000):
--    - le scadenze `[DOC:` non passano dall'annullo dello scadenzario, che le rifiuterebbe con
--      «annulla l'incasso dalla fattura» mentre l'utente è proprio sulla fattura: le chiude
--      annulla_pagamento_importata;
--    - se dopo gli annulli una scadenza risulta ancora incassata, ci si ferma con un messaggio,
--      invece di lasciare la fattura «da incassare» con la scadenza «pagata»;
--    - vale anche per le fatture storiche `primanota` (273 di un'impresa cliente, anno 2025, importate una
--      volta, nessun gestionale collegato): risultano incassate per scelta, ma se una non lo è
--      davvero si riporta da incassare una per una. Nessuna riga toccata qui.

-- 1. Pagati in blocco senza utente ──────────────────────────────────────────────────────────
create or replace function private.costi_pagati_in_blocco_senza_utente()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  n integer;
begin
  if auth.uid() is not null
     or coalesce(current_setting('eic.pagati_in_blocco', true), '') = 'on' then
    return null;
  end if;
  select count(*) into n
    from nuovi nw
    join vecchi vc on vc.id = nw.id
   where coalesce(nw.is_paid, false) and not coalesce(vc.is_paid, false);
  if n > 20 then
    raise exception 'Segnare pagati % costi in un colpo, senza un utente, non è permesso: i pagamenti non verrebbero registrati in prima nota. Se è voluto: select set_config(''eic.pagati_in_blocco'', ''on'', true);', n
      using errcode = 'P0001';
  end if;
  return null;
end;
$function$;

revoke all on function private.costi_pagati_in_blocco_senza_utente() from public, anon, authenticated;

drop trigger if exists costi_pagati_in_blocco_senza_utente on public.company_costs;
create trigger costi_pagati_in_blocco_senza_utente
  after update on public.company_costs
  referencing old table as vecchi new table as nuovi
  for each statement execute function private.costi_pagati_in_blocco_senza_utente();

-- 2. «Riporta da incassare» ──────────────────────────────────────────────────────────────────
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
       or not public.puo_incassare_fatture(f.company_id)) then
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
