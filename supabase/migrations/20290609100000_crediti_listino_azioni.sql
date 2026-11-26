-- Una moneta sola, fase 1 (docs/piani/piano-moneta-unica-crediti.md, decisioni del 25/11/2026).
--
-- Render, render 3D e planimetrie AI passeranno dagli euro di credito AI con un
-- PREZZO FISSO per azione, invece di scalare un «credito render» a pezzi.
-- Questa migrazione prepara il listino e insegna a charge_ai_call a usarlo;
-- nessuna edge function lo usa ancora (fase 2), quindi non cambia niente per
-- nessuno finché una chiamata non porta metadata.azione.
--
--   ai_listino_azioni       prezzo fisso in euro per azione, con il costo stimato
--                           (il prezzo deve valere almeno 4× il costo stimato)
--   ai_crediti_illimitati   aziende che non pagano le azioni (Demo Azienda 2, al
--                           posto di render_credits.unlimited)
--   charge_ai_call          se metadata.azione è nel listino, addebita il prezzo
--                           fisso; tutto il resto (omaggio prima, poi portafoglio,
--                           debito, idempotenza, registro) resta com'era.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ─── Listino ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_listino_azioni (
  azione            text PRIMARY KEY,
  etichetta         text NOT NULL,
  prezzo_eur        numeric(10,4) NOT NULL CHECK (prezzo_eur > 0),
  costo_stimato_usd numeric(10,4) NOT NULL CHECK (costo_stimato_usd >= 0),
  attiva            boolean NOT NULL DEFAULT true,
  note              text,
  aggiornato_il     timestamptz NOT NULL DEFAULT now(),
  -- costo stimato in euro (cambio prudente 0,95) al massimo il 25% del prezzo (ricarico 4×, 26/11/2026)
  CONSTRAINT ai_listino_azioni_ricarico_minimo CHECK (prezzo_eur >= costo_stimato_usd * 0.95 * 4)
);

ALTER TABLE public.ai_listino_azioni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_listino_azioni FROM PUBLIC, anon, authenticated;
-- il browser mostra il prezzo sui pulsanti (fase 3): sola lettura
GRANT SELECT ON public.ai_listino_azioni TO authenticated;
DROP POLICY IF EXISTS ai_listino_azioni_lettura ON public.ai_listino_azioni;
CREATE POLICY ai_listino_azioni_lettura ON public.ai_listino_azioni
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.ai_listino_azioni (azione, etichetta, prezzo_eur, costo_stimato_usd, note) VALUES
  ('render',                  'Render',                                   0.50, 0.06, 'generazione + analisi della scena + controllo qualità, tutto dentro il prezzo'),
  ('render_3d',               'Render 3D della planimetria',              0.50, 0.012, 'motore nostro (container), ~1–3 minuti su 4 vCPU'),
  ('planimetria_ai',          'Planimetria generata dall''AI',            0.50, 0.065, 'da PDF, foto, schizzo, descrizione o rilievo; in media 1,7 tentativi del modello'),
  ('planimetria_chat',        'Chat sul progetto, norme, frazionamento',  0.12, 0.03, 'come una domanda a Silvio'),
  ('render_analisi_finestra', 'Analisi della foto di una finestra',       0.70, 0.18, 'modello con visione; costo medio 0,17 €, il più caro')
ON CONFLICT (azione) DO NOTHING;

-- ─── Aziende con le azioni gratuite ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_crediti_illimitati (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  motivo     text NOT NULL,
  creato_il  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_crediti_illimitati ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_crediti_illimitati FROM PUBLIC, anon, authenticated;

-- chi oggi ha i render illimitati li tiene (Demo Azienda 2)
INSERT INTO public.ai_crediti_illimitati (company_id, motivo)
SELECT company_id, 'render illimitati prima della moneta unica (render_credits.unlimited)'
  FROM public.render_credits
 WHERE unlimited
ON CONFLICT (company_id) DO NOTHING;

-- ─── charge_ai_call: prezzo fisso per azione ─────────────────────────────────
-- Patch chirurgica (pg_get_functiondef + replace), come per le altre modifiche
-- a questa funzione: il resto del corpo non cambia. Idempotente: se il
-- segnaposto 'azione_illimitata' c'è già, non fa niente.
DO $patch$
DECLARE
  v_def text;
  v_nuova text;
BEGIN
  v_def := pg_get_functiondef('public.charge_ai_call(text,uuid,uuid,text,text,text,boolean,integer,text,integer,integer,numeric,numeric,text,text,integer,jsonb)'::regprocedure);

  IF position('azione_illimitata' in v_def) > 0 THEN
    RAISE NOTICE 'charge_ai_call conosce già il listino delle azioni';
    RETURN;
  END IF;

  v_nuova := replace(v_def,
    $d$  v_regalato      boolean := false;
$d$,
    $d$  v_regalato      boolean := false;
  v_azione        text;
  v_prezzo_azione numeric;
  v_illimitata    boolean := false;
$d$);

  v_nuova := replace(v_nuova,
    $d$    IF v_regola.regalato THEN
$d$,
    $d$    v_azione := NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'azione', '');
    IF v_azione IS NOT NULL THEN
      SELECT prezzo_eur INTO v_prezzo_azione FROM public.ai_listino_azioni WHERE azione = v_azione AND attiva;
      v_illimitata := EXISTS (SELECT 1 FROM public.ai_crediti_illimitati WHERE company_id = p_company_id);
    END IF;

    IF v_prezzo_azione IS NOT NULL AND v_illimitata THEN
      v_cost_billed_eur := 0;
      v_markup_pct := 0;
      v_regalato := true;
      v_status := 'skipped';
      v_regola_nome := 'azione_illimitata';
    ELSIF v_prezzo_azione IS NOT NULL THEN
      v_cost_billed_eur := v_prezzo_azione;
      v_markup_pct := CASE WHEN v_cost_real_eur > 0
                           THEN LEAST(round((v_prezzo_azione / v_cost_real_eur - 1) * 100, 2), 999999)
                           ELSE 0 END;
      v_regola_nome := 'azione:' || v_azione;
    ELSIF v_regola.regalato THEN
$d$);

  IF v_nuova = v_def OR position('azione_illimitata' in v_nuova) = 0 OR position('v_prezzo_azione numeric' in v_nuova) = 0 THEN
    RAISE EXCEPTION 'charge_ai_call: i punti di aggancio non sono stati trovati, la funzione è cambiata. Nessuna modifica.';
  END IF;

  EXECUTE v_nuova;
END
$patch$;

COMMENT ON TABLE public.ai_listino_azioni IS
  'Prezzo fisso in euro per le azioni AI (render, planimetrie…), letto da charge_ai_call quando metadata.azione è valorizzato. Moneta unica, decisioni del 25/11/2026.';
COMMENT ON TABLE public.ai_crediti_illimitati IS
  'Aziende che non pagano le azioni del listino (sostituisce render_credits.unlimited).';
