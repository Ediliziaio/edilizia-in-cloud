-- ════════════════════════════════════════════════════════════════════════════
-- La scadenza di una fattura fornitore si legge dall'XML, non è la sua data
-- ════════════════════════════════════════════════════════════════════════════
-- Vedi docs/flussi-acquisti-pagamenti.md, sezione 1-bis. Approvato da Florin il
-- 29/10/2026: «la scadenza dei costi da fattura si legge dall'XML (tutte le
-- rate), e i 224 di renova si riallineano».
--
-- IL GUASTO. `contabilizza_fattura_ricevuta`, quando una fattura diventa un
-- costo da pagare, gli metteva come scadenza la DATA DELLA FATTURA, sempre. Una
-- fattura del 3 ottobre a 60 giorni risultava da pagare il 3 ottobre.
--
-- Quanto pesava davvero, misurato su renova (224 costi da fattura, tutti con
-- scadenza = data della fattura, tutti «scaduti» per 244.919 €):
--   153  l'XML stesso dice «si paga il giorno della fattura»: erano GIÀ giusti;
--    31  l'XML dice una data successiva: spostati in avanti (82.192 €);
--    20  carta o contanti: la data della fattura è quella giusta;
--    20  nessuna data in nessun posto: diventano «senza scadenza» (10.628 €).
-- Quindi la maggior parte di quei «scaduti» lo è DAVVERO secondo il suo XML:
-- il problema di renova è un altro, nessuno dei 224 risulta pagato. Questa
-- migrazione mette le date giuste, non svuota lo scaduto. Il guasto vero è la
-- regola: per le fatture a 30/60/90 giorni la scadenza era falsa.
--
-- Il lettore TypeScript (`_shared/fatturapaReader.ts`) la estraeva già — ma
-- solo dalla prima rata — e nessuno dei tre import delle fatture ricevute la
-- usava. Qui la si legge nel database, dall'XML salvato, al momento in cui la
-- fattura diventa un costo: è l'unico punto dove serve, e lì l'XML c'è.
--
-- LA REGOLA, in quest'ordine:
--   1. la scadenza più vicina fra le rate dell'XML (`DataScadenzaPagamento`, o
--      `DataRiferimentoTerminiPagamento` + `GiorniTerminiPagamento`);
--   2. se non c'è una data ma la fattura è pagata con CARTA o CONTANTI (MP08,
--      MP01), la data della fattura: il pagamento è contestuale, e lì è giusta;
--   3. altrimenti SENZA SCADENZA, dichiarata: la convenzione del progetto è
--      `due_date = '9999-12-31'` (vedi `src/lib/costsUtils.ts`), che il
--      previsionale tiene fuori dai totali di periodo e mostra a parte come
--      «costi senza scadenza». Mai più la data della fattura per finta.
--
-- TUTTE LE RATE. Le rate si leggono tutte (`rate_pagamento_da_xml`). Il costo
-- però resta UNO per fattura: la scelta fra «tabella delle rate» e «una riga di
-- costo per rata» è ancora aperta (docs/flussi-acquisti-pagamenti.md, «Da
-- decidere»), e spezzare il costo adesso romperebbe il legame unico
-- `fatture_ricevute.company_cost_id` su cui contano note di credito, SAL e
-- riepiloghi. Quindi: scadenza = la PRIMA rata, e quando le rate sono più di
-- una il piano intero si scrive nelle note del costo, perché si veda. Su renova
-- le fatture a più rate sono 2 su 224. Fino alla decisione, per quelle il
-- previsionale vede l'importo intero alla prima rata: un'uscita anticipata, mai
-- una dimenticata.
--
-- Il METODO di pagamento si scrive sul costo quando l'XML lo dice (MP12 →
-- «riba», MP05 → «bonifico»…), con un codice solo per la RiBa: `riba`.
--
-- E per poterlo scrivere la RiBa deve ESISTERE: il primo tentativo di questa
-- migrazione è fallito (e non ha toccato niente) perché il vincolo
-- `company_costs_payment_method_check` ammetteva bonifico, contanti, carta,
-- RID, assegno, altro — e basta. La tabella dei debiti non poteva dire che un
-- debito si paga con RiBa. Qui si aggiunge. RID resta il nome del SEPA SDD
-- (MP19-MP21), che è un'altra cosa.
--
-- L'ACCORDO col fornitore (termini sul fornitore o sull'ordine) dovrà vincere
-- sull'XML — è la regola concordata — ma oggi nessun fornitore ha i termini
-- compilati e la segnalazione «la fattura chiede di essere pagata prima del
-- pattuito» non c'è ancora: è il passo dopo, non questo.
--
-- I COSTI GIÀ NATI. Si riallineano solo quelli che portano il segno preciso
-- del guasto: creati da `contabilizza_fattura_ricevuta`, con l'XML, non
-- pagati, con scadenza uguale alla data della fattura. Sono esattamente i 224
-- di renova: la migrazione lo verifica e si ferma se i numeri non tornano. Per
-- 173 di loro la data non cambia (l'XML dice la stessa, o è carta/contanti):
-- cambiano il metodo di pagamento, che era vuoto su tutti, e la nota.
-- Le fatture senza XML (Dimora, Best Infissi, Innovasol) non si toccano qui.
--
-- Il corpo di `contabilizza_fattura_ricevuta` è lungo e nessun'altra parte
-- cambia: si sostituiscono solo i pezzi necessari, e ogni sostituzione deve
-- trovare il suo testo esattamente una volta, altrimenti la migrazione si
-- ferma senza toccare niente.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 0. La RiBa fra i metodi di pagamento di un costo ────────────────────────
-- 1.794 righe: il nuovo vincolo si verifica in un attimo.

alter table public.company_costs drop constraint if exists company_costs_payment_method_check;
alter table public.company_costs add constraint company_costs_payment_method_check
  check (payment_method = any (array['bonifico', 'contanti', 'carta', 'riba', 'rid', 'assegno', 'altro']));

-- ── 1. Tutte le rate di una fattura, dal suo XML ────────────────────────────

create or replace function public.rate_pagamento_da_xml(p_xml text, p_indice_corpo integer default 0)
returns jsonb
language plpgsql stable set search_path = '' as $fn$
declare
  v_testo  text;
  v_doc    xml;
  v_corpo  xml;
  v_rata   xml;
  v_out    jsonb := '[]'::jsonb;
  v_scad   text;
  v_giorni text;
  v_rif    text;
  v_imp    text;
  v_data   date;
  v_cond   text;
begin
  if p_xml is null or btrim(p_xml) = '' then
    return v_out;
  end if;
  -- La dichiarazione <?xml … encoding=…?> e il BOM fanno fallire xmlparse su
  -- un testo già in UTF-8: si tolgono. Un XML che non si legge non è un
  -- errore della contabilizzazione: semplicemente non dice le rate.
  v_testo := regexp_replace(p_xml, '^﻿', '');
  v_testo := regexp_replace(v_testo, '^\s*<\?xml[^>]*\?>', '');
  begin
    v_doc := xmlparse(document v_testo);
  exception when others then
    return v_out;
  end;

  -- Un file può contenere più fatture (lotto): si legge il corpo giusto.
  -- `local-name()` perché i prefissi di namespace cambiano da un emittente
  -- all'altro.
  v_corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])['
                    || (coalesce(p_indice_corpo, 0) + 1) || ']', v_doc))[1];
  if v_corpo is null then
    return v_out;
  end if;

  v_cond := nullif(btrim((xpath(
    'string(//*[local-name()="DatiPagamento"]/*[local-name()="CondizioniPagamento"])',
    v_corpo))[1]::text), '');

  for v_rata in
    select unnest(xpath('//*[local-name()="DettaglioPagamento"]', v_corpo))
  loop
    -- Sul frammento della rata il nodo di partenza è la rata stessa: i campi
    -- sono i suoi figli, cioè /*/*.
    v_scad   := nullif(btrim((xpath('string(/*/*[local-name()="DataScadenzaPagamento"])', v_rata))[1]::text), '');
    v_giorni := nullif(btrim((xpath('string(/*/*[local-name()="GiorniTerminiPagamento"])', v_rata))[1]::text), '');
    v_rif    := nullif(btrim((xpath('string(/*/*[local-name()="DataRiferimentoTerminiPagamento"])', v_rata))[1]::text), '');
    v_imp    := nullif(btrim((xpath('string(/*/*[local-name()="ImportoPagamento"])', v_rata))[1]::text), '');

    v_data := null;
    if v_scad ~ '^\d{4}-\d{2}-\d{2}$' then
      v_data := v_scad::date;
    elsif v_rif ~ '^\d{4}-\d{2}-\d{2}$' and v_giorni ~ '^\d{1,3}$' then
      v_data := v_rif::date + v_giorni::int;
    end if;

    v_out := v_out || jsonb_build_object(
      'scadenza',   v_data,
      'importo',    case when v_imp ~ '^-?\d+(\.\d+)?$' then v_imp::numeric end,
      'modalita',   nullif(btrim((xpath('string(/*/*[local-name()="ModalitaPagamento"])', v_rata))[1]::text), ''),
      'iban',       nullif(btrim((xpath('string(/*/*[local-name()="IBAN"])', v_rata))[1]::text), ''),
      'condizioni', v_cond
    );
  end loop;

  return v_out;
