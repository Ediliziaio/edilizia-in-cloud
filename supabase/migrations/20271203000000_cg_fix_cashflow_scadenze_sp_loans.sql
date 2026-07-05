-- ════════════════════════════════════════════════════════════════════════════
-- Controllo di Gestione — collegamento consuntivo/previsionale (audit 2026-07-03)
--
-- FIX 1 (CRITICO) — cg_get_cash_flow_prospettico leggeva ZERO scadenze da sempre:
--   filtrava direction IN ('in','out') e status NOT IN ('paid','cancelled'),
--   ma la tabella scadenze usa valori ITALIANI: direction ∈ {entrata,uscita}
--   (colonna GENERATED da tipo) e status ∈ {da_pagare,parziale,pagata,annullata}.
--   → il Cash Flow del CG non ha mai incluso incassi clienti né pagamenti
--   fornitori. Verificato su prod: 206 entrata/da_pagare, 34 uscita/da_pagare.
--
-- FIX 2 — previsionale dalle COMMESSE (requisito dominio): le rate attese
--   (order_installments non pagate con expected_date) ora entrano nelle
--   entrate del mese. Dedup anti doppio-conteggio: se l'ordine ha già
--   scadenze 'entrata' aperte (es. rata fatturata → trigger scadenza),
--   contano le scadenze e le rate di quell'ordine sono escluse.
--
-- FIX 3 — v_uscite_costi non era mai popolato (stub a 0): ora somma i
--   company_costs non pagati con due_date nel mese. Verificato su prod:
--   NESSUN trigger crea scadenze da company_costs → nessun doppio conteggio.
--
-- FIX 4 — cg_cash_flow_manuali.ricorrente era ignorato: una voce ricorrente
--   (es. F24 mensile) ora vale per il suo mese e per tutti i successivi
--   dell'anno.
--
-- FIX 5 — cg_get_stato_patrimoniale_riclassificato: v_mutui_mlt era uno stub
--   a 0 ("tabella loans non disponibile") scritto PRIMA che cg_loans esistesse.
--   Il Cash Flow usa i mutui, lo SP no → passivo sottostimato e rating troppo
--   ottimista. Ora mutui MLT = capitale_residuo dei cg_loans attivi.
-- ════════════════════════════════════════════════════════════════════════════

