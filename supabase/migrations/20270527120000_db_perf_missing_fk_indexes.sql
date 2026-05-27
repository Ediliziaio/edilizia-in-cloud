-- ============================================================================
-- CICLO 8 DB perf — 25 indici FK mancanti
-- ============================================================================
-- 2026-05-27 — Identificate 25 FK senza covering index sulle tabelle hot
-- (>100 righe). Senza indice, DELETE/UPDATE del parent fa sequential scan
-- sul child → query lente quando si cancella un'azienda, un utente, ecc.
--
-- IMPATTO STIMATO:
--   - DELETE companies cascade: -O(N) → -O(log N) per ogni FK
--   - listino_griglia (14k rows) → check cascade in millisecondi invece di
--     secondi
--   - email_inbox 17MB con 4 FK → 4 covering index per JOIN performance
--
-- IDEMPOTENTE: tutti IF NOT EXISTS. Safe da rilanciare.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listino_griglia_company_id ON public.listino_griglia(company_id);
CREATE INDEX IF NOT EXISTS idx_company_activity_log_brain_doc_id ON public.company_activity_log(brain_doc_id);
CREATE INDEX IF NOT EXISTS idx_company_activity_log_actor_user_id ON public.company_activity_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_brain_documents_replaces_doc_id ON public.ai_brain_documents(replaces_doc_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_folder_id ON public.email_inbox(folder_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_matched_order_id ON public.email_inbox(matched_order_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_matched_contact_id ON public.email_inbox(matched_contact_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_ai_action_proposal_id ON public.email_inbox(ai_action_proposal_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_by ON public.user_sessions(revoked_by);
CREATE INDEX IF NOT EXISTS idx_silvio_user_preferences_company_id ON public.silvio_user_preferences(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_blocked_by ON public.profiles(blocked_by);
CREATE INDEX IF NOT EXISTS idx_order_status_history_status_id ON public.order_status_history(status_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by ON public.order_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_email_threads_company_id ON public.email_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_article_family_axis_values_company_id ON public.article_family_axis_values(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_router_usage_log_user_id ON public.ai_router_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_order_events_actor_id ON public.order_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_pricing_override_id ON public.ai_call_ledger(pricing_override_id);
CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_reply_to_id ON public.internal_chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_company_id ON public.hr_talent_answers(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_question_id ON public.hr_talent_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_assessment_version ON public.hr_talent_answers(assessment_version);
CREATE INDEX IF NOT EXISTS idx_article_family_axes_company_id ON public.article_family_axes(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contact_activities_created_by ON public.marketing_contact_activities(created_by);

COMMENT ON INDEX public.idx_listino_griglia_company_id IS
  'FK covering index — evita seq scan su DELETE companies (14k rows in listino_griglia)';
