-- Ammortamenti: un solo calcolo per conto economico, dettaglio e Stato patrimoniale (15/11/2026)
--
-- 1. Il dettaglio della voce 09 contava dodici quote per ogni bene presente nell'anno: anche
--    nell'anno d'acquisto (da marzo sono dieci mesi) e anche per i beni già del tutto
--    ammortizzati. Il conto economico no: su Demo 2 il dettaglio diceva 25.290 € nel 2023 contro
--    19.352,50 € del conto economico (diversi anche nel 2021, 2022 e 2025).
-- 2. Un bene «dismesso» (is_active = false) spariva da tutti gli anni, anche da quelli in cui
--    c'era: il conto economico degli anni passati perdeva i suoi ammortamenti e lo Stato
--    patrimoniale il suo valore. Adesso un bene con la data di dismissione conta fino a quella data.
-- 3. Il fondo già ammortizzato inserito non contava mai: si ricalcolava tutto dalla data
--    d'acquisto. Adesso, se il bene ha il fondo noto al 1° gennaio di un anno (fondo_iniziale e
--    fondo_iniziale_anno, gli stessi del registro dei cespiti della contabilità), da quell'anno il
--    fondo parte da lì.
--
-- private.cg_cespite_fondo_al dà il fondo ammortamento alla fine del mese della data, con la
-- quota mensile (costo × aliquota / 12, oppure costo / vita utile in mesi) dal mese d'acquisto,
-- mai oltre il costo. Ammortamento di un periodo = fondo alla fine meno fondo prima dell'inizio:
-- i mesi sommano all'anno e lo Stato patrimoniale (costo − fondo) torna col conto economico.

create or replace function private.cg_cespite_fondo_al(
  p_costo numeric, p_aliquota numeric, p_vita_mesi integer, p_acquisto date,
  p_fondo_iniziale numeric, p_fondo_iniziale_anno integer, p_rif date)
returns numeric language sql immutable parallel safe set search_path to '' as $$
  with q as (
    select coalesce(p_costo, 0) as costo,
           case when coalesce(p_aliquota, 0) > 0 then p_costo * p_aliquota / 100.0 / 12.0
                when coalesce(p_vita_mesi, 0) > 0 then p_costo / p_vita_mesi::numeric
                else 0 end as quota_mese,
           (extract(year from p_rif) * 12 + extract(month from p_rif))::integer as mese_rif,
           (extract(year from p_acquisto) * 12 + extract(month from p_acquisto))::integer as mese_acquisto
  )
  select case
    when p_rif is null or p_acquisto is null or p_rif < date_trunc('month', p_acquisto)::date then 0
    -- Il fondo al 1° gennaio è anche quello al 31 dicembre prima.
    when p_fondo_iniziale is not null and p_fondo_iniziale_anno is not null
         and p_rif >= make_date(p_fondo_iniziale_anno, 1, 1) - 1 then
      round(least(q.costo, p_fondo_iniziale
        + q.quota_mese * greatest(0, q.mese_rif - greatest(p_fondo_iniziale_anno * 12 + 1, q.mese_acquisto) + 1)), 2)
    else
      round(least(q.costo, q.quota_mese * greatest(0, q.mese_rif - q.mese_acquisto + 1)), 2)
    end::numeric(14,2)
  from q
$$;
revoke all on function private.cg_cespite_fondo_al(numeric, numeric, integer, date, numeric, integer, date) from public, anon, authenticated;

-- Ammortamento del periodo per un bene: fondo alla fine (o alla dismissione) meno fondo prima dell'inizio.
-- Per un periodo che finisce prima dell'anno del fondo noto vale la stima dalla data d'acquisto:
-- la differenza fra stima e fondo noto non è un costo di nessun anno, e il conto economico
-- dell'anno noto resta di dodici quote.
create or replace function private.cg_cespite_ammortamento(
  p_costo numeric, p_aliquota numeric, p_vita_mesi integer, p_acquisto date,
  p_fondo_iniziale numeric, p_fondo_iniziale_anno integer, p_dismissione date, p_dal date, p_al date)
