

## Piano: UNIF-AGE-03 — Agenti Vocali: ElevenLabs, Telefonia, Conversazioni

Il documento specifica 3 fasi: edge functions aggiornate, tab telefonia nuova, e pagina conversazioni con audio player. Analizzo cosa esiste gia e cosa va creato/aggiornato.

### Stato attuale

| Componente | Stato |
|---|---|
| `elevenlabs-proxy` | Esiste con architettura action-based (create_agent, update_agent, etc.) — diversa dal path-based del documento |
| `elevenlabs-webhook` | Esiste con logica completa (CRM, crediti, audit) — scrive su `ai_agent_conversations` (tabella legacy) |
| `PhoneNumberManager` | Esiste, completo con acquisto Telnyx, assegnazione agenti, sync EL |
| `TelephonyTab` | Non esiste — il documento ne propone una versione nuova |
| `ConversazioniTab` | Non esiste — solo `ContactAIConversations` (vista CRM per contatto) |
| `increment_agent_stats` RPC | Non esiste nel DB |
| `ai_conversations_v2` | Tabella creata nella migrazione precedente (UNIF-AGE-01) |

### Decisioni architetturali

1. **Proxy**: Il proxy attuale funziona bene con la logica action-based. Il documento propone un proxy path-based generico. Aggiungo le azioni mancanti (`get_conversations`, `get_conversation_audio`, `get_phone_numbers`) al proxy esistente invece di riscriverlo — cosi non rompo nulla.

2. **Webhook**: L'attuale scrive su `ai_agent_conversations` (legacy). Va aggiornato per scrivere anche su `ai_conversations_v2` e cercare agenti su `ai_agents_v2`. Aggiungere `increment_agent_stats` RPC per statistiche atomiche.

3. **Telefonia**: Creare `TelephonyTab.tsx` come da documento, che usa `ai_phone_numbers_v2` (creata in UNIF-AGE-01) e si integra con il proxy per sync numeri da EL e assegnazione agenti.

4. **Conversazioni**: Creare `ConversazioniTab.tsx` con lista filtri + `ConversazioneDetail` con audio player, trascrizione click-to-seek, riassunto AI. Query su `ai_conversations_v2`.

### Implementazione

#### 1. Migrazione SQL
- Creare RPC `increment_agent_stats` per aggiornamento atomico su `ai_agents_v2`
- Assicurarsi che `ai_conversations_v2` abbia tutti i campi necessari (gia creata)

#### 2. Edge Functions — Aggiornamenti

**`elevenlabs-proxy`** — aggiungere 3 nuove azioni:
- `get_conversations`: lista conversazioni da EL per un agente
- `get_conversation_audio`: fetch audio binario di una conversazione
- `get_phone_numbers`: lista numeri da EL

**`elevenlabs-webhook`** — aggiornare per:
- Cercare agenti su `ai_agents_v2` oltre che `ai_agents`
- Scrivere conversazioni su `ai_conversations_v2`
- Chiamare `increment_agent_stats` per stats atomiche

#### 3. Componenti Frontend

| File | Azione |
|---|---|
| `src/components/agenti/TelephonyTab.tsx` | Creare — tabella numeri, sync EL, assegnazione agenti |
| `src/components/agenti/ConversazioniTab.tsx` | Creare — lista conversazioni con filtri, dettaglio con audio player, trascrizione, riassunto |
| `src/pages/azienda/AgentiAIPage.tsx` | Aggiornare tab "Telefonia" per usare il nuovo `TelephonyTab` |

#### 4. Integrazione nella pagina principale

Nella tab "Telefonia" di `AgentiAIPage.tsx`, sostituire il lazy-load di `AgentPhoneNumbersPage` con il nuovo `TelephonyTab`. Aggiungere una nuova sub-route o tab per le conversazioni per agente (accessibile dalla card agente o come sub-pagina).

### File da creare/modificare

| File | Azione |
|---|---|
| Migrazione SQL | RPC `increment_agent_stats` |
| `supabase/functions/elevenlabs-proxy/index.ts` | +3 azioni (conversations, audio, phone numbers) |
| `supabase/functions/elevenlabs-webhook/index.ts` | Dual-write su v2, lookup su v2, call increment_agent_stats |
| `src/components/agenti/TelephonyTab.tsx` | Creare |
| `src/components/agenti/ConversazioniTab.tsx` | Creare (include ConversazioneDetail con player) |
| `src/pages/azienda/AgentiAIPage.tsx` | Aggiornare tab telefonia |

