-- Riconciliazione senza AI, lotto A (28/11/2026): l'analisi dei movimenti per ogni azienda.
--
-- COSA SI È VISTO IN PRODUZIONE
-- Il giro del mattino (`bank-auto-reconcile`, cron 06:02 UTC) prendeva le aziende solo da
-- `bank_connections` attive: chi carica l'estratto a mano non veniva mai classificato in
-- `tesoreria_esiti`. E anche l'unica azienda collegata non lo era più: la chiamata
-- `tesoreria_classifica_movimenti(p_limite => 100)` arriva da PostgREST, che dà al ruolo
-- `authenticator` uno `statement_timeout` di 8 secondi. Classificare un movimento costa circa
-- 0,4 secondi (misurato: 10 → 3,9 s, 25 → 9,6 s, 100 → 39 s), quindi ogni giro moriva con
-- 57014 dopo 8 secondi e tornava indietro per intero. Il `set_config('statement_timeout','60s')`
-- dentro la funzione non aiuta: vale dall'istruzione successiva, non per quella già partita.
-- Nei log: `POST | 500 | rpc/tesoreria_classifica_movimenti` ogni mattina almeno dal 23/11,
-- mentre la funzione rispondeva 200 perché gli errori stanno nel corpo.
--
-- COSA FA QUESTA MIGRAZIONE (le regole della classificazione non si toccano: sono del lotto B)
--  1. `tesoreria_aziende_da_classificare` — le aziende con movimenti aperti recenti, a rotazione
--     (prima chi ha movimenti senza esito, poi chi è stato guardato meno di recente). La usa il
--     giro del mattino, che ora classifica a lotti da 5 sotto il tetto degli 8 secondi.
--  2. Una coda dopo i caricamenti: un trigger d'istruzione su `bank_transactions` mette in coda
--     l'azienda di ogni movimento nuovo, da qualunque parte arrivi (estratto caricato a mano,
--     import CSV/AI, Open Banking, script). Un cron SQL ogni minuto la lavora una azienda per
--     volta, fuori da PostgREST e senza pg_net: nessun tetto degli 8 secondi, nessuna coda
--     degli HTTP tenuta ferma.
--  3. `tesoreria_aperti_vecchi` — quanti movimenti sono aperti da oltre 30 giorni e quanto
--     valgono: il riquadro del registro movimenti e la riga del brief del mattino.
--  4. `bank_movimenti_elenco` sa ordinare per importo (`p_filters.sort = 'amount'`).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tesoreria_aziende_da_classificare(
  p_giorni integer default 180, p_limite integer default 20
) returns jsonb language sql stable security definer set search_path = '' as $$
  with aperti as (
    select t.company_id, t.id, e.calcolato_at
    from public.bank_transactions t
    left join public.tesoreria_esiti e on e.transaction_id = t.id
    where t.chiuso_senza_documento is null
      and coalesce(t.reconciliation_status,'pending') in ('pending','suggestion','parziale')
      and t.booking_date >= current_date - least(greatest(coalesce(p_giorni,180),1),730)
  ), aziende as (
    select a.company_id, count(*)::integer aperti,
      count(*) filter (where a.calcolato_at is null)::integer senza_esito,
      min(a.calcolato_at) calcolo_piu_vecchio
    from aperti a join public.companies c on c.id = a.company_id
    group by a.company_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('company_id',company_id,'aperti',aperti,
      'senza_esito',senza_esito,'calcolo_piu_vecchio',calcolo_piu_vecchio)
    order by (senza_esito > 0) desc, calcolo_piu_vecchio asc nulls first, company_id), '[]'::jsonb)
  from (select * from aziende
        order by (senza_esito > 0) desc, calcolo_piu_vecchio asc nulls first, company_id
        limit least(greatest(coalesce(p_limite,20),1),200)) x;
$$;
revoke all on function public.tesoreria_aziende_da_classificare(integer,integer) from public, anon, authenticated;
grant execute on function public.tesoreria_aziende_da_classificare(integer,integer) to service_role;

-- 2. ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists private.tesoreria_classifica_coda(
  company_id uuid primary key references public.companies(id) on delete cascade,
  richiesta_at timestamptz not null default now(),
  prossimo_at timestamptz not null default now(),
  tentativi integer not null default 0,
  ultimo_errore text
);
revoke all on private.tesoreria_classifica_coda from public, anon, authenticated;

