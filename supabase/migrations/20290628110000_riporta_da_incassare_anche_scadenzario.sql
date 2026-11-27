-- «Riporta da incassare» su una fattura emessa importata da XML: se l'incasso era stato registrato
-- dallo scadenzario, la funzione rispondeva «annulla prima l'incasso dallo scadenzario». L'utente
-- chiede di riportare la fattura da incassare: lo fa la funzione, togliendo da sé l'incasso dallo
-- scadenzario (scadenza, prima nota, fattura, rata), come la riconciliazione dal 26/11 riapre da sé
-- la rata segnata pagata. Caso: un'impresa cliente, 27/11/2026.
--
-- Resta un solo blocco vero: un bonifico agganciato. Il messaggio dice quale movimento sganciare,
-- con data e importo, perché in Tesoreria lo si trova così.
--
-- Permessi invariati: decide puo_incassare_fatture, come prima. Per questo il lavoro di
-- annulla_incasso_scadenza passa in annulla_incasso_scadenza_esegui, senza controllo dei permessi
-- e chiamabile solo dalle funzioni definer: annulla_incasso_scadenza tiene il suo controllo
-- (puo_incassare_fatture e non sola lettura), «Riporta da incassare» il proprio.
--
-- Solo funzioni: nessuna riga toccata.

-- 1. Il lavoro, senza permessi ───────────────────────────────────────────────────────────────
create or replace function public.annulla_incasso_scadenza_esegui(p_scadenza_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.scadenze%rowtype;
  v_movimenti uuid[];
  v_importo numeric;
  v_pagato numeric;
  v_totale numeric;
begin
  select * into s from public.scadenze where id = p_scadenza_id;
  if not found then
    raise exception 'Scadenza non trovata' using errcode = 'P0002';
  end if;

  -- Stesso lucchetto di mark_scadenza_paid_con_richiesta: un pagamento e il suo annullo in fila.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.company_id::text, 2810));
  select * into s from public.scadenze where id = p_scadenza_id for update;

  if s.direction <> 'entrata' or s.cost_id is not null then
    raise exception 'Qui si annullano solo gli incassi dei clienti.' using errcode = '23514';
  end if;
  if coalesce(s.notes, '') like '%[DOC:%' then
    raise exception 'Questa scadenza è di una fattura: annulla l''incasso dalla fattura.' using errcode = '23514';
  end if;
  if s.status not in ('pagata', 'parziale') or s.prima_nota_entry_id is null then
    raise exception 'Su questa scadenza non c''è un incasso da annullare.' using errcode = '23514';
  end if;

  -- Una fattura chiusa non ha più niente da incassare: la scadenza riaperta sarebbe un credito finto.
  if s.invoice_id is not null and exists (
       select 1 from public.invoices i
        where i.id = s.invoice_id
          and (i.deleted_at is not null or i.status in ('cancelled', 'credited', 'draft'))) then
    raise exception 'Questa fattura è eliminata, annullata o stornata: l''incasso non si riapre da qui.' using errcode = '23514';
  end if;

  select array_agg(p.id), coalesce(sum(p.amount), 0) into v_movimenti, v_importo
    from public.prima_nota_entries p
   where p.scadenza_id = s.id and p.company_id = s.company_id
     and p.is_auto and p.auto_source = 'scadenzario';
  if v_movimenti is null or not (s.prima_nota_entry_id = any (v_movimenti)) then
    raise exception 'Questo incasso non è stato registrato dallo scadenzario.' using errcode = '23514';
  end if;
  -- Il pagato deve venire tutto da questi movimenti: azzerarlo cancellerebbe anche il resto.
  if abs(coalesce(s.paid_amount, 0) - v_importo) > 0.01 then
    raise exception 'Il pagato della scadenza (% €) non corrisponde ai movimenti di prima nota (% €): va controllata a mano.',
      s.paid_amount, v_importo using errcode = '23514';
  end if;

  if exists (select 1 from public.prima_nota_entries p
              where p.id = any (v_movimenti) and p.bank_transaction_id is not null)
     or exists (select 1 from public.bank_transactions t
                 where t.company_id = s.company_id and t.linked_scadenza_id = s.id)
     or exists (select 1 from public.bank_reconciliations r
                 where r.scadenza_id = s.id and r.unmatched_at is null)
     or (s.invoice_id is not null and exists (
           select 1 from public.bank_transactions t
             join public.order_installments r on r.id = t.linked_installment_id
            where t.company_id = s.company_id and r.invoice_id = s.invoice_id)) then
    raise exception 'Un bonifico è agganciato a questo incasso: sgancialo prima dalla Tesoreria.' using errcode = '23514';
  end if;
  if exists (select 1 from public.prima_nota_entries p where p.reversal_of = any (v_movimenti)) then
    raise exception 'Questo incasso ha già uno storno in prima nota: va controllato a mano.' using errcode = '23514';
  end if;

  -- Prima la scadenza, poi la fattura: il trigger della fattura riapre le rate senza prima nota
  -- per la differenza tra il pagato delle scadenze e quello della fattura, che così torna a zero.
  update public.scadenze
     set paid_amount = 0,
         status = 'da_pagare',
         paid_date = null,
         prima_nota_entry_id = null,
         updated_at = now()
   where id = s.id;

  delete from public.prima_nota_entries where id = any (v_movimenti);

  -- Come mark_scadenza_paid_con_richiesta: solo le fatture da XML seguono lo scadenzario.
  if s.invoice_id is not null then
    update public.invoices
       set paid_amount = greatest(0, coalesce(paid_amount, 0) - v_importo),
           payment_date = case when coalesce(paid_amount, 0) - v_importo > 0.01 then payment_date end,
           status = case when status = 'paid' and coalesce(paid_amount, 0) - v_importo < coalesce(total, 0) - 0.01
                         then 'issued' else status end,
           updated_at = now()
     where id = s.invoice_id and company_id = s.company_id and external_provider = 'xml_import'
     returning paid_amount, total into v_pagato, v_totale;

    -- Anche qui e non solo nel trigger della fattura, che ingoia gli errori.
    if found and coalesce(v_pagato, 0) < coalesce(v_totale, 0) - 0.01 then
      update public.order_installments
         set is_paid = false, paid_date = null
       where invoice_id = s.invoice_id and is_paid;
    end if;
  end if;

  return jsonb_build_object('scadenza_id', s.id, 'importo', v_importo, 'movimenti_tolti', cardinality(v_movimenti));
