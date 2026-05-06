-- MP-COMP-03 + MP-FAT-04 + MP-HR-02 + MP-OPS-06 + MP-SALES-04
-- ════════════════════════════════════════════════════════════════════════════
-- Personas v5: aggiunge i 18 nuovi tool al set allowed_tools.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_append_persona_tool(
  p_persona_key text, p_tool_name text
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ai_personas
     SET allowed_tools = allowed_tools || jsonb_build_array(p_tool_name)
   WHERE persona_key = p_persona_key
     AND NOT (allowed_tools @> jsonb_build_array(p_tool_name));
END $$;

-- Silvio: META — riceve TUTTI i 18 nuovi
SELECT public.tg_append_persona_tool('silvio', t)
  FROM (VALUES
    ('lista_subappaltatori_compliance'), ('archivia_documento_subappaltatore'),
    ('lista_documenti_in_scadenza'), ('richiedi_rinnovo_documento'),
    ('get_cashflow_forecast_scenarios'), ('simula_intervento_cashflow'),
    ('save_cashflow_snapshot'),
    ('calcola_ore_mese_dipendente'), ('genera_cedolino_dipendente'),
    ('lista_cedolini_da_revisionare'), ('registra_assenza'),
    ('analizza_qualita_foto'), ('trend_qualita_cantiere'),
    ('lista_foto_critical_recenti'),
    ('storico_pricing_voce'), ('suggerisci_prezzo_voce'),
    ('simula_what_if_pricing'), ('analizza_storico_pricing_cliente')
  ) AS x(t);

-- Compliance: COMP-03 + foto critical
SELECT public.tg_append_persona_tool('compliance', t)
  FROM (VALUES
    ('lista_subappaltatori_compliance'), ('archivia_documento_subappaltatore'),
    ('lista_documenti_in_scadenza'), ('richiedi_rinnovo_documento'),
    ('lista_foto_critical_recenti')
  ) AS x(t);

-- Amministrazione: COMP-03 docs + HR-02 cedolini + cashflow
SELECT public.tg_append_persona_tool('amministrazione', t)
  FROM (VALUES
    ('lista_subappaltatori_compliance'), ('archivia_documento_subappaltatore'),
    ('lista_documenti_in_scadenza'),
    ('get_cashflow_forecast_scenarios'),
    ('calcola_ore_mese_dipendente'), ('genera_cedolino_dipendente'),
    ('lista_cedolini_da_revisionare'), ('registra_assenza')
  ) AS x(t);

-- CFO: cashflow forecast + simulation
SELECT public.tg_append_persona_tool('cfo', t)
  FROM (VALUES
    ('get_cashflow_forecast_scenarios'), ('simula_intervento_cashflow')
  ) AS x(t);

-- Controller: cashflow + pricing what-if
SELECT public.tg_append_persona_tool('controller', t)
  FROM (VALUES
    ('get_cashflow_forecast_scenarios'), ('simula_intervento_cashflow'),
    ('storico_pricing_voce'), ('simula_what_if_pricing')
  ) AS x(t);

-- HR: cedolini + presenze
SELECT public.tg_append_persona_tool('hr', t)
  FROM (VALUES
    ('calcola_ore_mese_dipendente'), ('genera_cedolino_dipendente'),
    ('lista_cedolini_da_revisionare'), ('registra_assenza')
  ) AS x(t);

-- PM Cantiere: subappaltatori compliance + foto quality + scadenze
SELECT public.tg_append_persona_tool('pm_cantiere', t)
  FROM (VALUES
    ('lista_subappaltatori_compliance'), ('lista_documenti_in_scadenza'),
    ('analizza_qualita_foto'), ('trend_qualita_cantiere'), ('lista_foto_critical_recenti')
  ) AS x(t);

-- Capocantiere: trend qualità foto
SELECT public.tg_append_persona_tool('capocantiere', t)
  FROM (VALUES
    ('trend_qualita_cantiere'), ('lista_foto_critical_recenti')
  ) AS x(t);

-- Tecnico: foto quality + pricing tecnico
SELECT public.tg_append_persona_tool('tecnico', t)
  FROM (VALUES
    ('analizza_qualita_foto'), ('trend_qualita_cantiere'), ('lista_foto_critical_recenti'),
    ('storico_pricing_voce'), ('suggerisci_prezzo_voce')
  ) AS x(t);

-- Sales: dynamic pricing completo
SELECT public.tg_append_persona_tool('sales', t)
  FROM (VALUES
    ('storico_pricing_voce'), ('suggerisci_prezzo_voce'),
    ('simula_what_if_pricing'), ('analizza_storico_pricing_cliente')
  ) AS x(t);

-- Direttore Vendite: pricing analysis + storico cliente
SELECT public.tg_append_persona_tool('direttore_vendite', t)
  FROM (VALUES
    ('storico_pricing_voce'), ('suggerisci_prezzo_voce'),
    ('simula_what_if_pricing'), ('analizza_storico_pricing_cliente')
  ) AS x(t);

-- Cliente Tutor: storico pricing cliente (per personalizzare offerte)
SELECT public.tg_append_persona_tool('cliente_tutor', t)
  FROM (VALUES
    ('analizza_storico_pricing_cliente')
  ) AS x(t);

-- Assistente Imprenditore: dashboard cross-feature
SELECT public.tg_append_persona_tool('assistente_imprenditore', t)
  FROM (VALUES
    ('lista_subappaltatori_compliance'), ('lista_documenti_in_scadenza'),
    ('get_cashflow_forecast_scenarios'),
    ('lista_cedolini_da_revisionare'),
    ('lista_foto_critical_recenti')
  ) AS x(t);

DROP FUNCTION IF EXISTS public.tg_append_persona_tool(text, text);

DO $$
DECLARE v_silvio int;
BEGIN
  SELECT jsonb_array_length(allowed_tools) INTO v_silvio FROM public.ai_personas WHERE persona_key='silvio';
  RAISE NOTICE 'MP-v5: Silvio ora ha % tool', v_silvio;
END $$;
