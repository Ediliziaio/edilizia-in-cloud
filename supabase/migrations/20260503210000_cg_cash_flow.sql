-- MP-CG-10 — Cash Flow Mensile Prospettico + tabella loans (mutui MLT)
-- Replica l'Excel "OTP | Flusso Finanziario" mensile.
-- Fonti dati:
--   • saldo iniziale  ← bank_accounts.current_balance (somma)
--   • entrate         ← scadenze direction='in' + cg_cash_flow_manuali tipo='entrata'
--   • uscite          ← scadenze direction='out' + cedolini + cg_loans + cg_cash_flow_manuali tipo='uscita'

-- ════════════════════════════════════════════════════════════════════════════
-- 1) cg_loans — Tabella mutui MLT (M2 finalmente implementata)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cg_loans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  banca           text NOT NULL,
  descrizione     text,
  capitale_iniziale numeric(14,2) NOT NULL,
  capitale_residuo  numeric(14,2) NOT NULL,
  tasso_pct       numeric(6,3) NOT NULL DEFAULT 0,
  rata_mensile    numeric(14,2) NOT NULL,
  durata_mesi     int NOT NULL,
  rate_pagate     int NOT NULL DEFAULT 0,
  data_inizio     date NOT NULL,
  data_fine       date NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cg_loans_company ON public.cg_loans(company_id);
CREATE INDEX IF NOT EXISTS idx_cg_loans_active  ON public.cg_loans(company_id, is_active);

ALTER TABLE public.cg_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_loans_select ON public.cg_loans;
CREATE POLICY cg_loans_select ON public.cg_loans FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_loans_insert ON public.cg_loans;
CREATE POLICY cg_loans_insert ON public.cg_loans FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_loans_update ON public.cg_loans;
CREATE POLICY cg_loans_update ON public.cg_loans FOR UPDATE
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_loans_delete ON public.cg_loans;
CREATE POLICY cg_loans_delete ON public.cg_loans FOR DELETE
  USING (company_id = public.get_my_company_id());

DROP TRIGGER IF EXISTS trg_cg_loans_updated_at ON public.cg_loans;
CREATE TRIGGER trg_cg_loans_updated_at
  BEFORE UPDATE ON public.cg_loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cg_loans IS
  'Mutui e finanziamenti MLT — usati da Cash Flow + SP riclassificato.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) cg_cash_flow_manuali — Voci manuali utente (anticipi, immissioni, ecc.)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cg_cash_flow_manuali (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anno          int NOT NULL,
  mese          int NOT NULL CHECK (mese BETWEEN 1 AND 12),
  tipo          text NOT NULL CHECK (tipo IN ('entrata','uscita')),
  categoria     text NOT NULL,
  descrizione   text NOT NULL,
  importo       numeric(14,2) NOT NULL CHECK (importo >= 0),
  ricorrente    boolean NOT NULL DEFAULT false,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cg_cf_manuali_company_anno
  ON public.cg_cash_flow_manuali(company_id, anno, mese);

ALTER TABLE public.cg_cash_flow_manuali ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_cf_manuali_select ON public.cg_cash_flow_manuali;
CREATE POLICY cg_cf_manuali_select ON public.cg_cash_flow_manuali FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_cf_manuali_insert ON public.cg_cash_flow_manuali;
CREATE POLICY cg_cf_manuali_insert ON public.cg_cash_flow_manuali FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_cf_manuali_update ON public.cg_cash_flow_manuali;
CREATE POLICY cg_cf_manuali_update ON public.cg_cash_flow_manuali FOR UPDATE
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_cf_manuali_delete ON public.cg_cash_flow_manuali;
CREATE POLICY cg_cf_manuali_delete ON public.cg_cash_flow_manuali FOR DELETE
  USING (company_id = public.get_my_company_id());

DROP TRIGGER IF EXISTS trg_cg_cf_manuali_updated_at ON public.cg_cash_flow_manuali;
CREATE TRIGGER trg_cg_cf_manuali_updated_at
  BEFORE UPDATE ON public.cg_cash_flow_manuali
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cg_cash_flow_manuali IS
  'Voci manuali aggiuntive per Cash Flow: anticipi soci, immissioni capitale, F24, IVA stimata, ecc.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) cg_get_cash_flow_prospettico — RPC mensile prospettica