-- ── FIX 1-4: Cash Flow prospettico ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cg_get_cash_flow_prospettico(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int,
  p_mese_da    int  DEFAULT 1,
  p_mese_a     int  DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id      uuid;
  v_saldo_apertura  numeric(14,2) := 0;
  v_mesi            jsonb := '[]'::jsonb;
  v_saldo_progressivo numeric(14,2);
  v_riga            jsonb;
  v_m               int;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Saldo iniziale = somma current_balance bank_accounts attivi (oggi).
  SELECT COALESCE(sum(COALESCE(ba.current_balance, ba.available_balance, 0)), 0)
  INTO v_saldo_apertura
  FROM public.bank_accounts ba
  WHERE ba.company_id = v_company_id AND ba.is_active = true;

  v_saldo_progressivo := v_saldo_apertura;

  FOR v_m IN p_mese_da..p_mese_a LOOP
    DECLARE
      v_entrate_scadenze  numeric(14,2) := 0;
      v_entrate_commesse  numeric(14,2) := 0;
      v_entrate_manuali   numeric(14,2) := 0;
      v_uscite_costi      numeric(14,2) := 0;
      v_uscite_scadenze   numeric(14,2) := 0;
      v_uscite_personale  numeric(14,2) := 0;
      v_uscite_mutui      numeric(14,2) := 0;
      v_uscite_manuali    numeric(14,2) := 0;
      v_saldo_inizio      numeric(14,2);
      v_saldo_fine        numeric(14,2);
      v_dettaglio_entrate jsonb;
      v_dettaglio_uscite  jsonb;
    BEGIN
      v_saldo_inizio := v_saldo_progressivo;

      -- ENTRATE: scadenze attive aperte con due_date nel mese (residuo)
      SELECT COALESCE(sum(s.amount - COALESCE(s.paid_amount, 0)), 0)
      INTO v_entrate_scadenze
      FROM public.scadenze s
      WHERE s.company_id = v_company_id
        AND s.direction = 'entrata'
        AND extract(year  from s.due_date)::int = p_anno
        AND extract(month from s.due_date)::int = v_m
        AND s.status NOT IN ('pagata','annullata');

      -- ENTRATE da COMMESSE: rate attese non pagate (previsione di commessa).
      -- Esclusi gli ordini già coperti da scadenze entrata aperte (dedup).
      SELECT COALESCE(sum(oi.amount), 0)
      INTO v_entrate_commesse
      FROM public.order_installments oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.company_id = v_company_id
        AND oi.is_paid = false
        AND oi.expected_date IS NOT NULL
        AND extract(year  from oi.expected_date)::int = p_anno
        AND extract(month from oi.expected_date)::int = v_m
        AND NOT EXISTS (
          SELECT 1 FROM public.scadenze s2
          WHERE s2.company_id = v_company_id
            AND s2.order_id = oi.order_id
            AND s2.direction = 'entrata'
            AND s2.status NOT IN ('pagata','annullata')
        );

      -- Entrate manuali (ricorrenti: valgono dal loro mese in poi, stesso anno)
      SELECT COALESCE(sum(importo), 0) INTO v_entrate_manuali
      FROM public.cg_cash_flow_manuali
      WHERE company_id = v_company_id AND anno = p_anno
        AND tipo = 'entrata'
        AND (mese = v_m OR (COALESCE(ricorrente, false) AND mese <= v_m));

      -- USCITE: scadenze passive aperte con due_date nel mese (residuo)
      SELECT COALESCE(sum(s.amount - COALESCE(s.paid_amount, 0)), 0)
      INTO v_uscite_scadenze
      FROM public.scadenze s
      WHERE s.company_id = v_company_id
        AND s.direction = 'uscita'
        AND extract(year  from s.due_date)::int = p_anno
        AND extract(month from s.due_date)::int = v_m
        AND s.status NOT IN ('pagata','annullata');

      -- Costi aziendali non pagati con scadenza nel mese (nessun trigger li
      -- porta in scadenze → nessun doppio conteggio)
      SELECT COALESCE(sum(cc.amount), 0)
      INTO v_uscite_costi
      FROM public.company_costs cc
      WHERE cc.company_id = v_company_id
        AND COALESCE(cc.is_paid, false) = false
        AND cc.due_date IS NOT NULL
        AND extract(year  from cc.due_date)::int = p_anno
        AND extract(month from cc.due_date)::int = v_m;

      -- Stipendi: cedolini del mese (lordo + contributi datore)
      SELECT COALESCE(sum(COALESCE(cd.lordo, 0) + COALESCE(cd.contributi_datore, 0)), 0)
      INTO v_uscite_personale
      FROM public.cedolini cd
      WHERE cd.company_id = v_company_id
        AND cd.anno = p_anno AND cd.mese = v_m;

      -- Mutui: rata_mensile dei mutui attivi
      SELECT COALESCE(sum(rata_mensile), 0) INTO v_uscite_mutui
      FROM public.cg_loans
      WHERE company_id = v_company_id
        AND is_active = true
        AND data_inizio <= make_date(p_anno, v_m, 28)
        AND data_fine   >= make_date(p_anno, v_m, 1);

      -- Uscite manuali (ricorrenti: valgono dal loro mese in poi, stesso anno)
      SELECT COALESCE(sum(importo), 0) INTO v_uscite_manuali
      FROM public.cg_cash_flow_manuali
      WHERE company_id = v_company_id AND anno = p_anno
        AND tipo = 'uscita'
        AND (mese = v_m OR (COALESCE(ricorrente, false) AND mese <= v_m));

      v_saldo_fine := v_saldo_inizio
                    + v_entrate_scadenze + v_entrate_commesse + v_entrate_manuali
                    - v_uscite_costi - v_uscite_scadenze - v_uscite_personale
                    - v_uscite_mutui - v_uscite_manuali;

      -- Dettaglio raggruppato (sub-righe Excel-style)
      SELECT jsonb_agg(jsonb_build_object('etichetta', etichetta, 'importo', tot) ORDER BY tot DESC)
      INTO v_dettaglio_entrate
      FROM (
        SELECT 'Incassi clienti (scadenze)' AS etichetta, v_entrate_scadenze AS tot
        WHERE v_entrate_scadenze <> 0
        UNION ALL
        SELECT 'Rate attese commesse', v_entrate_commesse
        WHERE v_entrate_commesse <> 0
        UNION ALL
        SELECT 'Voci manuali entrata', v_entrate_manuali
        WHERE v_entrate_manuali <> 0
      ) e;

      SELECT jsonb_agg(jsonb_build_object('etichetta', etichetta, 'importo', tot) ORDER BY tot DESC)
      INTO v_dettaglio_uscite
      FROM (
        SELECT 'Pagamenti fornitori (scadenze)' AS etichetta, v_uscite_scadenze AS tot
        WHERE v_uscite_scadenze <> 0
        UNION ALL
        SELECT 'Costi aziendali (da pagare)', v_uscite_costi
        WHERE v_uscite_costi <> 0
        UNION ALL
        SELECT 'Costo personale (cedolini)', v_uscite_personale
        WHERE v_uscite_personale <> 0
        UNION ALL
        SELECT 'Rate mutui MLT', v_uscite_mutui
        WHERE v_uscite_mutui <> 0
        UNION ALL
        SELECT 'Voci manuali uscita', v_uscite_manuali
        WHERE v_uscite_manuali <> 0
      ) u;

      v_riga := jsonb_build_object(
        'mese',              v_m,
        'saldo_inizio',      v_saldo_inizio,
        'entrate_totali',    v_entrate_scadenze + v_entrate_commesse + v_entrate_manuali,
        'entrate',           jsonb_build_object(
                                'scadenze', v_entrate_scadenze,
                                'commesse', v_entrate_commesse,
                                'manuali',  v_entrate_manuali,
                                'fatture',  0
                             ),
        'uscite_totali',     v_uscite_costi + v_uscite_scadenze + v_uscite_personale + v_uscite_mutui + v_uscite_manuali,
        'uscite',            jsonb_build_object(
                                'scadenze',  v_uscite_scadenze,
                                'personale', v_uscite_personale,
                                'mutui',     v_uscite_mutui,
                                'manuali',   v_uscite_manuali,
                                'costi',     v_uscite_costi
                             ),
        'saldo_fine',        v_saldo_fine,
        'flusso_netto',      (v_entrate_scadenze + v_entrate_commesse + v_entrate_manuali)
                             - (v_uscite_costi + v_uscite_scadenze + v_uscite_personale + v_uscite_mutui + v_uscite_manuali),
        'sotto_zero',        v_saldo_fine < 0,
        'dettaglio_entrate', COALESCE(v_dettaglio_entrate, '[]'::jsonb),
        'dettaglio_uscite',  COALESCE(v_dettaglio_uscite,  '[]'::jsonb)
      );

      v_mesi := v_mesi || v_riga;
      v_saldo_progressivo := v_saldo_fine;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id',     v_company_id,
      'anno',           p_anno,
      'mese_da',        p_mese_da,
      'mese_a',         p_mese_a,
      'saldo_apertura', v_saldo_apertura,
      'saldo_chiusura', v_saldo_progressivo,
      'generato_il',    now()
    ),
    'mesi', v_mesi
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_cash_flow_prospettico FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_cash_flow_prospettico TO authenticated;

