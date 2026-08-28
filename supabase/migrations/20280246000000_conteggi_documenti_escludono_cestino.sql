-- ============================================================================
-- I contatori delle fatture promettevano documenti che la lista non mostrava.
--
-- Nella pagina Fatture, la striscia dei mesi e i chip per tipo contavano ANCHE
-- i documenti nel cestino, mentre la lista — giustamente — li esclude. Il
-- risultato, verificato a schermo sull'azienda demo: il chip diceva "Fatture
-- 34" e marzo "17 doc", ma cliccando marzo compariva "Nessuna fattura trovata".
-- Di quei 34 documenti solo 1 era davvero visibile: gli altri 33 erano cestinati.
--
-- Terza incoerenza, sulla scheda Cestino: il suo contatore usava i documenti in
-- stato 'annullata' (2) mentre la scheda mostra quelli cestinati (35). Aggiungo
-- il conteggio giusto, 'cestinati', tenendo 'annullate' per non rompere nulla.
--
-- Attenzione a non confondere le due cose: 'annullata' e' uno STATO fiscale del
-- documento, il cestino e' deleted_at valorizzato (con cancellazione definitiva
-- dopo 14 giorni). Un documento puo' essere cestinato senza essere annullato.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_documenti_counts(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT json_build_object(
    -- I conteggi per tipo seguono la lista: niente cestinati
    'fatture',      COUNT(*) FILTER (WHERE tipo IN ('fattura', 'fattura_pa') AND stato != 'annullata' AND deleted_at IS NULL),
    'proforma',     COUNT(*) FILTER (WHERE tipo = 'proforma' AND stato != 'annullata' AND deleted_at IS NULL),
    'nota_credito', COUNT(*) FILTER (WHERE tipo = 'nota_credito' AND stato != 'annullata' AND deleted_at IS NULL),
    'ddt',          COUNT(*) FILTER (WHERE tipo = 'ddt' AND stato != 'annullata' AND deleted_at IS NULL),
    'preventivo',   COUNT(*) FILTER (WHERE tipo = 'preventivo' AND stato != 'annullata' AND deleted_at IS NULL),
    -- Stato fiscale 'annullata' (tenuto per compatibilita')
    'annullate',    COUNT(*) FILTER (WHERE stato = 'annullata'),
    -- Quello che c'e' davvero nel cestino: e' cio' che la scheda mostra
    'cestinati',    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)
  ) INTO v_result
  FROM public.documenti_fiscali
  WHERE company_id = p_company_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_documenti_monthly_timeline(p_company_id uuid, p_tipos text[] DEFAULT NULL::text[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      EXTRACT(YEAR FROM data_emissione)::INTEGER AS year,
      EXTRACT(MONTH FROM data_emissione)::INTEGER AS month,
      COUNT(*)::INTEGER AS doc_count,
      COALESCE(SUM(totale_documento), 0)::NUMERIC AS total_amount
    FROM public.documenti_fiscali
    WHERE company_id = p_company_id
      AND stato != 'annullata'
      AND deleted_at IS NULL   -- la striscia conta cio' che la lista sa mostrare
      AND (p_tipos IS NULL OR tipo = ANY(p_tipos))
      AND data_emissione >= (date_trunc('month', NOW()) - INTERVAL '12 months')::DATE
      AND data_emissione < (date_trunc('month', NOW()) + INTERVAL '4 months')::DATE
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$;