-- Non deve mai far fallire un caricamento: se la coda non si scrive, il giro del mattino
-- recupera comunque i movimenti senza esito.
create or replace function private.tes_coda_movimenti_nuovi()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into private.tesoreria_classifica_coda(company_id, richiesta_at, prossimo_at, tentativi, ultimo_errore)
    select distinct n.company_id, now(), now(), 0, null
    from nuovi n
    where n.company_id is not null and n.chiuso_senza_documento is null
      and coalesce(n.reconciliation_status,'pending') in ('pending','suggestion','parziale')
    on conflict (company_id) do update
      set richiesta_at = excluded.richiesta_at, prossimo_at = excluded.prossimo_at,
          tentativi = 0, ultimo_errore = null;
  exception when others then
    raise warning 'Coda della classificazione non aggiornata: % %', sqlstate, sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.tes_coda_movimenti_nuovi() from public, anon, authenticated, service_role;

drop trigger if exists tes_coda_classifica_dopo_insert on public.bank_transactions;
create trigger tes_coda_classifica_dopo_insert
  after insert on public.bank_transactions
  referencing new table as nuovi
  for each statement execute function private.tes_coda_movimenti_nuovi();

-- Una azienda per giro: il classificatore tiene il lucchetto dell'azienda (3101) fino alla fine
-- della transazione, e così lo tiene per un'azienda sola e al massimo per `p_tetto_ms` (8 s): un lotto parte solo se ci sta ancora dentro.
create or replace function private.tesoreria_classifica_coda_lavora(
  p_tetto_ms integer default 8000, p_lotto integer default 10
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r private.tesoreria_classifica_coda;
  inizio timestamptz := clock_timestamp();
  esito jsonb;
  analizzati integer := 0;
  ultimi integer;
  restano integer;
  lotto integer := least(greatest(coalesce(p_lotto,10),1),50);
  tetto interval := make_interval(secs => greatest(coalesce(p_tetto_ms,8000),1000) / 1000.0);
  partenza timestamptz;
  durata interval := interval '0';
begin
  -- Due giri insieme non servono: il secondo esce subito.
  if not pg_try_advisory_xact_lock(hashtextextended('tesoreria_classifica_coda',3102)) then
    return jsonb_build_object('saltato','giro già in corso');
  end if;
  select * into r from private.tesoreria_classifica_coda q
  where q.prossimo_at <= now() order by q.prossimo_at, q.richiesta_at limit 1;
  if not found then return jsonb_build_object('aziende',0); end if;

  -- Il classificatore ammette il servizio o chi può riconciliare; qui non c'è un utente.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    loop
      partenza := clock_timestamp();
      esito := private.tes_classifica_movimenti_selezionati(r.company_id, lotto, false, null::uuid[]);
      ultimi := coalesce((esito->>'analizzati')::integer, 0);
      durata := greatest(durata, clock_timestamp() - partenza);
      analizzati := analizzati + ultimi;
      select count(*) into restano
      from public.bank_transactions t
      left join public.tesoreria_esiti e on e.transaction_id = t.id
      where t.company_id = r.company_id and e.transaction_id is null and t.chiuso_senza_documento is null
        and coalesce(t.reconciliation_status,'pending') in ('pending','suggestion','parziale');
      exit when restano = 0 or ultimi < lotto
        -- Un altro lotto solo se ci sta ancora dentro il tetto (stima: il lotto più lungo visto).
        or clock_timestamp() - inizio + durata > tetto;
    end loop;
    if restano = 0 then
      -- Se nel frattempo è arrivato un caricamento nuovo, la richiesta è cambiata e resta in coda.
      delete from private.tesoreria_classifica_coda q
      where q.company_id = r.company_id and q.richiesta_at = r.richiesta_at;
    else
      -- In fondo alla coda: le altre aziende non aspettano chi ha caricato mille righe.
      update private.tesoreria_classifica_coda q set prossimo_at = now(), tentativi = 0, ultimo_errore = null
      where q.company_id = r.company_id;
    end if;
  exception when others then
    update private.tesoreria_classifica_coda q
      set tentativi = r.tentativi + 1,
          prossimo_at = now() + make_interval(mins => least(60, 1 + r.tentativi * 5)),
          ultimo_errore = left(sqlstate || ' ' || sqlerrm, 300)
    where q.company_id = r.company_id;
    return jsonb_build_object('company_id', r.company_id, 'errore', left(sqlstate || ' ' || sqlerrm, 300));
  end;
  return jsonb_build_object('company_id', r.company_id, 'analizzati', analizzati, 'senza_esito', restano,
    'ms', round(extract(epoch from clock_timestamp() - inizio) * 1000));
end $$;
revoke all on function private.tesoreria_classifica_coda_lavora(integer,integer) from public, anon, authenticated, service_role;

-- Chi ha già movimenti aperti senza esito entra subito in coda (pochi: 2 aziende il 28/11).
insert into private.tesoreria_classifica_coda(company_id)
select distinct t.company_id
from public.bank_transactions t
join public.companies c on c.id = t.company_id
left join public.tesoreria_esiti e on e.transaction_id = t.id
where e.transaction_id is null and t.chiuso_senza_documento is null
  and coalesce(t.reconciliation_status,'pending') in ('pending','suggestion','parziale')
on conflict (company_id) do nothing;

-- pg_cron, non pg_net: lavora dentro il database e non tiene ferma la coda degli HTTP.
-- Tetto 8 s: il lucchetto 3101 dell'azienda resta preso fino al commit, e un «Analizza» o il giro
-- delle 06:02 nello stesso momento aspettano al massimo 3 s (lock_timeout del classificatore)
-- prima di fallire con 55P03. Il job gira ogni minuto: 8 s per giro non perdono niente.
-- Il tetto vero dell'istruzione è il `set_config('statement_timeout','60s')` del classificatore,
-- che vale dal primo lotto in poi: il `set statement_timeout` qui sotto copre solo l'avvio.
select cron.schedule('tesoreria-classifica-coda', '* * * * *',
  $$set statement_timeout='60s'; select private.tesoreria_classifica_coda_lavora(8000, 10);$$);

-- 3. ─────────────────────────────────────────────────────────────────────────────────────────
-- «Da oltre 30 giorni» = data contabile fino a `fino_al` (oggi meno 31). Stesse righe del
-- registro con `state = 'work'` e `to = fino_al`: stessa vista (`bank_transactions_operativi`),
-- stesso importo corretto (Salt Edge), tutte le valute. `numero` coincide quindi col conteggio
-- della lista; `importo` è il residuo in euro, `per_valuta` il residuo di ogni valuta.
create or replace function public.tesoreria_aperti_vecchi(p_company uuid, p_giorni integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  giorni integer := least(greatest(coalesce(p_giorni,30),1),365);
  fino_al date := current_date - (least(greatest(coalesce(p_giorni,30),1),365) + 1);
  esito jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    perform private.bank_operativa_access(p_company, false);
  end if;
  with righe as materialized (
    select t.booking_date, t.currency,
      case when t.metadata->>'provider'='saltedge' and t.metadata->>'currency_code'=t.currency
             and jsonb_typeof(t.metadata->'amount')='number'
           then (t.metadata->>'amount')::numeric else t.amount end amount,
      t.id
    from public.bank_transactions_operativi t
    where t.company_id = p_company and t.chiuso_senza_documento is null
      and t.reconciliation_status in ('pending','suggestion','parziale')
      and t.booking_date <= fino_al
  ), x as materialized (
    select r.*, greatest(coalesce((private.bank_movimento_links(p_company, r.id)->>'remaining')::numeric, abs(r.amount)), 0) residuo
    from righe r
  )
  select jsonb_build_object(
      'giorni', giorni,
      'fino_al', fino_al,
      'numero', count(*),
      'importo', coalesce(round(sum(x.residuo) filter (where coalesce(x.currency,'EUR') = 'EUR'), 2), 0),
      'per_valuta', coalesce((select jsonb_object_agg(v.valuta, v.residuo) from (
          select coalesce(y.currency,'EUR') valuta, round(sum(y.residuo), 2) residuo from x y group by 1) v), '{}'::jsonb),
      'entrate', count(*) filter (where x.amount > 0),
      'uscite', count(*) filter (where x.amount < 0),
      'piu_vecchio', min(x.booking_date))
    into esito
  from x;
  return esito;
end $$;
revoke all on function public.tesoreria_aperti_vecchi(uuid,integer) from public, anon;
grant execute on function public.tesoreria_aperti_vecchi(uuid,integer) to authenticated, service_role;

-- 4. ─────────────────────────────────────────────────────────────────────────────────────────
-- A toppa sulla definizione viva, come 20290430144000: altri lotti possono averla cambiata.
do $patch$
declare
  definizione text := pg_get_functiondef('public.bank_movimenti_elenco(uuid,jsonb,integer,integer)'::regprocedure);
  vecchio text := 'ORDER BY booking_date DESC NULLS LAST,id DESC';
  nuovo text := 'ORDER BY CASE WHEN p_filters->>''sort''=''amount'' THEN abs(amount) END DESC NULLS LAST,booking_date DESC NULLS LAST,id DESC';
begin
  if position('p_filters->>''sort''' in definizione) > 0 then return; end if;
  if (length(definizione) - length(replace(definizione, vecchio, ''))) / length(vecchio) <> 2 then
    raise exception 'bank_movimenti_elenco: ordinamento non riconosciuto, toppa da rivedere.';
  end if;
  execute replace(definizione, vecchio, nuovo);
end $patch$;

notify pgrst, 'reload schema';
