-- Classificare i movimenti in blocco dal Cash flow (14/11/2026)
--
-- Il popup «Classifica movimenti» del Cash flow lavora su tutti i movimenti di
-- un periodo, non su una pagina da 50. Servono due cose che il browser non può
-- fare da solo (la revisione del movimento non è tra le colonne che legge):
--
--  - `cassa_movimenti_da_classificare(azienda, dal, al)`: i movimenti
--    contabilizzati del periodo con la categoria confermata o, se manca, una
--    PROPOSTA. Le proposte, nell'ordine:
--      1. la controparte: l'ultima categoria scelta A MANO per lo stesso IBAN
--         (o, senza IBAN, lo stesso nome) nello stesso verso — «se pago
--         abitualmente questo fornitore per i materiali, propongo Materiali»;
--      2. la vecchia categoria testuale del movimento.
--    Una proposta resta proposta: la conferma una persona.
--
--  - `cassa_classifica_movimenti(azienda, movimenti[], voce, motivo, anche_confermati)`:
--    stessa categoria a più movimenti, con gli stessi controlli della scelta
--    singola (voce attiva, dell'azienda, verso giusto). Quelli che hanno già
--    una categoria confermata DIVERSA si saltano, a meno che chi classifica
--    non lo chieda esplicitamente: niente riclassificazioni silenziose.
--    Ogni cambio finisce in `cassa_voce_storico` con autore e motivo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.cassa_movimenti_da_classificare(p_company uuid, p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.bank_operativa_access(p_company, false);
  if p_dal is null or p_al is null or p_al < p_dal then raise exception 'Periodo non valido'; end if;
  if p_al - p_dal > 400 then raise exception 'Periodo troppo lungo: al massimo un anno alla volta'; end if;
  with tx as (
    select t.id, t.booking_date, t.description, t.category, t.cassa_voce_id, t.cassa_voce_origine, t.operativita_revision,
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
      ) x
     where nullif(chiave, '') is not null
     order by chiave, entrata, il desc
  ), con_proposta as (
    select tx.*,
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
                             when p.da_controparte is not null then 'controparte' else 'storico' end,
             'confermata', p.cassa_voce_id is not null and p.cassa_voce_origine <> 'proposta') end)
           order by p.booking_date desc, p.id), '[]'::jsonb)
    into r
    from con_proposta p
    left join public.cassa_voci v on v.company_id = p_company and v.id = coalesce(p.cassa_voce_id, p.da_controparte, p.da_testo)
    left join public.cassa_voci c on c.id = v.parent_id and v.livello in ('voce', 'sottovoce');
  return r;
end $$;
revoke all on function public.cassa_movimenti_da_classificare(uuid, date, date) from public, anon;
grant execute on function public.cassa_movimenti_da_classificare(uuid, date, date) to authenticated;

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

  if not p_anche_confermati then
    select count(*) into saltati from public.bank_transactions t
     where t.company_id = p_company and t.id = any (p_tx)
       and t.cassa_voce_id is not null and t.cassa_voce_id <> p_voce and t.cassa_voce_origine <> 'proposta';
  end if;

  perform set_config('cassa.motivo', coalesce(p_motivo, ''), true);
  update public.bank_transactions t set
    cassa_voce_id = p_voce, cassa_voce_origine = 'manuale', cassa_voce_il = now(), cassa_voce_da = auth.uid(),
    category = v.nome, operativita_revision = t.operativita_revision + 1
   where t.company_id = p_company and t.id = any (p_tx) and t.status = 'booked'
     and t.cassa_voce_id is distinct from p_voce
     and (p_anche_confermati or t.cassa_voce_id is null or t.cassa_voce_origine = 'proposta');
  get diagnostics aggiornati = row_count;
  return jsonb_build_object('aggiornati', aggiornati, 'saltati', saltati);
end $$;
revoke all on function public.cassa_classifica_movimenti(uuid, uuid[], uuid, text, boolean) from public, anon;
grant execute on function public.cassa_classifica_movimenti(uuid, uuid[], uuid, text, boolean) to authenticated;
