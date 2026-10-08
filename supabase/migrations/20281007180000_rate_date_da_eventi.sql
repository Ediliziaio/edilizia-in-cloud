-- La data di una rata agganciata a un evento la tiene il database (07/10/2026).
--
-- In edilizia la rata si incassa a un evento: alla firma, a fine lavori, al SAL n°.
-- La data di quella rata si calcola con data_attesa_rata e la mostrava solo la vista
-- v_rate_commessa_stato: tutto il resto del database (previsione di cassa, scaduti di
-- Silvio, avvisi del mattino, colonne «previste» delle commesse) legge order_installments
-- .expected_date, che per una rata a evento era una data finta messa dal modulo (+30 giorni).
-- Così una rata «a fine lavori» non entrava mai in nessuna previsione. Ora expected_date
-- DIVENTA la data dell'evento, per le rate a evento non incassate, e si muove da sola
-- quando si muove l'evento.
--
-- Cosa c'è.
--   · SAL: la rata «al SAL n°» leggeva la tabella vecchia public.sal, vuota (la schermata
--     scrive sal_records): non scattava mai. Ora legge sal_records.maturato_il, la data in cui
--     il verbale è diventato esigibile. Quando matura lo sceglie l'azienda
--     (company_pagamenti_settings.sal_matura_quando): 'emesso' (di partenza: appena non è più
--     bozza) oppure 'approvato' (quando il cliente lo approva o lo firma). La data la scrive
--     un trigger a ogni cambio di stato, qualunque sia la strada (schermata, firma del cliente
--     con il link, funzioni del server).
--   · data_attesa_rata: stessa firma, cambia solo il ramo del SAL.
--   · rate_aggiorna_date(commessa): ricalcola expected_date delle rate a evento non incassate
--     (scrive solo dove il valore cambia). La chiamano i trigger qui sotto, e nient'altro.
--   · rata_data_da_evento: prima di ogni scrittura di una rata a evento non incassata, la sua
--     expected_date è quella dell'evento (una data scritta a mano non vale: la decide l'evento).
--     Le rate «a data fissa» e quelle incassate non si toccano.
--   · Trigger sulle fonti degli eventi: le date della commessa, i verbali SAL, le spedizioni
--     in cantiere, le fatture, la storia degli stati, la firma del preventivo.
--   · pagamenti_impostazioni_salva impara 'sal_matura_quando'; cambiarla ricalcola i verbali
--     dell'azienda.
--
-- Additiva: due colonne con default, funzioni e trigger nuovi. Dipende da 20281007170000.
-- Le rate «a data fissa» (179 su 181 oggi) non cambiano; delle 2 a evento si riallineano le date.

set local lock_timeout = '3s';

alter table public.company_pagamenti_settings
  add column if not exists sal_matura_quando text not null default 'emesso'
  check (sal_matura_quando in ('emesso', 'approvato'));

alter table public.sal_records add column if not exists maturato_il date;

-- Un verbale è «maturato» quando lo stato ha raggiunto quello scelto dall'azienda.
create or replace function public.sal_matura(p_regola text, p_stato text)
returns boolean
language sql
immutable
as $$
  select case when coalesce(p_regola, 'emesso') = 'approvato'
              then p_stato in ('approvato', 'firmato')
              else p_stato <> 'bozza' end;
$$;

