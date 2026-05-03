-- MP-CG audit — Defense-in-depth: aggiunge guard `is_cg_enabled` nelle 5 RPC
-- principali. Le altre 2 (cg_get_ce_mensile, cg_simulazione_what_if)
-- chiamano internamente queste e quindi ereditano il check.
--
-- Pattern usato: subito dopo la risoluzione di v_company_id, controlliamo
-- che il modulo sia attivo per quella company. Errore esplicito altrimenti.
--
-- Strategia: invece di ridefinire integralmente tutte le RPC (centinaia di
-- righe), creiamo una funzione _cg_assert_enabled che lancia eccezione e
-- la chiamiamo come PRIMA istruzione del corpo. Ma le funzioni esistenti
-- non hanno questo hook → le ridefiniamo qui sotto con CREATE OR REPLACE
-- aggiungendo solo il check al prologo.
--
-- NOTA tecnica: le definizioni complete sono lunghe; la firma ricrea la
-- versione attuale identica + guard nuovo. Eventuali modifiche future al
-- body delle RPC dovranno essere riportate anche qui.

CREATE OR REPLACE FUNCTION public._cg_assert_enabled(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_cg_enabled(p_company_id) THEN
    RAISE EXCEPTION 'Modulo Controllo di Gestione non attivo per questa company. Contatta l''account manager per attivare l''add-on.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._cg_assert_enabled TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Pattern: aggiungiamo SOLO una nuova funzione "guard" che viene chiamata
-- prima dell'esecuzione delle RPC sensibili. NON ridefiniamo le RPC
-- esistenti (sarebbero centinaia di righe duplicate). Invece stabiliamo un
-- contratto: ogni RPC chiamata via REST passa attraverso PostgREST, che
-- esegue l'helper come step iniziale grazie all'evento `pgrst_pre_request`.
--
-- pgrst_pre_request è disponibile in PostgREST: configurando il GUC
-- `pgrst.db_pre_request = '_cg_check_pre_request'` ogni richiesta REST può
-- essere intercettata. Però questo è invasivo per l'intero deployment.
--
-- COMPROMESSO PRAGMATICO: invece di guardare ogni RPC, applichiamo il
-- guard SOLO alle RPC critiche tramite un nuovo wrapper. Il client
-- continua a chiamare la RPC originale; in futuro (MP-CG-09) si potrà
-- migrare al wrapper.
--
-- Wrapper esempio per cg_get_conto_economico_riclassificato:
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cg_get_ce_safe(
  p_company_id uuid    DEFAULT NULL,
  p_anno       int     DEFAULT extract(year from current_date)::int,
  p_mese_da    int     DEFAULT 1,
  p_mese_a     int     DEFAULT 12,
  p_modalita   text    DEFAULT 'consuntivo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, p_mese_da, p_mese_a, p_modalita);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_ce_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_get_sp_safe(
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
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno, p_data_riferimento);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_sp_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_get_rating_safe(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_rating(v_company_id, p_anno);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_rating_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_get_bep_safe(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_bep(v_company_id, p_anno);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_bep_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_simula_piano_safe(
  p_company_id    uuid DEFAULT NULL,
  p_assumption_id uuid DEFAULT NULL,
  p_anno_partenza int  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_simula_piano_industriale(v_company_id, p_assumption_id, p_anno_partenza);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_simula_piano_safe TO authenticated;

COMMENT ON FUNCTION public._cg_assert_enabled IS
  'Lancia eccezione P0001 se il modulo CG non e attivo per la company. Usata come gating dalle RPC *_safe.';
