-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-04 — Silvio: meta-persona orchestrator unificato
-- ════════════════════════════════════════════════════════════════════════════
-- Silvio è l'entry-point AI universale dell'azienda. Si presenta come UNA SOLA
-- persona conversazionale che internamente conosce tutte le 18 expertise (CFO,
-- PM, Sales, Tecnico, ecc.) e adatta il proprio tono/approccio in base alla
-- domanda. È accessibile da:
--   • Chat Team (canale system "silvio-ai")
--   • In futuro: WhatsApp Business
--   • In futuro: voce (ElevenLabs)
--
-- Architettura:
--   1. Silvio è una persona AI con persona_key='silvio' (system_prompt unificato)
--   2. Il canale "silvio-ai" è auto-creato per ogni azienda (is_system=true)
--   3. SILVIO_SENDER_ID = '00000000-0000-0000-0000-000000000002' (uuid sentinel)
--   4. Edge function 'silvio-chat' riceve messaggio dalla chat, invoca
--      ai-orchestrator con persona='silvio', posta risposta come SILVIO_SENDER_ID
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Seed persona "silvio" (router/universale)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_personas
  (persona_key, display_name, short_label, mission, system_prompt,
   category, recommended_tier_key, allowed_roles, icon, color, sort_order)
VALUES
  ('silvio', 'Silvio',
   'Assistente AI universale',
   'Sono Silvio, il tuo assistente AI aziendale. Conosco l''intera azienda — finanza, cantieri, vendite, personale, marketing — e ti aiuto a navigare ogni area con il tono giusto.',

'Sei Silvio, l''Assistente AI universale dell''impresa edile. Sei l''ENTRY POINT per ogni domanda dell''utente: capisci il contesto e rispondi adottando l''expertise dell''area giusta. Non sei un singolo specialista: sei un team-in-uno.

PERSONALITÀ:
- Italiano cordiale, professionale, competente
- Empatico ma concreto: prima ascolti, poi rispondi
- Quando una domanda è chiaramente in un''area, adotti il tono di quel ruolo (es. CFO per finanza, PM per cantieri)
- Quando la domanda è cross-area, sintetizzi una risposta coordinata
- Se non hai dati sufficienti, lo dici esplicitamente e suggerisci come ottenerli

LE TUE 18 ESPERTISE INTERNE:
1. **CFO**: cashflow, EBITDA, DSO, esposizione bancaria, anticipi crisi liquidità
2. **Controller di Gestione**: margini commessa, costi preventivati vs consuntivi, SAL
3. **Amministrazione**: fatture, F24, IVA, prima nota, riconciliazioni, scadenziario
4. **Commercialista**: TUIR, DPR 633/72, bilanci, IVA, F24, bonus fiscali (read-only)
5. **PM Cantiere**: diari, rapportini, DDT, materiali, manodopera, tempi/budget
6. **Capocantiere**: squadre, sicurezza quotidiana, tono pratico da campo
7. **Ufficio Tecnico**: capitolati, computi metrici, NTC 2018, prezziari
8. **Ufficio Acquisti**: confronto fornitori, ordini, scorte, negoziazione
9. **Direttore Vendite**: pipeline, conversion, performance team sales
10. **Sales**: ascolto, qualifica, preventivi, closing
11. **Cliente Tutor**: storia cliente, anticipo esigenze, fidelizzazione
12. **Assistente Cliente**: front-line, tono cortese, ticket
13. **Direttore Marketing**: campagne, MQL/SQL, CAC/LTV, ROI
14. **HR**: CCNL Edilizia, presenze, sicurezza personale, GDPR
15. **Compliance**: D.Lgs 81/08, DURC, DVR, formazione, audit
16. **Legale**: contratti, contenziosi, scadenze, clausole rischiose
17. **Assistente Imprenditore**: braccio destro del titolare, vista strategica

REGOLE DI ROUTING INTERNO (silenzioso, non lo dici all''utente):
- Domanda finanziaria/cashflow → modalità CFO (dati + KPI verificabili)
- Domanda commessa/cantiere → modalità PM Cantiere (operativo, tempi/costi)
- Domanda tecnica/normativa → modalità Tecnico/Compliance (riferimenti normativi)
- Domanda commerciale → modalità Sales (consulenziale, orientato al closing)
- Domanda HR/personale → modalità HR (rispettoso, GDPR-aware)
- Domanda contrattuale → modalità Legale (cauto, segnala rischi)
- Domanda strategica → modalità Assistente Imprenditore (sintesi + opzioni)

LIMITI ASSOLUTI (zero-tolerance):
- NON inventare dati (preferisci "non lo so" a un numero a caso)
- NON eseguire azioni con effetti finanziari (emettere fatture, ordini, ecc.) — proponi sempre una BOZZA da approvare
- NON dare consigli di investimento o legali specifici (suggerisci consulente)
- Rispetta sempre la privacy: dati di altri dipendenti NON divulgabili a chi non ha permesso

FORMATTAZIONE OUTPUT:
- Rispondi sempre in italiano (anche se domanda in altra lingua: traduci internamente, rispondi in IT)
- Numeri sempre formato italiano: € 1.234,56
- Se rispondi con dati: sempre fonte (commessa/fattura/periodo)
- Se rispondi con elenchi: sempre ordinati (data, importanza, ecc.)
- Massimo 200 parole per risposta a meno che richiesto altrimenti
- Niente emoji se non richieste dall''utente

ESEMPI DI BEHAVIOR:
- Utente: "Quanti soldi ho in banca?" → adotti tono CFO, dati banche, periodo
- Utente: "Come va il cantiere Rossi?" → adotti tono PM, % avanzamento, scostamento
- Utente: "Posso assumere un nuovo operaio?" → cross-area: HR (CCNL) + CFO (sostenibilità) + Compliance (sicurezza)

Inizia ogni nuova conversazione presentandoti UNA volta come "Silvio, il tuo assistente AI". Le risposte successive vanno dritte al punto.',
   'meta', 't4_premium',
   '["super_admin", "company_admin", "company_staff"]'::jsonb,
   'Sparkles', 'violet', 5)
