-- MP-COMP-04 — Pratiche Edilizie Workflow
-- ════════════════════════════════════════════════════════════════════════════
-- CILA / SCIA / PdC con AI guidance + tracking iter SUE.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pratiche_edilizie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,

  tipo_pratica text NOT NULL CHECK (tipo_pratica IN (
    'edilizia_libera','cila','cilas','scia','scia_alternativa_pdc',
    'permesso_costruire','sanatoria','autorizzazione_paesaggistica',
    'agibilita','condono'
  )),

  ai_recommended_type text,
  ai_reasoning text,

  comune text,
  provincia text,
  protocollo_sue text,
  data_invio date,
  data_inizio_lavori date,

  documenti_richiesti jsonb DEFAULT '[]'::jsonb,
  documenti_caricati jsonb DEFAULT '[]'::jsonb,
  documenti_mancanti jsonb DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','in_preparation','submitted','under_review','integrazioni_richieste',
    'approved','rejected','withdrawn','completed'
  )),
  scadenza_silenzio_assenso date,

  next_action text,
  next_action_deadline date,
  ai_persona_used text DEFAULT 'tecnico',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pratiche_company_status ON public.pratiche_edilizie(company_id, status);
CREATE INDEX IF NOT EXISTS idx_pratiche_cantiere ON public.pratiche_edilizie(cantiere_id);
CREATE INDEX IF NOT EXISTS idx_pratiche_scadenza ON public.pratiche_edilizie(scadenza_silenzio_assenso) WHERE scadenza_silenzio_assenso IS NOT NULL;

