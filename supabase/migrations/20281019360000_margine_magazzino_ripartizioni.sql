-- Margine di commessa: magazzino coperto dagli ODA, costi ripartiti tra commesse,
-- ricalcolo del semaforo a ogni movimento di magazzino e rimborso km, quantità intere.
--
-- 1. Magazzino. Una riga coperta da un ODA ha il costo nell'ODA. Il materiale della riga
--    che rientra in magazzino esce dal costo acquisti, al valore della riga dell'ODA e in
--    proporzione a quanto è tornato (rientrato / max(scaricato, ordinato): regge anche
--    quando l'ODA è «a corpo» e il magazzino conta i pezzi).
--    Esempio: ODA 150 € per 20 sacchi, scarico 20, rientro 8 → la commessa paga 90 €;
--    gli 8 sacchi riscaricati su un'altra commessa li paga quella. Totale: 150 €.
--    La merce di un ODA della commessa caricata senza riga (conferma_carico_ddt) e poi
--    scaricata su una riga della stessa commessa è già nell'ODA: lo scarico non si ripete.
-- 2. Costi ripartiti (company_costs.allocations): ogni commessa conta la sua percentuale.
--    Un costo che paga una squadra esterna già registrata sulla commessa si collega con
--    order_external_team_id e resta fuori: il costo è già nella manodopera.
-- 3. Il semaforo del margine si ricalcola anche per i movimenti di magazzino e i
--    rimborsi km, una volta per commessa e per istruzione (trigger di istruzione).
-- 4. Le quantità di magazzino sono intere: le funzioni che muovono il magazzino dalle
--    righe di commessa rifiutano i decimali, come già conferma_carico_ddt.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 2. Collegamento costo ↔ squadra esterna ─────────────────────────────────
ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS order_external_team_id uuid
  REFERENCES public.order_external_teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.company_costs.order_external_team_id IS
  'La squadra esterna della commessa che questo costo paga: il costo è già nella manodopera della commessa e il margine non lo ripete.';

CREATE INDEX IF NOT EXISTS company_costs_order_external_team_idx
  ON public.company_costs (order_external_team_id) WHERE order_external_team_id IS NOT NULL;

-- I costi ripartiti esistenti che ricopiano una squadra della stessa commessa
-- (stessa commessa, stesso importo, una sola squadra possibile) si collegano a lei.
UPDATE public.company_costs cc
   SET order_external_team_id = t.id
  FROM public.order_external_teams t
 WHERE cc.order_external_team_id IS NULL
   AND jsonb_typeof(cc.allocations) = 'array'
   AND jsonb_array_length(cc.allocations) = 1
   AND coalesce((cc.allocations->0->>'pct')::numeric, 0) = 100
   AND t.order_id = (cc.allocations->0->>'order_id')::uuid
   AND abs(t.total_cost - cc.amount) < 0.01
   AND (SELECT count(*) FROM public.order_external_teams t2
         WHERE t2.order_id = t.order_id AND abs(t2.total_cost - cc.amount) < 0.01) = 1
   AND NOT EXISTS (SELECT 1 FROM public.company_costs c2 WHERE c2.order_external_team_id = t.id);

-- ── 1 e 2. Vista del margine ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_ordine_marginalita
WITH (security_invoker = true) AS
 SELECT o.id,
    o.company_id,
    o.order_code,
    o.description,
    o.total_amount AS preventivo_contratto,
    COALESCE(odv.variazioni_approvate, 0::numeric) AS variazioni_approvate,
    o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric) AS preventivo_totale,
    o.work_start_date,
    o.work_end_date,
    o.created_at,
    COALESCE((c.first_name || ' '::text) || c.last_name, ''::text) AS cliente_nome,
    COALESCE(po.costo_acquisti, 0::numeric) AS costo_acquisti,
    COALESCE(err.costo_errori, 0::numeric) AS costo_errori,
    COALESCE(po.costo_acquisti, 0::numeric) + COALESCE(wh.costo_materiali_magazzino, 0::numeric) + COALESCE(err.costo_errori, 0::numeric) + COALESCE(lab.costo_manodopera, 0::numeric) + COALESCE(comm.costo_provvigioni, 0::numeric) + COALESCE(cc.costo_diretto, 0::numeric) + COALESCE(km.costo_rimborsi_km, 0::numeric) AS consuntivo,
    o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric) - (COALESCE(po.costo_acquisti, 0::numeric) + COALESCE(wh.costo_materiali_magazzino, 0::numeric) + COALESCE(err.costo_errori, 0::numeric) + COALESCE(lab.costo_manodopera, 0::numeric) + COALESCE(comm.costo_provvigioni, 0::numeric) + COALESCE(cc.costo_diretto, 0::numeric) + COALESCE(km.costo_rimborsi_km, 0::numeric)) AS margine,
        CASE
            WHEN (o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)) > 0::numeric THEN round((o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric) - (COALESCE(po.costo_acquisti, 0::numeric) + COALESCE(wh.costo_materiali_magazzino, 0::numeric) + COALESCE(err.costo_errori, 0::numeric) + COALESCE(lab.costo_manodopera, 0::numeric) + COALESCE(comm.costo_provvigioni, 0::numeric) + COALESCE(cc.costo_diretto, 0::numeric) + COALESCE(km.costo_rimborsi_km, 0::numeric))) / (o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)) * 100::numeric, 1)
            ELSE 0::numeric
        END AS margine_perc,
    COALESCE(lab.costo_manodopera, 0::numeric) AS costo_manodopera,
    COALESCE(comm.costo_provvigioni, 0::numeric) AS costo_provvigioni,
    COALESCE(cc.costo_diretto, 0::numeric) AS costo_diretto,
    COALESCE(wh.costo_materiali_magazzino, 0::numeric) AS costo_materiali_magazzino,
    COALESCE(wh.movimenti_magazzino_senza_costo, 0::bigint) AS movimenti_magazzino_senza_costo,
    COALESCE(o.percentuale_avanzamento::numeric, 0::numeric) AS percentuale_avanzamento,
    COALESCE(km.costo_rimborsi_km, 0::numeric) AS costo_rimborsi_km,
    COALESCE(km.rimborsi_km_da_approvare, 0::numeric) AS rimborsi_km_da_approvare,
    COALESCE(km.numero_rimborsi_da_approvare, 0::bigint) AS numero_rimborsi_km_da_approvare
   FROM orders o
     LEFT JOIN profiles c ON c.id = o.customer_id
     LEFT JOIN ( SELECT ov.order_id,
            sum(ov.impatto_economico) AS variazioni_approvate
           FROM ordini_variazione ov
          WHERE ov.status = 'approvato'::text AND ov.order_id IS NOT NULL
          GROUP BY ov.order_id) odv ON odv.order_id = o.id
     LEFT JOIN ( SELECT a.order_id,
            sum(a.importo) AS costo_acquisti
           FROM ( SELECT po_1.order_id,
                    po_1.subtotal AS importo
                   FROM purchase_orders po_1
                  WHERE po_1.order_id IS NOT NULL AND (po_1.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text]))
                UNION ALL
                 -- Materiale di una riga coperta dall'ODA rientrato in magazzino: esce dal
                 -- costo dell'ODA in proporzione a quanto della riga è tornato indietro
                 -- (rientrato / max(scaricato, ordinato)), al valore della riga dell'ODA.
                 -- La quota spostata da dividi_scarico_magazzino resta della commessa: passa
                 -- da una riga all'altra insieme alla sua parte di ODA.
                 SELECT k.order_id,
                    - k.valore_oda * LEAST(1::numeric, k.rientrato / NULLIF(GREATEST(k.scaricato, k.coperta, k.rientrato), 0::numeric)) AS importo
                   FROM ( SELECT wm.order_id,
                            wm.order_item_id,
                            sum(CASE
                                    WHEN wm.movement_type = 'scarico'::text THEN wm.quantity::numeric
                                    WHEN wm.movement_type = 'carico'::text AND wm.rientro_commessa AND COALESCE(wm.notes, ''::text) LIKE 'Divisione tra le fasi:%'::text THEN (- wm.quantity)::numeric
                                    ELSE 0::numeric
                                END) AS scaricato,
                            sum(CASE
                                    WHEN wm.movement_type = 'carico'::text AND wm.rientro_commessa AND COALESCE(wm.notes, ''::text) NOT LIKE 'Divisione tra le fasi:%'::text THEN wm.quantity::numeric
                                    ELSE 0::numeric
                                END) AS rientrato,
                            cop.coperta,
                            cop.valore_oda
                           FROM warehouse_movements wm
                             JOIN ( SELECT poi.order_item_id,
                                    po2.order_id,
                                    sum(poi.quantity) AS coperta,
                                    sum(COALESCE(poi.line_total, poi.quantity * poi.unit_price * (1::numeric - COALESCE(poi.discount_percent, 0::numeric) / 100::numeric))) AS valore_oda
                                   FROM purchase_order_items poi
                                     JOIN purchase_orders po2 ON po2.id = poi.purchase_order_id
                                  WHERE poi.order_item_id IS NOT NULL AND (po2.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text]))
                                  GROUP BY poi.order_item_id, po2.order_id) cop ON cop.order_item_id = wm.order_item_id AND cop.order_id = wm.order_id
                          WHERE wm.order_id IS NOT NULL AND (wm.movement_type = ANY (ARRAY['carico'::text, 'scarico'::text]))
                          GROUP BY wm.order_id, wm.order_item_id, cop.coperta, cop.valore_oda
                         HAVING sum(CASE WHEN wm.movement_type = 'carico'::text AND wm.rientro_commessa THEN 1 ELSE 0 END) > 0) k) a
          GROUP BY a.order_id) po ON po.order_id = o.id
     LEFT JOIN ( SELECT x.order_id,
            GREATEST(sum(x.costo), 0::numeric) AS costo_materiali_magazzino,
            sum(x.senza_costo)::bigint AS movimenti_magazzino_senza_costo
           FROM ( -- Righe senza ODA (le coperte sono nel costo dell'ODA): scarichi meno
                  -- rientri, meno la merce già pagata da un ODA della commessa e caricata
                  -- in magazzino senza riga.
                 SELECT u.order_id,
                    u.costo - CASE WHEN u.netto > 0::numeric AND u.da_oda > 0::numeric
                                   THEN LEAST(u.da_oda, u.netto) * u.costo / u.netto
                                   ELSE 0::numeric END AS costo,
                    u.senza_costo
                   FROM ( SELECT wm.order_id,
                            wm.stock_item_id,
                            sum(CASE
                                    WHEN wm.movement_type = 'scarico'::text THEN wm.quantity::numeric * COALESCE(wm.unit_cost, 0::numeric)
                                    WHEN wm.movement_type = 'carico'::text AND wm.rientro_commessa THEN (- wm.quantity)::numeric * COALESCE(wm.unit_cost, 0::numeric)
                                    ELSE 0::numeric
                                END) AS costo,
                            sum(CASE
                                    WHEN wm.movement_type = 'scarico'::text THEN wm.quantity::numeric
                                    WHEN wm.movement_type = 'carico'::text AND wm.rientro_commessa THEN (- wm.quantity)::numeric
                                    ELSE 0::numeric
                                END) AS netto,
                            sum(CASE
                                    WHEN wm.movement_type = 'carico'::text AND NOT COALESCE(wm.rientro_commessa, false) AND wm.order_item_id IS NULL THEN wm.quantity::numeric
                                    ELSE 0::numeric
                                END) AS da_oda,
                            count(*) FILTER (WHERE wm.movement_type = 'scarico'::text AND COALESCE(wm.unit_cost, 0::numeric) <= 0::numeric) AS senza_costo
                           FROM warehouse_movements wm
                          WHERE wm.order_id IS NOT NULL AND (wm.movement_type = ANY (ARRAY['carico'::text, 'scarico'::text]))
                            AND NOT (wm.order_item_id IS NOT NULL AND (EXISTS ( SELECT 1
                                   FROM purchase_order_items poi
                                     JOIN purchase_orders po2 ON po2.id = poi.purchase_order_id
                                  WHERE poi.order_item_id = wm.order_item_id AND po2.order_id = wm.order_id AND (po2.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text])))))
                          GROUP BY wm.order_id, wm.stock_item_id) u
                ) x
          GROUP BY x.order_id) wh ON wh.order_id = o.id
     LEFT JOIN ( SELECT oe.order_id,
            sum(oe.amount) AS costo_errori
           FROM order_errors oe
          GROUP BY oe.order_id) err ON err.order_id = o.id
     LEFT JOIN ( SELECT x.order_id,
            sum(x.total_cost) AS costo_manodopera
           FROM ( SELECT order_employees.order_id,
                    order_employees.total_cost
                   FROM order_employees
                UNION ALL
                 SELECT order_external_teams.order_id,
                    order_external_teams.total_cost / (1::numeric + COALESCE(order_external_teams.vat_rate, 22::numeric) / 100::numeric) AS total_cost
                   FROM order_external_teams) x
          WHERE x.order_id IS NOT NULL
          GROUP BY x.order_id) lab ON lab.order_id = o.id
     LEFT JOIN ( SELECT osp.order_id,
            sum(GREATEST(GREATEST(osp.commission_amount, 0::numeric) - GREATEST(osp.deduction_amount, 0::numeric), 0::numeric)) AS costo_provvigioni
           FROM order_salespeople osp
          WHERE osp.order_id IS NOT NULL
          GROUP BY osp.order_id) comm ON comm.order_id = o.id
     LEFT JOIN ( SELECT q.order_id,
            sum(q.importo) AS costo_diretto
           FROM ( -- Costo intero sulla sua commessa, se non è ripartito.
                 SELECT cc_1.order_id,
                    cc_1.amount AS importo
                   FROM company_costs cc_1
                  WHERE cc_1.order_id IS NOT NULL AND cc_1.purchase_order_id IS NULL AND cc_1.order_external_team_id IS NULL
                    AND (cc_1.allocations IS NULL OR jsonb_typeof(cc_1.allocations) <> 'array'::text OR jsonb_array_length(cc_1.allocations) = 0)
                UNION ALL
                 -- Costo ripartito: ogni commessa la sua percentuale.
                 -- I CASE proteggono le conversioni anche quando il filtro sulla commessa
                 -- viene valutato prima degli altri.
                 SELECT CASE WHEN (a.value ->> 'order_id'::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text
                             THEN (a.value ->> 'order_id'::text)::uuid END AS order_id,
                    cc_1.amount * CASE WHEN (a.value ->> 'pct'::text) ~ '^[0-9]+(\.[0-9]+)?$'::text
                                       THEN (a.value ->> 'pct'::text)::numeric ELSE 0::numeric END / 100::numeric AS importo
                   FROM company_costs cc_1
                     CROSS JOIN LATERAL jsonb_array_elements(cc_1.allocations) a(value)
                  WHERE jsonb_typeof(cc_1.allocations) = 'array'::text AND jsonb_array_length(cc_1.allocations) > 0
                    AND cc_1.purchase_order_id IS NULL AND cc_1.order_external_team_id IS NULL) q
          GROUP BY q.order_id) cc ON cc.order_id = o.id
     LEFT JOIN ( SELECT r.order_id,
            sum(r.importo) FILTER (WHERE r.stato = ANY (ARRAY['approvato'::text, 'rimborsato'::text])) AS costo_rimborsi_km,
            sum(r.importo) FILTER (WHERE r.stato = ANY (ARRAY['da_confermare'::text, 'da_rimborsare'::text])) AS rimborsi_km_da_approvare,
            count(*) FILTER (WHERE r.stato = ANY (ARRAY['da_confermare'::text, 'da_rimborsare'::text])) AS numero_rimborsi_da_approvare
           FROM hr_rimborsi_km r
          WHERE r.order_id IS NOT NULL AND r.stato <> 'annullato'::text
          GROUP BY r.order_id) km ON km.order_id = o.id;

-- ── 3. Semaforo: tutte le voci del margine ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ordine_margine_valuta(p_order_id uuid, p_causa text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m           record;
  v_soglia    numeric := 15;   -- lo stesso valore predefinito di thresholds.ts
  v_attivo    boolean := true;
  v_semaforo  text;
  v_prima     text;
  v_resp      uuid;
  v_voce      text;
  v_importo   numeric;
  f           record;
BEGIN
  SELECT o.id, o.company_id, o.order_code, o.assigned_to, o.created_at,
         v.margine, v.margine_perc, v.preventivo_totale, v.consuntivo,
         v.costo_acquisti, v.costo_errori, v.costo_manodopera,
         v.costo_provvigioni, v.costo_diretto,
         v.costo_materiali_magazzino, v.costo_rimborsi_km
    INTO m
    FROM public.orders o
    JOIN public.v_ordine_marginalita v ON v.id = o.id
   WHERE o.id = p_order_id;

  IF m.id IS NULL THEN
    RETURN jsonb_build_object('valutato', false, 'motivo', 'commessa non trovata');
  END IF;

  SELECT coalesce(g.marginalita_soglia_perc, 15), coalesce(g.marginalita_alert_enabled, true)
    INTO v_soglia, v_attivo
    FROM public.company_governance_settings g
   WHERE g.company_id = m.company_id;
  IF NOT FOUND THEN v_soglia := 15; v_attivo := true; END IF;

  -- Una commessa senza importo non ha un margine: non si inventa uno zero.
  IF coalesce(m.preventivo_totale, 0) <= 0 THEN
    RETURN jsonb_build_object('valutato', false,
      'motivo', 'la commessa non ha un importo: il margine non è definito',
      'order_id', p_order_id);
  END IF;

  v_semaforo := CASE
    WHEN m.margine_perc < 0                       THEN 'rosso'
    WHEN v_attivo AND m.margine_perc < v_soglia   THEN 'giallo'
    ELSE 'verde'
  END;

  SELECT s.semaforo INTO v_prima FROM public.ordine_margine_stato s WHERE s.order_id = p_order_id;

  INSERT INTO public.ordine_margine_stato AS s
    (order_id, company_id, margine, margine_perc, semaforo, soglia_perc, ultima_causa, valutato_at)
  VALUES (p_order_id, m.company_id, round(m.margine, 2), round(m.margine_perc, 2),
          v_semaforo, v_soglia, p_causa, now())
  ON CONFLICT (order_id) DO UPDATE SET
    margine = EXCLUDED.margine, margine_perc = EXCLUDED.margine_perc,
    semaforo = EXCLUDED.semaforo, soglia_perc = EXCLUDED.soglia_perc,
    ultima_causa = EXCLUDED.ultima_causa, valutato_at = EXCLUDED.valutato_at;

  -- Si avvisa solo quando il livello PEGGIORA.
  IF v_prima IS NOT DISTINCT FROM v_semaforo
     OR v_semaforo = 'verde'
     OR (v_prima = 'rosso') THEN
    RETURN jsonb_build_object('valutato', true, 'semaforo', v_semaforo,
      'margine_perc', round(m.margine_perc, 2), 'avvisato', false);
  END IF;

  -- La voce che lo sta erodendo: la più grossa fra tutte quelle del consuntivo.
  SELECT x.voce, x.importo INTO v_voce, v_importo
    FROM (VALUES
      ('acquisti da fornitori',  coalesce(m.costo_acquisti, 0)),
      ('materiali di magazzino', coalesce(m.costo_materiali_magazzino, 0)),
      ('errori e rilavorazioni', coalesce(m.costo_errori, 0)),
      ('manodopera',             coalesce(m.costo_manodopera, 0)),
      ('provvigioni',            coalesce(m.costo_provvigioni, 0)),
      ('costi diretti',          coalesce(m.costo_diretto, 0)),
      ('rimborsi chilometrici',  coalesce(m.costo_rimborsi_km, 0))
    ) AS x(voce, importo)
   ORDER BY x.importo DESC LIMIT 1;

  v_resp := m.assigned_to;

  FOR f IN
    SELECT coalesce(v_resp, p.id) AS user_id
      FROM public.profiles p
     WHERE (v_resp IS NOT NULL AND p.id = v_resp)
        OR (v_resp IS NULL AND p.company_id = m.company_id
            AND public.has_role(p.id, 'company_admin'::public.app_role))
  LOOP
    INSERT INTO public.notifications (company_id, user_id, type, title, body, action_url,
                                      entity_type, entity_id)
    VALUES (
      m.company_id, f.user_id, 'margine_commessa',
      format('%s: margine sceso a %s%%', coalesce(m.order_code, 'commessa'),
             round(m.margine_perc, 1)),
      format('Il margine è passato da %s a %s (soglia %s%%). La voce più pesante è %s: %s €.%s',
             coalesce(v_prima, 'non valutato'), v_semaforo, round(v_soglia, 1),
             v_voce, round(v_importo, 2),
             CASE WHEN p_causa IS NOT NULL THEN ' Ultimo movimento: ' || p_causa || '.' ELSE '' END),
      '/azienda/commesse/' || p_order_id::text,
      'order', p_order_id);
  END LOOP;

  RETURN jsonb_build_object('valutato', true, 'semaforo', v_semaforo,
    'semaforo_prima', v_prima, 'margine_perc', round(m.margine_perc, 2),
    'soglia_perc', v_soglia, 'voce_piu_pesante', v_voce, 'avvisato', true);
END $function$;

-- Trigger di riga: un costo ripartito valuta tutte le commesse a cui è ripartito.
CREATE OR REPLACE FUNCTION public.tg_ordine_margine()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ord uuid; v_causa text; v_righe jsonb;
BEGIN
  v_causa := CASE TG_TABLE_NAME
    WHEN 'purchase_orders'      THEN 'un ordine a fornitore'
    WHEN 'order_errors'         THEN 'un errore o una rilavorazione'
    WHEN 'order_employees'      THEN 'una assegnazione di manodopera'
    WHEN 'order_external_teams' THEN 'una squadra esterna'
    WHEN 'order_salespeople'    THEN 'una provvigione'
    WHEN 'company_costs'        THEN 'un costo diretto'
    WHEN 'ordini_variazione'    THEN 'una variazione'
    WHEN 'orders'               THEN 'l''importo della commessa'
    ELSE TG_TABLE_NAME END;

  IF TG_TABLE_NAME = 'company_costs' THEN
    v_righe := CASE WHEN TG_OP = 'INSERT' THEN '[]'::jsonb ELSE jsonb_build_array(to_jsonb(OLD)) END
            || CASE WHEN TG_OP = 'DELETE' THEN '[]'::jsonb ELSE jsonb_build_array(to_jsonb(NEW)) END;
    FOR v_ord IN
      SELECT DISTINCT d.ord::uuid
        FROM jsonb_array_elements(v_righe) r(riga)
        CROSS JOIN LATERAL (
          SELECT r.riga ->> 'order_id' AS ord
          UNION ALL
          SELECT a.value ->> 'order_id'
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.riga -> 'allocations') = 'array'
                                           THEN r.riga -> 'allocations' ELSE '[]'::jsonb END) a(value)
        ) d
       WHERE d.ord ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    LOOP
      PERFORM public.ordine_margine_valuta(v_ord, v_causa);
    END LOOP;
    RETURN NULL;
  END IF;

  v_ord := coalesce(
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'order_id')
         ELSE (to_jsonb(NEW) ->> 'order_id') END,
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'id')
         ELSE (to_jsonb(NEW) ->> 'id') END)::uuid;

  IF v_ord IS NULL THEN RETURN NULL; END IF;

  PERFORM public.ordine_margine_valuta(v_ord, v_causa);
  RETURN NULL;
