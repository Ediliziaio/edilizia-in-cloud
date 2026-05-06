-- MP batch 13 — Personas v6 (51 nuovi tool)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_append_persona_tool_v6(
  p_persona_key text, p_tool_name text
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ai_personas
     SET allowed_tools = allowed_tools || jsonb_build_array(p_tool_name)
   WHERE persona_key = p_persona_key
     AND NOT (allowed_tools @> jsonb_build_array(p_tool_name));
END $$;

-- Silvio: META — riceve TUTTI i 51 nuovi
SELECT public.tg_append_persona_tool_v6('silvio', t)
  FROM (VALUES
    -- AIE-03 (4)
    ('approve_proposal_with_edits'),('batch_approve_proposals'),
    ('undo_executed_action'),('get_proposal_audit_log'),
    -- COMP-04 (6)
    ('identifica_tipo_pratica'),('checklist_documenti_pratica'),
    ('genera_relazione_tecnica'),('verifica_completezza_pratica'),
    ('prepara_invio_sue'),('monitoraggio_pratica_status'),
    -- FAT-05 (3)
    ('genera_report_cfo_settimanale'),('invia_report_cfo'),('chiedi_riassunto_settimana'),
    -- FAT-06 (5)
    ('genera_lipe_trimestrale'),('genera_f24_mese'),('genera_cu_anno'),
    ('verifica_quadrature_contabili'),('invia_lipe_ade'),
    -- HR-03 (5)
    ('suggerisci_squadra_cantiere'),('analizza_competenze_operaio'),
    ('aggiorna_skill_da_rapportini'),('top_performer_lavorazione'),('analizza_squadra_storia'),
    -- HR-04 (6)
    ('stato_sicurezza_operaio'),('operai_non_conformi_sicurezza'),
    ('formazioni_in_scadenza'),('prenota_formazione_operaio'),
    ('genera_modulo_consegna_dpi'),('blocca_operaio_da_cantiere'),
    -- OPS-07 (5)
    ('pianifica_cantiere'),('ottimizza_allocazioni_settimana'),
    ('identifica_conflitti_allocazione'),('prevedi_impatto_ritardo'),('sposta_allocazione'),
    -- OPS-08 (4)
    ('genera_pos_cantiere'),('genera_duvri_cantiere'),
    ('valida_dpi_operai_cantiere'),('verifica_formazioni_operai'),
    -- PRED-02 (5)
    ('predici_data_fine_cantiere'),('analizza_cause_ritardo'),
    ('genera_piano_recovery_cantiere'),('lista_cantieri_a_rischio'),('calcola_costo_ritardo'),
    -- SALES-05 (4)
    ('genera_proposal_commerciale'),('trova_case_studies_simili'),
    ('analizza_proposal_engagement'),('invia_proposal_cliente'),
    -- SALES-06 (4)
    ('stima_probabilita_close_quote'),('get_pipeline_forecast'),
    ('identifica_quotes_da_followup'),('suggerisci_azione_per_quote')
  ) AS x(t);

-- Compliance
SELECT public.tg_append_persona_tool_v6('compliance', t) FROM (VALUES
  ('approve_proposal_with_edits'),('get_proposal_audit_log'),
  ('identifica_tipo_pratica'),('checklist_documenti_pratica'),('genera_relazione_tecnica'),
  ('verifica_completezza_pratica'),('prepara_invio_sue'),('monitoraggio_pratica_status'),
  ('stato_sicurezza_operaio'),('operai_non_conformi_sicurezza'),('formazioni_in_scadenza'),
  ('prenota_formazione_operaio'),('genera_modulo_consegna_dpi'),('blocca_operaio_da_cantiere'),
  ('genera_pos_cantiere'),('genera_duvri_cantiere'),
  ('valida_dpi_operai_cantiere'),('verifica_formazioni_operai')
) AS x(t);

-- Tecnico
SELECT public.tg_append_persona_tool_v6('tecnico', t) FROM (VALUES
  ('identifica_tipo_pratica'),('checklist_documenti_pratica'),('genera_relazione_tecnica'),
  ('verifica_completezza_pratica'),('prepara_invio_sue'),('monitoraggio_pratica_status'),
  ('genera_pos_cantiere')
) AS x(t);

-- CFO
SELECT public.tg_append_persona_tool_v6('cfo', t) FROM (VALUES
  ('genera_report_cfo_settimanale'),('invia_report_cfo'),('chiedi_riassunto_settimana'),
  ('genera_lipe_trimestrale'),('verifica_quadrature_contabili'),
  ('calcola_costo_ritardo'),('get_pipeline_forecast')
) AS x(t);

-- Controller
SELECT public.tg_append_persona_tool_v6('controller', t) FROM (VALUES
  ('genera_report_cfo_settimanale'),('invia_report_cfo'),
  ('genera_lipe_trimestrale'),('genera_f24_mese'),('verifica_quadrature_contabili'),
  ('calcola_costo_ritardo')
) AS x(t);

-- Commercialista
SELECT public.tg_append_persona_tool_v6('commercialista', t) FROM (VALUES
  ('genera_lipe_trimestrale'),('genera_f24_mese'),('genera_cu_anno'),
  ('verifica_quadrature_contabili'),('invia_lipe_ade')
) AS x(t);

-- Amministrazione
SELECT public.tg_append_persona_tool_v6('amministrazione', t) FROM (VALUES
  ('genera_f24_mese'),('genera_cu_anno'),('verifica_quadrature_contabili')
) AS x(t);

-- HR
SELECT public.tg_append_persona_tool_v6('hr', t) FROM (VALUES
  ('genera_cu_anno'),
  ('suggerisci_squadra_cantiere'),('analizza_competenze_operaio'),
  ('aggiorna_skill_da_rapportini'),('top_performer_lavorazione'),('analizza_squadra_storia'),
  ('stato_sicurezza_operaio'),('operai_non_conformi_sicurezza'),
  ('formazioni_in_scadenza'),('prenota_formazione_operaio'),
  ('genera_modulo_consegna_dpi'),('blocca_operaio_da_cantiere'),
  ('verifica_formazioni_operai')
) AS x(t);

-- PM Cantiere
SELECT public.tg_append_persona_tool_v6('pm_cantiere', t) FROM (VALUES
  ('monitoraggio_pratica_status'),
  ('suggerisci_squadra_cantiere'),('analizza_competenze_operaio'),
  ('top_performer_lavorazione'),('analizza_squadra_storia'),
  ('stato_sicurezza_operaio'),('operai_non_conformi_sicurezza'),
  ('pianifica_cantiere'),('ottimizza_allocazioni_settimana'),
  ('identifica_conflitti_allocazione'),('prevedi_impatto_ritardo'),('sposta_allocazione'),
  ('valida_dpi_operai_cantiere'),('verifica_formazioni_operai'),
  ('predici_data_fine_cantiere'),('analizza_cause_ritardo'),
  ('genera_piano_recovery_cantiere'),('lista_cantieri_a_rischio'),('calcola_costo_ritardo')
) AS x(t);

-- Capocantiere
SELECT public.tg_append_persona_tool_v6('capocantiere', t) FROM (VALUES
  ('top_performer_lavorazione'),
  ('identifica_conflitti_allocazione'),
  ('valida_dpi_operai_cantiere')
) AS x(t);

-- Sales
SELECT public.tg_append_persona_tool_v6('sales', t) FROM (VALUES
  ('genera_proposal_commerciale'),('trova_case_studies_simili'),
  ('analizza_proposal_engagement'),('invia_proposal_cliente'),
  ('stima_probabilita_close_quote'),('get_pipeline_forecast'),
  ('identifica_quotes_da_followup'),('suggerisci_azione_per_quote')
) AS x(t);

-- Direttore Vendite
SELECT public.tg_append_persona_tool_v6('direttore_vendite', t) FROM (VALUES
  ('genera_proposal_commerciale'),('trova_case_studies_simili'),
  ('analizza_proposal_engagement'),('invia_proposal_cliente'),
  ('stima_probabilita_close_quote'),('get_pipeline_forecast'),
  ('identifica_quotes_da_followup'),('suggerisci_azione_per_quote')
) AS x(t);

-- Assistente Imprenditore
SELECT public.tg_append_persona_tool_v6('assistente_imprenditore', t) FROM (VALUES
  ('chiedi_riassunto_settimana'),
  ('predici_data_fine_cantiere'),('lista_cantieri_a_rischio'),
  ('get_pipeline_forecast'),('monitoraggio_pratica_status')
) AS x(t);

DROP FUNCTION IF EXISTS public.tg_append_persona_tool_v6(text, text);

DO $$
DECLARE v_silvio int;
BEGIN
  SELECT jsonb_array_length(allowed_tools) INTO v_silvio FROM public.ai_personas WHERE persona_key='silvio';
  RAISE NOTICE 'MP-v6: Silvio ora ha % tool', v_silvio;
END $$;