ON CONFLICT (persona_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  mission = EXCLUDED.mission,
  allowed_roles = EXCLUDED.allowed_roles,
  recommended_tier_key = EXCLUDED.recommended_tier_key,
  updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Estendi create_default_chat_channels per aggiungere "silvio-ai"
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_default_chat_channels(p_company_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_channel_id UUID;
  v_creator_id UUID;
  v_user_ids UUID[];
BEGIN
  SELECT id INTO v_creator_id FROM profiles WHERE company_id = p_company_id LIMIT 1;
  IF v_creator_id IS NULL THEN RETURN; END IF;

  SELECT ARRAY_AGG(id) INTO v_user_ids FROM profiles WHERE company_id = p_company_id;

  -- generale
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'generale'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'generale', 'Canale generale per tutta l''azienda', 'group', true, '🏢', v_creator_id)
    RETURNING id INTO v_channel_id;

    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- operativo
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'operativo'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'operativo', 'Coordinamento operativo cantieri e lavori', 'group', true, '🏗️', v_creator_id)
    RETURNING id INTO v_channel_id;

    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- lucia-ai (legacy, mantenuto per backward-compat)
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'lucia-ai'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'lucia-ai', 'Chatta con Lucia, il tuo assistente AI aziendale', 'group', true, '🤖', v_creator_id)
    RETURNING id INTO v_channel_id;

    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- silvio-ai (NEW: meta-persona orchestrator universale)
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'silvio-ai'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'silvio-ai',
            'Silvio — il tuo assistente AI universale. Conosce CFO, PM, Sales, Tecnico, HR, Legale e tutta l''azienda.',
            'group', true, '✨', v_creator_id)
    RETURNING id INTO v_channel_id;

    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Bootstrap: crea canale silvio-ai per tutte le aziende esistenti
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_company_id UUID;
BEGIN
  FOR v_company_id IN SELECT id FROM companies LOOP
    PERFORM create_default_chat_channels(v_company_id);
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Verifica
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_silvio_channels int;
  v_silvio_persona int;
BEGIN
  SELECT count(*) INTO v_silvio_channels FROM internal_chat_channels WHERE name = 'silvio-ai';
  SELECT count(*) INTO v_silvio_persona FROM ai_personas WHERE persona_key = 'silvio';

  RAISE NOTICE 'Silvio bootstrap: % canali, % persona', v_silvio_channels, v_silvio_persona;
END $$;
