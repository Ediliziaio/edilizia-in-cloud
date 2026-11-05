-- Crea con Silvio: i difetti trovati dalle simulazioni su Demo Azienda 2 (2/11/2026). Vedi
-- docs/piano-silvio-commessa-ai.md. Solo CREATE OR REPLACE di funzioni, nessuna riga toccata:
-- le migrazioni 20281112* sono già in produzione e non si modificano. Ogni funzione parte dal
-- testo di produzione (`prosrc` confrontato con md5).
--
-- _silvio_aggiungi: il costo delle voci va nel lavoro, non nei materiali (costi doppi con
--   la ditta in economiaFasi); il venduto della fase è la somma delle sue voci.
-- _silvio_aggiungi_risorse: il costo previsto della ditta è con la sua IVA, come la colonna
--   vuole e come economiaFasi la toglie: il numero nel popup è quello della commessa.
-- _silvio_scrittura_permessa: senza il permesso sui costi, `tolte_permessi` lo dice.
-- commessa_annulla_silvio: le colonne si ripristinano anche dopo la cancellazione delle righe,
--   che fa ricalcolare ai trigger l'avanzamento della commessa.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public._silvio_aggiungi(p_bozza public.commessa_bozze, p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $funzione$
declare
  s jsonb := coalesce(p_bozza.scrittura, '{}'::jsonb);
  o public.orders;
  v_colonne jsonb;
  v_vuote jsonb := '{}'::jsonb;
  v_prima jsonb;
  v_dopo jsonb;
  v_diff jsonb := '{}'::jsonb;
  k text;
  v_set text;
  v_fasi jsonb := '[]'::jsonb;
  v_date jsonb := '[]'::jsonb;
  v_fase jsonb;
  v_sotto jsonb;
  v_base integer;
  v_fase_id uuid;
  v_sotto_id uuid;
  v_i integer;
  v_j integer;
  v_q numeric;
  v_costo numeric;
  v_voci integer := 0;
  v_fasi_con_voci uuid[] := '{}';
  v_totale numeric;
  v_somma numeric;
  v_fasi_prima jsonb;
  v_fasi_dopo jsonb;
  v_rate integer := 0;
  v_contratto boolean := false;
  v_risorse jsonb;
  v_inizio date;
  v_fine date;
  c jsonb;
