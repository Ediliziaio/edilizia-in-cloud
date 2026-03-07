

# Verifica Modulo AI Agents — Gap Analysis

## Stato attuale vs Specifica

### DATABASE — ✅ Implementato / ❌ Mancante

| Tabella | Stato | Note |
|---------|-------|------|
| `ai_agents` | ✅ | Corretto, usa `company_id`, RLS con `get_my_company_id()` |
| `ai_agent_knowledge_docs` | ✅ | OK, `agent_id` nullable per KB globale |
| `ai_agent_conversations` | ✅ | Usa `contact_id` (→ marketing_contacts) invece di `lead_id` — accettabile |
| `ai_agent_credits` | ⚠️ | Mancano colonne `cost_per_minute_platform` e `cost_per_minute_billed` dalla spec |
| `platform_elevenlabs_config` | ✅ | OK |
| `ai_agent_audit_log` | ✅ | OK |
| **`ai_agent_phone_numbers`** | ❌ | **Tabella completamente mancante** dalla migration |

### EDGE FUNCTIONS — ✅ / ❌

| Funzione | Stato | Note |
|----------|-------|------|
| `elevenlabs-proxy` | ✅ | Funzionale con auth, CORS, audit log |
| `elevenlabs-webhook` | ❌ | **Non implementata** — spec richiede webhook per post-conversazione, sync CRM, decremento crediti |

### FRONTEND — File per file

| File spec | Stato | Gap |
|-----------|-------|-----|
| `index.tsx` | ✅ | Routing completo con lazy loading |
| `AgentsListPage.tsx` | ✅ | Lista + wizard creazione + delete dialog |
| `AgentEditorPage.tsx` | ⚠️ | Manca tab **Branch** e tab **Test**. I tab Workflow, Strumenti, Sicurezza, Avanzato sono placeholder |
| `AgentTab.tsx` | ⚠️ | Mancano: toggle "Personalità predefinita", "Imposta fuso orario", sezione "Trascrizione e riassunto post-chiamata" |
| `VoiceSelector.tsx` | ⚠️ | Solo voci hardcoded, nessun fetch da API. Mancano: pannello laterale con filtri (Lingua/Accento/Categoria/Genere/Età), slider Stabilità/Velocità/Somiglianza, famiglia modelli TTS, toggle "Modalità Espressiva" |
| `LLMSelector.tsx` | ⚠️ | Mancano: backup LLM, Temperatura slider, Budget di riflessione toggle, Limite token |
| `CreateAgentWizard.tsx` | ✅ | 2 step funzionanti |
| `AgentKBTab.tsx` | ⚠️ | Manca pulsante "Configura RAG", filtro per Tipo/Creatore, supporto file upload |
| `AgentAnalyticsTab.tsx` | ⚠️ | Solo KPI. Mancano: tabella conversazioni con filtri, riga espandibile trascrizione, pannello criteri valutazione, raccolta dati |
| `AgentWidgetTab.tsx` | ✅ | Widget + iframe + preview |
| `PlatformKnowledgeBasePage.tsx` | ⚠️ | Mancano: pulsante "Crea cartella", indicatore "Archiviazione RAG: X B / 1.0 MB" |
| `AgentCreditsPage.tsx` | ⚠️ | Mancano: storico ricariche, tabella utilizzo mensile per agente, costo per minuto fatturato |
| `PlatformSettingsPage.tsx` | ⚠️ | Test connessione è mock (setTimeout). Salvataggio non implementato. Manca whitelist domini |
| `AgentPhoneNumbersPage.tsx` | ✅ placeholder | Corretto come placeholder |
| `AgentWhatsAppPage.tsx` | ✅ placeholder | Corretto come placeholder |
| **`AgentSidebar.tsx`** | ❌ | **Non creato** — spec richiede sotto-navigazione nel modulo |
| **`KnowledgeBaseDocumentList.tsx`** | ❌ | Non creato come componente riusabile |
| **`PhoneNumberManager.tsx`** | ❌ | Non creato |
| **`AnalyticsTable.tsx`** | ❌ | Non creato |
| **`ConversationPlayer.tsx`** | ❌ | Non creato |
| **`WorkflowCanvas.tsx`** | ❌ | Non creato |
| **`CreditUsageBar.tsx`** | ❌ | Non creato |

### HOOKS / LIB — ❌ Mancanti