end;
$function$;

-- Nessun permesso: la chiamano solo le funzioni definer qui sotto, che controllano chi chiama.
revoke all on function public.annulla_incasso_scadenza_esegui(uuid) from public, anon, authenticated, service_role;

-- 2. L'annullo dallo scadenzario: stesso controllo di prima, poi il lavoro ──────────────────
create or replace function public.annulla_incasso_scadenza(p_scadenza_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
begin
  select s.company_id into v_company from public.scadenze s where s.id = p_scadenza_id;
  if not found then
    raise exception 'Scadenza non trovata' using errcode = 'P0002';
  end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and (
       auth.uid() is null
       or public.user_can_access_company(v_company) is not true
       or not public.puo_incassare_fatture(v_company)
       or public.utente_sola_lettura(v_company)) then
    raise exception 'Non hai il permesso di annullare incassi.' using errcode = '42501';
  end if;

  return public.annulla_incasso_scadenza_esegui(p_scadenza_id);
end;
$function$;

revoke all on function public.annulla_incasso_scadenza(uuid) from public, anon;
grant execute on function public.annulla_incasso_scadenza(uuid) to authenticated, service_role;

-- 3. «Riporta da incassare» ──────────────────────────────────────────────────────────────────
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
  if f.external_provider is distinct from 'xml_import' then
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
  for v_scadenza in
    select s.id from public.scadenze s
     where s.invoice_id = f.id and s.prima_nota_entry_id is not null
       and s.status in ('pagata', 'parziale')
     order by s.due_date nulls last, s.id
  loop
    perform public.annulla_incasso_scadenza_esegui(v_scadenza);
  end loop;

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