end
$fn$;

comment on function public.rate_pagamento_da_xml(text, integer) is
  'Tutte le rate di una fattura elettronica (DatiPagamento): scadenza, importo, modalità (MP..), IBAN, condizioni (TP..). Un XML illeggibile dà un elenco vuoto, non un errore.';

revoke all on function public.rate_pagamento_da_xml(text, integer) from public, anon;
grant execute on function public.rate_pagamento_da_xml(text, integer) to authenticated, service_role;

-- ── 2. Dalle rate: quando si paga, come, e che cosa dirlo ───────────────────

create or replace function public.piano_pagamento_da_xml(
  p_xml text, p_indice_corpo integer, p_data_fattura date
)
returns jsonb
language plpgsql stable set search_path = '' as $fn$
declare
  v_rate     jsonb := public.rate_pagamento_da_xml(p_xml, p_indice_corpo);
  v_prima    date;
  v_mp       text;
  v_metodo   text;
  v_scadenza date;
  v_nota     text;
begin
  select min((e->>'scadenza')::date) into v_prima
    from jsonb_array_elements(v_rate) e
   where e->>'scadenza' is not null;

  v_mp := v_rate->0->>'modalita';

  -- Un codice solo per metodo: la RiBa è `riba`, non anche `ri.ba`.
  -- Solo i codici che `company_costs_payment_method_check` ammette, e solo
  -- quando la corrispondenza è esatta: un vaglia (MP06) o un bollettino (MP07)
  -- non sono bonifici, e restano senza metodo piuttosto che con quello sbagliato.
  v_metodo := case
                when v_mp in ('MP01', 'MP04')         then 'contanti'
                when v_mp in ('MP02', 'MP03')         then 'assegno'
                when v_mp = 'MP05'                    then 'bonifico'
                when v_mp = 'MP08'                    then 'carta'
                when v_mp = 'MP12'                    then 'riba'
                when v_mp in ('MP19', 'MP20', 'MP21') then 'rid'
                else null
              end;

  v_scadenza := case
    when v_prima is not null then v_prima
    -- carta e contanti si pagano sul momento: lì la data della fattura è giusta
    when v_mp in ('MP01', 'MP08') then p_data_fattura
    -- nessuno lo sa: senza scadenza, dichiarata (convenzione del progetto)
    else date '9999-12-31'
  end;

  -- Con più rate il costo resta uno solo (la scelta del modello è aperta): il
  -- piano intero va scritto, perché non lo si perda di vista.
  if jsonb_array_length(v_rate) > 1 then
    select ' · Rate dall''XML: ' || string_agg(
             coalesce(to_char((e->>'scadenza')::date, 'DD/MM/YYYY'), 'senza data')
             || coalesce(' ' || replace(to_char((e->>'importo')::numeric, 'FM999999990.00'), '.', ',') || ' €', '')
             || coalesce(' ' || nullif(e->>'modalita', ''), ''),
             ' · ' order by (e->>'scadenza')::date nulls last)
      into v_nota
      from jsonb_array_elements(v_rate) e;
  end if;

  return jsonb_build_object(
    'scadenza', v_scadenza,
    'metodo',   v_metodo,
    'nota',     v_nota,
    'rate',     jsonb_array_length(v_rate)
  );
