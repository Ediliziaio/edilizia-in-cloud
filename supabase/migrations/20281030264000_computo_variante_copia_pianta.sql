-- ════════════════════════════════════════════════════════════════════════════
-- Perizia di variante: la copia delle righe di misura tiene il legame con la pianta
-- ════════════════════════════════════════════════════════════════════════════
-- Planimetrie, fase 4 (docs/superpowers/specs/2026-10-30-planimetrie-design.md).
-- Le righe di misura prese da una pianta portano planimetria_id, planimetria_versione
-- e planimetria_chiavi (20281030260000_planimetrie_base). computo_crea_variante
-- copiava le righe senza queste tre colonne: nella perizia la riga perdeva la pianta
-- da cui viene, e con lei l'avviso «la pianta è cambiata» e l'origine stimata.
--
-- Unica differenza dalla versione di 20281023053000: le tre colonne nella copia delle
-- misure. Il resto è identico (controllato il 30/10/2026 contro pg_get_functiondef).
-- Senza questa migrazione il frontend ritrova comunque le righe nella copia (per
-- posizione e descrizione) e rimette il legame quando porta le differenze: questa
-- migrazione lo rende sicuro anche per le righe con la stessa descrizione.
--
-- Nessuna riga scritta: solo CREATE OR REPLACE di una funzione. Idempotente.
-- NON APPLICATA: la applica il coordinatore (CLAUDE.md, apply_migration + riallineo).
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.computo_crea_variante(p_upload_id uuid, p_titolo text, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '30s'
AS $fn$
DECLARE
  v public.computo_uploads%rowtype;
  v_nuovo uuid;
  v_numero integer;
BEGIN
  SELECT * INTO v FROM public.computo_uploads WHERE id = p_upload_id FOR UPDATE;
  IF NOT FOUND OR NOT public.puo_modificare_computo(p_upload_id) THEN
    RAISE EXCEPTION 'Per una perizia di variante serve il permesso «Ordini e Commesse».' USING ERRCODE = '42501';
  END IF;
  IF v.stato <> 'contrattuale' THEN
    RAISE EXCEPTION 'La variante si fa sul computo contrattuale.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.computo_uploads x WHERE x.variante_di = p_upload_id AND x.stato IN ('bozza', 'verificato')) THEN
    RAISE EXCEPTION 'C''è già una perizia di variante aperta su questo computo.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(max(x.numero_variante), 0) + 1 INTO v_numero
    FROM public.computo_uploads x WHERE x.company_id = v.company_id AND x.order_id IS NOT DISTINCT FROM v.order_id;

  INSERT INTO public.computo_uploads (company_id, uploaded_by, file_name, file_type, file_size, storage_path, extraction_status,
    extraction_method, extraction_completed_at, oggetto_lavori, committente, progettista, data_computo, order_id, titolo, stato,
    totale_dichiarato, totale_calcolato, prezzari, lavoro_pubblico, stazione_appaltante, cig, cup, ribasso_percentuale,
    oneri_sicurezza, variante_di, numero_variante, motivo_variante)
  VALUES (v.company_id, auth.uid(), v.file_name, v.file_type, v.file_size, v.storage_path, 'review',
    v.extraction_method, now(), v.oggetto_lavori, v.committente, v.progettista, v.data_computo, v.order_id,
    coalesce(nullif(btrim(p_titolo), ''), 'Perizia di variante n. ' || v_numero), 'bozza',
    NULL, NULL, v.prezzari, v.lavoro_pubblico, v.stazione_appaltante, v.cig, v.cup, v.ribasso_percentuale,
    v.oneri_sicurezza, v.id, v_numero, nullif(btrim(p_motivo), ''))
  RETURNING id INTO v_nuovo;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.computo_variante_mappa (vecchia uuid PRIMARY KEY, nuova uuid NOT NULL) ON COMMIT DROP;
  DELETE FROM pg_temp.computo_variante_mappa;
  INSERT INTO pg_temp.computo_variante_mappa (vecchia, nuova)
    SELECT ve.id, gen_random_uuid() FROM public.computo_voci_estratte ve WHERE ve.computo_upload_id = v.id;

  INSERT INTO public.computo_voci_estratte (id, computo_upload_id, company_id, capitolo_numero, capitolo_nome, codice_voce,
    codice_prezzario, descrizione_breve, descrizione_estesa, unita_misura, quantita, prezzo_unitario_computo, importo_computo,
    confidence, warnings, ai_notes, is_included, ordine, numero_ordine, codice_tariffa, super_categoria, categoria,
    sotto_categoria, is_sicurezza, is_detrazione, a_corpo, quadro_voce, voce_origine_id, nuovo_prezzo)
  SELECT m.nuova, v_nuovo, ve.company_id, ve.capitolo_numero, ve.capitolo_nome, ve.codice_voce,
    ve.codice_prezzario, ve.descrizione_breve, ve.descrizione_estesa, ve.unita_misura, ve.quantita, ve.prezzo_unitario_computo,
    ve.importo_computo, ve.confidence, ve.warnings, ve.ai_notes, ve.is_included, ve.ordine, ve.numero_ordine, ve.codice_tariffa,
    ve.super_categoria, ve.categoria, ve.sotto_categoria, ve.is_sicurezza, ve.is_detrazione, ve.a_corpo, ve.quadro_voce,
    coalesce(ve.voce_origine_id, ve.id), ve.nuovo_prezzo
  FROM public.computo_voci_estratte ve JOIN pg_temp.computo_variante_mappa m ON m.vecchia = ve.id;

  INSERT INTO public.computo_voci_misure (company_id, voce_id, ordine, descrizione, parti_uguali, lunghezza, larghezza,
    altezza_peso, quantita, formula, planimetria_id, planimetria_versione, planimetria_chiavi)
  SELECT mi.company_id, m.nuova, mi.ordine, mi.descrizione, mi.parti_uguali, mi.lunghezza, mi.larghezza, mi.altezza_peso,
    mi.quantita, mi.formula, mi.planimetria_id, mi.planimetria_versione, mi.planimetria_chiavi
  FROM public.computo_voci_misure mi JOIN pg_temp.computo_variante_mappa m ON m.vecchia = mi.voce_id;

  INSERT INTO public.computo_eventi (company_id, computo_upload_id, order_id, tipo, motivo, utente_id)
  VALUES (v.company_id, v_nuovo, v.order_id, 'variante_creata', nullif(btrim(p_motivo), ''), auth.uid());
  RETURN v_nuovo;
END;
$fn$;
REVOKE ALL ON FUNCTION public.computo_crea_variante(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.computo_crea_variante(uuid, text, text) TO authenticated, service_role;
