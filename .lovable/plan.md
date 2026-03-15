

## Piano: UNIF-AGE-04 — Knowledge Base, WhatsApp, AgentDetailPage, Chat Conversazioni

Implementazione di 5 componenti principali dal documento, adattati allo schema DB e alle convenzioni gia esistenti nel progetto.

---

### Analisi stato attuale vs documento

| Elemento | Stato DB | Nota |
|---|---|---|
| `ai_knowledge_base_v2` | Esiste (colonne: titolo, tipo, url, contenuto, elevenlabs_doc_id, sincronizzato_el) | Mancano: category_id, sync_status, file_size, file_type, parole_chiave, utilizzi |
| `ai_whatsapp_numbers` | Esiste (colonne: numero, nome_account, phone_number_id, waba_id, stato) | Mancano: provider, webhook_verified, agent_id, messaggio_benvenuto, orario_attivo |
| `ai_chat_sessions` | Non esiste | Da creare |
| `ai_chat_messages` | Non esiste | Da creare |
| `ai_kb_categories` | Non esiste | Da creare |
| `kb-sync` edge function | Non esiste | Da creare |
| `AgentDetailPage` | Non esiste | Da creare |
| Storage bucket `ai-knowledge` | Non esiste | Da creare via SQL |

### Adattamenti rispetto al documento

1. **Il documento referenzia `ai_agents` e `ai_knowledge_base`** — noi usiamo `ai_agents_v2` e `ai_knowledge_base_v2`. Adatto tutti i riferimenti.
2. **Il documento usa `get_current_company_id()`** — noi usiamo `get_my_company_id()` (funzione gia esistente). Adatto le RLS.
3. **CHECK constraints nel documento** — li sostituisco con validation trigger come da linee guida.
4. **WhatsApp**: la tabella `ai_whatsapp_numbers` esiste gia con schema diverso. Aggiungo solo le colonne mancanti con ALTER TABLE.
5. **Il documento usa `react-dropzone`** — verifico se gia installato, altrimenti aggiungo.

---

### Fase 1 — Migrazione SQL

Una singola migrazione che:

1. **Crea `ai_kb_categories`** con RLS su `get_my_company_id()`
2. **ALTER `ai_knowledge_base_v2`**: aggiunge `category_id`, `sync_status`, `sync_error`, `file_size`, `file_type`, `parole_chiave`, `utilizzi`, `updated_at` — con trigger updated_at e validation trigger per sync_status
3. **ALTER `ai_whatsapp_numbers`**: aggiunge `provider`, `webhook_verified`, `agent_id` (FK a `ai_agents_v2`), `messaggio_benvenuto`, `messaggio_fuori_orario`, `orario_attivo`, `updated_at`
4. **Crea `ai_chat_sessions`** con RLS su company_id
5. **Crea `ai_chat_messages`** con RLS via session join
6. **Crea RPC `update_kb_sync_status`** e `get_agent_chat_stats`**
7. **Crea indici** per performance
8. **Crea storage bucket** `ai-knowledge` con policy company-scoped

### Fase 2 — Edge Function `kb-sync`

Nuova edge function `supabase/functions/kb-sync/index.ts`:
- Azioni: `sync_document`, `attach_to_agent`, `delete_document`
- Legge api key da `ai_elevenlabs_config`
- Chiama ElevenLabs Knowledge Base API
- Aggiorna sync_status via RPC

### Fase 3 — Componenti Frontend

| File | Descrizione |
|---|---|
| `src/components/agenti/KnowledgeBaseTab.tsx` | Sostituzione del lazy-load di PlatformKnowledgeBasePage. Tabella documenti con filtri sync, modal aggiunta (file/url/testo), sync EL, eliminazione |
| `src/components/agenti/WhatsAppTabUnified.tsx` | Sostituzione del placeholder AgentWhatsAppPage. Card numeri con assegnazione agenti, config messaggi, modal aggiunta con selezione provider |
| `src/components/agenti/ChatConversazioniTab.tsx` | Split-panel: lista sessioni chat con filtri + dettaglio messaggi stile chat bubble |
| `src/pages/azienda/AgentDetailPage.tsx` | Pagina dettaglio agente con sub-tab: Panoramica, Configurazione, Conversazioni, Statistiche. Route: `/azienda/agenti-ai/:agentId` |

### Fase 4 — Integrazione

1. **`AgentiAIPage.tsx`**: Sostituire lazy-load di `PlatformKnowledgeBasePage` con `KnowledgeBaseTab` e `AgentWhatsAppPage` con `WhatsAppTabUnified`
2. **`companyRoutes.tsx`**: Aggiungere route `agenti-ai/:agentId` per `AgentDetailPage`
3. **`AgentCardUnified.tsx`**: Il click su "Configura" naviga a `/azienda/agenti-ai/:agentId`
4. **`AgentiTab.tsx`**: Il click sulla card naviga al detail page

### File da creare/modificare

| File | Azione |
|---|---|
| Migrazione SQL | Creare tabelle, alter, RPC, indici, storage |
| `supabase/functions/kb-sync/index.ts` | Creare edge function |
| `src/components/agenti/KnowledgeBaseTab.tsx` | Creare |
| `src/components/agenti/WhatsAppTabUnified.tsx` | Creare |
| `src/components/agenti/ChatConversazioniTab.tsx` | Creare |
| `src/pages/azienda/AgentDetailPage.tsx` | Creare |
| `src/pages/azienda/AgentiAIPage.tsx` | Aggiornare import tab KB e WhatsApp |
| `src/routes/companyRoutes.tsx` | Aggiungere route detail |
| `src/components/agenti/AgentCardUnified.tsx` | Aggiornare click handler per navigazione |