-- ════════════════════════════════════════════════════════════════════════════

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
  -- Rappresenta la cassa "in entrata" al mese p_mese_da.
  SELECT COALESCE(sum(COALESCE(ba.current_balance, ba.available_balance, 0)), 0)
  INTO v_saldo_apertura
  FROM public.bank_accounts ba
  WHERE ba.company_id = v_company_id AND ba.is_active = true;

  v_saldo_progressivo := v_saldo_apertura;

  FOR v_m IN p_mese_da..p_mese_a LOOP
    DECLARE
      v_entrate_fatture   numeric(14,2) := 0;
      v_entrate_scadenze  numeric(14,2) := 0;
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

      -- ENTRATE: scadenze in + fatture aperte con due_date nel mese
      SELECT COALESCE(sum(s.amount - COALESCE(s.paid_amount, 0)), 0)
      INTO v_entrate_scadenze
      FROM public.scadenze s
      WHERE s.company_id = v_company_id
        AND s.direction = 'in'
        AND extract(year  from s.due_date)::int = p_anno
        AND extract(month from s.due_date)::int = v_m
        AND s.status NOT IN ('paid','cancelled');

      -- Entrate manuali
      SELECT COALESCE(sum(importo), 0) INTO v_entrate_manuali
      FROM public.cg_cash_flow_manuali
      WHERE company_id = v_company_id AND anno = p_anno
        AND mese = v_m AND tipo = 'entrata';

      -- USCITE: scadenze out + costi non pagati
      SELECT COALESCE(sum(s.amount - COALESCE(s.paid_amount, 0)), 0)
      INTO v_uscite_scadenze
      FROM public.scadenze s
      WHERE s.company_id = v_company_id
        AND s.direction = 'out'
        AND extract(year  from s.due_date)::int = p_anno
        AND extract(month from s.due_date)::int = v_m
        AND s.status NOT IN ('paid','cancelled');

      -- Stipendi: cedolini emessi/pagati del mese (lordo + contributi datore)
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

      -- Uscite manuali
      SELECT COALESCE(sum(importo), 0) INTO v_uscite_manuali
      FROM public.cg_cash_flow_manuali
      WHERE company_id = v_company_id AND anno = p_anno
        AND mese = v_m AND tipo = 'uscita';

      v_saldo_fine := v_saldo_inizio
                    + v_entrate_fatture + v_entrate_scadenze + v_entrate_manuali
                    - v_uscite_costi - v_uscite_scadenze - v_uscite_personale
                    - v_uscite_mutui - v_uscite_manuali;

      -- Dettaglio raggruppato (sub-righe Excel-style)
      SELECT jsonb_agg(jsonb_build_object('etichetta', etichetta, 'importo', tot) ORDER BY tot DESC)
      INTO v_dettaglio_entrate
      FROM (
        SELECT 'Incassi clienti (scadenze)' AS etichetta, v_entrate_scadenze AS tot
        WHERE v_entrate_scadenze <> 0
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
        'entrate_totali',    v_entrate_fatture + v_entrate_scadenze + v_entrate_manuali,
        'entrate',           jsonb_build_object(
                                'scadenze', v_entrate_scadenze,
                                'manuali',  v_entrate_manuali,
                                'fatture',  v_entrate_fatture
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
        'flusso_netto',      (v_entrate_fatture + v_entrate_scadenze + v_entrate_manuali)
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
  'Cash Flow mensile prospettico: saldi banche + entrate (scadenze in/manuali) - uscite (scadenze out/cedolini/mutui/manuali).';

-- Wrapper feature-flag-gated
CREATE OR REPLACE FUNCTION public.cg_get_cash_flow_prospettico_safe(
  p_anno    int,
  p_mese_da int,
  p_mese_a  int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_cash_flow_prospettico(v_company_id, p_anno, p_mese_da, p_mese_a);
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_cash_flow_prospettico_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_cash_flow_prospettico_safe TO authenticated;

COMMENT ON FUNCTION public.cg_get_cash_flow_prospettico_safe IS
  'Wrapper feature-flag-gated di cg_get_cash_flow_prospettico.';