END $function$;

-- Trigger di istruzione: una valutazione per commessa, anche quando un'istruzione
-- muove molte righe di magazzino o molti rimborsi insieme.
CREATE OR REPLACE FUNCTION public.tg_ordine_margine_istruzione()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ord uuid; v_causa text;
BEGIN
  v_causa := CASE TG_TABLE_NAME
    WHEN 'warehouse_movements' THEN 'un movimento di magazzino'
    WHEN 'hr_rimborsi_km'      THEN 'un rimborso chilometrico'
    ELSE TG_TABLE_NAME END;

  IF TG_OP = 'INSERT' THEN
    FOR v_ord IN SELECT DISTINCT n.order_id FROM nuove n WHERE n.order_id IS NOT NULL LOOP
      PERFORM public.ordine_margine_valuta(v_ord, v_causa);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR v_ord IN SELECT DISTINCT v.order_id FROM vecchie v WHERE v.order_id IS NOT NULL LOOP
      PERFORM public.ordine_margine_valuta(v_ord, v_causa);
    END LOOP;
  ELSE
    FOR v_ord IN
      SELECT n.order_id FROM nuove n WHERE n.order_id IS NOT NULL
      UNION
      SELECT v.order_id FROM vecchie v WHERE v.order_id IS NOT NULL
    LOOP
      PERFORM public.ordine_margine_valuta(v_ord, v_causa);
    END LOOP;
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.tg_ordine_margine_istruzione() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_margine_commessa_ins ON public.warehouse_movements;
DROP TRIGGER IF EXISTS trg_margine_commessa_upd ON public.warehouse_movements;
DROP TRIGGER IF EXISTS trg_margine_commessa_del ON public.warehouse_movements;
CREATE TRIGGER trg_margine_commessa_ins AFTER INSERT ON public.warehouse_movements
  REFERENCING NEW TABLE AS nuove FOR EACH STATEMENT EXECUTE FUNCTION public.tg_ordine_margine_istruzione();
