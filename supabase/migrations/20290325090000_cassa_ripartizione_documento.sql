-- Ripartizione di un movimento su più categorie, e categoria dalla fattura (15/11/2026)
--
-- Due richieste del capitolato del cash flow:
--
--  1. RIPARTIZIONE. Un bonifico solo può pagare cose diverse: 1.000 € al
--     fornitore, 700 di materiali e 300 di trasporto. `cassa_ripartizione` tiene
--     le quote [{voce_id, cents}]; la somma è l'importo del movimento, al
--     centesimo. `cassa_voce_id` resta la voce della quota più grande, così chi
--     legge una voce sola (filtri, colonna Categoria, esportazioni) continua a
--     funzionare. Scegliere poi UNA categoria (singola o in blocco) toglie la
--     ripartizione: vale l'ultima scelta.
--
--  2. CATEGORIA DALLA FATTURA. Un movimento riconciliato con una fattura porta
--     con sé la categoria del documento:
--       - un incasso collegato a una fattura emessa → «Incassi clienti» (01);
--       - un pagamento collegato a un costo (scadenza, prima nota o pagamento
--         registrato) → la categoria del costo, oppure quella che l'AI ha dato
--         alla fattura ricevuta, tradotta col dizionario dei vecchi testi.
--     Se il pagamento copre documenti di categorie diverse, la proposta è già
--     una ripartizione, con gli importi riconciliati.
--     Resta una PROPOSTA (origine «documento»): la conferma una persona. Nelle
--     proposte viene prima di controparte e vecchio testo, perché è la più
--     specifica.
--
-- Niente da togliere: le funzioni si sostituiscono, i trigger nuovi si creano solo se
-- mancano.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Le quote ───────────────────────────────────────────────────────────────
alter table public.bank_transactions add column if not exists cassa_ripartizione jsonb;
do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.bank_transactions'::regclass and conname = 'bank_transactions_cassa_ripartizione_array') then
    alter table public.bank_transactions add constraint bank_transactions_cassa_ripartizione_array
      check (cassa_ripartizione is null or jsonb_typeof(cassa_ripartizione) = 'array') not valid;
  end if;
end $c$;
comment on column public.bank_transactions.cassa_ripartizione is
  'Quote del movimento su più voci di cassa: [{voce_id, cents}], somma = importo in centesimi. NULL = una voce sola (cassa_voce_id). La scrive solo bank_movimento_ripartizione().';

alter table public.cassa_voce_storico add column if not exists ripartizione jsonb;

-- Il guardiano dei dati importati lascia passare anche le quote.
create or replace function public.bank_transaction_operator_guard()
 returns trigger language plpgsql set search_path to '' as $function$
DECLARE row_company uuid; row_account uuid; manual_account boolean;
  liberi text[] := ARRAY['category','category_icon','note','linked_cost_id','linked_installment_id','linked_invoice_id','linked_scadenza_id','reconciled_at','reconciled_invoice_id','reconciliation_status','reconciliation_suggestions','chiuso_senza_documento','operativita_revision','proposta_rifiutata_at','proposta_rifiutata_da','proposta_controllata_at','cassa_voce_id','cassa_voce_origine','cassa_voce_il','cassa_voce_da','cassa_ripartizione'];
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN coalesce(NEW,OLD); END IF;
 row_company:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
 row_account:=CASE WHEN TG_OP='DELETE' THEN OLD.account_id ELSE NEW.account_id END;
 IF public.has_permission_for_company(auth.uid(),'__solo_amministratori__',row_company) THEN RETURN coalesce(NEW,OLD); END IF;
 SELECT is_manual INTO manual_account FROM public.bank_accounts WHERE id=row_account AND company_id=row_company;
 IF NOT coalesce(manual_account,false) AND (TG_OP IN ('INSERT','DELETE') OR (to_jsonb(NEW)-liberi) IS DISTINCT FROM (to_jsonb(OLD)-liberi)) THEN
  RAISE EXCEPTION 'I dati importati dalla banca non si possono riscrivere' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
  RAISE EXCEPTION 'Non puoi spostare un movimento tra conti o aziende' USING ERRCODE='42501';
 END IF;
 RETURN coalesce(NEW,OLD);
END $function$;

