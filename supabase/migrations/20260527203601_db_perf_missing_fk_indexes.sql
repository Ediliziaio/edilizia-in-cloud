-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- PERF: aggiunge indici su 25 FK senza covering index su tabelle hot.
-- Senza questi, DELETE/UPDATE del parent fa sequential scan sul child.
-- Esempio: DELETE FROM companies WHERE id = X → 14k row scan su listino_griglia.
--
-- IDEMPOTENTE: IF NOT EXISTS, safe da rilanciare.
-- NON CONCURRENTLY (migration transaction context blocca CONCURRENTLY).
-- Sostenibile: indici BTREE su singola colonna, costo IO/spazio minimo.

-- listino_griglia (14k rows, 6.8MB) — FK più hot in assoluto
CREATE INDEX IF NOT EXISTS idx_listino_griglia_company_id ON public.listino_griglia(company_id);

-- company_activity_log (4k rows) — 2 FK
CREATE INDEX IF NOT EXISTS idx_company_activity_log_brain_doc_id ON public.company_activity_log(brain_doc_id);
CREATE INDEX IF NOT EXISTS idx_company_activity_log_actor_user_id ON public.company_activity_log(actor_user_id);

-- ai_brain_documents (1.8k rows, 36MB) — self-ref
CREATE INDEX IF NOT EXISTS idx_ai_brain_documents_replaces_doc_id ON public.ai_brain_documents(replaces_doc_id);

-- email_inbox (1.2k rows, 17MB) — 4 FK
CREATE INDEX IF NOT EXISTS idx_email_inbox_folder_id ON public.email_inbox(folder_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_matched_order_id ON public.email_inbox(matched_order_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_matched_contact_id ON public.email_inbox(matched_contact_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_ai_action_proposal_id ON public.email_inbox(ai_action_proposal_id);

-- user_sessions (800 rows)
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_by ON public.user_sessions(revoked_by);

-- silvio_user_preferences (770 rows)
CREATE INDEX IF NOT EXISTS idx_silvio_user_preferences_company_id ON public.silvio_user_preferences(company_id);

-- profiles (770 rows)
CREATE INDEX IF NOT EXISTS idx_profiles_blocked_by ON public.profiles(blocked_by);

-- order_status_history (770 rows) — 2 FK
CREATE INDEX IF NOT EXISTS idx_order_status_history_status_id ON public.order_status_history(status_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by ON public.order_status_history(changed_by);

-- email_threads (630 rows)
CREATE INDEX IF NOT EXISTS idx_email_threads_company_id ON public.email_threads(company_id);

-- article_family_axis_values (570 rows)
CREATE INDEX IF NOT EXISTS idx_article_family_axis_values_company_id ON public.article_family_axis_values(company_id);

-- ai_router_usage_log (460 rows)
CREATE INDEX IF NOT EXISTS idx_ai_router_usage_log_user_id ON public.ai_router_usage_log(user_id);

-- order_events (450 rows)
CREATE INDEX IF NOT EXISTS idx_order_events_actor_id ON public.order_events(actor_id);

-- ai_call_ledger (400 rows)
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_pricing_override_id ON public.ai_call_ledger(pricing_override_id);

-- internal_chat_messages (300 rows) — self-ref reply_to
CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_reply_to_id ON public.internal_chat_messages(reply_to_id);

-- hr_talent_answers (240 rows) — 3 FK
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_company_id ON public.hr_talent_answers(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_question_id ON public.hr_talent_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_assessment_version ON public.hr_talent_answers(assessment_version);

-- article_family_axes (180 rows)
CREATE INDEX IF NOT EXISTS idx_article_family_axes_company_id ON public.article_family_axes(company_id);

-- marketing_contact_activities (160 rows) — created_by ha 2 FK (profiles + auth.users)
CREATE INDEX IF NOT EXISTS idx_marketing_contact_activities_created_by ON public.marketing_contact_activities(created_by);

COMMENT ON INDEX public.idx_listino_griglia_company_id IS
  'FK covering index — evita seq scan su DELETE companies (14k rows in listino_griglia)';
