

# Piano di completamento Modulo AI Agents — Fase Finale

## Stato attuale: ~60% completato

Il modulo ha infrastruttura solida (DB, proxy, routing, editor base). Mancano componenti, hook, integrazioni e la webhook edge function.

---

## Batch 1: File mancanti dalla spec + Sidebar interna

### 1.1 Componenti mancanti da creare
- **`AgentSidebar.tsx`** — Sotto-navigazione interna al modulo con link: Agenti, KB Globale, Numeri Telefono, WhatsApp, Crediti, Impostazioni. Va renderizzato come barra laterale o top-nav dentro le pagine del modulo.
- **`KnowledgeBaseDocumentList.tsx`** — Componente riusabile per lista documenti (usato sia in `PlatformKnowledgeBasePage` che in `AgentKBTab`). Estrarre la logica duplicata.
- **`PhoneNumberManager.tsx`** — Componente per gestire numeri telefonici (lista, assegnazione agente, stato). Usato in `AgentPhoneNumbersPage`.

### 1.2 Hook mancanti
- **`useEdiliziaIntegration.ts`** — Hook per accedere a funzionalità CRM (contatti, appuntamenti, calendario) dal modulo AI Agents.
- **`lib/elevenLabsClient.ts`** — Wrapper tipizzato per le chiamate al proxy edge function. Attualmente la logica è sparsa in `useElevenLabsProxy.ts` e nei componenti.

### 1.3 Sidebar sottovoci mancanti in `sidebarConfig.ts`
Aggiungere le voci mancanti:
- Numeri di Telefono → `/azienda/marketing/agente-ai/numeri-telefono`
- WhatsApp → `/azienda/marketing/agente-ai/whatsapp` (badge Alpha)
- Impostazioni → `/azienda/marketing/agente-ai/impostazioni`

---

## Batch 2: Completare pagine e tab esistenti

### 2.1 `PlatformSettingsPage.tsx`
- Implementare salvataggio reale su `platform_elevenlabs_config` via edge function (non esporre API key al frontend)
- Test connessione reale via proxy (`get_voices` come health check)
- Aggiungere sezione whitelist domini

### 2.2 `AgentCreditsPage.tsx`
- Aggiungere colonne `cost_per_minute_platform` e `cost_per_minute_billed` nella UI
- Tabella utilizzo mensile per agente (aggregazione da `ai_agent_conversations`)
- Storico ricariche (placeholder per ora)

### 2.3 `PlatformKnowledgeBasePage.tsx`
- Aggiungere pulsante "Crea cartella"
- Indicatore "Archiviazione RAG: X B / 1.0 MB"
- Filtro per creatore

### 2.4 `AgentPhoneNumbersPage.tsx`
- Sostituire placeholder con componente funzionale usando `PhoneNumberManager`
- Lista numeri da DB, assegnazione agente, stato

### 2.5 Tab editor incompleti
- **Sicurezza**: Whitelist domini, autenticazione, rate limiting (form con salvataggio)
- **Avanzato**: Timeout conversazione, max durata, gestione errori (form con salvataggio)

---

## Batch 3: Edge Function webhook + CRM integration

### 3.1 `elevenlabs-webhook` edge function
- Endpoint pubblico (verify_jwt = false) con validazione signature
- Riceve eventi post-conversazione da ElevenLabs
- Salva conversazione in `ai_agent_conversations`
- Decrementa minuti da `ai_agent_credits`
- Se strumento `create_appointment` chiamato → crea in tabella `appointments`
- Se nuovo contatto identificato → crea in `marketing_contacts` con source "agente_ai"
- Aggiorna `config.toml` con `[functions.elevenlabs-webhook] verify_jwt = false`

### 3.2 `ediliziaSync.ts` potenziamento
- Spostare logica CRM nel webhook (server-side). Il client-side stub attuale va mantenuto solo come utility per letture.
- Implementare `createAppointmentFromAI()`, `createContactFromAI()`, `updateContactStatus()`

---

## Batch 4: Documentazione

### 4.1 `/docs/ai-agents-module.md`
- Schema DB con tutte le tabelle
- Flow API (proxy + webhook)
- Istruzioni deploy e configurazione

---

## Riepilogo file da creare/modificare

**Creare:**
- `src/modules/ai-agents/components/AgentSidebar.tsx`
- `src/modules/ai-agents/components/KnowledgeBaseDocumentList.tsx`
- `src/modules/ai-agents/components/PhoneNumberManager.tsx`
- `src/modules/ai-agents/hooks/useEdiliziaIntegration.ts`
- `src/modules/ai-agents/lib/elevenLabsClient.ts`
- `supabase/functions/elevenlabs-webhook/index.ts`
- `docs/ai-agents-module.md`

**Modificare:**
- `src/lib/sidebarConfig.ts` (aggiungere sottovoci mancanti)
- `src/modules/ai-agents/pages/PlatformSettingsPage.tsx` (salvataggio reale)
- `src/modules/ai-agents/pages/AgentCreditsPage.tsx` (costi + tabella per agente)
- `src/modules/ai-agents/pages/PlatformKnowledgeBasePage.tsx` (cartelle + RAG indicator)
- `src/modules/ai-agents/pages/AgentPhoneNumbersPage.tsx` (componente funzionale)
- `src/modules/ai-agents/pages/AgentEditorPage.tsx` (tab Sicurezza + Avanzato funzionali)
- `src/modules/ai-agents/lib/ediliziaSync.ts` (funzioni CRM)
- `supabase/config.toml` (aggiungere webhook)