begin
  select * into o from public.orders where id = p_order and company_id = p_bozza.company_id for update;
  v_prima := to_jsonb(o);

  -- Colonne: solo quelle vuote (null o testo vuoto). Uno 0 scritto è un valore e resta, tranne
  -- l'importo (D3): `total_amount` ha default 0 e la creazione lo mette anche quando nessuno l'ha
  -- scritto, quindi lì 0 vuol dire «manca». Chi non vede gli importi non arriva qui con un importo:
  -- lo toglie `_silvio_scrittura_permessa`.
  v_colonne := public._silvio_colonne(p_bozza.company_id, s->'ordine');
  for k in select jsonb_object_keys(v_colonne) loop
    if v_prima->k is null or jsonb_typeof(v_prima->k) = 'null' or v_prima->>k = ''
       or (k = 'total_amount' and (v_prima->>k)::numeric = 0) then
      v_vuote := v_vuote || jsonb_build_object(k, v_colonne->k);
    end if;
  end loop;
  -- Mai una fine prima dell'inizio (quarta revisione, 3): se l'altra data l'ha scritta qualcuno
  -- mentre la bozza aspettava e non torna, quella di Silvio resta fuori.
  v_inizio := coalesce(nullif(v_vuote->>'work_start_date', '')::date, o.work_start_date);
  v_fine := coalesce(nullif(v_vuote->>'work_end_date', '')::date, o.work_end_date);
  if v_fine < v_inizio then
    v_vuote := v_vuote - (case when v_vuote ? 'work_end_date' then 'work_end_date' else 'work_start_date' end);
  end if;
  if v_vuote <> '{}'::jsonb then
    select string_agg(format('%I = r.%I', k2, k2), ', ') into v_set from jsonb_object_keys(v_vuote) k2;
    execute format('update public.orders o set %s from jsonb_populate_record(null::public.orders, $1) r where o.id = $2', v_set)
      using v_vuote, p_order;
  end if;

  -- Fasi che mancano, per nome (come commessa_pianifica_fasi), con le sottofasi.
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object('start_date', f.start_date, 'end_date', f.end_date)), '{}'::jsonb)
    into v_fasi_prima from public.order_work_phases f where f.order_id = p_order;
  for v_fase in select value from jsonb_array_elements(coalesce(s->'fasi', '[]'::jsonb)) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    if nullif(v_fase->>'inizio', '') is not null and nullif(v_fase->>'fine', '') is not null then
      v_date := v_date || jsonb_build_array(jsonb_build_object('nome', v_fase->>'nome', 'inizio', v_fase->>'inizio', 'fine', v_fase->>'fine'));
    end if;
    continue when exists (
      select 1 from public.order_work_phases f
       where f.order_id = p_order
         and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_fase->>'nome'), '\s+', ' ', 'g')));
    v_fasi := v_fasi || jsonb_build_array(v_fase);
  end loop;
  -- «Completa» (fase 3): le date proposte per le fasi che la commessa ha già senza date.
  -- Vanno a commessa_pianifica_fasi come le altre: per nome, solo alle fasi senza date.
  for v_fase in select value from jsonb_array_elements(coalesce(s->'date_fasi', '[]'::jsonb)) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = ''
               or nullif(v_fase->>'inizio', '') is null or nullif(v_fase->>'fine', '') is null;
    v_date := v_date || jsonb_build_array(jsonb_build_object('nome', v_fase->>'nome', 'inizio', v_fase->>'inizio', 'fine', v_fase->>'fine'));
  end loop;

  if jsonb_array_length(v_fasi) > 0 then
    select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order;
    perform public.aggiungi_fasi_commessa(p_order, (
      select jsonb_agg(jsonb_build_object(
               'nome', f->>'nome',
               -- Una fase senza date né sottofasi ma con la durata: la durata va su una
               -- sottofase col nome della fase (revisione 1/11), se no si perde.
               'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', x->>'nome', 'giorni', x->'giorni'))
                                        from jsonb_array_elements(coalesce(f->'sottofasi', '[]'::jsonb)) x
                                       where btrim(coalesce(x->>'nome', '')) <> ''),
                                     case when nullif(f->>'giorni', '') is not null
                                          then jsonb_build_array(jsonb_build_object('nome', f->>'nome', 'giorni', f->'giorni')) end,
                                     '[]'::jsonb)))
        from jsonb_array_elements(v_fasi) f));

    -- Le voci previste: una per sottofase con quantità, venduto o costo. I costi sono
    -- unitari senza IVA (economiaFasi); il costo del piano è il totale della voce.
    v_i := 0;
    for v_fase in select value from jsonb_array_elements(v_fasi) loop
      select id into v_fase_id from public.order_work_phases
       where order_id = p_order and position = v_base + v_i;
      v_i := v_i + 1;
      continue when v_fase_id is null or coalesce(v_fase->>'origine', '') not in ('preventivo', 'computo');
      v_fasi_con_voci := v_fasi_con_voci || v_fase_id;
      v_j := 0;
      for v_sotto in select value from jsonb_array_elements(coalesce(v_fase->'sottofasi', '[]'::jsonb))
                      where btrim(coalesce(value->>'nome', '')) <> '' loop
        select id into v_sotto_id from public.order_work_subphases where phase_id = v_fase_id and position = v_j;
        v_j := v_j + 1;
        continue when nullif(v_sotto->>'costo', '') is null and nullif(v_sotto->>'importo', '') is null;
        v_q := greatest(coalesce(nullif(v_sotto->>'quantita', '')::numeric, 1), 0);
        v_costo := greatest(coalesce(nullif(v_sotto->>'costo', '')::numeric, 0), 0);
        insert into public.order_work_phase_voci
          (company_id, order_id, phase_id, subphase_id, position, descrizione, unita, quantita,
           costo_manodopera, costo_materiali, importo, origine, origine_id, origine_codice)
        values
          (p_bozza.company_id, p_order, v_fase_id, v_sotto_id, v_j - 1, left(v_sotto->>'nome', 500),
           nullif(v_sotto->>'unita', ''), v_q,
           -- Nel lavoro, come crea_commessa_preventivo_atomic: economiaFasi non somma le voci
           -- di lavoro a una ditta col suo costo previsto. Nei materiali la stessa fase
           -- contava due volte (voci 4.450 € + ditta 4.450 € = 8.900 €).
           case when v_q > 0 then round(v_costo / v_q, 4) else v_costo end, 0,
           nullif(v_sotto->>'importo', '')::numeric, v_fase->>'origine',
           -- La riga d'origine (voce del computo, riga del preventivo) il piano non la porta:
           -- l'origine è la sottofase, unica nella fase come vuole il vincolo.
           coalesce(v_sotto_id, gen_random_uuid()), nullif(v_sotto->>'codice', ''));
        v_voci := v_voci + 1;
      end loop;
    end loop;

    -- Il venduto delle fasi nuove: la somma delle loro voci. Senza, economiaFasi dava venduto 0 e
    -- salDaFasi una voce di SAL senza importo. Con uno sconto sul totale le voci lo superano e
    -- non si sa a quale fase toglierlo: resta da scrivere, come in crea_commessa_preventivo_atomic.
    if cardinality(v_fasi_con_voci) > 0 then
      select o2.total_amount into v_totale from public.orders o2 where o2.id = p_order;
      select coalesce(sum(v.importo), 0) into v_somma
        from public.order_work_phase_voci v where v.phase_id = any (v_fasi_con_voci);
      select v_somma + coalesce(sum(f.importo_venduto), 0) into v_somma
        from public.order_work_phases f
       where f.order_id = p_order and not (f.id = any (v_fasi_con_voci));
      if coalesce(v_totale, 0) = 0 or v_somma <= v_totale + 1 then
        update public.order_work_phases f
           set importo_venduto = x.somma
          from (select v.phase_id, round(sum(v.importo), 2) as somma
                  from public.order_work_phase_voci v
                 where v.phase_id = any (v_fasi_con_voci) and v.importo is not null
                 group by v.phase_id) x
         where f.id = x.phase_id and f.importo_venduto is null and x.somma >= 0;
      end if;
    end if;
  end if;

  -- Le date: solo alle fasi che non ne hanno (sovrascrivi = false); riempie anche
  -- inizio e fine lavori se mancano. Solo alle fasi che ci sono (quarta revisione, 3):
  -- `commessa_pianifica_fasi` ricrea quelle che non trova, e una bozza ripresa può parlare
  -- di una fase che un altro ha cancellato.
  select coalesce(jsonb_agg(d.voce order by d.ord), '[]'::jsonb) into v_date
    from jsonb_array_elements(v_date) with ordinality d(voce, ord)
   where exists (select 1 from public.order_work_phases f
                  where f.order_id = p_order
                    and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(d.voce->>'nome'), '\s+', ' ', 'g')));
  if jsonb_array_length(v_date) > 0 then
    perform public.commessa_pianifica_fasi(p_order, v_date, false);
  end if;
  for v_fase in
    select jsonb_build_object('id', f.id, 'start_date', f.start_date, 'end_date', f.end_date)
      from public.order_work_phases f
     where f.order_id = p_order and v_fasi_prima ? f.id::text
       and (f.start_date, f.end_date) is distinct from
           ((v_fasi_prima->f.id::text->>'start_date')::date, (v_fasi_prima->f.id::text->>'end_date')::date)
  loop
    insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
    values (p_bozza.id, p_bozza.company_id, 'order_work_phases', (v_fase->>'id')::uuid, 'aggiornata',
            jsonb_build_object(
              'start_date', jsonb_build_object('prima', v_fasi_prima->(v_fase->>'id')->'start_date', 'dopo', v_fase->'start_date'),
              'end_date', jsonb_build_object('prima', v_fasi_prima->(v_fase->>'id')->'end_date', 'dopo', v_fase->'end_date')));
  end loop;

  -- Le rate, se la commessa non ne ha (in «crea» le ha già messe la creazione).
  if jsonb_array_length(coalesce(s->'rate', '[]'::jsonb)) > 0
     and not exists (select 1 from public.order_installments where order_id = p_order) then
    v_rate := public.order_rate_sostituisci(p_order, s->'rate');
  end if;

  -- Le condizioni del contratto, se la commessa non ha un contratto.
  c := s->'condizioni';
  if jsonb_typeof(c) = 'object' and c <> '{}'::jsonb
     and not exists (select 1 from public.contratti_documents where order_id = p_order) then
    select * into o from public.orders where id = p_order;
    insert into public.contratti_documents
      (company_id, order_id, numero_contratto, status, committente_nome, oggetto_lavori, ubicazione_cantiere,
       importo_totale_eur, data_inizio_lavori, durata_giorni, penale_ritardo_eur_giorno, garanzia_anni,
       ai_generated_raw, generated_by, created_by)
    values
      (p_bozza.company_id, p_order, nullif(c->>'numero_contratto', ''), 'bozza',
       coalesce(nullif(o.client_company, ''), o.client_name), coalesce(o.work_description, o.description),
       coalesce(o.indirizzo_lavori, o.work_address), nullif(o.total_amount, 0), o.work_start_date,
       nullif(c->>'durata_giorni', '')::integer, nullif(c->>'penale_giorno_eur', '')::numeric,
       nullif(c->>'garanzia_anni', '')::integer,
       jsonb_build_object('condizioni_silvio', c, 'bozza_id', p_bozza.id), 'silvio', auth.uid());
    v_contratto := true;
  end if;

  -- Fase 4: squadra, ditte, mezzi, ordini e contratti in bozza, promemoria
  -- (20281112130000). Dopo le fasi, che ritrova per nome. Chiamata per nome: questa
  -- migrazione vale anche senza quella.
  if to_regprocedure('public._silvio_aggiungi_risorse(public.commessa_bozze, uuid)') is not null then
    execute 'select public._silvio_aggiungi_risorse($1, $2)' into v_risorse using p_bozza, p_order;
  end if;

  -- Le colonne della commessa riempite qui (anche dai trigger e da pianifica_fasi).
  select to_jsonb(x) into v_dopo from public.orders x where x.id = p_order;
  for k in select jsonb_object_keys(v_dopo) loop
    continue when public._silvio_colonna_di_macchina('orders', k);
    if (v_prima->k) is distinct from (v_dopo->k) then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('prima', v_prima->k, 'dopo', v_dopo->k));
    end if;
  end loop;
  if v_diff <> '{}'::jsonb then
    insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
    values (p_bozza.id, p_bozza.company_id, 'orders', p_order, 'aggiornata', v_diff);
  end if;

  return jsonb_build_object('colonne', (select count(*) from jsonb_object_keys(v_diff)),
                            'fasi', jsonb_array_length(v_fasi), 'voci', v_voci,
                            'rate', v_rate, 'contratto', v_contratto)
         || case when v_risorse is null then '{}'::jsonb else jsonb_build_object('risorse', v_risorse) end;