CREATE TRIGGER trg_margine_commessa_upd AFTER UPDATE ON public.warehouse_movements
  REFERENCING OLD TABLE AS vecchie NEW TABLE AS nuove FOR EACH STATEMENT EXECUTE FUNCTION public.tg_ordine_margine_istruzione();
CREATE TRIGGER trg_margine_commessa_del AFTER DELETE ON public.warehouse_movements
  REFERENCING OLD TABLE AS vecchie FOR EACH STATEMENT EXECUTE FUNCTION public.tg_ordine_margine_istruzione();

DROP TRIGGER IF EXISTS trg_margine_commessa_ins ON public.hr_rimborsi_km;
DROP TRIGGER IF EXISTS trg_margine_commessa_upd ON public.hr_rimborsi_km;
DROP TRIGGER IF EXISTS trg_margine_commessa_del ON public.hr_rimborsi_km;
CREATE TRIGGER trg_margine_commessa_ins AFTER INSERT ON public.hr_rimborsi_km
  REFERENCING NEW TABLE AS nuove FOR EACH STATEMENT EXECUTE FUNCTION public.tg_ordine_margine_istruzione();
CREATE TRIGGER trg_margine_commessa_upd AFTER UPDATE ON public.hr_rimborsi_km
  REFERENCING OLD TABLE AS vecchie NEW TABLE AS nuove FOR EACH STATEMENT EXECUTE FUNCTION public.tg_ordine_margine_istruzione();
