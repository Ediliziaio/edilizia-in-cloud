-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 6 — AI Act Compliance (governance strutturata in DB)
-- Cervello Supremo EiC
-- ════════════════════════════════════════════════════════════════════════════
-- Trasforma checklist + classificazione rischio + DPIA + AI literacy in
-- strutture DB interrogabili (Silvio puo rispondere "il sistema X e classificato
-- rischio limitato perche..." citando da DB).
--
-- 4 tabelle + 3 RPC + seed iniziale 25 sistemi AI EiC.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) ai_system_classification — registro formale dei sistemi AI EiC
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_system_classification (
  id text PRIMARY KEY,                        -- es. 'silvio-chat'
  system_type text NOT NULL DEFAULT 'edge_function',  -- edge_function | rpc | model_integration | ui_component
  name text NOT NULL,
  purpose text NOT NULL,
  risk_category text NOT NULL CHECK (risk_category IN (
    'inaccettabile',
    'alto_rischio',
    'limitato',
    'minimo',
    'borderline'
  )),
  risk_motivation text NOT NULL,
  ai_act_obligations text[] NOT NULL DEFAULT '{}',  -- es. {trasparenza, etichetta, HIL, audit_log}
  human_oversight_level text CHECK (human_oversight_level IN ('automatic','suggest_only','approve_required','co_decision','none_required')),
  ai_model_used text,
  data_read text[],
  data_written text[],
  transparency_measures text,
  human_oversight_measures text,
  known_limitations text,
  user_disclaimer text,
  incident_response_procedure text,
  owner_business text,
  owner_technical text,
  enabled boolean NOT NULL DEFAULT true,
  classification_version text NOT NULL DEFAULT '1.0',
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  next_review_due timestamptz DEFAULT (now() + interval '12 months'),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aiclass_risk ON public.ai_system_classification (risk_category);
CREATE INDEX IF NOT EXISTS idx_aiclass_review_due ON public.ai_system_classification (next_review_due);

ALTER TABLE public.ai_system_classification ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aiclass_read_all" ON public.ai_system_classification;
CREATE POLICY "aiclass_read_all" ON public.ai_system_classification FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS "aiclass_super_admin" ON public.ai_system_classification;
CREATE POLICY "aiclass_super_admin" ON public.ai_system_classification FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) ai_act_compliance_status — checklist live (sostituisce Excel)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_act_compliance_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'principio_isolamento_dati','principio_rbac','principio_no_hallucination',
    'principio_no_distruttive','principio_hil','principio_trasparenza','principio_tracciabilita',
    'art_50_trasparenza_utenti','art_4_ai_literacy','art_9_gestione_rischio',
    'art_15_cybersecurity','art_11_documentazione','art_73_notifica_violazioni',
    'art_12_conservazione_log'
  )),
  requirement text NOT NULL,
  status text NOT NULL CHECK (status IN ('implemented','partial','missing','documental','not_applicable')),
  notes text,
  evidence_link text,                 -- link a doc, commit git, dashboard
  related_track text,                 -- es. 'track_1', 'track_3'
  priority text CHECK (priority IN ('alta','media','bassa')),
  target_date date,
  completed_at timestamptz,
  responsible_role text,              -- es. 'CTO','DPO','dev_team'
  last_audit_at timestamptz,
  next_audit_due timestamptz DEFAULT (now() + interval '6 months'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_category ON public.ai_act_compliance_status (category);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON public.ai_act_compliance_status (status);
CREATE INDEX IF NOT EXISTS idx_compliance_priority ON public.ai_act_compliance_status (priority, status);

ALTER TABLE public.ai_act_compliance_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compliance_read_all" ON public.ai_act_compliance_status;
CREATE POLICY "compliance_read_all" ON public.ai_act_compliance_status FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS "compliance_super_admin" ON public.ai_act_compliance_status;
CREATE POLICY "compliance_super_admin" ON public.ai_act_compliance_status FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ai_dpia_documents — versioning DPIA
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_dpia_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','review','approved','superseded')),
  content_md text NOT NULL,
  scope_description text,
  applicable_to_systems text[],          -- es. {silvio-chat, ai-lead-score, ...}
  risks_identified jsonb DEFAULT '[]'::jsonb,
  mitigations jsonb DEFAULT '[]'::jsonb,
  approved_by_dpo uuid REFERENCES auth.users(id),
  approved_by_dpo_at timestamptz,
  approved_by_ceo uuid REFERENCES auth.users(id),
  approved_by_ceo_at timestamptz,
  approved_by_cto uuid REFERENCES auth.users(id),
  approved_by_cto_at timestamptz,
  next_review_due timestamptz DEFAULT (now() + interval '12 months'),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpia_status ON public.ai_dpia_documents (status);
CREATE INDEX IF NOT EXISTS idx_dpia_review_due ON public.ai_dpia_documents (next_review_due);

ALTER TABLE public.ai_dpia_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpia_read_authorised" ON public.ai_dpia_documents;
CREATE POLICY "dpia_read_authorised" ON public.ai_dpia_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin'))
);
DROP POLICY IF EXISTS "dpia_super_admin_write" ON public.ai_dpia_documents;
CREATE POLICY "dpia_super_admin_write" ON public.ai_dpia_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) ai_literacy_training — tracking obbligo art.4 (in vigore dal 2/2/2025)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_literacy_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text,                                    -- ruolo formativo (dev, sales, marketing, c-level)
  course_id text NOT NULL,                           -- es. 'eic_ai_basics_v1'
  course_title text NOT NULL,
  course_version text DEFAULT '1.0',
  status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed','expired','exempted')),
  enrolled_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  score numeric,                                     -- 0-100 se quiz finale
  certificate_url text,
  next_recertification_due timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_literacy_user ON public.ai_literacy_training (user_id);
