-- Due buchi nell'annullamento degli incassi delle fatture emesse.
--
-- 1) Una scadenza pagata dallo scadenzario non si poteva annullare da nessuna parte: la riga
--    di prima nota è automatica (non si elimina a mano) e «Riporta da incassare» rimanda qui.
--    annulla_incasso_scadenza toglie gli incassi della scadenza e i loro movimenti di prima nota.
--
-- 2) bank-auto-reconcile riprende ogni movimento libero: ricorda gli abbinamenti annullati
--    leggendo le righe di bank_reconciliations con unmatched_at. Per le fatture interne però
--    la riga non diceva quale fattura: movimento_id si azzera quando l'incasso viene stornato
--    (ON DELETE SET NULL). Da qui documento_id, che resta.
--
-- Idempotente. Tocca dati solo per riempire documento_id, su una tabella di poche migliaia di righe.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Senza chiave esterna, di proposito: con ON DELETE SET NULL, cancellare un documento senza scadenza
-- violerebbe target_check qui sotto e fermerebbe il cestino dei documenti di tutte le aziende, che
-- cancella in un solo comando. Un id rimasto orfano non fa danni: è solo memoria.
alter table public.bank_reconciliations
  add column if not exists documento_id uuid;

comment on column public.bank_reconciliations.documento_id is
  'Fattura interna incassata da questo bonifico. A differenza di movimento_id sopravvive allo storno: serve a bank-auto-reconcile per non riabbinare un bonifico sganciato alla stessa fattura. Senza chiave esterna: vedi la migrazione 20281211140000.';

-- Senza documento_id nel vincolo, stornare l'incasso di un documento senza scadenza (una parcella,
-- per esempio) farebbe fallire l'azzeramento di movimento_id.
alter table public.bank_reconciliations drop constraint if exists bank_reconciliations_target_check;
alter table public.bank_reconciliations add constraint bank_reconciliations_target_check
  check (invoice_id is not null or scadenza_id is not null or movimento_id is not null or documento_id is not null);

-- Il movimento c'è quando la riga nasce (riconcilia_bonifico_fattura, bonifico parlante): si legge
-- da lì, così nessuna delle funzioni che scrivono la riga deve ricordarsene.
create or replace function public.bank_reconciliations_documento_da_movimento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  select m.documento_id into new.documento_id
    from public.movimenti_cassa_native m
   where m.id = new.movimento_id and m.company_id = new.company_id;
  return new;
end;
$function$;

revoke all on function public.bank_reconciliations_documento_da_movimento() from public, anon, authenticated, service_role;

drop trigger if exists trg_bank_reconciliations_documento on public.bank_reconciliations;
create trigger trg_bank_reconciliations_documento
  before insert or update of movimento_id on public.bank_reconciliations
  for each row
  when (new.movimento_id is not null and new.documento_id is null)
  execute function public.bank_reconciliations_documento_da_movimento();

update public.bank_reconciliations r
   set documento_id = m.documento_id
  from public.movimenti_cassa_native m
 where m.id = r.movimento_id and m.company_id = r.company_id
   and r.documento_id is null and m.documento_id is not null;

-- Il contrario di mark_scadenza_paid per le entrate. Toglie TUTTI gli incassi della scadenza,
-- anche i parziali: prima_nota_entry_id dice solo l'ultimo, gli altri si trovano per scadenza_id.
create or replace function public.annulla_incasso_scadenza(p_scadenza_id uuid)
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
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and (
       auth.uid() is null
       or public.user_can_access_company(s.company_id) is not true
       or not public.puo_incassare_fatture(s.company_id)
       or public.utente_sola_lettura(s.company_id)) then
    raise exception 'Non hai il permesso di annullare incassi.' using errcode = '42501';
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

revoke all on function public.annulla_incasso_scadenza(uuid) from public, anon;
grant execute on function public.annulla_incasso_scadenza(uuid) to authenticated, service_role;