returns numeric language sql immutable parallel safe set search_path to '' as $$
  select greatest(
    case when p_fondo_iniziale_anno is not null and p_al < make_date(p_fondo_iniziale_anno, 1, 1) then
      private.cg_cespite_fondo_al(p_costo, p_aliquota, p_vita_mesi, p_acquisto, null, null,
                                  least(p_al, coalesce(p_dismissione, p_al)))
    else
      private.cg_cespite_fondo_al(p_costo, p_aliquota, p_vita_mesi, p_acquisto, p_fondo_iniziale, p_fondo_iniziale_anno,
                                  least(p_al, coalesce(p_dismissione, p_al)))
    end
    - private.cg_cespite_fondo_al(p_costo, p_aliquota, p_vita_mesi, p_acquisto, p_fondo_iniziale, p_fondo_iniziale_anno,
                                  p_dal - 1),
    0)::numeric(14,2)
$$;
revoke all on function private.cg_cespite_ammortamento(numeric, numeric, integer, date, numeric, integer, date, date, date) from public, anon, authenticated;

do $p$
declare
  ce text := pg_get_functiondef('public.cg_get_conto_economico_riclassificato'::regproc);
  sp text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  dt text := pg_get_functiondef('public.cg_get_dettaglio_voce_mese'::regproc);
  i integer;
  j integer;
  ce_nuovo text := $b$  -- Fondo alla fine del periodo (o alla dismissione) meno fondo prima: un solo calcolo con
  -- Stato patrimoniale e dettaglio (private.cg_cespite_ammortamento). I beni dismessi contano fino
  -- alla data di dismissione.
  SELECT COALESCE(sum(private.cg_cespite_ammortamento(c.costo_storico, c.aliquota_amm, c.vita_utile_mesi, c.data_acquisto,
           c.fondo_iniziale, c.fondo_iniziale_anno, c.data_dismissione,
           make_date(p_anno, p_mese_da, 1), (make_date(p_anno, p_mese_a, 1) + interval '1 month - 1 day')::date)), 0)
    INTO v_amm
    FROM public.cespiti c
   WHERE c.company_id = v_company_id AND c.data_acquisto IS NOT NULL
     AND (c.is_active OR c.data_dismissione IS NOT NULL);$b$;
  dt_nuovo text := $b$  -- ── Ammortamenti (09) ──────────────────────────────────────────────────
  -- Bene per bene, con lo stesso calcolo del conto economico (private.cg_cespite_ammortamento).
  ELSIF p_codice = '09' THEN
    v_label := 'Ammortamenti';
    WITH quote AS (
      SELECT c.id, c.descrizione, c.categoria,
             private.cg_cespite_ammortamento(c.costo_storico, c.aliquota_amm, c.vita_utile_mesi, c.data_acquisto,
               c.fondo_iniziale, c.fondo_iniziale_anno, c.data_dismissione,
               make_date(p_anno, COALESCE(p_mese, 1), 1),
               (make_date(p_anno, COALESCE(p_mese, 12), 1) + interval '1 month - 1 day')::date) AS importo
        FROM public.cespiti c
       WHERE c.company_id = v_company_id AND c.data_acquisto IS NOT NULL
         AND (c.is_active OR c.data_dismissione IS NOT NULL)
    )
    SELECT jsonb_agg(jsonb_build_object(
              'id', q.id, 'source_table', 'cespiti',
              'data', make_date(p_anno, COALESCE(p_mese, 1), 1),
              'descrizione', q.descrizione, 'controparte', NULL,
              'voce_chiave', q.categoria, 'categoria', q.categoria,
              'importo', q.importo
            ) ORDER BY q.importo DESC),
           COALESCE(sum(q.importo), 0)
      INTO v_righe, v_totale
      FROM quote q
     WHERE q.importo > 0;

    WITH quote AS (
      SELECT c.categoria,
             private.cg_cespite_ammortamento(c.costo_storico, c.aliquota_amm, c.vita_utile_mesi, c.data_acquisto,
               c.fondo_iniziale, c.fondo_iniziale_anno, c.data_dismissione,
               make_date(p_anno, COALESCE(p_mese, 1), 1),
               (make_date(p_anno, COALESCE(p_mese, 12), 1) + interval '1 month - 1 day')::date) AS importo
        FROM public.cespiti c
       WHERE c.company_id = v_company_id AND c.data_acquisto IS NOT NULL
         AND (c.is_active OR c.data_dismissione IS NOT NULL)
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'etichetta', etichetta, 'totale', tot, 'count', n
           ) ORDER BY tot DESC), '[]'::jsonb)
      INTO v_raggr
      FROM (SELECT q.categoria AS etichetta, sum(q.importo) AS tot, count(*) AS n
              FROM quote q WHERE q.importo > 0 GROUP BY q.categoria) g;