end
$fn$;

comment on function public.piano_pagamento_da_xml(text, integer, date) is
  'Scadenza, metodo e nota di un costo nato da una fattura ricevuta. Scadenza: la rata più vicina dell''XML; carta/contanti → data fattura; altrimenti 9999-12-31 (senza scadenza, dichiarata). Mai la data della fattura per finta.';

revoke all on function public.piano_pagamento_da_xml(text, integer, date) from public, anon;
grant execute on function public.piano_pagamento_da_xml(text, integer, date) to authenticated, service_role;

-- ── 3. La contabilizzazione usa il piano invece della data della fattura ────

do $migrazione$
declare
  v_def   text;
  v_nuova text;

  -- sostituisce `p_vecchio` (regex) con `p_nuovo` esattamente una volta
  -- (l'aiutante è scritto in linea per non lasciare funzioni di servizio)
  v_conta int;
begin
  v_def := pg_get_functiondef('public.contabilizza_fattura_ricevuta'::regproc);

  if position('piano_pagamento_da_xml' in v_def) > 0 then
    raise notice 'contabilizza_fattura_ricevuta: già corretta, niente da fare';
    return;
  end if;

  -- a) la variabile per il piano
  select count(*) into v_conta from regexp_matches(v_def, '\n(\s*)v_esito(\s+)text;\s*\nbegin', 'g');
  if v_conta <> 1 then
    raise exception 'contabilizza: dichiarazione di v_esito trovata % volte, attesa 1', v_conta;
  end if;
  v_nuova := regexp_replace(v_def, '\n(\s*)v_esito(\s+)text;\s*\nbegin',
                            E'\n\\1v_esito\\2text;\n\\1v_piano          jsonb;\nbegin');

  -- b) il piano si calcola subito prima dell'unico insert del costo
  select count(*) into v_conta from regexp_matches(v_nuova, '\n(\s*)insert into public\.company_costs \(', 'g');
  if v_conta <> 1 then
    raise exception 'contabilizza: insert del costo trovato % volte, atteso 1', v_conta;
  end if;
  v_nuova := regexp_replace(v_nuova, '\n(\s*)insert into public\.company_costs \(',
    E'\n\\1-- La scadenza dall''XML, non la data della fattura (29/10/2026).\n'
    || E'\\1v_piano := public.piano_pagamento_da_xml(f.xml_raw, f.indice_corpo, f.data_fattura);\n'
    || E'\\1insert into public.company_costs (');

  -- c) anche il metodo di pagamento, fra le colonne
  select count(*) into v_conta from regexp_matches(v_nuova, 'due_date, is_paid, notes\n', 'g');
  if v_conta <> 1 then
    raise exception 'contabilizza: elenco colonne trovato % volte, atteso 1', v_conta;
  end if;
  v_nuova := regexp_replace(v_nuova, 'due_date, is_paid, notes\n',
                            E'due_date, is_paid, notes, payment_method\n');

  -- d) la scadenza: il piano invece della data della fattura
  select count(*) into v_conta from regexp_matches(v_nuova, 'f\.data_fattura, false,', 'g');
  if v_conta <> 1 then
    raise exception 'contabilizza: «f.data_fattura, false,» trovato % volte, atteso 1', v_conta;
  end if;
  v_nuova := regexp_replace(v_nuova, 'f\.data_fattura, false,',
                            '(v_piano->>''scadenza'')::date, false,');

  -- e) le note (col piano, se ha più rate) e il metodo, in fondo ai valori
  select count(*) into v_conta from regexp_matches(v_nuova,
    '''Generato contabilizzando la fattura ricevuta '' \|\| coalesce\(f\.numero_fattura, ''''\)\n(\s*)\)', 'g');
  if v_conta <> 1 then
    raise exception 'contabilizza: fine dei valori trovata % volte, attesa 1', v_conta;
  end if;
  v_nuova := regexp_replace(v_nuova,
    '''Generato contabilizzando la fattura ricevuta '' \|\| coalesce\(f\.numero_fattura, ''''\)\n(\s*)\)',
    E'''Generato contabilizzando la fattura ricevuta '' || coalesce(f.numero_fattura, '''')\n'
    || E'        || coalesce(v_piano->>''nota'', ''''),\n'
    || E'      v_piano->>''metodo''\n\\1)');

  if v_nuova = v_def then
    raise exception 'contabilizza: nessuna sostituzione avvenuta';
  end if;
  execute v_nuova;
end
$migrazione$;

-- ── 4. I costi già nati col guasto: i 224 di renova ─────────────────────────

do $bonifica$
declare
  v_candidati int;
  v_aziende   int;
  v_renova    int;
  v_fatti     int;
begin
  -- Il segno preciso del guasto, e nient'altro.
  create temp table _da_riallineare on commit drop as
  select cc.id as cost_id, f.company_id,
         public.piano_pagamento_da_xml(f.xml_raw, f.indice_corpo, f.data_fattura) as piano
    from public.fatture_ricevute f
    join public.company_costs cc on cc.id = f.company_cost_id
   where f.xml_raw is not null
     and cc.notes like 'Generato contabilizzando la fattura ricevuta%'
     and cc.due_date = f.data_fattura
     and not coalesce(cc.is_paid, false);

  select count(*), count(distinct company_id),
         count(*) filter (where company_id = (select id from public.companies where name = 'renova solution srl'))
    into v_candidati, v_aziende, v_renova
    from _da_riallineare;

  -- L'approvazione è per «i 224 di renova»: se il database dice altro, ci si
  -- ferma prima di toccare debiti veri.
  if v_candidati <> 224 or v_aziende <> 1 or v_renova <> 224 then
    raise exception 'Bonifica fermata: attesi 224 costi di renova, trovati % in % aziende (% di renova)',
      v_candidati, v_aziende, v_renova;
  end if;

  update public.company_costs cc
     set due_date       = (r.piano->>'scadenza')::date,
         payment_method = coalesce(cc.payment_method, r.piano->>'metodo'),
         notes          = cc.notes || coalesce(r.piano->>'nota', '')
                          || ' · Scadenza riletta dall''XML il 29/10/2026 (prima era la data della fattura)'
    from _da_riallineare r
   where cc.id = r.cost_id;
  get diagnostics v_fatti = row_count;

  if v_fatti <> 224 then
    raise exception 'Bonifica: aggiornati % costi invece di 224', v_fatti;
  end if;
end
$bonifica$;

-- ── 5. Controllo ────────────────────────────────────────────────────────────

do $$
declare
  v_ancora int;
begin
  if position('piano_pagamento_da_xml' in pg_get_functiondef('public.contabilizza_fattura_ricevuta'::regproc)) = 0 then
    raise exception 'contabilizza_fattura_ricevuta non usa il piano di pagamento';
  end if;
  if position('f.data_fattura, false,' in pg_get_functiondef('public.contabilizza_fattura_ricevuta'::regproc)) > 0 then
    raise exception 'contabilizza_fattura_ricevuta usa ancora la data della fattura come scadenza';
  end if;

  -- Ogni costo nato da una fattura con l'XML, non pagato, deve avere la
  -- scadenza che il piano ricava dal suo XML. Non «mai la data della fattura»:
  -- quando l'XML stesso dice quella data (153 casi su renova), è giusta.
  select count(*) into v_ancora
    from public.fatture_ricevute f
    join public.company_costs cc on cc.id = f.company_cost_id
   where f.xml_raw is not null
     and cc.notes like 'Generato contabilizzando la fattura ricevuta%'
     and not coalesce(cc.is_paid, false)
     and cc.due_date is distinct from
         (public.piano_pagamento_da_xml(f.xml_raw, f.indice_corpo, f.data_fattura)->>'scadenza')::date;
  if v_ancora > 0 then
    raise exception 'Restano % costi con una scadenza diversa da quella del loro XML', v_ancora;
  end if;
end $$;