CREATE INDEX IF NOT EXISTS idx_literacy_status ON public.ai_literacy_training (status);
CREATE INDEX IF NOT EXISTS idx_literacy_recert ON public.ai_literacy_training (next_recertification_due) WHERE status = 'completed';

ALTER TABLE public.ai_literacy_training ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "literacy_self_or_admin" ON public.ai_literacy_training;
CREATE POLICY "literacy_self_or_admin" ON public.ai_literacy_training FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin'))
);
DROP POLICY IF EXISTS "literacy_admin_write" ON public.ai_literacy_training;
CREATE POLICY "literacy_admin_write" ON public.ai_literacy_training FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin'))
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC: compliance_status_export per audit
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_compliance_status_export()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int; v_implemented int; v_partial int; v_missing int; v_documental int;
  v_systems_total int; v_systems_borderline int; v_systems_alto int;
  v_dpia_active jsonb;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE status = 'implemented'),
         count(*) FILTER (WHERE status = 'partial'),
         count(*) FILTER (WHERE status = 'missing'),
         count(*) FILTER (WHERE status = 'documental')
    INTO v_total, v_implemented, v_partial, v_missing, v_documental
  FROM public.ai_act_compliance_status;

  SELECT count(*),
         count(*) FILTER (WHERE risk_category = 'borderline'),
         count(*) FILTER (WHERE risk_category = 'alto_rischio')
    INTO v_systems_total, v_systems_borderline, v_systems_alto
  FROM public.ai_system_classification WHERE enabled = true;

  SELECT row_to_json(d)::jsonb INTO v_dpia_active
  FROM (
    SELECT version, status, approved_by_dpo_at, approved_by_ceo_at, approved_by_cto_at, next_review_due
    FROM public.ai_dpia_documents WHERE status = 'approved' ORDER BY created_at DESC LIMIT 1
  ) d;

  RETURN jsonb_build_object(
    'export_at', now(),
    'compliance_summary', jsonb_build_object(
      'requirements_total', v_total,
      'implemented', v_implemented,
      'partial', v_partial,
      'missing', v_missing,
      'documental', v_documental,
      'compliance_rate_pct', ROUND(100.0 * (v_implemented + v_partial * 0.5) / NULLIF(v_total, 0), 1)
    ),
    'systems_summary', jsonb_build_object(
      'total_active', v_systems_total,
      'borderline_count', v_systems_borderline,
      'alto_rischio_count', v_systems_alto
    ),
    'dpia_active', v_dpia_active,
    'literacy_summary', (
      SELECT jsonb_build_object(
        'users_enrolled', count(DISTINCT user_id),
        'completed', count(*) FILTER (WHERE status = 'completed'),
        'expiring_60d', count(*) FILTER (WHERE next_recertification_due BETWEEN now() AND now() + interval '60 days')
      )
      FROM public.ai_literacy_training
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_compliance_status_export() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC: get_system_classification per Silvio (citazione in chat)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_system_classification(p_system_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(s)::jsonb
  FROM (
    SELECT id, name, purpose, risk_category, risk_motivation,
           ai_act_obligations, human_oversight_level,
           transparency_measures, human_oversight_measures,
           known_limitations, user_disclaimer, classification_version, classified_at
    FROM public.ai_system_classification WHERE id = p_system_id
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_system_classification(text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: literacy_set_completion
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.literacy_set_completion(
  p_user_id uuid, p_course_id text, p_score numeric DEFAULT NULL,
  p_certificate_url text DEFAULT NULL, p_recert_months int DEFAULT 24
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.ai_literacy_training SET
    status = 'completed',
    completed_at = now(),
    score = COALESCE(p_score, score),
    certificate_url = COALESCE(p_certificate_url, certificate_url),
    next_recertification_due = now() + (p_recert_months * interval '1 month'),
    updated_at = now()
  WHERE user_id = p_user_id AND course_id = p_course_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No enrollment found for user % course %', p_user_id, p_course_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.literacy_set_completion(uuid, text, numeric, text, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) SEED: 25 sistemi AI EiC con classificazione (da spec 02)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_system_classification (id, name, purpose, risk_category, risk_motivation, ai_act_obligations, human_oversight_level, ai_model_used, transparency_measures, user_disclaimer)
VALUES
('silvio-chat','Silvio Chat','Chatbot principale assistente edile','limitato','Chatbot interagisce con utenti, deve dichiararsi AI',ARRAY['trasparenza','audit_log'],'suggest_only','gpt-4o-mini (default)','Persona Silvio si dichiara AI a inizio conversazione','Sei in chat con Silvio, AI assistente di Edilizia in Cloud'),
('silvio-daily-briefing','Daily Briefing','Briefing giornaliero proattivo','limitato','Genera contenuti per utenti',ARRAY['trasparenza','etichetta_generato_ai'],'suggest_only','claude-haiku-4.5','Notifica riporta "briefing generato AI"','Briefing generato AI - revisione rapida consigliata'),
('silvio-execute-action','Execute Action','Esegue azioni confermate dopo HIL','limitato','Esegue solo dopo HIL, non decide',ARRAY['audit_log'],'approve_required','none','Logged in silvio_decision_log','Azione eseguita su tua conferma esplicita'),
('silvio-memory-extract','Memory Extract','Estrae fatti long-term da chat','limitato','Profilazione leggera, no decisioni',ARRAY['trasparenza','gdpr'],'automatic','gpt-4o-mini','Memoria visibile a super_admin','I tuoi messaggi possono essere usati per estrarre preferenze long-term'),
('silvio-transcribe-audio','Audio Transcription','Whisper STT per audio chat','minimo','Trascrizione, no decisioni','{}','automatic','whisper-1','Audio trascritto e processato come testo','Audio trascritto da AI'),
('genera-contratto-ai','Genera Contratto AI','Genera contratti edili art.1655 c.c.','limitato','Bozza, sempre revisionata da umano',ARRAY['trasparenza','etichetta','disclaimer_legale'],'approve_required','claude-haiku-4.5','Footer "Bozza AI - revisiona prima della firma"','Bozza generata AI - revisiona attentamente prima firma'),
('ai-contratto-review','Contratto Review','Compliance review contratti vs computo','limitato','Suggerimenti, non decide',ARRAY['trasparenza'],'suggest_only','claude-haiku-4.5','Output esplicitamente "AI review"','Review AI - non sostituisce parere legale'),
('genera-pos','Genera POS','Genera POS sicurezza D.Lgs 81/08','limitato','Bozza, sempre revisionata; sicurezza delicata ma no sostituzione RSPP',ARRAY['trasparenza','disclaimer_sicurezza'],'approve_required','claude-haiku-4.5','Disclaimer "Rivedi con RSPP qualificato"','POS generato AI - validazione RSPP obbligatoria prima utilizzo'),
('suggerisci-sal-ai','SAL AI Suggest','Suggerimenti % avanzamento SAL','limitato','Suggerimenti, decisione umana',ARRAY['trasparenza'],'suggest_only','claude-haiku-4.5','Output marcato "suggerimento AI"','Percentuali suggerite AI - verifica sul cantiere prima conferma'),
('ddt-ocr-extract','DDT OCR','OCR documenti di trasporto','minimo','Estrazione dati, no decisioni','{}','automatic','gpt-4o-mini-vision','Estrazione visibile prima di salvare','Dati estratti AI dal documento'),
('ai-fattura-classify','Fattura Classify','Classificazione 16 categorie fatture','limitato','Classificazione automatica con review umana',ARRAY['trasparenza','review_possibile'],'suggest_only','deepseek-chat-v3.1','Categoria + confidenza visibili','Categoria suggerita AI - puoi modificare'),
('ai-lead-score','Lead Score','Score 0-100 contatti commerciali','limitato','Suggerimento commerciale',ARRAY['trasparenza'],'suggest_only','deepseek-chat-v3.1','Score con reasoning visibile','Score AI - tool decisionale, non automatico'),
('ai-customer-ltv','Customer LTV','Predizione lifetime value cliente','limitato','Statistico, suggerimento',ARRAY['trasparenza'],'suggest_only','gpt-4o-mini','Modello e dati storici visibili','Predizione AI - margine di errore atteso'),
('ai-allocazione-operai','Allocazione Operai','Suggerisce team per cantiere','borderline','Borderline alto rischio se autonomo. Configurazione attuale: solo suggest, decide umano',ARRAY['trasparenza','HIL_obbligatorio','no_decisioni_HR_autonome'],'approve_required','deepseek-chat-v3.1','Output esplicito "suggerimento AI" + lavoratore informato','Suggerimento AI - decisione finale del responsabile umano. Lavoratore puo contestare la proposta.'),
('ai-pricing-suggest','Pricing Suggest','Prezzo ottimale per voce listino','limitato','Suggerimento commerciale',ARRAY['trasparenza'],'suggest_only','deepseek-chat-v3.1','Razionale e storico visibili','Prezzo suggerito AI - valuta caso specifico'),
('ai-foto-cantiere-quality','Foto Cantiere Quality','Vision check qualita + DPI + fase','limitato','Analisi suggerimento, decisione umana',ARRAY['trasparenza'],'suggest_only','gpt-4o-mini-vision','Qualita score con dettaglio problemi','Analisi AI - non sostituisce ispezione fisica'),
('ai-biz-card-ocr','Biz Card OCR','OCR biglietti da visita','minimo','Estrazione dati','{}','automatic','gpt-4o-mini-vision','Anteprima dati estratti','Dati estratti AI - controlla correttezza'),
('ai-summarize','Summarize','Riassume testi lunghi','limitato','Generazione contenuti',ARRAY['etichetta'],'suggest_only','deepseek-chat-v3.1','Footer "Riassunto AI"','Riassunto AI - leggi originale per dettagli'),
('ai-executive-briefing','Executive Briefing','Briefing C-level strutturato','limitato','Generazione report, decisione umana',ARRAY['trasparenza','etichetta'],'suggest_only','claude-haiku-4.5','Marcato come "briefing AI"','Briefing AI - dati aggregati al momento export'),
('ai-fraud-review','Fraud Review','Audit anomalie fatture/pagamenti','borderline','Borderline alto rischio se etichettasse "frode" autonomamente. Configurazione: anomalie cautelative, decide umano',ARRAY['trasparenza','HIL','no_etichette_frode_automatiche'],'approve_required','deepseek-chat-v3.1','Linguaggio cauto: "merita verifica" non "frode confermata"','Anomalia rilevata AI - richiede indagine umana, non e classificazione di frode'),
('ai-briefing-per-ruolo','Briefing per Ruolo','Briefing personalizzato per ruolo utente','limitato','Contenuti generati per utente',ARRAY['etichetta'],'suggest_only','claude-haiku-4.5','Header "briefing AI"','Briefing AI personalizzato'),
('ai-genera-preventivo-v2','Genera Preventivo','Genera preventivi (legacy migrato)','limitato','Bozza, revisionata',ARRAY['trasparenza'],'approve_required','claude-haiku-4.5','Output marcato "AI bozza"','Preventivo AI - revisiona costi e tempi prima invio'),
('computo-ai-extract','Computo OCR','OCR computi metrici PDF','minimo','Estrazione','{}','automatic','gpt-4o-mini','Voci visibili prima salvataggio','Voci estratte AI - verifica importi'),
('ai-tabella-finanziamento-extract','Tabella Finanziamento OCR','OCR piani finanziamento','minimo','Estrazione','{}','automatic','gpt-4o-mini-vision','Rate visibili prima salvataggio','Rate estratte AI'),
('parse-rapportino-ai','Rapportino Parser','Parse rapportini campo (multi-lang IT/RO/SQ/AR)','limitato','Auto-detect safety alert (delicato sicurezza)',ARRAY['trasparenza','escalation_umana_su_alert_sicurezza'],'suggest_only','deepseek-chat-v3.1','Alert sicurezza marcati esplicitamente','Rapportino interpretato AI - safety alert richiedono verifica umana')
ON CONFLICT (id) DO UPDATE SET
  risk_category = EXCLUDED.risk_category,
  risk_motivation = EXCLUDED.risk_motivation,
  ai_act_obligations = EXCLUDED.ai_act_obligations,
  human_oversight_level = EXCLUDED.human_oversight_level,
  updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 9) SEED: ai_act_compliance_status iniziale (basato sui 5 track delivered)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_act_compliance_status (category, requirement, status, notes, related_track, priority, responsible_role, completed_at) VALUES
-- Principio 1: Isolamento dati
('principio_isolamento_dati','Multi-tenancy con company_id','implemented','Tutte le tabelle hanno company_id + RLS','baseline','alta','CTO',now()),
('principio_isolamento_dati','RLS policies su tabelle company-scoped','implemented','Pattern documentato e in uso','baseline','alta','CTO',now()),
('principio_isolamento_dati','Test penetration cross-tenant trimestrale','partial','Da formalizzare e schedulare','track_6','media','CTO',NULL),
('principio_isolamento_dati','Procedura incident response cross-tenant leak','missing','Da definire','track_6','alta','DPO',NULL),

-- Principio 2: RBAC
('principio_rbac','Schema ruoli definito','implemented','super_admin, company_admin, company_staff, ecc','baseline','alta','CTO',now()),
('principio_rbac','RBAC enforced via RLS','implemented','Pattern in uso','baseline','alta','CTO',now()),
('principio_rbac','can_user_use_persona RPC','implemented','Esistente, fixato in track_1','baseline','alta','CTO',now()),
('principio_rbac','Filtraggio KB per persona (kb_areas_filter)','implemented','Implementato in Track 1','track_1','alta','CTO',now()),
('principio_rbac','Audit log accessi','implemented','ai_router_usage_log + silvio_decision_log','track_3','alta','CTO',now()),

-- Principio 3: Anti-hallucination
('principio_no_hallucination','RAG su KB universale','implemented','Track 2: 1712 chunks ingeriti, 97% hit-rate test set','track_2','alta','CTO',now()),
('principio_no_hallucination','Citazioni fonti nelle risposte','implemented','Preambolo costituzionale Track 1 lo richiede','track_1','alta','CTO',now()),
('principio_no_hallucination','Rifiuto su dati mancanti','implemented','Preambolo Track 1 obbligo "non inventare"','track_1','alta','CTO',now()),
('principio_no_hallucination','Test set RAG per validazione','implemented','45 query, pass rate 97%','track_2','media','CTO',now()),
('principio_no_hallucination','Monitoring tasso hallucination','missing','Da implementare dashboard','track_6','media','dev_team',NULL),

-- Principio 4: No azioni distruttive
('principio_no_distruttive','Tool sandboxing (no eliminazioni nei tool registrati)','implemented','silvioTools.ts non include eliminazioni','baseline','alta','CTO',now()),
('principio_no_distruttive','Soft delete su tabelle critiche','partial','Pattern presente su alcune tabelle, da estendere','baseline','media','CTO',NULL),
('principio_no_distruttive','Audit log immutabile','implemented','ai_router_usage_log + silvio_decision_log append-only','baseline','alta','CTO',now()),
('principio_no_distruttive','Procedura formale eliminazioni','documental','Da formalizzare con DPO','track_6','media','DPO',NULL),
('principio_no_distruttive','Disaster recovery testato','missing','Da testare almeno annualmente','track_6','media','CTO',NULL),

-- Principio 5: HIL
('principio_hil','propose_action con risk_level','implemented','Tool esistente in silvioTools','baseline','alta','CTO',now()),
('principio_hil','silvio-execute-action solo dopo conferma','implemented','Pattern attivo','baseline','alta','CTO',now()),
('principio_hil','UI per review proposals (SilvioActionProposals)','implemented','Componente esistente','baseline','alta','CTO',now()),
('principio_hil','Decision log unificato','implemented','Track 3 silvio_decision_log','track_3','alta','CTO',now()),
('principio_hil','Soglie HIL configurate per tipologia azione','partial','Da formalizzare','track_6','media','dev_team',NULL),

-- Principio 6: Trasparenza
('principio_trasparenza','Identità AI dichiarata in chat','implemented','Preambolo Track 1: regola 6 trasparenza','track_1','alta','CTO',now()),
('principio_trasparenza','Citazione fonti nelle risposte','implemented','Preambolo + KB chunks Track 1+2','track_1','alta','CTO',now()),
('principio_trasparenza','Spiegazione ragionamento (advisory levels L1-L5)','implemented','Playbook orchestrator Track 4 produce SITUAZIONE/DIAGNOSI/OPZIONI','track_4','alta','CTO',now()),
('principio_trasparenza','Etichettatura contenuti generati AI in documenti','partial','Footer da implementare in contratti/POS/preventivi','track_6','media','dev_team',NULL),
('principio_trasparenza','Banner UI "stai chattando con AI" persistente','partial','Da aggiungere in chat React component','track_6','media','dev_team',NULL),

-- Principio 7: Tracciabilità totale
('principio_tracciabilita','ai_router_usage_log per chiamate AI','implemented','Esistente, completo','baseline','alta','CTO',now()),
('principio_tracciabilita','ai_chat_messages per conversazioni','implemented','Esistente','baseline','alta','CTO',now()),
('principio_tracciabilita','silvio_decision_log unificato end-to-end','implemented','Track 3','track_3','alta','CTO',now()),
('principio_tracciabilita','Export per audit AI Act','implemented','silvio_decision_log_audit_export RPC','track_3','alta','CTO',now()),
('principio_tracciabilita','Conservazione log 5+ anni','partial','Strategia da formalizzare','track_6','media','DPO',NULL),

-- Art 50: Trasparenza utenti
('art_50_trasparenza_utenti','Utente sa di interagire con AI','implemented','Preambolo + system prompt Track 1','track_1','alta','CTO',now()),
('art_50_trasparenza_utenti','Etichetta su contenuti generati','partial','Da implementare in footer documenti','track_6','media','dev_team',NULL),

-- Art 4: AI Literacy (IN VIGORE DAL 2/2/2025!)
('art_4_ai_literacy','Programma formativo team interno EiC','missing','CRITICO: già fuori scadenza dal 2/2/2025','track_6','alta','CEO',NULL),
('art_4_ai_literacy','Programma formativo per clienti','missing','Da costruire','track_6','media','CEO',NULL),
('art_4_ai_literacy','Documentazione completamento corsi','partial','ai_literacy_training tabella creata Track 6','track_6','alta','dev_team',NULL),

-- Art 9: Gestione rischio
('art_9_gestione_rischio','Sistema gestione rischio formalizzato','partial','ai_system_classification creata Track 6','track_6','media','CTO',NULL),
('art_9_gestione_rischio','Identificazione rischi prevedibili','partial','Per i 25 sistemi classificati','track_6','media','CTO',NULL),
('art_9_gestione_rischio','Misure mitigazione documentate','partial','Per sistemi borderline (allocazione_operai, fraud_review)','track_6','alta','CTO',NULL),

-- Art 15: Cybersecurity
('art_15_cybersecurity','Cifratura at-rest e in-transit','implemented','Standard Supabase','baseline','alta','CTO',now()),
('art_15_cybersecurity','Protezione contro prompt injection','implemented','Preambolo Track 1 con regole anti-injection','track_1','alta','CTO',now()),
('art_15_cybersecurity','Penetration test periodici','partial','Da formalizzare','track_6','media','CTO',NULL),
('art_15_cybersecurity','Incident response plan','missing','Da formalizzare','track_6','alta','DPO',NULL),

-- Art 11: Documentazione tecnica
('art_11_documentazione','Descrizione del sistema AI','implemented','ai_system_classification + 25 sistemi seedati','track_6','alta','CTO',now()),
('art_11_documentazione','Specifiche dei dati di training','not_applicable','EiC non addestra modelli, usa GPAI as-is','baseline','bassa','CTO',now()),
('art_11_documentazione','Documenti di test e validazione','partial','Test set Track 2, audit Track 3','track_2','media','CTO',NULL),

-- Art 73: Notifica violazioni
('art_73_notifica_violazioni','Procedura notifica autorità (ACN)','missing','Da formalizzare','track_6','alta','DPO',NULL),

-- Art 12: Conservazione log
('art_12_conservazione_log','Logging automatico interazioni','implemented','ai_router_usage_log + silvio_decision_log','baseline','alta','CTO',now()),
('art_12_conservazione_log','Conservazione minimo 6 mesi','implemented','Storage indefinito attualmente','baseline','alta','CTO',now()),
('art_12_conservazione_log','Estrazione per audit','implemented','silvio_decision_log_audit_export','track_3','alta','CTO',now())
ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 10) Verifiche post-migration
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_systems int; v_compliance int; v_implemented int;
BEGIN
  SELECT count(*) INTO v_systems FROM public.ai_system_classification WHERE enabled = true;
  IF v_systems < 25 THEN RAISE EXCEPTION 'Atteso 25 sistemi classificati, trovati %', v_systems; END IF;
  RAISE NOTICE 'OK: % sistemi AI EiC classificati', v_systems;

  SELECT count(*), count(*) FILTER (WHERE status='implemented') INTO v_compliance, v_implemented
    FROM public.ai_act_compliance_status;
  RAISE NOTICE 'OK: % requisiti compliance, di cui % implementati (% pct)',
    v_compliance, v_implemented, ROUND(100.0 * v_implemented / v_compliance, 0);
END $$;

COMMIT;