$b$;
  sp_prima text[] := array[
    $a$    COALESCE(sum(private.cg_cespite_netto_al(costo_storico, aliquota_amm, vita_utile_mesi, data_acquisto, v_rif)) FILTER (WHERE categoria='immateriale'), 0),
    COALESCE(sum(private.cg_cespite_netto_al(costo_storico, aliquota_amm, vita_utile_mesi, data_acquisto, v_rif)) FILTER (WHERE categoria='materiale'),   0),$a$,
    $a$    AND is_active = true
    AND data_acquisto <= v_rif$a$];
  sp_dopo text[] := array[
    $b$    -- Costo meno fondo alla data, come il conto economico (private.cg_cespite_fondo_al).
    COALESCE(sum(costo_storico - private.cg_cespite_fondo_al(costo_storico, aliquota_amm, vita_utile_mesi, data_acquisto, fondo_iniziale, fondo_iniziale_anno, v_rif)) FILTER (WHERE categoria='immateriale'), 0),
    COALESCE(sum(costo_storico - private.cg_cespite_fondo_al(costo_storico, aliquota_amm, vita_utile_mesi, data_acquisto, fondo_iniziale, fondo_iniziale_anno, v_rif)) FILTER (WHERE categoria='materiale'),   0),$b$,
    $b$    -- Anche i beni dismessi dopo la data: alla data c'erano.
    AND (is_active OR data_dismissione IS NOT NULL)
    AND data_acquisto <= v_rif$b$];
begin
  -- Conto economico.
  if position('private.cg_cespite_ammortamento' in ce) = 0 then
    i := position('  WITH amm_base AS (' in ce);
    j := position('    INTO v_amm FROM amm_anno;' in ce);
    if i = 0 or j = 0 or j < i then
      raise exception 'Conto economico: calcolo degli ammortamenti non trovato, la funzione è cambiata';
    end if;
    j := j + length('    INTO v_amm FROM amm_anno;');
    execute substr(ce, 1, i - 1) || ce_nuovo || substr(ce, j);
  end if;

  -- Dettaglio della voce 09.
  if position('private.cg_cespite_ammortamento' in dt) = 0 then
    i := position('  -- ── Ammortamenti (09)' in dt);
    j := position('  -- ── Voci macro_voce semplici' in dt);
    if i = 0 or j = 0 or j < i then
      raise exception 'Dettaglio della voce: blocco degli ammortamenti non trovato, la funzione è cambiata';
    end if;
    execute substr(dt, 1, i - 1) || dt_nuovo || substr(dt, j);
  end if;

  -- Stato patrimoniale.
  if position('private.cg_cespite_fondo_al' in sp) = 0 then
    for i in 1 .. array_length(sp_prima, 1) loop
      if (length(sp) - length(replace(sp, sp_prima[i], ''))) / length(sp_prima[i]) <> 1 then
        raise exception 'Stato patrimoniale: blocco % dei cespiti non trovato una volta sola, la funzione è cambiata', i;
      end if;
      sp := replace(sp, sp_prima[i], sp_dopo[i]);
    end loop;
    execute sp;
  end if;
end $p$;