-- A ogni cambio di stato di un verbale scrive (o toglie) la data in cui è maturato.
create or replace function public.sal_stampa_maturazione()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regola text;
begin
  select s.sal_matura_quando into v_regola
    from public.company_pagamenti_settings s where s.company_id = new.company_id;
  if not public.sal_matura(v_regola, new.stato) then
    new.maturato_il := null;
  elsif tg_op = 'INSERT' then
    new.maturato_il := coalesce(new.maturato_il, new.data_emissione, current_date);
  else
    new.maturato_il := coalesce(old.maturato_il, new.maturato_il, current_date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sal_stampa_maturazione on public.sal_records;
create trigger trg_sal_stampa_maturazione
  before insert or update of stato on public.sal_records
  for each row execute function public.sal_stampa_maturazione();

-- Gli stessi casi di prima; cambia solo «sal_numero» (sal_records al posto di sal).
create or replace function public.data_attesa_rata(
  p_evento text, p_expected_date date, p_status_id uuid, p_order_id uuid, p_created_at timestamp with time zone,
  p_merce date, p_inizio date, p_fine date, p_posa date default null::date, p_quote_id uuid default null::uuid,
  p_numero integer default null::integer)
returns date
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT CASE coalesce(p_evento, 'data_fissa')
    WHEN 'firma_contratto' THEN p_created_at::date
    WHEN 'accettazione_preventivo' THEN (
      SELECT coalesce(q.signed_at::date, q.updated_at::date) FROM public.quotes q WHERE q.id = p_quote_id
    )
    WHEN 'merce_magazzino' THEN p_merce
    WHEN 'consegna_cantiere' THEN (
      SELECT min(s.arrived_at)::date FROM public.shipments_to_site s
      WHERE s.order_id = p_order_id AND s.arrived_at IS NOT NULL
    )
    WHEN 'inizio_lavori' THEN p_inizio
    WHEN 'data_posa' THEN p_posa
    WHEN 'sal_numero' THEN (
      SELECT min(sl.maturato_il) FROM public.sal_records sl
      WHERE sl.order_id = p_order_id AND sl.maturato_il IS NOT NULL
        AND (p_numero IS NULL OR sl.numero_sal = p_numero)
    )
    WHEN 'fine_lavori' THEN p_fine
    WHEN 'fattura_acconto' THEN (
      SELECT min(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'fattura_saldo' THEN (
      SELECT max(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'stato_commessa' THEN (
      SELECT min(h.changed_at)::date FROM public.order_status_history h
      WHERE h.order_id = p_order_id AND h.status_id = p_status_id
    )
    ELSE p_expected_date
  END;
$function$;

-- Ricalcola la data delle rate a evento non incassate di una commessa. Scrive solo dove cambia.
create or replace function public.rate_aggiorna_date(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  with d as (
    select i.id,
           public.data_attesa_rata(i.trigger_evento, i.expected_date, i.trigger_status_id, o.id, o.created_at,
                                   o.warehouse_arrival_date, o.work_start_date, o.work_end_date, o.expected_date,
                                   o.quote_id, i.trigger_numero) as data
      from public.order_installments i
      join public.orders o on o.id = i.order_id
     where i.order_id = p_order_id and i.trigger_evento <> 'data_fissa' and not i.is_paid
  )
  update public.order_installments i
     set expected_date = d.data
    from d
   where i.id = d.id and i.expected_date is distinct from d.data;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Una rata a evento non incassata ha sempre la data del suo evento.
create or replace function public.rata_data_da_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
begin
  if new.trigger_evento = 'data_fissa' or new.is_paid then
    return new;
  end if;
  select c.id, c.created_at, c.warehouse_arrival_date, c.work_start_date, c.work_end_date, c.expected_date, c.quote_id
    into o from public.orders c where c.id = new.order_id;
  if not found then
    return new;
  end if;
  new.expected_date := public.data_attesa_rata(new.trigger_evento, new.expected_date, new.trigger_status_id, o.id,
                                               o.created_at, o.warehouse_arrival_date, o.work_start_date,
                                               o.work_end_date, o.expected_date, o.quote_id, new.trigger_numero);
  return new;
end;
$$;

drop trigger if exists trg_rata_data_da_evento on public.order_installments;
create trigger trg_rata_data_da_evento
  before insert or update of trigger_evento, trigger_status_id, trigger_numero, is_paid, expected_date, order_id
  on public.order_installments
  for each row execute function public.rata_data_da_evento();

-- Le fonti degli eventi: quando si muovono, si muovono le rate.
create or replace function public.trg_rate_date_da_commessa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rate_aggiorna_date(new.id);
  return null;
end;
$$;

create or replace function public.trg_rate_date_da_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.order_id is not null then
    perform public.rate_aggiorna_date(old.order_id);
  end if;
  if tg_op <> 'DELETE' and new.order_id is not null and (tg_op = 'INSERT' or new.order_id is distinct from old.order_id) then
    perform public.rate_aggiorna_date(new.order_id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_rate_date_da_preventivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine uuid;
begin
  for v_ordine in select o.id from public.orders o where o.quote_id = new.id loop
    perform public.rate_aggiorna_date(v_ordine);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_rate_date_da_commessa on public.orders;
create trigger trg_rate_date_da_commessa
  after update of warehouse_arrival_date, work_start_date, work_end_date, expected_date on public.orders
  for each row
  when (old.warehouse_arrival_date is distinct from new.warehouse_arrival_date
     or old.work_start_date is distinct from new.work_start_date
     or old.work_end_date is distinct from new.work_end_date
     or old.expected_date is distinct from new.expected_date)
  execute function public.trg_rate_date_da_commessa();

drop trigger if exists trg_rate_date_da_sal on public.sal_records;
create trigger trg_rate_date_da_sal
  after insert or delete or update of stato, maturato_il, numero_sal, order_id on public.sal_records
  for each row execute function public.trg_rate_date_da_documento();

drop trigger if exists trg_rate_date_da_spedizione on public.shipments_to_site;
create trigger trg_rate_date_da_spedizione
  after insert or delete or update of arrived_at, order_id on public.shipments_to_site
  for each row execute function public.trg_rate_date_da_documento();

drop trigger if exists trg_rate_date_da_fattura on public.invoices;
create trigger trg_rate_date_da_fattura
  after insert or delete or update of issue_date, document_type, order_id on public.invoices
  for each row execute function public.trg_rate_date_da_documento();

drop trigger if exists trg_rate_date_da_stato on public.order_status_history;
create trigger trg_rate_date_da_stato
  after insert or delete on public.order_status_history
  for each row execute function public.trg_rate_date_da_documento();

drop trigger if exists trg_rate_date_da_firma_preventivo on public.quotes;
create trigger trg_rate_date_da_firma_preventivo
  after update of signed_at on public.quotes
  for each row when (old.signed_at is distinct from new.signed_at)
  execute function public.trg_rate_date_da_preventivo();

-- Le scelte dell'azienda sul pagamento: il modello di partenza e quando matura la rata di un SAL.
-- Cambiare la seconda ricalcola i verbali dell'azienda (e, per i trigger, le date delle rate).
create or replace function public.pagamenti_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modello uuid;
  v_regola text;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_pagamenti_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;
  if p_valori ? 'modello_predefinito' then
    v_modello := nullif(p_valori->>'modello_predefinito', '')::uuid;
    if v_modello is not null
       and not exists (select 1 from public.payment_plan_templates t where t.id = v_modello and t.company_id = p_company_id) then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    update public.company_pagamenti_settings
       set modello_predefinito = v_modello, updated_at = now()
     where company_id = p_company_id;
  end if;
  if p_valori ? 'sal_matura_quando' then
    v_regola := p_valori->>'sal_matura_quando';
    if v_regola is null or v_regola <> all (array['emesso', 'approvato']) then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_pagamenti_settings
       set sal_matura_quando = v_regola, updated_at = now()
     where company_id = p_company_id;
    update public.sal_records s
       set maturato_il = case when public.sal_matura(v_regola, s.stato)
                              then coalesce(s.maturato_il, s.data_emissione) end
     where s.company_id = p_company_id
       and s.maturato_il is distinct from case when public.sal_matura(v_regola, s.stato)
                                               then coalesce(s.maturato_il, s.data_emissione) end;
  end if;
end;
$$;

-- Dati già in casa: i verbali non in bozza hanno già maturato (regola di partenza), e le rate
-- a evento non incassate prendono la data del loro evento.
update public.sal_records set maturato_il = data_emissione where maturato_il is null and stato <> 'bozza';
select public.rate_aggiorna_date(x.order_id)
  from (select distinct order_id from public.order_installments where trigger_evento <> 'data_fissa' and not is_paid) x;

-- Funzioni interne e di trigger: nessuno le chiama dal browser (per un trigger l'EXECUTE non si controlla).
revoke all on function public.sal_matura(text, text) from public, anon, authenticated;
revoke all on function public.rate_aggiorna_date(uuid) from public, anon, authenticated;
revoke all on function public.sal_stampa_maturazione() from public, anon, authenticated;
revoke all on function public.rata_data_da_evento() from public, anon, authenticated;
revoke all on function public.trg_rate_date_da_commessa() from public, anon, authenticated;
revoke all on function public.trg_rate_date_da_documento() from public, anon, authenticated;
revoke all on function public.trg_rate_date_da_preventivo() from public, anon, authenticated;
revoke all on function public.pagamenti_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.pagamenti_impostazioni_salva(uuid, jsonb) to authenticated;