-- Lo storico registra anche le quote; e un cambio delle sole quote (stessa
-- voce principale) lascia comunque una riga.
create or replace function private.cassa_voce_registra_storico()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.cassa_voce_storico (company_id, bank_transaction_id, da_voce_id, a_voce_id, origine, motivo, autore, ripartizione)
  values (new.company_id, new.id, old.cassa_voce_id, new.cassa_voce_id, new.cassa_voce_origine,
          nullif(current_setting('cassa.motivo', true), ''), auth.uid(), new.cassa_ripartizione);
  return new;
end $$;
revoke all on function private.cassa_voce_registra_storico() from public, anon, authenticated;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.bank_transactions'::regclass and tgname = 'cassa_voce_storico_quote') then
    create trigger cassa_voce_storico_quote after update of cassa_ripartizione on public.bank_transactions
      for each row when (old.cassa_voce_id is not distinct from new.cassa_voce_id
                         and old.cassa_ripartizione is distinct from new.cassa_ripartizione)
      execute function private.cassa_voce_registra_storico();
  end if;
end $t$;

-- ── 2. Una voce valida per un movimento ───────────────────────────────────────
-- Gli stessi controlli della scelta singola, in un posto solo.
create or replace function private.cassa_voce_per_movimento(p_company uuid, p_voce uuid, p_importo numeric)
returns public.cassa_voci language plpgsql stable set search_path to '' as $$
declare v public.cassa_voci;
begin
  select * into v from public.cassa_voci where id = p_voce and company_id = p_company;
  if v.id is null then raise exception 'Categoria non trovata'; end if;
  if v.livello not in ('voce', 'sottovoce') then raise exception 'Scegli una voce, non una categoria intera («%»)', v.nome; end if;
  if not v.attiva or v.archiviata_il is not null then raise exception 'La voce «%» non è attiva', v.nome; end if;
  if v.flusso = 'nessuno' then raise exception 'La voce «%» non muove denaro: non si usa su un movimento di banca', v.nome; end if;
  if (p_importo >= 0 and v.flusso = 'uscita') or (p_importo < 0 and v.flusso = 'entrata') then
    raise exception 'La voce «%» è per le %', v.nome, case v.flusso when 'uscita' then 'uscite' else 'entrate' end;
  end if;
  return v;
end $$;
revoke all on function private.cassa_voce_per_movimento(uuid, uuid, numeric) from public, anon;

-- ── 3. Salvare una ripartizione ───────────────────────────────────────────────
-- p_quote: [{"voce": uuid, "cents": intero > 0}, …], almeno due voci diverse,
-- somma = importo del movimento. Un elenco vuoto (o NULL) toglie la
-- ripartizione e lascia la voce principale.
create or replace function public.bank_movimento_ripartizione(
  p_company uuid, p_tx uuid, p_quote jsonb, p_revision integer, p_motivo text default null)
returns integer language plpgsql security definer set search_path to '' as $$
declare t record; e jsonb; v public.cassa_voci; principale public.cassa_voci; q jsonb := '[]'::jsonb;
  quota bigint; massima bigint := 0; totale bigint := 0; atteso bigint; n integer; rev integer;
begin
  perform private.bank_operativa_access(p_company, true);
  select id, amount, amount_eur into t from public.bank_transactions where id = p_tx and company_id = p_company;
  if t.id is null then raise exception 'Movimento non disponibile'; end if;
  if p_quote is not null and jsonb_typeof(p_quote) <> 'array' then raise exception 'Ripartizione non valida'; end if;
  n := coalesce(jsonb_array_length(p_quote), 0);
  if n = 1 then raise exception 'Una ripartizione ha almeno due voci: per una voce sola scegli la categoria'; end if;
  if n > 20 then raise exception 'Al massimo 20 voci in una ripartizione'; end if;

  if n > 0 then
    for e in select x from jsonb_array_elements(p_quote) x loop
      if jsonb_typeof(e->'cents') is distinct from 'number' or (e->>'cents') !~ '^[0-9]+$' then
        raise exception 'Ogni quota ha un importo in centesimi, intero';
      end if;
      quota := (e->>'cents')::bigint;
      if quota <= 0 then raise exception 'Ogni quota deve essere maggiore di zero'; end if;
      v := private.cassa_voce_per_movimento(p_company, (e->>'voce')::uuid, t.amount);
      if q @> jsonb_build_array(jsonb_build_object('voce_id', v.id)) then
        raise exception 'La voce «%» compare due volte', v.nome;
      end if;
      q := q || jsonb_build_object('voce_id', v.id, 'cents', quota);
      totale := totale + quota;
      if quota > massima then massima := quota; principale := v; end if;
    end loop;
    atteso := abs(round(coalesce(t.amount_eur, t.amount) * 100))::bigint;
    if totale <> atteso then
      raise exception 'Le quote sommano % €, il movimento è di % €',
        to_char(totale / 100.0, 'FM999999990.00'), to_char(atteso / 100.0, 'FM999999990.00');
    end if;
  end if;

  perform set_config('cassa.motivo', coalesce(p_motivo, ''), true);
  update public.bank_transactions set
    cassa_ripartizione = case when n = 0 then null else q end,
    cassa_voce_id = case when n = 0 then cassa_voce_id else principale.id end,
    cassa_voce_origine = case when n = 0 then cassa_voce_origine else 'manuale' end,
    cassa_voce_il = case when n = 0 then cassa_voce_il else now() end,
    cassa_voce_da = case when n = 0 then cassa_voce_da else auth.uid() end,
    category = case when n = 0 then category else principale.nome end,
    operativita_revision = operativita_revision + 1
  where id = p_tx and company_id = p_company and operativita_revision = p_revision
  returning operativita_revision into rev;
  if rev is null then
    raise exception 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' using errcode = 'PT409';
  end if;
  return rev;
