-- Stato patrimoniale riclassificato: debiti presi da dove stanno davvero.
--
-- Demo 2, 22/10/2026: attivo 2.611.458,82 €, passivo 1.265.127,27 €,
-- differenza 1.346.331,55 €. Tre cause nella funzione, non nei dati:
--
-- 1. Debiti verso fornitori = 0,00 €. Si sommavano gli ordini d'acquisto con
--    stato 'pending','confirmed','received': gli stati veri sono in italiano
--    ('ricevuto','confermato','inviato'), quindi non entrava mai niente. E un
--    ordine non è un debito: il debito è il pagamento al fornitore ancora
--    aperto. Ora: scadenze in uscita aperte, non previsionali
--      - pagamento_fornitore: tutte (fattura ricevuta, da pagare) → 124.284 €
--      - costo_aziendale: solo quelle già scadute alla data (affitti, utenze…
--        di dicembre non sono ancora un debito oggi) → fino a 33.103,84 €
-- 2. Debiti tributari: solo f24_entries (tabella vuota per tutte le aziende).
--    Ora anche le scadenze fiscali aperte (6.950 € in Demo 2) e le ritenute
--    dei cedolini emessi e non pagati.
-- 3. Debiti verso personale e previdenziali: zero fisso. Ora dai cedolini
--    emessi e non pagati (netto; contributi dipendente + datore).
--
-- In più:
-- - Per un anno chiuso la data di riferimento è il 31/12 di quell'anno, non
--   oggi (prima lo SP 2025 mescolava il patrimonio netto 2025 con le fatture
--   e i debiti di oggi).
-- - meta.voci_manuali: le voci che il gestionale non sa calcolare (crediti
--   tributari, anticipi a fornitori, cassa contanti); la pagina le mostra
--   come «da inserire a mano» invece di 0,00 €.
--
-- La differenza residua della Demo 2 (circa 1,18 M€) resta: è patrimonio
-- netto (utili degli anni passati) non inserito, e la pagina ora lo dice.
--
-- Solo CREATE OR REPLACE di una funzione: nessuna riga scritta.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.cg_get_stato_patrimoniale_riclassificato(
  p_company_id uuid DEFAULT NULL::uuid,
  p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer,
  p_data_riferimento date DEFAULT CURRENT_DATE
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_rif date;
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
  v_ritenute_ced numeric(14,2) := 0;
  v_pas_corr numeric(14,2);
  v_tot_passivo numeric(14,2);
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Anno chiuso: situazione al 31/12 di quell'anno, non a oggi.
  v_rif := LEAST(COALESCE(p_data_riferimento, CURRENT_DATE), make_date(p_anno, 12, 31));

  -- ── Attivo fisso (cespiti per categoria) ────────────────────────────────
  SELECT
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='immateriale'), 0),
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='materiale'),   0),
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='finanziaria'), 0)
  INTO v_imm_imm, v_imm_mat, v_imm_fin
  FROM public.cespiti
  WHERE company_id = v_company_id
    AND is_active = true
    AND data_acquisto <= v_rif
    AND (data_dismissione IS NULL OR data_dismissione > v_rif);

  v_attivo_fisso := v_imm_imm + v_imm_mat + v_imm_fin;

  -- ── Rimanenze (giacenza di oggi: il magazzino non ha storico) ───────────
  SELECT COALESCE(sum(quantity * COALESCE(unit_cost, 0)), 0)
  INTO v_rimanenze
  FROM public.warehouse_stock
  WHERE company_id = v_company_id AND quantity > 0;

  -- ── Crediti verso clienti = fatture emesse non incassate (IVA compresa) ─
  SELECT COALESCE(sum(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0)), 0)
  INTO v_crediti_clienti
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.status NOT IN ('cancelled','draft','annullata','bozza')
    AND i.issue_date <= v_rif;

  -- Crediti tributari / anticipi a fornitori: nessuna fonte nel gestionale.
  v_crediti_trib  := 0;
  v_anticipi_forn := 0;

  v_liq_diff := v_crediti_clienti + v_crediti_trib + v_anticipi_forn;

  -- ── Liquidità immediate (saldi di oggi dei conti) ───────────────────────
  SELECT COALESCE(sum(current_balance), 0)
  INTO v_banche_pos
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance > 0;

  v_cassa := 0;  -- nessuna fonte per la cassa contanti
  v_liq_imm := v_cassa + v_banche_pos;

  v_attivo_circ := v_rimanenze + v_liq_diff + v_liq_imm + v_ratei_att;
  v_tot_attivo  := v_attivo_fisso + v_attivo_circ;

  -- ── Mezzi propri (patrimonio_netto + utile dell'esercizio dal CE) ───────
  SELECT
    COALESCE(pn.capitale_sociale, 0),
    COALESCE(pn.riserva_legale, 0) + COALESCE(pn.riserva_straordinaria, 0)
      + COALESCE(pn.altre_riserve, 0) + COALESCE(pn.utili_perdite_a_nuovo, 0),
    COALESCE(pn.fondo_tfr, 0),
    COALESCE(pn.fondo_rischi, 0) + COALESCE(pn.altri_fondi, 0)
  INTO v_capitale, v_riserve, v_tfr, v_fondi_rischi
  FROM public.patrimonio_netto pn
  WHERE pn.company_id = v_company_id AND pn.esercizio = p_anno;

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

  -- Mutui = capitale residuo dei finanziamenti attivi.
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

  -- Debiti verso fornitori = pagamenti in uscita ancora aperti nello
  -- scadenzario (non gli ordini d'acquisto: un ordine non è un debito).
  SELECT COALESCE(sum(GREATEST(COALESCE(s.amount, 0) - COALESCE(s.paid_amount, 0), 0)), 0)
  INTO v_debiti_forn
  FROM public.scadenze s
  WHERE s.company_id = v_company_id
    AND s.direction = 'uscita'
    AND s.status IN ('da_pagare', 'parziale')
    AND COALESCE(s.is_previsionale, false) = false
    AND (
      s.tipo = 'pagamento_fornitore'
      OR (s.tipo = 'costo_aziendale' AND s.due_date <= v_rif)
    );

  -- Debiti tributari = F24 da pagare + scadenze fiscali aperte.
  SELECT COALESCE(sum(COALESCE(importo, 0)), 0)
  INTO v_debiti_trib
  FROM public.f24_entries
  WHERE company_id = v_company_id
    AND stato IN ('da_pagare','parzialmente_pagato')
    AND anno <= p_anno;

  v_debiti_trib := v_debiti_trib + COALESCE((
    SELECT sum(GREATEST(COALESCE(s.amount, 0) - COALESCE(s.paid_amount, 0), 0))
    FROM public.scadenze s
    WHERE s.company_id = v_company_id
      AND s.direction = 'uscita'
      AND s.tipo = 'scadenza_fiscale'
      AND s.status IN ('da_pagare', 'parziale')
      AND COALESCE(s.is_previsionale, false) = false
  ), 0);

  -- Personale: cedolini emessi e non ancora pagati fino alla data.
  SELECT
    COALESCE(sum(COALESCE(c.netto, 0)), 0),
    COALESCE(sum(COALESCE(c.contributi_dipendente, 0) + COALESCE(c.contributi_datore, 0)), 0),
    COALESCE(sum(COALESCE(c.ritenute_irpef, 0)), 0)
  INTO v_debiti_pers, v_debiti_prev, v_ritenute_ced
  FROM public.cedolini c
  WHERE c.company_id = v_company_id
    AND c.stato = 'emesso'
    AND make_date(c.anno, c.mese, 1) <= v_rif;

  v_debiti_trib := v_debiti_trib + v_ritenute_ced;

  v_pas_corr    := v_banche_neg + v_debiti_forn + v_debiti_trib + v_debiti_pers + v_debiti_prev;
  v_tot_passivo := v_mezzi_propri + v_pas_consol + v_pas_corr;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id, 'anno', p_anno,
      'data_riferimento', v_rif, 'generato_il', now(),
      'voci_manuali', jsonb_build_array('crediti_tributari', 'anticipi_fornitori', 'cassa')
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
$function$;

-- Interna: la chiamano cg_get_sp_safe e le altre funzioni cg_* (SECURITY
-- DEFINER). Nessun accesso diretto da anon.
REVOKE ALL ON FUNCTION public.cg_get_stato_patrimoniale_riclassificato(uuid, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_stato_patrimoniale_riclassificato(uuid, integer, date) TO authenticated, service_role;
