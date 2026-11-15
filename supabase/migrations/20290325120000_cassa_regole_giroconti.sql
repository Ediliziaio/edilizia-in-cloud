-- Regole che assegnano una voce di cassa, e giroconti riconosciuti (15/11/2026)
--
-- 1. REGOLE. Le regole della Tesoreria («se la descrizione contiene ENEL →
--    Utenze») scrivevano solo il vecchio testo della categoria. Adesso una
--    regola può indicare una VOCE del catalogo (`cassa_voce_id`) e un verso
--    (entrate, uscite o entrambi):
--      - nelle proposte vale prima di tutto il resto (è una scelta esplicita
--        dell'azienda): confermata > regola > fattura > giroconto >
--        controparte > vecchio testo;
--      - `cassa_regole_applica(azienda, anteprima)` le applica ai movimenti
--        ancora senza categoria: in anteprima dice quanti e quali, senza
--        scrivere; applicate, la categoria è confermata con origine «regola»,
--        e lo storico registra quale regola.
--    La voce di una regola deve essere della stessa azienda e una voce vera
--    (non una categoria intera): lo controlla un trigger.
--
-- 2. GIROCONTI. Un trasferimento tra due conti dell'azienda è due movimenti
--    (−1.000 su un conto, +1.000 sull'altro) che contati come uscita e
--    incasso gonfiavano entrambi. Proposto come «Giroconto banca-banca»
--    (21.01) quando:
--      - sull'altro conto dell'azienda c'è il movimento opposto, stesso
--        importo, entro 3 giorni; oppure
--      - l'IBAN della controparte è un conto dell'azienda.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Regole con voce ────────────────────────────────────────────────────────
alter table public.bank_categorization_rules add column if not exists cassa_voce_id uuid references public.cassa_voci(id);
alter table public.bank_categorization_rules add column if not exists verso text not null default 'entrambi';
do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.bank_categorization_rules'::regclass and conname = 'bank_categorization_rules_verso_check') then
    alter table public.bank_categorization_rules add constraint bank_categorization_rules_verso_check check (verso in ('entrata', 'uscita', 'entrambi'));
  end if;
end $c$;
comment on column public.bank_categorization_rules.cassa_voce_id is 'Voce del catalogo di cassa che la regola assegna (proposta e «Applica le regole»). NULL = regola solo testuale, come prima.';

create or replace function private.cassa_regola_controlla()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v public.cassa_voci;
begin
  if new.cassa_voce_id is null then return new; end if;
  select * into v from public.cassa_voci where id = new.cassa_voce_id;
  if v.id is null or v.company_id is distinct from new.company_id then
    raise exception 'La voce della regola non è di questa azienda' using errcode = '42501';
  end if;
  if v.livello not in ('voce', 'sottovoce') then raise exception 'Una regola assegna una voce, non una categoria intera'; end if;
  return new;
end $$;
revoke all on function private.cassa_regola_controlla() from public, anon, authenticated;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.bank_categorization_rules'::regclass and tgname = 'cassa_regola_controlla') then
    create trigger cassa_regola_controlla before insert or update of cassa_voce_id, company_id on public.bank_categorization_rules
      for each row execute function private.cassa_regola_controlla();
  end if;
end $t$;

-- La prima regola (per priorità) che vale per il movimento. Solo regole con
-- una voce attiva e utilizzabile in quel verso.
create or replace function private.cassa_regola_per(
  p_company uuid, p_importo numeric, p_descrizione text, p_creditore text, p_debitore text, p_controparte text)
returns table (regola_id uuid, voce_id uuid, testo text)
language sql stable security definer set search_path to '' as $$
  select r.id, v.id, r.match_value
    from public.bank_categorization_rules r
    join public.cassa_voci v on v.id = r.cassa_voce_id and v.company_id = p_company
     and v.attiva and v.archiviata_il is null and v.livello in ('voce', 'sottovoce') and v.flusso <> 'nessuno'
     and not ((p_importo >= 0 and v.flusso = 'uscita') or (p_importo < 0 and v.flusso = 'entrata'))
   where r.company_id = p_company and nullif(btrim(r.match_value), '') is not null
     and (r.verso = 'entrambi' or (r.verso = 'entrata') = (p_importo >= 0))
     and exists (
       select 1 from unnest(case coalesce(r.match_field, 'any')
                              when 'description' then array[p_descrizione]
                              when 'creditor_name' then array[p_creditore]
                              when 'debtor_name' then array[p_debitore]
                              else array[p_descrizione, p_creditore, p_debitore, p_controparte] end) as h(testo)
        where case when coalesce(r.is_case_sensitive, false) then
                case coalesce(r.match_type, 'contains')
                  when 'equals' then h.testo = r.match_value
                  when 'starts_with' then left(h.testo, length(r.match_value)) = r.match_value
                  else strpos(h.testo, r.match_value) > 0 end
              else
                case coalesce(r.match_type, 'contains')
                  when 'equals' then lower(h.testo) = lower(r.match_value)
                  when 'starts_with' then left(lower(h.testo), length(r.match_value)) = lower(r.match_value)
                  else strpos(lower(h.testo), lower(r.match_value)) > 0 end
              end)
   order by r.priority nulls last, r.created_at, r.id
   limit 1
$$;
revoke all on function private.cassa_regola_per(uuid, numeric, text, text, text, text) from public, anon;

-- ── 2. Giroconti ──────────────────────────────────────────────────────────────
create index if not exists bank_transactions_company_data_idx on public.bank_transactions (company_id, booking_date);

create or replace function private.cassa_e_giroconto(p_company uuid, p_tx uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.bank_transactions t
     where t.id = p_tx and t.company_id = p_company
       and (
         exists (select 1 from public.bank_transactions g
                  where g.company_id = p_company and g.id <> t.id and g.account_id is distinct from t.account_id
                    and g.status = 'booked'
                    and g.booking_date between t.booking_date - 3 and t.booking_date + 3
                    and coalesce(g.amount_eur, g.amount) = -coalesce(t.amount_eur, t.amount)
                    and coalesce(t.amount_eur, t.amount) <> 0)
         or exists (select 1 from public.bank_accounts a
                     where a.company_id = p_company and a.id is distinct from t.account_id and nullif(a.iban, '') is not null
                       and upper(replace(a.iban, ' ', '')) = upper(replace(coalesce(nullif(t.counterparty_iban, ''),
                             case when t.amount >= 0 then t.debtor_iban else t.creditor_iban end, ''), ' ', '')))))
$$;
revoke all on function private.cassa_e_giroconto(uuid, uuid) from public, anon;

-- ── 3. Applicare le regole ────────────────────────────────────────────────────
create or replace function public.cassa_regole_applica(p_company uuid, p_anteprima boolean default true)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; n integer := 0; riga record;
begin
  perform private.bank_operativa_access(p_company, not p_anteprima);
  perform set_config('lock_timeout', '3s', true);

  select jsonb_build_object(
    'movimenti', coalesce(sum(e.n), 0),
    'regole', coalesce(jsonb_agg(jsonb_build_object('regola', e.regola_id, 'testo', e.testo, 'voce', v.nome, 'codice', v.codice,
                                                    'movimenti', e.n, 'cents', e.cents) order by e.n desc), '[]'::jsonb))
    into r
    from (select x.regola_id, x.voce_id, x.testo, count(*) n, sum(round(coalesce(t.amount_eur, t.amount) * 100))::bigint cents
            from public.bank_transactions t
            cross join lateral private.cassa_regola_per(p_company, t.amount, coalesce(t.description, ''), coalesce(t.creditor_name, ''),
                                                        coalesce(t.debtor_name, ''), coalesce(t.counterparty_name, '')) x
           where t.company_id = p_company and t.status = 'booked' and t.cassa_voce_id is null
             and coalesce(t.reconciliation_status, '') <> 'ignored'
           group by 1, 2, 3) e
    join public.cassa_voci v on v.id = e.voce_id;
  if p_anteprima then return r; end if;

  for riga in
    select t.id, t.operativita_revision, x.voce_id, x.testo, v.nome
      from public.bank_transactions t
      cross join lateral private.cassa_regola_per(p_company, t.amount, coalesce(t.description, ''), coalesce(t.creditor_name, ''),
                                                  coalesce(t.debtor_name, ''), coalesce(t.counterparty_name, '')) x
      join public.cassa_voci v on v.id = x.voce_id
     where t.company_id = p_company and t.status = 'booked' and t.cassa_voce_id is null
       and coalesce(t.reconciliation_status, '') <> 'ignored'
     limit 5000
  loop
    perform set_config('cassa.motivo', 'Regola: ' || riga.testo, true);
    update public.bank_transactions set
      cassa_voce_id = riga.voce_id, cassa_voce_origine = 'regola', cassa_voce_il = now(), cassa_voce_da = auth.uid(),
      cassa_ripartizione = null, category = riga.nome, operativita_revision = operativita_revision + 1
     where id = riga.id and company_id = p_company and cassa_voce_id is null and operativita_revision = riga.operativita_revision;
    if found then n := n + 1; end if;
  end loop;
  return r || jsonb_build_object('aggiornati', n);
end $$;
revoke all on function public.cassa_regole_applica(uuid, boolean) from public, anon;
grant execute on function public.cassa_regole_applica(uuid, boolean) to authenticated;

-- ── 4. Le proposte, nel nuovo ordine ──────────────────────────────────────────
create or replace function public.cassa_voci_movimenti(p_company uuid, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.bank_operativa_access(p_company, false);
  if coalesce(array_length(p_ids, 1), 0) > 200 then raise exception 'Troppi movimenti in una volta'; end if;
  with tx as (
    select t.id, t.category, t.cassa_voce_id, t.cassa_voce_origine, t.cassa_voce_il, t.cassa_ripartizione,
           case when t.cassa_voce_id is null then
             (select x.voce_id from private.cassa_regola_per(p_company, t.amount, coalesce(t.description, ''), coalesce(t.creditor_name, ''),
                                                             coalesce(t.debtor_name, ''), coalesce(t.counterparty_name, '')) x) end as da_regola,
           case when t.cassa_voce_id is null then private.cassa_proposta_documento(p_company, t.id) end as dal_documento,
           case when t.cassa_voce_id is null and private.cassa_e_giroconto(p_company, t.id) then
             (select g.id from public.cassa_voci g where g.company_id = p_company and g.codice = '21.01' and g.attiva and g.archiviata_il is null) end as da_giroconto
      from public.bank_transactions t
     where t.company_id = p_company and t.id = any (p_ids)
  ), scelta as (
    select tx.*,
           coalesce(tx.cassa_voce_id, tx.da_regola, (tx.dal_documento->0->>'id')::uuid, tx.da_giroconto,
             (select x.id from public.cassa_voci x where x.company_id = p_company and x.codice = private.cassa_codice_da_testo(tx.category))) as voce_id
      from tx
  )
  select coalesce(jsonb_object_agg(s.id, jsonb_build_object(
           'id', v.id, 'codice', v.codice, 'nome', v.nome, 'categoria', c.nome,
           'origine', case when s.cassa_voce_id is not null then s.cassa_voce_origine
                           when s.da_regola is not null then 'regola'
                           when s.dal_documento is not null then 'documento'
                           when s.da_giroconto is not null then 'giroconto' else 'storico' end,
           'confermata', s.cassa_voce_id is not null and s.cassa_voce_origine <> 'proposta',
           'il', s.cassa_voce_il,
           'quote', private.cassa_quote_lette(s.cassa_ripartizione),
           'proposta_quote', case when s.da_regola is null and jsonb_array_length(s.dal_documento) > 1 then s.dal_documento end)), '{}'::jsonb)
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
    select t.id, t.account_id, t.booking_date, t.description, t.category, t.cassa_voce_id, t.cassa_voce_origine, t.operativita_revision,
           t.cassa_ripartizione, t.amount, t.creditor_name, t.debtor_name, t.counterparty_name,
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
  ), giroconto as (
    select g.id from public.cassa_voci g where g.company_id = p_company and g.codice = '21.01' and g.attiva and g.archiviata_il is null
  ), con_proposta as (
    select tx.*,
           case when tx.cassa_voce_id is null then
             (select x.voce_id from private.cassa_regola_per(p_company, tx.amount, coalesce(tx.description, ''), coalesce(tx.creditor_name, ''),
                                                             coalesce(tx.debtor_name, ''), coalesce(tx.counterparty_name, '')) x) end as da_regola,
           case when tx.cassa_voce_id is null then private.cassa_proposta_documento(p_company, tx.id) end as dal_documento,
           case when tx.cassa_voce_id is null and private.cassa_e_giroconto(p_company, tx.id) then (select id from giroconto) end as da_giroconto,
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
                             when p.da_regola is not null then 'regola'
                             when p.dal_documento is not null then 'documento'
                             when p.da_giroconto is not null then 'giroconto'
                             when p.da_controparte is not null then 'controparte' else 'storico' end,
             'confermata', p.cassa_voce_id is not null and p.cassa_voce_origine <> 'proposta',
             'quote', private.cassa_quote_lette(p.cassa_ripartizione),
             'proposta_quote', case when p.da_regola is null and jsonb_array_length(p.dal_documento) > 1 then p.dal_documento end) end)
           order by p.booking_date desc, p.id), '[]'::jsonb)
    into r
    from con_proposta p
    left join public.cassa_voci v on v.company_id = p_company
     and v.id = coalesce(p.cassa_voce_id, p.da_regola, (p.dal_documento->0->>'id')::uuid, p.da_giroconto, p.da_controparte, p.da_testo)
    left join public.cassa_voci c on c.id = v.parent_id and v.livello in ('voce', 'sottovoce');
  return r;
end $$;
revoke all on function public.cassa_movimenti_da_classificare(uuid, date, date) from public, anon;
grant execute on function public.cassa_movimenti_da_classificare(uuid, date, date) to authenticated;
