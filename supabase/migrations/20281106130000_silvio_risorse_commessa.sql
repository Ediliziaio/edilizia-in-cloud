-- ════════════════════════════════════════════════════════════════════════════
-- Silvio e la commessa, fase 4 (lotti 4.1–4.3): persone, ditte, mezzi, acquisti
-- e le bozze 🔴. Vedi docs/piano-silvio-commessa-ai.md, fase 4.
-- ════════════════════════════════════════════════════════════════════════════
-- `_silvio_aggiungi_risorse(bozza, commessa)` scrive le parti della `scrittura` che
-- la fase 4 aggiunge (src/lib/silvio-commessa/scrittura.ts): le proposte 🟡 accettate
-- nel popup e le bozze 🔴, mai mandate. La chiama `_silvio_aggiungi` (20281106100000)
-- dopo le fasi, sia in «crea» sia in «completa», dentro la stessa transazione.
--
-- Una sola strada di scrittura, la stessa delle pagine:
--   · squadra → `order_employees` (come «Aggiungi persona» di Lavorazioni);
--   · ditte   → `order_external_teams` col costo previsto (come Ditte e contratti);
--   · mezzi   → `salva_piano_mezzo`, che rifiuta un mezzo già prenotato in quei giorni:
--               un mezzo che non si prenota non ferma la commessa, torna in `non_prenotati`;
--   · ordini  → `purchase_orders` in stato «bozza», con le righe (mai line_total e
--               vat_amount, che sono GENERATED): nessun invio, `sent_at` resta vuoto;
--   · contratti → `contratti_subappalto` in stato «bozza». Il subappaltatore del contratto
--               è la scheda di sicurezza (`subappaltatori_sicurezza`, collegata con
--               `campo_subappaltatore_id`): se la ditta non ne ha una per la commessa, nasce;
--   · promemoria (POS, DUVRI, messaggio d'avvio al cliente) → `tasks` della commessa,
--               col testo nelle note. Nessun messaggio parte.
-- Le fasi si ritrovano per nome, come in `commessa_pianifica_fasi`. Solo aggiunte:
-- quello che la commessa ha già (la stessa persona sulla stessa fase, la stessa ditta,
-- un contratto per quella ditta, un'attività con lo stesso titolo) non si raddoppia.
--
-- L'annullamento: tutte le righe nuove hanno `created_at` e puntano alla commessa (o a
-- una riga di Silvio), quindi le registra `_silvio_registra_nuove`; `mezzi_piani_cantiere`
-- non ha `created_at` e si registra qui. Le righe che i trigger fanno nascere altrove
-- (gli accessi al cantiere, l'avviso in app alla ditta assegnata, la coda del calendario)
-- sono le stesse che nascono assegnando dalla pagina.
--
-- Idempotente. Nessun dato esistente viene toccato. Richiede 20281106100000.
-- ════════════════════════════════════════════════════════════════════════════

-- La fase della commessa con quel nome (spazi e maiuscole non contano).
create or replace function public._silvio_fase_per_nome(p_order uuid, p_nome text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select f.id from public.order_work_phases f
   where f.order_id = p_order
     and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'))
   order by f.position nulls last, f.id
   limit 1
$$;
revoke all on function public._silvio_fase_per_nome(uuid, text) from public, anon, authenticated;

create or replace function public._silvio_aggiungi_risorse(p_bozza public.commessa_bozze, p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- ── Ditte, col costo previsto (senza IVA: le ditte sono in reverse charge) ──
  for x in select value from jsonb_array_elements(case when jsonb_typeof(s->'ditte') = 'array' then s->'ditte' else '[]'::jsonb end) loop
    select * into v_team from public.external_teams t
     where t.id = nullif(x->>'external_team_id', '')::uuid and t.company_id = v_company and t.is_active is not false
       and coalesce(t.kind, 'esterna') <> 'interna';
    continue when not found;
    v_fase := public._silvio_fase_per_nome(p_order, x->>'fase');
    continue when v_fase is null or exists (select 1 from public.order_external_teams a
                                             where a.order_id = p_order and a.external_team_id = v_team.id and a.phase_id = v_fase);
    insert into public.order_external_teams (order_id, external_team_id, phase_id, total_cost, cost_preventivo, vat_rate, is_paid, costo_origine, notes)
    values (p_order, v_team.id, v_fase, 0, greatest(round(coalesce(nullif(x->>'costo_previsto', '')::numeric, 0), 2), 0),
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

  return jsonb_build_object('persone', v_persone, 'ditte', v_ditte, 'mezzi', v_mezzi, 'oda', v_oda,
                            'contratti', v_contratti, 'promemoria', v_promemoria,
                            'non_prenotati', v_non_prenotati, 'saltati', v_saltati);
end
$$;
revoke all on function public._silvio_aggiungi_risorse(public.commessa_bozze, uuid) from public, anon, authenticated;
