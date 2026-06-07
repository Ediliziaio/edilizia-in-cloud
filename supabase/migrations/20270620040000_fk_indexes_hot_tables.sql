-- Performance: indici di copertura sulle foreign key NON indicizzate delle
-- tabelle piu' grandi (> 200 kB). Advisor Supabase: unindexed_foreign_keys.
--
-- CONTESTO (onesto)
--   Le ~686 FK senza indice sono quasi tutte su tabelle minuscole, dove un
--   indice e' inutile (Postgres seq-scanna piu' veloce). Qui indicizziamo solo
--   le 39 FK sulle tabelle piu' grandi: beneficio attuale MARGINALE (la piu'
--   grande, render_sessions, e' ~2 MB), ma e' future-proofing sicuro e azzera
--   39 warning dell'advisor. Velocizza join e CASCADE DELETE man mano che le
--   tabelle crescono.
--
-- SICUREZZA: aggiungere un indice non cambia alcun risultato/permesso; IF NOT
--   EXISTS rende la migration idempotente. A queste dimensioni il CREATE INDEX
--   non-concurrent costruisce in millisecondi (lock trascurabile). Se in futuro
--   si indicizzano tabelle molto piu' grandi, valutare CREATE INDEX CONCURRENTLY
--   (fuori da una transazione).
--
-- Verificata creando tutti e 39 gli indici in transazione con ROLLBACK (0 errori).

CREATE INDEX IF NOT EXISTS idx_render_sessions_created_by ON public.render_sessions (created_by);
CREATE INDEX IF NOT EXISTS idx_eic_tabelle_finanziamento_created_by ON public.eic_tabelle_finanziamento (created_by);
CREATE INDEX IF NOT EXISTS idx_article_families_posa_tariffa_default_id ON public.article_families (posa_tariffa_default_id);
CREATE INDEX IF NOT EXISTS idx_ai_personas_updated_by ON public.ai_personas (updated_by);
CREATE INDEX IF NOT EXISTS idx_ai_personas_system_prompt_updated_by ON public.ai_personas (system_prompt_updated_by);
CREATE INDEX IF NOT EXISTS idx_internal_chat_channels_silvio_folder_id ON public.internal_chat_channels (silvio_folder_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON public.tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets (created_by);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_call_center_id ON public.marketing_contacts (call_center_id);
CREATE INDEX IF NOT EXISTS idx_marketing_opportunities_pipeline_id ON public.marketing_opportunities (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_marketing_opportunities_call_center_id ON public.marketing_opportunities (call_center_id);
CREATE INDEX IF NOT EXISTS idx_sr_progetti_consulente_id ON public.sr_progetti (consulente_id);
CREATE INDEX IF NOT EXISTS idx_sr_progetti_created_by ON public.sr_progetti (created_by);
CREATE INDEX IF NOT EXISTS idx_sr_progetti_fin_tabella_riga_id ON public.sr_progetti (fin_tabella_riga_id);
CREATE INDEX IF NOT EXISTS idx_sr_progetti_discount_rule_id ON public.sr_progetti (discount_rule_id);
CREATE INDEX IF NOT EXISTS idx_silvio_decision_log_user_id ON public.silvio_decision_log (user_id);
CREATE INDEX IF NOT EXISTS idx_silvio_decision_log_user_decided_by ON public.silvio_decision_log (user_decided_by);
CREATE INDEX IF NOT EXISTS idx_appointments_opportunity_id ON public.appointments (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_article_family_templates_created_by ON public.article_family_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_documento_correlato_id ON public.documenti_fiscali (documento_correlato_id);
CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_ddt_fattura_id ON public.documenti_fiscali (ddt_fattura_id);
CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_created_by ON public.ai_persona_memory (created_by);
CREATE INDEX IF NOT EXISTS idx_company_costs_treasury_category_id ON public.company_costs (treasury_category_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_order_id ON public.scadenze (order_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_created_by ON public.scadenze (created_by);
CREATE INDEX IF NOT EXISTS idx_survey_templates_created_by ON public.survey_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_scadenze_contact_id ON public.scadenze (contact_id);
CREATE INDEX IF NOT EXISTS idx_companies_white_label_enabled_by ON public.companies (white_label_enabled_by);
CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_created_by ON public.render_stanza_sessions (created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_last_verification_id ON public.purchase_orders (last_verification_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON public.purchase_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_ai_pdf_run_id ON public.quotes (ai_pdf_run_id);
CREATE INDEX IF NOT EXISTS idx_quotes_template_id ON public.quotes (template_id);
CREATE INDEX IF NOT EXISTS idx_quotes_opportunity_id ON public.quotes (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_ai_persona_messages_ledger_id ON public.ai_persona_messages (ledger_id);
CREATE INDEX IF NOT EXISTS idx_silvio_agent_tasks_agent_key ON public.silvio_agent_tasks (agent_key);
CREATE INDEX IF NOT EXISTS idx_silvio_playbook_definitions_created_by ON public.silvio_playbook_definitions (created_by);
CREATE INDEX IF NOT EXISTS idx_silvio_playbook_definitions_updated_by ON public.silvio_playbook_definitions (updated_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_section_id ON public.warehouse_stock (section_id);
