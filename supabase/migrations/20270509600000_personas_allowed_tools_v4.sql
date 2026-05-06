-- MP-HR-01 + MP-OPS-04 + MP-OPS-05 + MP-SALES-01 + MP-SALES-03
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge i 18 nuovi tool al set allowed_tools delle personas appropriate.
-- Pattern: append jsonb array unique (idempotente).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_append_persona_tool(
  p_persona_key text,
  p_tool_name text
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ai_personas
     SET allowed_tools = allowed_tools || jsonb_build_array(p_tool_name)
   WHERE persona_key = p_persona_key
     AND NOT (allowed_tools @> jsonb_build_array(p_tool_name));
END $$;

-- ── Silvio: META riceve TUTTI i nuovi tool ──────────────────────────────────
SELECT public.tg_append_persona_tool('silvio', t)
  FROM (VALUES
    ('avvia_onboarding_dipendente'), ('aggiorna_step_onboarding'),
    ('lista_onboarding_in_corso'), ('verifica_completion_onboarding'),
    ('compone_sal_da_rapportini'), ('lista_sal_in_attesa'), ('approva_sal'),
    ('predici_consumo_materiali'), ('lista_stockout_imminenti'),
    ('crea_proposta_ordine_fornitore'), ('lista_proposte_ordini_pending'),
    ('crea_lead_first_touch'), ('lista_lead_first_touch'), ('chiudi_lead_first_touch'),
    ('identify_dormant_customers'), ('crea_winback_draft'), ('lista_winback_campaigns')
  ) AS x(t);

-- ── HR: onboarding completo ─────────────────────────────────────────────────
SELECT public.tg_append_persona_tool('hr', t)
  FROM (VALUES
    ('avvia_onboarding_dipendente'), ('aggiorna_step_onboarding'),
    ('lista_onboarding_in_corso'), ('verifica_completion_onboarding')
  ) AS x(t);

-- ── PM Cantiere: SAL + JIT materiali ────────────────────────────────────────
SELECT public.tg_append_persona_tool('pm_cantiere', t)
  FROM (VALUES
    ('compone_sal_da_rapportini'), ('lista_sal_in_attesa'), ('approva_sal'),
    ('predici_consumo_materiali'), ('lista_stockout_imminenti'),
    ('crea_proposta_ordine_fornitore'), ('lista_proposte_ordini_pending')
  ) AS x(t);

-- ── Capocantiere: stockout monitor (read-only sul SAL) ──────────────────────
SELECT public.tg_append_persona_tool('capocantiere', t)
  FROM (VALUES
    ('predici_consumo_materiali'), ('lista_stockout_imminenti'),
    ('lista_sal_in_attesa')
  ) AS x(t);

-- ── Acquisti: tutto JIT ─────────────────────────────────────────────────────
SELECT public.tg_append_persona_tool('acquisti', t)
  FROM (VALUES
    ('predici_consumo_materiali'), ('lista_stockout_imminenti'),
    ('crea_proposta_ordine_fornitore'), ('lista_proposte_ordini_pending')
  ) AS x(t);

-- ── Controller: SAL approval + KPI ──────────────────────────────────────────
SELECT public.tg_append_persona_tool('controller', t)
  FROM (VALUES
    ('compone_sal_da_rapportini'), ('lista_sal_in_attesa'), ('approva_sal')
  ) AS x(t);

-- ── CFO: dashboard SAL + lista SAL ──────────────────────────────────────────
SELECT public.tg_append_persona_tool('cfo', t)
  FROM (VALUES
    ('lista_sal_in_attesa'), ('approva_sal')
  ) AS x(t);

-- ── Amministrazione: SAL + onboarding ───────────────────────────────────────
SELECT public.tg_append_persona_tool('amministrazione', t)
  FROM (VALUES
    ('compone_sal_da_rapportini'), ('lista_sal_in_attesa')
  ) AS x(t);

-- ── Sales: lead first-touch + winback ───────────────────────────────────────
SELECT public.tg_append_persona_tool('sales', t)
  FROM (VALUES
    ('crea_lead_first_touch'), ('lista_lead_first_touch'), ('chiudi_lead_first_touch'),
    ('identify_dormant_customers'), ('crea_winback_draft'), ('lista_winback_campaigns')
  ) AS x(t);

-- ── Direttore Vendite: dashboard sales + winback ────────────────────────────
SELECT public.tg_append_persona_tool('direttore_vendite', t)
  FROM (VALUES
    ('lista_lead_first_touch'), ('chiudi_lead_first_touch'),
    ('identify_dormant_customers'), ('crea_winback_draft'), ('lista_winback_campaigns')
  ) AS x(t);

-- ── Direttore Marketing: KPI lead + winback dashboard ───────────────────────
SELECT public.tg_append_persona_tool('direttore_marketing', t)
  FROM (VALUES
    ('lista_lead_first_touch'),
    ('identify_dormant_customers'), ('lista_winback_campaigns')
  ) AS x(t);

-- ── Cliente Tutor: identify dormant + winback ───────────────────────────────
SELECT public.tg_append_persona_tool('cliente_tutor', t)
  FROM (VALUES
    ('identify_dormant_customers'), ('crea_winback_draft'), ('lista_winback_campaigns')
  ) AS x(t);

-- ── Assistente Imprenditore: dashboard cross-feature ────────────────────────
SELECT public.tg_append_persona_tool('assistente_imprenditore', t)
  FROM (VALUES
    ('lista_onboarding_in_corso'),
    ('lista_sal_in_attesa'),
    ('lista_stockout_imminenti'), ('lista_proposte_ordini_pending'),
    ('lista_lead_first_touch'), ('lista_winback_campaigns')
  ) AS x(t);

-- Drop helper
DROP FUNCTION IF EXISTS public.tg_append_persona_tool(text, text);

DO $$
DECLARE
  v_silvio int;
BEGIN
  SELECT jsonb_array_length(allowed_tools) INTO v_silvio
    FROM public.ai_personas WHERE persona_key = 'silvio';
  RAISE NOTICE 'MP-v4: Silvio ora ha % tool', v_silvio;
END $$;