end
$funzione$;
revoke all on function public._silvio_aggiungi(public.commessa_bozze, uuid) from public, anon, authenticated;

create or replace function public._silvio_aggiungi_risorse(p_bozza public.commessa_bozze, p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $funzione$
declare
  s jsonb := coalesce(p_bozza.scrittura, '{}'::jsonb);
  v_company uuid := p_bozza.company_id;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  x jsonb;
  r jsonb;
  v_fase uuid;
  v_fasi uuid[];
  v_id uuid;
  v_team public.external_teams;
  v_sub public.subappaltatori;
  v_ss uuid;
  v_iva numeric;
  v_sub_tot numeric;
  v_iva_tot numeric;
  v_pos integer;
  v_persone integer := 0;
  v_ditte integer := 0;
  v_mezzi integer := 0;
  v_oda integer := 0;
  v_contratti integer := 0;
  v_promemoria integer := 0;
  v_adempimenti integer := 0;
  v_non_prenotati jsonb := '[]'::jsonb;
  v_saltati jsonb := '[]'::jsonb;
begin
  -- ── Squadra ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'squadra') = 'array' then s->'squadra' else '[]'::jsonb end) loop
    continue when not exists (select 1 from public.employees e
                               where e.id = nullif(x->>'employee_id', '')::uuid and e.company_id = v_company and e.is_active is not false);
    v_fase := case when nullif(x->>'fase', '') is null then null else public._silvio_fase_per_nome(p_order, x->>'fase') end;
    continue when exists (select 1 from public.order_employees oe
                           where oe.order_id = p_order and oe.employee_id = (x->>'employee_id')::uuid
                             and oe.phase_id is not distinct from v_fase);
    insert into public.order_employees (order_id, employee_id, phase_id, hours_worked, hourly_rate, total_cost, notes)
    values (p_order, (x->>'employee_id')::uuid, v_fase, 0, 0, 0, 'Proposto da Silvio');
    v_persone := v_persone + 1;
  end loop;

  -- ── Ditte, col costo previsto. La colonna è con l'IVA della ditta (economiaFasi la toglie, come
  --    DitteContrattiCommessa la mette): in reverse charge resta uguale. ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'ditte') = 'array' then s->'ditte' else '[]'::jsonb end) loop
    select * into v_team from public.external_teams t
     where t.id = nullif(x->>'external_team_id', '')::uuid and t.company_id = v_company and t.is_active is not false
       and coalesce(t.kind, 'esterna') <> 'interna';
    continue when not found;
    v_fase := public._silvio_fase_per_nome(p_order, x->>'fase');
    continue when v_fase is null or exists (select 1 from public.order_external_teams a
                                             where a.order_id = p_order and a.external_team_id = v_team.id and a.phase_id = v_fase);
    insert into public.order_external_teams (order_id, external_team_id, phase_id, total_cost, cost_preventivo, vat_rate, is_paid, costo_origine, notes)
    values (p_order, v_team.id, v_fase, 0,
            greatest(round(coalesce(nullif(x->>'costo_previsto', '')::numeric, 0) * (1 + coalesce(v_team.vat_rate, 0) / 100), 2), 0),
            coalesce(v_team.vat_rate, 0), false,
            case when coalesce(nullif(x->>'costo_previsto', '')::numeric, 0) > 0 then 'preventivo' end, 'Proposta da Silvio');
    v_ditte := v_ditte + 1;
  end loop;

  -- ── Mezzi: con salva_piano_mezzo, che controlla permessi e prenotazioni doppie ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'mezzi') = 'array' then s->'mezzi' else '[]'::jsonb end) loop
    select coalesce(array_agg(f) filter (where f is not null), '{}') into v_fasi
      from (select public._silvio_fase_per_nome(p_order, n) f
              from jsonb_array_elements_text(case when jsonb_typeof(x->'fasi') = 'array' then x->'fasi' else '[]'::jsonb end) n) q;
    begin
      v_id := public.salva_piano_mezzo(jsonb_build_object(
        'order_id', p_order, 'mezzo_id', x->>'mezzo_id', 'fase_ids', to_jsonb(v_fasi),
        'dal', x->>'dal', 'al', nullif(x->>'al', ''), 'quantita', coalesce(nullif(x->>'quantita', '')::numeric, 1),
        'note', 'Prenotato con Silvio'));
      insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione)
      values (p_bozza.id, v_company, 'mezzi_piani_cantiere', v_id, 'creata');
      v_mezzi := v_mezzi + 1;
    exception when others then
      -- Prenotato nel frattempo, fuori servizio, permesso mancante: si dice, e la commessa va avanti.
      v_non_prenotati := v_non_prenotati || jsonb_build_array(jsonb_build_object('mezzo_id', x->>'mezzo_id', 'motivo', sqlerrm));
    end;
  end loop;

  -- ── Ordini al fornitore, in bozza ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'oda') = 'array' then s->'oda' else '[]'::jsonb end) loop
    continue when not exists (select 1 from public.suppliers f
                               where f.id = nullif(x->>'supplier_id', '')::uuid and f.company_id = v_company and f.is_active is not false);
    continue when jsonb_typeof(x->'righe') is distinct from 'array' or jsonb_array_length(x->'righe') = 0;
    select coalesce(f.vat_rate, 22) into v_iva from public.suppliers f where f.id = (x->>'supplier_id')::uuid;
    select coalesce(sum(round(q * p, 2)), 0), coalesce(sum(round(q * p * i / 100, 2)), 0) into v_sub_tot, v_iva_tot
      from (select greatest(coalesce(nullif(e->>'quantita', '')::numeric, 1), 0) q,
                   greatest(coalesce(nullif(e->>'prezzo', '')::numeric, 0), 0) p,
                   coalesce(nullif(e->>'iva', '')::numeric, v_iva) i
              from jsonb_array_elements(x->'righe') e) t;
    insert into public.purchase_orders (company_id, supplier_id, status, issue_date, expected_delivery_date, order_id,
                                        subtotal, vat_total, total, notes, internal_notes, created_by)
    values (v_company, (x->>'supplier_id')::uuid, 'bozza',
            greatest(coalesce(nullif(x->>'data_ordine', '')::date, v_oggi), v_oggi),
            nullif(x->>'data_consegna', '')::date, p_order, v_sub_tot, v_iva_tot, v_sub_tot + v_iva_tot,
            left(nullif(x->>'note', ''), 2000), 'Bozza preparata da Silvio con la commessa: non è stata mandata.', auth.uid())
    returning id into v_id;
    v_pos := 0;
    for r in select value from jsonb_array_elements(x->'righe') loop
      continue when btrim(coalesce(r->>'descrizione', '')) = '';
      insert into public.purchase_order_items (company_id, purchase_order_id, description, unit_of_measure, quantity, unit_price, vat_rate, sort_order)
      values (v_company, v_id, left(r->>'descrizione', 500), nullif(r->>'unita', ''),
              greatest(coalesce(nullif(r->>'quantita', '')::numeric, 1), 0), greatest(coalesce(nullif(r->>'prezzo', '')::numeric, 0), 0),
              coalesce(nullif(r->>'iva', '')::numeric, v_iva), v_pos);
      v_pos := v_pos + 1;
    end loop;
    v_oda := v_oda + 1;
  end loop;

  -- ── Contratti delle ditte, in bozza ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'contratti') = 'array' then s->'contratti' else '[]'::jsonb end) loop
    select * into v_team from public.external_teams t
     where t.id = nullif(x->>'external_team_id', '')::uuid and t.company_id = v_company;
    if not found or v_team.subappaltatore_id is null then
      v_saltati := v_saltati || jsonb_build_array(jsonb_build_object('contratto', x->>'external_team_id', 'motivo', 'ditta senza subappaltatore collegato'));
      continue;
    end if;
    select * into v_sub from public.subappaltatori where id = v_team.subappaltatore_id and company_id = v_company;
    continue when not found;
    -- La scheda di sicurezza della ditta per questa commessa (o quella generale); se non c'è, nasce.
    select ss.id into v_ss from public.subappaltatori_sicurezza ss
     where ss.company_id = v_company and ss.campo_subappaltatore_id = v_sub.id and (ss.order_id = p_order or ss.order_id is null)
     order by ss.order_id is null, ss.created_at desc
     limit 1;
    if v_ss is null then
      insert into public.subappaltatori_sicurezza (company_id, order_id, ragione_sociale, responsabile, telefono, email, piva, indirizzo,
                                                   data_inizio, data_fine, campo_subappaltatore_id)
      values (v_company, p_order, coalesce(nullif(btrim(v_sub.ragione_sociale), ''), v_team.name), v_sub.responsabile, v_sub.telefono,
              v_sub.email, v_sub.piva, v_sub.indirizzo, nullif(x->>'dal', '')::date, nullif(x->>'al', '')::date, v_sub.id)
      returning id into v_ss;
      -- Registrata subito, prima del contratto: l'annullamento toglie dall'ultima alla
      -- prima, e una scheda con un contratto non si cancella.
      insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione)
      values (p_bozza.id, v_company, 'subappaltatori_sicurezza', v_ss, 'creata');
    end if;
    continue when exists (select 1 from public.contratti_subappalto c where c.order_id = p_order and c.subappaltatore_id = v_ss);
    insert into public.contratti_subappalto (company_id, subappaltatore_id, order_id, stato, descrizione_lavori, importo_contrattuale,
                                             elenco_lavori, data_inizio, data_fine_prevista, ritenuta_garanzia_pct, durata_garanzia_mesi,
                                             oneri_sicurezza, note)
    values (v_company, v_ss, p_order, 'bozza', coalesce(nullif(x->>'descrizione', ''), 'Lavorazioni della commessa.'),
            greatest(round(coalesce(nullif(x->>'importo', '')::numeric, 0), 2), 0),
            case when jsonb_typeof(x->'elenco') = 'array' then x->'elenco' else '[]'::jsonb end,
            nullif(x->>'dal', '')::date, nullif(x->>'al', '')::date, 5, 12, 0,
            'Bozza preparata da Silvio: da controllare e firmare dalla commessa.');
    v_contratti := v_contratti + 1;
  end loop;

  -- ── Promemoria: POS, DUVRI, messaggio d'avvio al cliente. Testo nelle note, nessun invio. ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'promemoria') = 'array' then s->'promemoria' else '[]'::jsonb end) loop
    continue when btrim(coalesce(x->>'titolo', '')) = '';
    continue when exists (select 1 from public.tasks t where t.order_id = p_order and t.title = left(btrim(x->>'titolo'), 300));
    insert into public.tasks (company_id, title, notes, status, priority, due_date, order_id, created_by)
    values (v_company, left(btrim(x->>'titolo'), 300), left(x->>'testo', 6000), 'da_fare',
            case when x->>'tipo' in ('pos', 'duvri') then 'alta' else 'normale' end,
            nullif(x->>'scadenza', '')::date, p_order, auth.uid());
    v_promemoria := v_promemoria + 1;
  end loop;

  -- ── Adempimenti prima di partire (fase 5, lotto 5.2): CILA o SCIA, notifica preliminare,
  --    cartello, suolo pubblico → le scadenze di sicurezza della commessa. ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'adempimenti') = 'array' then s->'adempimenti' else '[]'::jsonb end) loop
    continue when btrim(coalesce(x->>'titolo', '')) = '';
    continue when exists (select 1 from public.adempimenti_sicurezza a where a.order_id = p_order and a.titolo = left(btrim(x->>'titolo'), 300));
    insert into public.adempimenti_sicurezza (company_id, order_id, titolo, tipo, scadenza_data, stato, note)
    values (v_company, p_order, left(btrim(x->>'titolo'), 300), coalesce(nullif(x->>'tipo', ''), 'altro'),
            nullif(x->>'scadenza', '')::date, 'da_fare', left(x->>'note', 4000));
    v_adempimenti := v_adempimenti + 1;
  end loop;

  return jsonb_build_object('persone', v_persone, 'ditte', v_ditte, 'mezzi', v_mezzi, 'oda', v_oda,
                            'contratti', v_contratti, 'promemoria', v_promemoria, 'adempimenti', v_adempimenti,
                            'non_prenotati', v_non_prenotati, 'saltati', v_saltati);