end $$;
revoke all on function public.bank_movimento_ripartizione(uuid, uuid, jsonb, integer, text) from public, anon;
grant execute on function public.bank_movimento_ripartizione(uuid, uuid, jsonb, integer, text) to authenticated;

-- Una categoria sola, scelta dopo, toglie la ripartizione (anche se è la
-- stessa voce principale).
create or replace function public.bank_movimento_categoria(
  p_company uuid, p_tx uuid, p_voce uuid, p_revision integer, p_motivo text default null)
returns integer language plpgsql security definer set search_path to '' as $$
declare v public.cassa_voci; t record; rev integer;
begin
  perform private.bank_operativa_access(p_company, true);
  select id, amount, transaction_type into t from public.bank_transactions where id = p_tx and company_id = p_company;
  if t.id is null then raise exception 'Movimento non disponibile'; end if;
  if p_voce is not null then
    v := private.cassa_voce_per_movimento(p_company, p_voce, t.amount);
  end if;
  perform set_config('cassa.motivo', coalesce(p_motivo, ''), true);
  update public.bank_transactions set
    cassa_voce_id = p_voce,
    cassa_voce_origine = case when p_voce is null then null else 'manuale' end,
    cassa_voce_il = case when p_voce is null then null else now() end,
    cassa_voce_da = case when p_voce is null then null else auth.uid() end,
    cassa_ripartizione = null,
    -- Il testo resta allineato per chi lo legge ancora (filtri, esportazioni).
    category = case when p_voce is null then category else v.nome end,
    operativita_revision = operativita_revision + 1
  where id = p_tx and company_id = p_company and operativita_revision = p_revision
  returning operativita_revision into rev;
  if rev is null then
    raise exception 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' using errcode = 'PT409';
  end if;
  return rev;