COMMENT ON FUNCTION public.cg_get_cash_flow_prospettico IS
  'Cash Flow mensile prospettico: saldi banche + entrate (scadenze entrata, rate attese commesse dedup, manuali anche ricorrenti) - uscite (scadenze uscita, costi aziendali non pagati, cedolini, mutui, manuali). Fix 2026-07: enum scadenze italiani.';

-- ── FIX 5: Stato Patrimoniale — mutui MLT da cg_loans ──────────────────────
CREATE OR REPLACE FUNCTION public.cg_get_stato_patrimoniale_riclassificato(
  p_company_id      uuid DEFAULT NULL,
  p_anno            int  DEFAULT extract(year from current_date)::int,
  p_data_riferimento date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_imm_imm   numeric(14,2) := 0;
  v_imm_mat   numeric(14,2) := 0;
  v_imm_fin   numeric(14,2) := 0;
  v_attivo_fisso numeric(14,2);
  v_rimanenze numeric(14,2) := 0;
  v_crediti_clienti  numeric(14,2) := 0;
  v_crediti_trib     numeric(14,2) := 0;
  v_anticipi_forn    numeric(14,2) := 0;
  v_liq_diff numeric(14,2);
  v_cassa numeric(14,2) := 0;
  v_banche_pos numeric(14,2) := 0;
  v_liq_imm numeric(14,2);
  v_ratei_att numeric(14,2) := 0;
  v_attivo_circ numeric(14,2);
  v_tot_attivo numeric(14,2);
  v_capitale numeric(14,2) := 0;
  v_riserve numeric(14,2) := 0;
  v_utile_es numeric(14,2) := 0;
  v_mezzi_propri numeric(14,2);
  v_tfr numeric(14,2) := 0;
  v_fondi_rischi numeric(14,2) := 0;
  v_mutui_mlt numeric(14,2) := 0;
  v_pas_consol numeric(14,2);
  v_banche_neg numeric(14,2) := 0;
  v_debiti_forn numeric(14,2) := 0;
  v_debiti_trib numeric(14,2) := 0;
  v_debiti_pers numeric(14,2) := 0;
  v_debiti_prev numeric(14,2) := 0;
  v_pas_corr numeric(14,2);
  v_tot_passivo numeric(14,2);
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- ── Attivo Fisso (cespiti per categoria) ────────────────────────────────
  SELECT
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='immateriale'), 0),
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='materiale'),   0),
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='finanziaria'), 0)
  INTO v_imm_imm, v_imm_mat, v_imm_fin
  FROM public.cespiti
  WHERE company_id = v_company_id
    AND is_active = true
    AND data_acquisto <= p_data_riferimento
    AND (data_dismissione IS NULL OR data_dismissione > p_data_riferimento);

  v_attivo_fisso := v_imm_imm + v_imm_mat + v_imm_fin;

  -- ── Rimanenze (warehouse_stock) ─────────────────────────────────────────
  SELECT COALESCE(sum(quantity * COALESCE(unit_cost, 0)), 0)
  INTO v_rimanenze
  FROM public.warehouse_stock
  WHERE company_id = v_company_id AND quantity > 0;

  -- ── Crediti vs clienti = (total - paid_amount) sulle fatture ────────────
  SELECT COALESCE(sum(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0)), 0)
  INTO v_crediti_clienti
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.status NOT IN ('cancelled','draft','annullata','bozza')
    AND i.issue_date <= p_data_riferimento;

  -- Crediti tributari / Anticipi fornitori → tabelle non disponibili: stub.
  v_crediti_trib  := 0;
  v_anticipi_forn := 0;

  v_liq_diff := v_crediti_clienti + v_crediti_trib + v_anticipi_forn;

  -- ── Liquidità immediate (banche) ────────────────────────────────────────
  SELECT COALESCE(sum(current_balance), 0)
  INTO v_banche_pos
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance > 0;

  v_cassa := 0;  -- nessuna view cassa_movimenti_riepilogo nello schema attuale
  v_liq_imm := v_cassa + v_banche_pos;

  v_attivo_circ := v_rimanenze + v_liq_diff + v_liq_imm + v_ratei_att;
  v_tot_attivo  := v_attivo_fisso + v_attivo_circ;

  -- ── Mezzi Propri (patrimonio_netto + utile esercizio dalla RPC CE) ──────
  SELECT
    COALESCE(pn.capitale_sociale, 0),
    COALESCE(pn.riserva_legale, 0) + COALESCE(pn.riserva_straordinaria, 0)
      + COALESCE(pn.altre_riserve, 0) + COALESCE(pn.utili_perdite_a_nuovo, 0),
    COALESCE(pn.fondo_tfr, 0),
    COALESCE(pn.fondo_rischi, 0) + COALESCE(pn.altri_fondi, 0)
  INTO v_capitale, v_riserve, v_tfr, v_fondi_rischi
  FROM public.patrimonio_netto pn
  WHERE pn.company_id = v_company_id AND pn.esercizio = p_anno;

  -- Utile esercizio dalla RPC CE (codice 'L')
  SELECT (val->>'valore')::numeric INTO v_utile_es
  FROM jsonb_array_elements(
    (public.cg_get_conto_economico_riclassificato(v_company_id, p_anno) -> 'voci')
  ) AS val
  WHERE val->>'codice' = 'L'
  LIMIT 1;

  v_capitale     := COALESCE(v_capitale, 0);
  v_riserve      := COALESCE(v_riserve, 0);
  v_tfr          := COALESCE(v_tfr, 0);
  v_fondi_rischi := COALESCE(v_fondi_rischi, 0);
  v_utile_es     := COALESCE(v_utile_es, 0);
  v_mezzi_propri := v_capitale + v_riserve + v_utile_es;

  -- Mutui MLT = capitale residuo dei finanziamenti attivi (cg_loans).
  -- Era uno stub a 0 scritto prima che cg_loans esistesse: il Cash Flow
  -- contava le rate, lo SP ignorava il debito → passivo sottostimato.
  SELECT COALESCE(sum(COALESCE(capitale_residuo, 0)), 0)
  INTO v_mutui_mlt
  FROM public.cg_loans
  WHERE company_id = v_company_id
    AND is_active = true;

  v_pas_consol := v_tfr + v_fondi_rischi + v_mutui_mlt;

  -- ── Passivo corrente ────────────────────────────────────────────────────
  SELECT COALESCE(sum(abs(current_balance)), 0)
  INTO v_banche_neg
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance < 0;

  -- Debiti fornitori = `purchase_orders.total` non saldati (no supplier_payments)
  SELECT COALESCE(sum(COALESCE(po.total, 0)), 0)
  INTO v_debiti_forn
  FROM public.purchase_orders po
  WHERE po.company_id = v_company_id
    AND po.status IN ('pending','confirmed','received');

  -- Debiti tributari = f24_entries non pagati
  SELECT COALESCE(sum(COALESCE(importo, 0)), 0)
  INTO v_debiti_trib
  FROM public.f24_entries
  WHERE company_id = v_company_id
    AND stato IN ('da_pagare','parzialmente_pagato')
    AND anno = p_anno;

  -- Debiti vs personale = cedolini emessi non pagati (campo data_pagamento
  -- assente → assumiamo pagati). Stub a 0 prudenziale.
  v_debiti_pers := 0;
  v_debiti_prev := 0;

  v_pas_corr    := v_banche_neg + v_debiti_forn + v_debiti_trib + v_debiti_pers + v_debiti_prev;
  v_tot_passivo := v_mezzi_propri + v_pas_consol + v_pas_corr;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id, 'anno', p_anno,
      'data_riferimento', p_data_riferimento, 'generato_il', now()
    ),
    'attivo', jsonb_build_object(
      'imm_immateriali', v_imm_imm,
      'imm_materiali',   v_imm_mat,
      'imm_finanziarie', v_imm_fin,
      'attivo_fisso',    v_attivo_fisso,
      'rimanenze',       v_rimanenze,
      'crediti_clienti', v_crediti_clienti,
      'crediti_tributari', v_crediti_trib,
      'anticipi_fornitori', v_anticipi_forn,
      'liquidita_differite', v_liq_diff,
      'cassa',           v_cassa,
      'banche_positive', v_banche_pos,
      'liquidita_immediate', v_liq_imm,
      'attivo_circolante', v_attivo_circ,
      'totale', v_tot_attivo
    ),
    'passivo', jsonb_build_object(
      'capitale_sociale', v_capitale,
      'riserve',          v_riserve,
      'utile_esercizio',  v_utile_es,
      'mezzi_propri',     v_mezzi_propri,
      'fondo_tfr',        v_tfr,
      'fondi_rischi',     v_fondi_rischi,
      'mutui_mlt',        v_mutui_mlt,
      'pas_consolidato',  v_pas_consol,
      'banche_negative',  v_banche_neg,
      'debiti_fornitori', v_debiti_forn,
      'debiti_tributari', v_debiti_trib,
      'debiti_personale', v_debiti_pers,
      'debiti_previdenziali', v_debiti_prev,
      'pas_corrente',     v_pas_corr,
      'totale',           v_tot_passivo
    ),
    'quadratura', jsonb_build_object(
      'differenza', v_tot_attivo - v_tot_passivo,
      'quadrato',   abs(v_tot_attivo - v_tot_passivo) < 1.00
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_stato_patrimoniale_riclassificato TO authenticated;
COMMENT ON FUNCTION public.cg_get_stato_patrimoniale_riclassificato IS
  'Stato Patrimoniale riclassificato (Impieghi/Fonti) auto-popolato dai dati EiC. Fix 2026-07: mutui MLT da cg_loans (capitale residuo attivi).';