ALTER TABLE public.pratiche_edilizie ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pratiche_company ON public.pratiche_edilizie;
CREATE POLICY pratiche_company ON public.pratiche_edilizie
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_identifica_tipo_pratica
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_identifica_tipo_pratica(
  p_company_id uuid,
  p_tipologia_intervento text,
  p_ubicazione text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_reason text;
BEGIN
  -- Heuristica iniziale (in produzione: LLM call)
  v_tipo := CASE
    WHEN lower(p_tipologia_intervento) ~ 'manutenzione ordinaria|tinteggi|piastrell' THEN 'edilizia_libera'
    WHEN lower(p_tipologia_intervento) ~ 'manutenzione straord' THEN 'cila'
    WHEN lower(p_tipologia_intervento) ~ 'superbonus|110|agevolazione' THEN 'cilas'
    WHEN lower(p_tipologia_intervento) ~ 'ristruttur.*strutturale|opere strutturali' THEN 'scia'
    WHEN lower(p_tipologia_intervento) ~ 'demoliz|ricostruz' THEN 'scia_alternativa_pdc'
    WHEN lower(p_tipologia_intervento) ~ 'nuova costruz|nuovo edificio' THEN 'permesso_costruire'
    ELSE 'cila'
  END;

  v_reason := format('Determinato "%s" basato su descrizione: "%s"', v_tipo, p_tipologia_intervento);

  RETURN jsonb_build_object(
    'recommended_type', v_tipo,
    'reasoning', v_reason,
    'tempi_tipici', CASE v_tipo
      WHEN 'edilizia_libera' THEN 'Nessuna autorizzazione'
      WHEN 'cila' THEN '30gg silenzio assenso'
      WHEN 'cilas' THEN 'Inizio immediato'
      WHEN 'scia' THEN '30gg controllo'
      WHEN 'scia_alternativa_pdc' THEN '60gg silenzio'
      WHEN 'permesso_costruire' THEN '60-180gg'
      ELSE 'Variabile'
    END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_identifica_tipo_pratica(uuid, text, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_checklist_documenti_pratica
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_checklist_documenti_pratica(
  p_company_id uuid,
  p_pratica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_checklist jsonb;
BEGIN
  SELECT tipo_pratica INTO v_tipo
  FROM public.pratiche_edilizie
  WHERE id = p_pratica_id AND company_id = p_company_id;

  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pratica_not_found');
  END IF;

  v_checklist := CASE v_tipo
    WHEN 'cila' THEN '["modulo_cila","relazione_tecnica","elaborati_grafici","asseverazione_tecnico","attestato_pagamento_diritti"]'::jsonb
    WHEN 'cilas' THEN '["modulo_cila","relazione_tecnica","asseverazione_doppia","attestato_pagamento","computo_metrico"]'::jsonb
    WHEN 'scia' THEN '["modulo_scia","relazione_tecnica","elaborati_grafici","asseverazione","calcoli_strutturali","relazione_geologica","autorizzazione_genio_civile"]'::jsonb
    WHEN 'permesso_costruire' THEN '["istanza_pdc","relazione_tecnica","elaborati_grafici","relazione_geologica","calcoli_strutturali","autorizzazione_paesaggistica","valutazione_impatto","piano_sicurezza"]'::jsonb
    ELSE '[]'::jsonb
  END;

  UPDATE public.pratiche_edilizie
     SET documenti_richiesti = v_checklist,
         updated_at = now()
   WHERE id = p_pratica_id;

  RETURN jsonb_build_object('ok', true, 'tipo', v_tipo, 'checklist', v_checklist);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_checklist_documenti_pratica(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_relazione_tecnica
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_relazione_tecnica(
  p_company_id uuid,
  p_pratica_id uuid,
  p_template_type text DEFAULT 'standard'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pratica record;
BEGIN
  SELECT * INTO v_pratica
  FROM public.pratiche_edilizie
  WHERE id = p_pratica_id AND company_id = p_company_id;

  IF v_pratica IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pratica_not_found');
  END IF;

  -- Marker placeholder: in produzione l'edge function si occupa della generazione
  RETURN jsonb_build_object(
    'ok', true,
    'pratica_id', p_pratica_id,
    'template', p_template_type,
    'next_step', 'edge:ai-pratiche-edilizie genera relazione completa'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_relazione_tecnica(uuid, uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_verifica_completezza_pratica
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_completezza_pratica(
  p_company_id uuid,
  p_pratica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_richiesti jsonb;
  v_caricati jsonb;
  v_mancanti jsonb;
BEGIN
  SELECT documenti_richiesti, documenti_caricati
    INTO v_richiesti, v_caricati
  FROM public.pratiche_edilizie
  WHERE id = p_pratica_id AND company_id = p_company_id;

  IF v_richiesti IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pratica_not_found');
  END IF;

  -- Confronto array: missing = richiesti - caricati
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
    INTO v_mancanti
  FROM jsonb_array_elements_text(v_richiesti) AS r
  WHERE r NOT IN (
    SELECT jsonb_array_elements_text(v_caricati)
  );

  UPDATE public.pratiche_edilizie
     SET documenti_mancanti = v_mancanti, updated_at = now()
   WHERE id = p_pratica_id;

  RETURN jsonb_build_object(
    'ok', true,
    'completa', jsonb_array_length(v_mancanti) = 0,
    'mancanti', v_mancanti,
    'totale_richiesti', jsonb_array_length(v_richiesti),
    'caricati', jsonb_array_length(v_caricati)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_verifica_completezza_pratica(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_prepara_invio_sue
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_prepara_invio_sue(
  p_company_id uuid,
  p_pratica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_completa boolean;
  v_check jsonb;
BEGIN
  v_check := public.silvio_tool_verifica_completezza_pratica(p_company_id, p_pratica_id);
  v_completa := (v_check->>'completa')::boolean;

  IF NOT v_completa THEN
    RETURN jsonb_build_object('ok', false, 'error', 'documenti_mancanti', 'mancanti', v_check->'mancanti');
  END IF;

  UPDATE public.pratiche_edilizie
     SET status = 'submitted',
         data_invio = current_date,
         scadenza_silenzio_assenso = current_date + interval '30 days',
         next_action = 'attendere risposta SUE',
         updated_at = now()
   WHERE id = p_pratica_id AND company_id = p_company_id;

  RETURN jsonb_build_object('ok', true, 'pratica_id', p_pratica_id, 'submitted_at', current_date);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_prepara_invio_sue(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_monitoraggio_pratica_status
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_monitoraggio_pratica_status(
  p_company_id uuid,
  p_pratica_id uuid DEFAULT NULL
)
RETURNS TABLE (
  pratica_id uuid,
  cantiere_id uuid,
  tipo_pratica text,
  status text,
  giorni_da_invio int,
  giorni_a_silenzio int,
  next_action text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.cantiere_id, p.tipo_pratica, p.status,
    CASE WHEN p.data_invio IS NOT NULL THEN (current_date - p.data_invio) ELSE NULL END,
    CASE WHEN p.scadenza_silenzio_assenso IS NOT NULL THEN (p.scadenza_silenzio_assenso - current_date) ELSE NULL END,
    p.next_action
  FROM public.pratiche_edilizie p
  WHERE p.company_id = p_company_id
    AND (p_pratica_id IS NULL OR p.id = p_pratica_id)
    AND p.status NOT IN ('completed','withdrawn','rejected')
  ORDER BY p.scadenza_silenzio_assenso NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_monitoraggio_pratica_status(uuid, uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-COMP-04 deployed: pratiche_edilizie + 6 RPC'; END $$;