| File spec | Stato |
|-----------|-------|
| `useAgentCredits.ts` | ❌ |
| `useEdiliziaIntegration.ts` | ❌ |
| `lib/elevenLabsClient.ts` | ❌ (funzionalità in useElevenLabsProxy) |
| `lib/creditCalculator.ts` | ❌ |
| `lib/ediliziaSync.ts` | ❌ |

### TYPES — ❌ Mancanti

| File spec | Stato |
|-----------|-------|
| `knowledgeBase.types.ts` | ❌ (tipi inline nei componenti) |
| `phoneNumber.types.ts` | ❌ |

### SIDEBAR — ⚠️ Parziale

La sidebar ha una singola voce "Agente AI" che punta a `/azienda/marketing/agente-ai`. La spec richiede **sottovoci**: Agenti, Knowledge Base, Numeri di Telefono, WhatsApp, Crediti & Utilizzo, Impostazioni. Attualmente queste sotto-pagine esistono come route ma **non sono navigabili dalla sidebar** — l'utente deve conoscere gli URL.

### INTEGRAZIONE CRM — ❌ Non implementata

Nessuna delle seguenti funzionalità è stata implementata:
- Sync post-conversazione con CRM (webhook → lead/appointment creation)
- Visualizzazione conversazioni nella scheda Lead
- Strumenti EdiliziaInCloud nativi (get_lead_info, create_appointment, etc.)
- Decremento automatico crediti

### EDGE FUNCTION AUTH — ⚠️

L'edge function usa `getClaims()` che potrebbe non essere disponibile in tutte le versioni del client Supabase. Il pattern più robusto è `getUser()`.

### DOCUMENTAZIONE — ❌

Il file `/docs/ai-agents-module.md` non è stato creato.

---

## Piano di correzione — Priorità

### Priorità 1: Funzionalità core mancanti

1. **Migration SQL**: Aggiungere tabella `ai_agent_phone_numbers` + colonne mancanti su `ai_agent_credits` (`cost_per_minute_platform`, `cost_per_minute_billed`)
2. **Sidebar con sottovoci**: Creare navigazione interna al modulo AI Agents (AgentSidebar o espandere sidebarConfig)
3. **VoiceSelector potenziato**: Fetch voci da API via proxy, pannello laterale con filtri, slider stabilità/velocità/somiglianza
4. **LLMSelector potenziato**: Aggiungere temperatura slider, backup LLM, limite token
5. **AgentTab completamento**: Toggle personalità, fuso orario, trascrizione post-chiamata
6. **PlatformSettingsPage**: Implementare salvataggio reale su DB + test connessione reale via edge function
7. **Edge function auth fix**: Sostituire `getClaims()` con `getUser()`

### Priorità 2: Tab editor mancanti

8. **Tab Branch**: Tabella branch con divisione traffico
9. **Tab Test**: Area test con esecuzioni precedenti
10. **AgentAnalyticsTab potenziato**: Tabella conversazioni filtrabili con trascrizione espandibile

### Priorità 3: Integrazioni e automazioni

11. **`elevenlabs-webhook` edge function**: Riceve eventi post-conversazione
12. **`ediliziaSync.ts`**: Sync CRM/calendario/crediti
13. **Strumenti EdiliziaInCloud nativi**: Tool definitions per il workflow
14. **Decremento crediti automatico**

### Priorità 4: Componenti di supporto e tipi

15. **Estrarre tipi**: `knowledgeBase.types.ts`, `phoneNumber.types.ts`
16. **Componenti riusabili**: `CreditUsageBar`, `AnalyticsTable`, `ConversationPlayer`
17. **WorkflowCanvas**: Canvas drag-and-drop con nodi
18. **Documentazione**: `/docs/ai-agents-module.md`

---

## Riepilogo

Lo scheletro è solido: routing, DB principale, edge function proxy, lista agenti, editor con tab base funzionante. Tuttavia circa il **40% della specifica** non è ancora implementato:
- La navigazione interna (sottovoci sidebar) è completamente assente
- VoiceSelector e LLMSelector sono versioni minimal
- Tab Branch, Test e Analytics avanzati mancano
- L'integrazione CRM/Calendario non esiste
- Il webhook ElevenLabs non è implementato
- La tabella phone_numbers non è nel DB
- PlatformSettings non salva realmente

Consiglio di procedere con le Priorità 1 e 2 nel prossimo step.