end $$;
revoke all on function public.bank_movimento_categoria(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.bank_movimento_categoria(uuid, uuid, uuid, integer, text) to authenticated;

create or replace function public.cassa_classifica_movimenti(
  p_company uuid, p_tx uuid[], p_voce uuid, p_motivo text default null, p_anche_confermati boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v public.cassa_voci; aggiornati integer := 0; saltati integer := 0; verso_sbagliato integer;
begin
  perform private.bank_operativa_access(p_company, true);
  perform set_config('lock_timeout', '3s', true);
  if coalesce(array_length(p_tx, 1), 0) = 0 then raise exception 'Scegli almeno un movimento'; end if;
  if array_length(p_tx, 1) > 500 then raise exception 'Al massimo 500 movimenti alla volta'; end if;

  select * into v from public.cassa_voci where id = p_voce and company_id = p_company;
  if v.id is null then raise exception 'Categoria non trovata'; end if;
  if v.livello not in ('voce', 'sottovoce') then raise exception 'Scegli una voce, non una categoria intera'; end if;
  if not v.attiva or v.archiviata_il is not null then raise exception 'La voce «%» non è attiva', v.nome; end if;
  if v.flusso = 'nessuno' then raise exception 'La voce «%» non muove denaro: non si usa su un movimento di banca', v.nome; end if;

  select count(*) into verso_sbagliato from public.bank_transactions t
   where t.company_id = p_company and t.id = any (p_tx)
     and ((t.amount >= 0 and v.flusso = 'uscita') or (t.amount < 0 and v.flusso = 'entrata'));
  if verso_sbagliato > 0 then
    raise exception 'La voce «%» è per le %: togli dalla selezione i % movimenti nell''altro verso', v.nome,
      case v.flusso when 'uscita' then 'uscite' else 'entrate' end, verso_sbagliato;
  end if;

  -- Un movimento ripartito è già classificato: si riscrive solo se richiesto.
  if not p_anche_confermati then
    select count(*) into saltati from public.bank_transactions t
     where t.company_id = p_company and t.id = any (p_tx)
       and t.cassa_voce_id is not null and t.cassa_voce_origine <> 'proposta'
       and (t.cassa_voce_id <> p_voce or t.cassa_ripartizione is not null);
  end if;

  perform set_config('cassa.motivo', coalesce(p_motivo, ''), true);
  update public.bank_transactions t set
    cassa_voce_id = p_voce, cassa_voce_origine = 'manuale', cassa_voce_il = now(), cassa_voce_da = auth.uid(),
    cassa_ripartizione = null,
    category = v.nome, operativita_revision = t.operativita_revision + 1
   where t.company_id = p_company and t.id = any (p_tx) and t.status = 'booked'
     and (t.cassa_voce_id is distinct from p_voce or t.cassa_ripartizione is not null)
     and (p_anche_confermati or t.cassa_voce_id is null or t.cassa_voce_origine = 'proposta');
  get diagnostics aggiornati = row_count;
  return jsonb_build_object('aggiornati', aggiornati, 'saltati', saltati);
end $$;
revoke all on function public.cassa_classifica_movimenti(uuid, uuid[], uuid, text, boolean) from public, anon;
grant execute on function public.cassa_classifica_movimenti(uuid, uuid[], uuid, text, boolean) to authenticated;

-- ── 4. Il dizionario dei vecchi testi, con le categorie dei costi vere ──────
-- Aggiunte le categorie che i costi e l'AI delle fatture ricevute usano davvero
-- (contate il 15/11/2026). «Altro» resta senza proposta.
create or replace function private.cassa_codice_da_testo(p_testo text)
returns text language sql immutable set search_path to '' as $$
  select case regexp_replace(regexp_replace(lower(btrim(coalesce(p_testo, ''))), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g')
    when 'incassi_fatture' then '01' when 'incasso_fattura' then '01' when 'incassi_clienti' then '01'
    when 'incasso_cliente' then '01' when 'incasso' then '01' when 'incassi' then '01' when 'clienti' then '01'
    when 'acconto' then '02.01' when 'acconti' then '02.01' when 'caparra' then '02.02'
    when 'materiali' then '04' when 'materiali_e_forniture' then '04' when 'materiali_edili' then '04.02'
    when 'merci' then '04.10' when 'materie_prime' then '04.01'
    when 'subappalti' then '05' when 'subappalto' then '05' when 'squadre' then '05.02' when 'manodopera' then '05'
    when 'stipendi' then '06.01' when 'stipendio' then '06.01' when 'personale' then '06' when 'salari' then '06.01'
    when 'inps' then '06.11'
    when 'affitti' then '08' when 'affitto' then '08' when 'immobili' then '08' when 'utenze' then '08'
    when 'struttura_servizi' then '08' when 'cancelleria' then '08.15'
    when 'telefonia' then '08.09' when 'manutenzione' then '08.11' when 'manutenzioni' then '08.11'
    when 'carburante' then '09.01' when 'carburanti' then '09.01' when 'trasporti_noleggi' then '09' when 'veicoli' then '09'
    when 'mezzi' then '09' when 'trasporti' then '09.12' when 'trasporti_logistica' then '09.12'
    when 'noleggi' then '09' when 'noleggio_mezzi_attrezzature' then '09'
    when 'pubblicita' then '10' when 'marketing' then '10' when 'provvigioni' then '10.14'
    when 'commercialista' then '11.01' when 'consulenze' then '11' when 'professionisti' then '11' when 'servizi' then '11'
    when 'consulenze_professionali' then '11' when 'servizi_generali' then '11' when 'consulenza_lavoro' then '11.02'
    when 'software' then '11.13'
    when 'iva' then '12.01' when 'imposte_e_contributi' then '12' when 'imposte' then '12' when 'tasse' then '12' when 'f24' then '12'
    when 'interessi' then '13' when 'spese_bancarie' then '13.09' when 'commissioni_bancarie' then '13.08'
    when 'attrezzature' then '14.06' when 'leasing' then '18'
    when 'giroconto' then '21' when 'giroconti' then '21'
    when 'trasferte' then '27' when 'viaggi_trasferte' then '27'
    else null end
$$;
revoke all on function private.cassa_codice_da_testo(text) from public, anon;

-- ── 5. La proposta dalla fattura ──────────────────────────────────────────────
-- Le riconciliazioni attive del movimento, ognuna col suo importo, tradotte in
-- voci dell'azienda (solo voci o categorie attive). Più documenti della stessa
-- voce si sommano. NULL se nessun documento dice qualcosa.
create or replace function private.cassa_proposta_documento(p_company uuid, p_tx uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  with r as (
    select r.matched_amount, t.amount, r.payment_source,
           coalesce(r.scadenza_id, (r.payment_source->>'scadenza_id')::uuid) as scadenza_id,
           r.prima_nota_id, r.invoice_id, r.documento_id
      from public.bank_reconciliations r
      join public.bank_transactions t on t.id = r.transaction_id and t.company_id = p_company
     where r.transaction_id = p_tx and r.company_id = p_company and r.unmatched_at is null
  ), d as (
    select r.matched_amount, r.amount,
           coalesce(s.cost_id, pn.cost_id, (r.payment_source->>'cost_id')::uuid) as cost_id,
           coalesce(r.invoice_id, (r.payment_source->>'invoice_id')::uuid, s.invoice_id, pn.invoice_id) as invoice_id,
           coalesce(r.documento_id, (r.payment_source->>'documento_id')::uuid, pn.documento_fiscale_id) as documento_id
      from r
      left join public.scadenze s on s.id = r.scadenza_id and s.company_id = p_company
      left join public.prima_nota_entries pn on pn.id = r.prima_nota_id and pn.company_id = p_company
  ), codici as (
    select round(abs(d.matched_amount) * 100)::bigint as cents,
           case
             -- Incasso di una fattura emessa (non una nota di credito).
             when d.amount >= 0 and (
                    exists (select 1 from public.invoices i where i.id = d.invoice_id and i.company_id = p_company
                              and coalesce(i.document_type, 'invoice') <> 'credit_note')
                 or exists (select 1 from public.documenti_fiscali f where f.id = d.documento_id and f.company_id = p_company
                              and f.tipo in ('fattura', 'fattura_pa')))
               then '01'
             -- Pagamento di un costo: la sua categoria, o quella della fattura ricevuta.
             when d.amount < 0 and d.cost_id is not null then coalesce(
               private.cassa_codice_da_testo(cc.category),
               (select private.cassa_codice_da_testo(fr.categoria_ai) from public.fatture_ricevute fr
                 where fr.company_cost_id = d.cost_id and fr.company_id = p_company and fr.categoria_ai is not null
                 order by fr.categoria_confidenza desc nulls last limit 1))
           end as codice
      from d
      left join public.company_costs cc on cc.id = d.cost_id and cc.company_id = p_company
  ), voci as (
    select v.id, v.nome, v.codice, v.livello, sum(c.cents)::bigint as cents
      from codici c
      join public.cassa_voci v on v.company_id = p_company and v.codice = c.codice
                              and v.attiva and v.archiviata_il is null
     group by v.id, v.nome, v.codice, v.livello
  )
  select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'codice', codice, 'livello', livello, 'cents', cents)
                   order by cents desc, codice)
    from voci
$$;
revoke all on function private.cassa_proposta_documento(uuid, uuid) from public, anon;

-- Le quote salvate, con nome e codice delle voci.
create or replace function private.cassa_quote_lette(p_quote jsonb)
returns jsonb language sql stable security definer set search_path to '' as $$
  select case when p_quote is null then null else (
    select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'codice', v.codice,
                                        'in', v.voce_cassa_in, 'out', v.voce_cassa_out, 'cents', (q->>'cents')::bigint)
                     order by (q->>'cents')::bigint desc, v.codice)
      from jsonb_array_elements(p_quote) q
      join public.cassa_voci v on v.id = (q->>'voce_id')::uuid) end
$$;
revoke all on function private.cassa_quote_lette(jsonb) from public, anon;

-- ── 6. Le letture, con quote e proposta dalla fattura ────────────────────────
create or replace function public.cassa_voci_movimenti(p_company uuid, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.bank_operativa_access(p_company, false);
  if coalesce(array_length(p_ids, 1), 0) > 200 then raise exception 'Troppi movimenti in una volta'; end if;
  with tx as (
    select t.id, t.category, t.cassa_voce_id, t.cassa_voce_origine, t.cassa_voce_il, t.cassa_ripartizione,
           case when t.cassa_voce_id is null then private.cassa_proposta_documento(p_company, t.id) end as dal_documento
      from public.bank_transactions t
     where t.company_id = p_company and t.id = any (p_ids)
  ), scelta as (
    select tx.*,
           coalesce(tx.cassa_voce_id, (tx.dal_documento->0->>'id')::uuid,
             (select x.id from public.cassa_voci x where x.company_id = p_company and x.codice = private.cassa_codice_da_testo(tx.category))) as voce_id
      from tx
  )
  select coalesce(jsonb_object_agg(s.id, jsonb_build_object(
           'id', v.id, 'codice', v.codice, 'nome', v.nome, 'categoria', c.nome,
           'origine', case when s.cassa_voce_id is not null then s.cassa_voce_origine
                           when s.dal_documento is not null then 'documento' else 'storico' end,
           'confermata', s.cassa_voce_id is not null and s.cassa_voce_origine <> 'proposta',
           'il', s.cassa_voce_il,
           'quote', private.cassa_quote_lette(s.cassa_ripartizione),
           'proposta_quote', case when jsonb_array_length(s.dal_documento) > 1 then s.dal_documento end)), '{}'::jsonb)
    into r
    from scelta s
    join public.cassa_voci v on v.company_id = p_company and v.id = s.voce_id
    left join public.cassa_voci c on c.id = v.parent_id and v.livello in ('voce', 'sottovoce');
  return r;
end $$;
revoke all on function public.cassa_voci_movimenti(uuid, uuid[]) from public, anon;
grant execute on function public.cassa_voci_movimenti(uuid, uuid[]) to authenticated;

create or replace function public.cassa_movimenti_da_classificare(p_company uuid, p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.bank_operativa_access(p_company, false);
  if p_dal is null or p_al is null or p_al < p_dal then raise exception 'Periodo non valido'; end if;
  if p_al - p_dal > 400 then raise exception 'Periodo troppo lungo: al massimo un anno alla volta'; end if;
  with tx as (
    select t.id, t.booking_date, t.description, t.category, t.cassa_voce_id, t.cassa_voce_origine, t.operativita_revision,
           t.cassa_ripartizione,
           round(coalesce(t.amount_eur, t.amount) * 100)::bigint as cents,
           coalesce(nullif(t.counterparty_name, ''), case when t.amount >= 0 then t.debtor_name else t.creditor_name end) as controparte,
           coalesce(nullif(t.counterparty_iban, ''), case when t.amount >= 0 then t.debtor_iban else t.creditor_iban end) as iban
      from public.bank_transactions t
     where t.company_id = p_company and t.status = 'booked'
       and coalesce(t.reconciliation_status, '') <> 'ignored'
       and t.booking_date between p_dal and p_al
  ), storia as (
    -- L'ultima scelta fatta a mano per ogni controparte e verso.
    select distinct on (chiave, entrata) chiave, entrata, voce_id
      from (
        select coalesce(nullif(coalesce(nullif(s.counterparty_iban, ''), case when s.amount >= 0 then s.debtor_iban else s.creditor_iban end), ''),
                        lower(btrim(coalesce(nullif(s.counterparty_name, ''), case when s.amount >= 0 then s.debtor_name else s.creditor_name end)))) as chiave,
               s.amount >= 0 as entrata, s.cassa_voce_id as voce_id, s.cassa_voce_il as il
          from public.bank_transactions s
         where s.company_id = p_company and s.cassa_voce_id is not null and s.cassa_voce_origine = 'manuale'
           and s.cassa_ripartizione is null
      ) x
     where nullif(chiave, '') is not null
     order by chiave, entrata, il desc
  ), con_proposta as (
    select tx.*,
           case when tx.cassa_voce_id is null then private.cassa_proposta_documento(p_company, tx.id) end as dal_documento,
           sc.voce_id as da_controparte,
           (select v.id from public.cassa_voci v where v.company_id = p_company and v.codice = private.cassa_codice_da_testo(tx.category)) as da_testo
      from tx
      left join storia sc on tx.cassa_voce_id is null
       and sc.chiave = coalesce(nullif(tx.iban, ''), lower(btrim(tx.controparte)))
       and sc.entrata = (tx.cents >= 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'data', p.booking_date, 'cents', p.cents, 'descrizione', p.description,
           'controparte', p.controparte, 'categoria_testo', p.category, 'revisione', p.operativita_revision,
           'voce', case when v.id is null then null else jsonb_build_object(
             'id', v.id, 'nome', v.nome, 'codice', v.codice, 'categoria', c.nome,
             'origine', case when p.cassa_voce_id is not null then p.cassa_voce_origine
                             when p.dal_documento is not null then 'documento'
                             when p.da_controparte is not null then 'controparte' else 'storico' end,
             'confermata', p.cassa_voce_id is not null and p.cassa_voce_origine <> 'proposta',
             'quote', private.cassa_quote_lette(p.cassa_ripartizione),
             'proposta_quote', case when jsonb_array_length(p.dal_documento) > 1 then p.dal_documento end) end)
           order by p.booking_date desc, p.id), '[]'::jsonb)
    into r
    from con_proposta p
    left join public.cassa_voci v on v.company_id = p_company
     and v.id = coalesce(p.cassa_voce_id, (p.dal_documento->0->>'id')::uuid, p.da_controparte, p.da_testo)
    left join public.cassa_voci c on c.id = v.parent_id and v.livello in ('voce', 'sottovoce');
  return r;
end $$;
revoke all on function public.cassa_movimenti_da_classificare(uuid, date, date) from public, anon;
grant execute on function public.cassa_movimenti_da_classificare(uuid, date, date) to authenticated;

-- Il rendiconto riceve le quote: ogni quota va nella riga della sua voce.
create or replace function public.cassa_rendiconto_banca(p_company uuid, p_anno integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.cassa_accesso(p_company, false);
  with tx as (
    select t.id, t.booking_date, t.category, t.description, t.cassa_voce_id, t.cassa_voce_origine, t.cassa_ripartizione,
           round(coalesce(t.amount_eur, t.amount) * 100)::bigint as cents,
           coalesce(nullif(t.counterparty_name, ''), case when t.amount >= 0 then t.debtor_name else t.creditor_name end) as controparte,
           exists (select 1 from public.prima_nota_entries p where p.bank_transaction_id = t.id and p.reversal_of is null
                     and not exists (select 1 from public.prima_nota_entries s where s.reversal_of = p.id)) as in_prima_nota
      from public.bank_transactions t
     where t.company_id = p_company and t.status = 'booked'
       and coalesce(t.reconciliation_status, '') <> 'ignored'
       and t.booking_date >= make_date(p_anno, 1, 1)
  )
  select jsonb_build_object(
    'movimenti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tx.id, 'data', tx.booking_date, 'cents', tx.cents, 'categoria', tx.category,
        'descrizione', tx.description, 'controparte', tx.controparte, 'in_prima_nota', tx.in_prima_nota,
        'voce', case when v.id is null then null else jsonb_build_object(
          'id', v.id, 'nome', v.nome, 'codice', v.codice, 'in', v.voce_cassa_in, 'out', v.voce_cassa_out,
          'origine', tx.cassa_voce_origine) end,
        'quote', case when v.id is null then null else private.cassa_quote_lette(tx.cassa_ripartizione) end)
        order by tx.booking_date, tx.id)
        from tx left join public.cassa_voci v on v.id = tx.cassa_voce_id and tx.cassa_voce_origine <> 'proposta'
       where tx.booking_date < make_date(p_anno + 1, 1, 1)
         and (not tx.in_prima_nota or v.id is not null)), '[]'::jsonb),
    'dopo_anno_cents', (select coalesce(sum(tx.cents), 0) from tx
                         where tx.booking_date >= make_date(p_anno + 1, 1, 1) and not tx.in_prima_nota))
  into r;
  return r;
end $$;
revoke all on function public.cassa_rendiconto_banca(uuid, integer) from public, anon;
grant execute on function public.cassa_rendiconto_banca(uuid, integer) to authenticated;