end
$funzione$;
revoke all on function public._silvio_aggiungi_risorse(public.commessa_bozze, uuid) from public, anon, authenticated;

create or replace function public._silvio_scrittura_permessa(p_company uuid, p_scrittura jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funzione$
declare
  s jsonb := coalesce(p_scrittura, '{}'::jsonb);
  v_tolte text[] := '{}';
  v_vietata boolean;
  v_ammessi text[] := array['pos', 'duvri', 'avvio_cliente'];
  v_senza text[] := '{}';
  v_uid uuid := auth.uid();
  v_admin boolean := public.has_role(auth.uid(), 'super_admin'::public.app_role) or public.e_amministratore_di(p_company);
  v_pieno boolean;
begin
  v_pieno := coalesce(jsonb_array_length(case when jsonb_typeof(s->'contratti') = 'array' then s->'contratti' end), 0) > 0;
  if v_pieno and not (public.has_permission_for_company(v_uid, 'can_view_costs', p_company) is true
                      and public.has_permission_for_company(v_uid, 'can_view_subappaltatori_amministrazione', p_company) is true) then
    v_senza := v_senza || 'contratti_ditte'::text;
    s := jsonb_set(s, '{contratti}', '[]'::jsonb);
  end if;
  if not v_admin then
    if coalesce(jsonb_array_length(case when jsonb_typeof(s->'squadra') = 'array' then s->'squadra' end), 0) > 0 then
      v_senza := v_senza || 'squadra'::text;
      s := jsonb_set(s, '{squadra}', '[]'::jsonb);
    end if;
    if jsonb_typeof(s->'condizioni') = 'object' and s->'condizioni' <> '{}'::jsonb then
      v_senza := v_senza || 'condizioni'::text;
      s := s - 'condizioni';
    end if;
  end if;
  if coalesce(jsonb_array_length(case when jsonb_typeof(s->'adempimenti') = 'array' then s->'adempimenti' end), 0) > 0
     and public.has_permission_for_company(v_uid, 'can_view_sicurezza_cantiere', p_company) is not true then
    v_senza := v_senza || 'adempimenti'::text;
    s := jsonb_set(s, '{adempimenti}', '[]'::jsonb);
  end if;
  if coalesce(jsonb_array_length(case when jsonb_typeof(s->'oda') = 'array' then s->'oda' end), 0) > 0
     and public.has_permission_for_company(v_uid, 'can_view_costs', p_company) is not true then
    v_senza := v_senza || 'ordini'::text;
    s := jsonb_set(s, '{oda}', '[]'::jsonb);
  end if;
  -- Chi non vede gli importi non li scrive (P2): con «Completa» sovrascriverebbe uno 0 che non
  -- vede, con «Crea» da preventivo quello che il preventivo ha copiato.
  if public.has_permission_for_company(v_uid, 'can_view_order_amounts', p_company) is not true then
    if s->'ordine' ?| array['total_amount', 'vat_rate']
       or coalesce(jsonb_array_length(case when jsonb_typeof(s->'rate') = 'array' then s->'rate' end), 0) > 0 then
      v_senza := v_senza || 'importi'::text;
    end if;
    s := s #- '{ordine,total_amount}' #- '{ordine,vat_rate}';
    if s ? 'rate' then s := jsonb_set(s, '{rate}', '[]'::jsonb); end if;
    if s ? 'righe' then s := jsonb_set(s, '{righe}', public._silvio_togli_chiavi(s->'righe', array['unit_price', 'discount_percent'])); end if;
    if s ? 'fasi' then s := jsonb_set(s, '{fasi}', public._silvio_togli_dalle_sottofasi(s->'fasi', array['importo'])); end if;
  end if;
  if public.has_permission_for_company(v_uid, 'can_view_costs', p_company) is not true then
    -- Voci e ditte nascono a 0: la persona lo deve sapere (simulazioni del 2/11).
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(s->'ditte') = 'array' then s->'ditte' else '[]'::jsonb end) d
                where coalesce(nullif(d->>'costo_previsto', '')::numeric, 0) > 0)
       or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(s->'fasi') = 'array' then s->'fasi' else '[]'::jsonb end) f,
                               jsonb_array_elements(case when jsonb_typeof(f->'sottofasi') = 'array' then f->'sottofasi' else '[]'::jsonb end) x
                   where nullif(x->>'costo', '') is not null)
       or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(s->'righe') = 'array' then s->'righe' else '[]'::jsonb end) g
                   where coalesce(nullif(g->>'purchase_price', '')::numeric, nullif(g->>'standard_cost', '')::numeric, 0) > 0) then
      v_senza := v_senza || 'costi'::text;
    end if;
    if s ? 'ditte' then s := jsonb_set(s, '{ditte}', public._silvio_togli_chiavi(s->'ditte', array['costo_previsto'])); end if;
    if s ? 'righe' then s := jsonb_set(s, '{righe}', public._silvio_togli_chiavi(s->'righe', array['purchase_price', 'standard_cost'])); end if;
    if s ? 'fasi' then s := jsonb_set(s, '{fasi}', public._silvio_togli_dalle_sottofasi(s->'fasi', array['costo'])); end if;
  end if;
  if cardinality(v_senza) > 0 then
    s := s || jsonb_build_object('tolte_permessi', to_jsonb(v_senza));
  end if;

  if public._silvio_livello(p_company, 'squadra') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'squadra', 'null'::jsonb), '[]')) > 0 or s->'ordine' ? 'capomastro_user_id' then
      v_tolte := v_tolte || 'squadra'::text;
    end if;
    s := jsonb_set(s, '{squadra}', '[]'::jsonb) #- '{ordine,capomastro_user_id}';
  end if;
  if public._silvio_livello(p_company, 'mezzi') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'mezzi', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'mezzi'::text; end if;
    s := jsonb_set(s, '{mezzi}', '[]'::jsonb);
  end if;
  if public._silvio_livello(p_company, 'ordini') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'oda', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'ordini'::text; end if;
    s := jsonb_set(s, '{oda}', '[]'::jsonb);
  end if;
  -- Il contratto segue la ditta: con le ditte vietate non c'è contratto.
  v_vietata := public._silvio_livello(p_company, 'ditte') = 'vietata';
  if v_vietata then
    if jsonb_array_length(coalesce(nullif(s->'ditte', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'ditte'::text; end if;
    s := jsonb_set(s, '{ditte}', '[]'::jsonb);
  end if;
  if v_vietata or public._silvio_livello(p_company, 'contratti_ditte') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'contratti', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'contratti_ditte'::text; end if;
    s := jsonb_set(s, '{contratti}', '[]'::jsonb);
  end if;
  if public._silvio_livello(p_company, 'promemoria') = 'vietata' then
    v_ammessi := array_remove(array_remove(v_ammessi, 'pos'), 'duvri');
    if jsonb_array_length(coalesce(nullif(s->'adempimenti', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'promemoria'::text; end if;
    s := jsonb_set(s, '{adempimenti}', '[]'::jsonb);
  end if;
  if public._silvio_livello(p_company, 'avvio_cliente') = 'vietata' then
    v_ammessi := array_remove(v_ammessi, 'avvio_cliente');
  end if;
  -- Un elenco di tipi ammessi, non di vietati (revisione 1/11, S3): prima si toglievano solo
  -- «pos» e «duvri», e un `{"tipo":"cartello"}` scritto a mano passava anche coi promemoria
  -- vietati. Un tipo che Silvio non conosce non entra mai.
  if jsonb_typeof(s->'promemoria') = 'array' then
    if exists (select 1 from jsonb_array_elements(s->'promemoria') p where not (coalesce(p->>'tipo', '') = any (v_ammessi))) then
      v_tolte := v_tolte || (select array_agg(distinct case when p->>'tipo' = 'avvio_cliente' then 'avvio_cliente' else 'promemoria' end)
                               from jsonb_array_elements(s->'promemoria') p where not (coalesce(p->>'tipo', '') = any (v_ammessi)));
    end if;
    s := jsonb_set(s, '{promemoria}', coalesce(
      (select jsonb_agg(p) from jsonb_array_elements(s->'promemoria') p where coalesce(p->>'tipo', '') = any (v_ammessi)), '[]'::jsonb));
  end if;
  if cardinality(v_tolte) > 0 then
    s := s || jsonb_build_object('tolte_autonomia', to_jsonb((select array_agg(distinct t) from unnest(v_tolte) t)));
  end if;
  return s;
end
$funzione$;
revoke all on function public._silvio_scrittura_permessa(uuid, jsonb) from public, anon, authenticated;

create or replace function public.commessa_annulla_silvio(p_bozza_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $funzione$
declare
  b public.commessa_bozze := public._silvio_bozza(p_bozza_id);
  o public.orders;
  v_creata boolean;
  r record;
  v_fk record;
  v_trovata boolean;
  v_colonna text;
  v_attuale jsonb;
  v_file text[];
  v_set text;
  v_tolte integer := 0;
  v_n integer;
  c jsonb;
begin
  if b.stato = 'bozza' or b.order_id is null then
    raise exception 'Non c''è niente da annullare: Silvio non ha ancora scritto.' using errcode = '22023';
  end if;
  select * into o from public.orders where id = b.order_id and company_id = b.company_id for update;
  if not found or public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) is not true then
    raise exception 'Commessa non trovata o non accessibile.' using errcode = '42501';
  end if;
  v_creata := b.stato = 'creata';

  -- 1. Una riga di Silvio cambiata dopo: si confronta con la sua istantanea, colonna per
  --    colonna (`updated_at` da solo non dice niente, e molte tabelle non ce l'hanno). Una
  --    riga che la persona ha già tolto non conta. Nel dubbio (riga senza istantanea) si rifiuta.
  --    Prima le righe più in fondo (ore, contratti, ditte), la commessa per ultima: il
  --    messaggio dice il lavoro vero, non il riflesso che ha lasciato sulla commessa.
  for r in select s.tabella, s.riga_id, s.istantanea from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'creata' order by s.tabella = 'orders', s.id desc loop
    v_attuale := public._silvio_stato_riga(r.tabella, r.riga_id);
    continue when v_attuale is null;
    continue when r.tabella = any (public._silvio_tabelle_di_macchina());
    if r.istantanea is null then
      raise exception 'Non si può annullare: non so com''erano le righe di Silvio in «%». Annulla a mano o tieni la commessa.',
        replace(r.tabella, '_', ' ') using errcode = '55000';
    end if;
    select k into v_colonna
      from jsonb_object_keys(v_attuale || r.istantanea) k
     where not public._silvio_colonna_di_macchina(r.tabella, k)
       and not (r.tabella = 'orders' and k in ('work_lat', 'work_lng') and r.istantanea->>k is null)
       and (v_attuale->k) is distinct from (r.istantanea->k)
     order by k like '\_\_figlie:%', k limit 1;
    if v_colonna is not null then
      raise exception 'Non si può annullare: %. Annulla a mano o tieni la commessa.',
        public._silvio_cosa_e_cambiato(r.tabella, v_attuale, v_colonna) using errcode = '55000';
    end if;
  end loop;

  -- 2. Una riga che punta a una riga di Silvio senza essere sua (rapportino, fattura, costo,
  --    allegato, spesa del mezzo, etichetta…), in qualunque tabella, a una o più colonne:
  --    cancellando la madre andrebbe via in cascata, o fermerebbe tutto con un errore grezzo.
  --    Su una commessa che Silvio ha solo completato, quelle che puntano alla commessa sono
  --    di chi ci lavora, e non contano.
  --    Le figlie senza `id` stanno nell'istantanea della madre: le ha già guardate il punto 1.
  for v_fk in select * from public._silvio_chiavi_figlie(b.id) k
               where k.con_id and not (k.figlia = any (public._silvio_tabelle_di_macchina()))
                 and k.madre in (select s.tabella from public.commessa_bozze_scritture s
                                  where s.bozza_id = b.id and s.azione = 'creata') loop
    execute format(
      'select exists (select 1 from public.%1$I t join public.%2$I m on %3$s
                       where m.id in (select s.riga_id from public.commessa_bozze_scritture s
                                       where s.bozza_id = $1 and s.tabella = %2$L and s.azione = ''creata'')
                         and %4$s)',
      v_fk.figlia, v_fk.madre, v_fk.unione,
      format('not exists (select 1 from public.commessa_bozze_scritture s where s.bozza_id = $1 and s.tabella = %L and s.riga_id = t.id)', v_fk.figlia))
      into v_trovata using b.id;
    if v_trovata then
      raise exception 'Non si può annullare: dopo Silvio si è aggiunto lavoro, % (%). Annulla a mano o tieni la commessa.',
        public._silvio_lavoro_aggiunto(v_fk.figlia), replace(v_fk.figlia, '_', ' ') using errcode = '55000';
    end if;
  end loop;

  -- 3. Una colonna riempita da Silvio che non ha più il suo valore.
  for r in select s.id, s.tabella, s.riga_id, s.colonne from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'aggiornata' loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.tabella) into v_attuale using r.riga_id;
    for v_colonna in select jsonb_object_keys(r.colonne) loop
      if v_attuale is not null and (v_attuale->v_colonna) is distinct from (r.colonne->v_colonna->'dopo') then
        raise exception 'Non si può annullare: «%» è stato cambiato dopo Silvio. Annulla a mano o tieni la commessa.', v_colonna using errcode = '55000';
      end if;
    end loop;
  end loop;

  -- I file da togliere dallo storage, prima che le righe spariscano.
  select array_agg(x.f) into v_file from (
    select a.file_url as f from public.order_attachments a
     where a.id in (select s.riga_id from public.commessa_bozze_scritture s
                     where s.bozza_id = b.id and s.tabella = 'order_attachments' and s.azione = 'creata')
    union all
    select a.thumb_path from public.order_attachments a
     where a.thumb_path is not null
       and a.id in (select s.riga_id from public.commessa_bozze_scritture s
                     where s.bozza_id = b.id and s.tabella = 'order_attachments' and s.azione = 'creata')) x;

  -- Le colonne tornano com'erano.
  for r in select s.tabella, s.riga_id, s.colonne from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'aggiornata' order by s.id desc loop
    select string_agg(format('%I = r.%I', k, k), ', ') into v_set from jsonb_object_keys(r.colonne) k;
    select jsonb_object_agg(k, r.colonne->k->'prima') into c from jsonb_object_keys(r.colonne) k;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
                   r.tabella, v_set, r.tabella)
      using c, r.riga_id;
  end loop;

  -- La giacenza (D12): una riga con `stock_item_id` scarica il magazzino nella creazione
  -- (magazzino_movimento_riga), e cancellare riga e movimento non la rimetteva. Si rimette quello
  -- che dicono i movimenti di Silvio, che subito sotto spariscono: nel registro di magazzino
  -- non resta né lo scarico né un carico.
  for r in select m.stock_item_id, sum(case m.movement_type when 'scarico' then m.quantity else -m.quantity end) as quanto
             from public.warehouse_movements m
            where m.company_id = b.company_id and m.movement_type in ('scarico', 'carico') and m.stock_item_id is not null
              and m.id in (select s.riga_id from public.commessa_bozze_scritture s
                            where s.bozza_id = b.id and s.tabella = 'warehouse_movements' and s.azione = 'creata')
            group by m.stock_item_id loop
    update public.warehouse_stock set quantity = quantity + r.quanto, updated_at = now()
     where id = r.stock_item_id and company_id = b.company_id;
  end loop;

  -- Le righe di Silvio, dall'ultima alla prima: i figli prima dei padri. La commessa
  -- nata da Silvio è la prima registrata, quindi l'ultima a sparire.
  for r in select s.tabella, s.riga_id from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'creata' order by s.id desc loop
    execute format('delete from public.%I where id = $1', r.tabella) using r.riga_id;
    get diagnostics v_n = row_count;
    v_tolte := v_tolte + v_n;
  end loop;

  -- Le colonne, di nuovo: cancellare fasi e sottofasi fa ricalcolare ai trigger quello che dipende
  -- da loro (recompute_order_progress), su righe che in quel momento ci sono ancora. Simulazioni
  -- del 2/11: percentuale_avanzamento passava da 35 a 0 e restava 0. Solo quelle diverse: il
  -- primo giro serve alle righe che puntano a quelle cancellate, questo a riportarle com'erano.
  for r in select s.tabella, s.riga_id, s.colonne from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'aggiornata' order by s.id desc loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.tabella) into v_attuale using r.riga_id;
    continue when v_attuale is null;
    v_set := null;
    select string_agg(format('%I = r.%I', k, k), ', '), jsonb_object_agg(k, r.colonne->k->'prima') into v_set, c
      from jsonb_object_keys(r.colonne) k
     where (v_attuale->k) is distinct from (r.colonne->k->'prima');
    continue when v_set is null;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
                   r.tabella, v_set, r.tabella)
      using c, r.riga_id;
  end loop;

  -- Gli eventi delle automazioni non ancora elaborati sulle righe tolte (l'attività creata,
  -- la commessa nata): elaborati dopo, farebbero partire un'automazione su qualcosa che non
  -- c'è più (revisione 1/11, S11). Quelli già elaborati restano: sono la storia.
  delete from public.automation_trigger_events e
   where e.company_id = b.company_id and e.processed is not true
     and (e.entity_id in (select s.riga_id::text from public.commessa_bozze_scritture s
                           where s.bozza_id = b.id and s.azione = 'creata')
          -- Il preventivo (D2): gli eventi di «convertita» e del ritorno a com'era.
          or (e.created_at >= b.eseguita_il
              and e.entity_id in (select s.riga_id::text from public.commessa_bozze_scritture s
                                   where s.bozza_id = b.id and s.tabella = 'quotes')));

  delete from public.commessa_bozze_scritture where bozza_id = b.id;
  update public.commessa_bozze
     set stato = 'bozza', eseguita_il = null, order_id = case when v_creata then null else order_id end
   where id = b.id;

  return jsonb_build_object('righe_tolte', v_tolte, 'commessa_tolta', v_creata,
                            'file_da_togliere', coalesce(to_jsonb(v_file), '[]'::jsonb));
end
$funzione$;
revoke all on function public.commessa_annulla_silvio(uuid) from public, anon;
grant execute on function public.commessa_annulla_silvio(uuid) to authenticated;