CREATE TRIGGER trg_margine_commessa_del AFTER DELETE ON public.hr_rimborsi_km
  REFERENCING OLD TABLE AS vecchie FOR EACH STATEMENT EXECUTE FUNCTION public.tg_ordine_margine_istruzione();

-- ── 4. Magazzino a quantità intere ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.magazzino_movimento_riga(p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_delta numeric, p_nota text, p_attore uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ws public.warehouse_stock; v_delta numeric := coalesce(p_delta, 0); v_preso numeric := 0;
begin
  if p_articolo is null or v_delta = 0 then return false; end if;
  -- Il magazzino conta pezzi interi: una quantità con decimali si ferma qui.
  if v_delta <> trunc(v_delta) then
    raise exception 'Il magazzino conta quantità intere: % non si può scaricare o far rientrare. Usa un numero intero.',
      abs(v_delta) using errcode = '22023';
  end if;
  select * into ws from public.warehouse_stock where id = p_articolo and company_id = p_company for update;
  if not found then return false; end if;
  if v_delta > 0 then
    v_preso := public.magazzino_collega_prelievi(p_company, p_commessa, p_riga, p_articolo, v_delta);
    v_delta := v_delta - v_preso;
    if v_delta <= 0 then return v_preso > 0; end if;
  else
    v_preso := public.magazzino_stacca_prelievi(p_riga, p_articolo, -v_delta);
    v_delta := v_delta + v_preso;
    if v_delta >= 0 then return v_preso > 0; end if;
  end if;
  if v_delta > 0 and coalesce(ws.quantity, 0) < v_delta then
    raise exception 'Giacenza insufficiente per «%»: disponibili %, servono %.',
      coalesce(ws.name, 'articolo di magazzino'), coalesce(ws.quantity, 0), v_delta using errcode = '23514';
  end if;
  update public.warehouse_stock
     set quantity = quantity - v_delta, updated_at = now()
   where id = p_articolo and company_id = p_company;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
     warehouse_id, unit_cost, rientro_commessa)
  values (p_articolo, p_riga, case when v_delta > 0 then 'scarico' else 'carico' end, abs(v_delta),
          p_nota, p_attore, p_commessa, p_company, ws.warehouse_id, ws.unit_cost, v_delta < 0);
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.dividi_scarico_magazzino(p_originale uuid, p_nuova uuid, p_quantita numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.order_items; b public.order_items;
  v_company uuid; v_netto numeric; v_sposta numeric; v_prelievi numeric := 0; v_resto numeric;
  ws public.warehouse_stock;
begin
  select * into a from public.order_items where id = p_originale for update;
  select * into b from public.order_items where id = p_nuova for update;
  if a.id is null or b.id is null or a.order_id <> b.order_id then
    raise exception 'Le due righe non sono della stessa commessa.' using errcode = '22023';
  end if;
  select o.company_id into v_company from public.orders o where o.id = a.order_id;
  if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
     or not exists (select 1 from public.orders o where o.id = a.order_id
                     and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  -- Un articolo di magazzino si divide a pezzi interi: prima di toccare l'ODA o il magazzino.
  if a.stock_item_id is not null and coalesce(p_quantita, 0) <> trunc(coalesce(p_quantita, 0)) then
    raise exception 'Il magazzino conta quantità intere: dividi «%» in parti intere.',
      coalesce(a.name, 'l''articolo') using errcode = '22023';
  end if;
  -- La nuova voce resta coperta dall'ordine d'acquisto per la sua parte.
  perform public.dividi_righe_ordine_acquisto(a.id, b.id, p_quantita);
  if a.stock_item_id is null or b.stock_item_id is distinct from a.stock_item_id or coalesce(p_quantita, 0) <= 0 then
    return 0;
  end if;
  v_netto := public.magazzino_scaricato_riga(a.id, a.stock_item_id);
  v_sposta := least(greatest(v_netto, 0), p_quantita);
  if v_sposta <= 0 then return 0; end if;
  v_prelievi := public.magazzino_stacca_prelievi(a.id, a.stock_item_id, v_sposta);
  if v_prelievi > 0 then
    perform public.magazzino_collega_prelievi(v_company, a.order_id, b.id, a.stock_item_id, v_prelievi);
  end if;
  v_resto := v_sposta - v_prelievi;
  if v_resto > 0 then
    select * into ws from public.warehouse_stock where id = a.stock_item_id;
    insert into public.warehouse_movements
      (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
       warehouse_id, unit_cost, rientro_commessa)
    values
      (a.stock_item_id, a.id, 'carico', v_resto, 'Divisione tra le fasi: quota passata alla nuova riga', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost, true),
      (a.stock_item_id, b.id, 'scarico', v_resto, 'Divisione tra le fasi: quota presa dalla riga originale', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost, false);
  end if;
  return v_sposta;
end $function$;
