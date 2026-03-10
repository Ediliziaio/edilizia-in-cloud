

# Audit — AI Agents (Marketing/Sales Module)

## Bug trovati

### Bug 1 (P1): Publish/Activate senza prerequisiti — agente "attivo" ma non raggiungibile
**File:** `src/modules/ai-agents/pages/AgentEditorPage.tsx`, riga 286-291

`handlePublish` imposta `status: "active"` senza verificare prerequisiti minimi:
- `elevenlabs_agent_id` potrebbe essere `null` (creazione ElevenLabs fallita silenziosamente)
- Nessun numero di telefono collegato
- Nessun `system_prompt`

L'agente risulta "Attivo" nella lista ma non è raggiungibile da nessun canale. L'utente pensa che l'agente sia operativo.

**Fix:** Aggiungere validazione pre-publish nell'editor: verificare che `elevenlabs_agent_id` esista e che `system_prompt` non sia vuoto. Mostrare toast di errore se i prerequisiti non sono soddisfatti.

---

### Bug 2 (P1): Delete agente non esegue rollback se la cancellazione locale fallisce
**File:** `src/modules/ai-agents/hooks/useAgents.ts`, righe 122-148

`useDeleteAgent` prima cancella su ElevenLabs (riga 132-135), poi cancella nel DB locale (riga 138). Se la cancellazione DB fallisce (RLS, rete), l'agente è già stato rimosso dal provider esterno ma esiste ancora nel DB locale — ora è un orfano locale senza `elevenlabs_agent_id` funzionante. Qualsiasi operazione futura (update, test, chiamate) fallirà silenziosamente.

**Fix:** Invertire l'ordine: cancellare prima dal DB locale, poi da ElevenLabs. Se ElevenLabs fallisce, è accettabile (catch già presente), ma l'integrità locale è preservata.

---

### Bug 3 (P1): KB doc aggiunta solo in DB locale, non sincronizzata con ElevenLabs
**File:** `src/modules/ai-agents/components/AgentKBTab.tsx`, righe 84-108

`addDoc` inserisce il documento solo nella tabella `ai_agent_knowledge_docs` locale. Non chiama mai il proxy ElevenLabs (`add_kb_doc`) per sincronizzare il documento con l'agente sul provider. L'agente non ha accesso al documento durante le conversazioni reali.

Stessa cosa per `deleteDoc` (riga 110-124): cancella solo localmente senza chiamare `remove_kb_doc` sul provider.

**Fix:** Dopo l'insert locale, chiamare `callElevenLabsProxy({ action: "add_kb_doc", agent_id: elevenlabs_agent_id, payload: {...} })`. Per delete, chiamare `remove_kb_doc` prima della cancellazione locale.

---

### Bug 4 (P1): ProxyAction type manca `link_phone_number`
**File:** `src/modules/ai-agents/types/agent.types.ts`, righe 117-128

Il tipo `ProxyAction` non include `"link_phone_number"`. Il componente `PhoneNumberManager` usa `action: "link_phone_number" as never` (riga 146) per aggirare il type check. Questo nasconde errori a compile-time.

**Fix:** Aggiungere `"link_phone_number"` al tipo `ProxyAction`.

---

### Bug 5 (P1): Query keys AI Agents non nella factory
**Files:** `useAgents.ts`, `AgentAnalyticsTab.tsx`, `AgentKBTab.tsx`, `AgentTestTab.tsx`, `PhoneNumberManager.tsx`, `useEdiliziaIntegration.ts`

Tutte le query keys sono inline: `["ai-agents"]`, `["ai-agents", id]`, `["ai-agent-conversations", agentId]`, `["ai-kb-agent", agentId]`, `["ai-agent-phone-numbers"]`, `["ai-agent-tests", agentId]`, `["ai-agents-list-minimal"]`, `["ai-kb-global-count"]`, `["ai-conversations-contact", contactId]`. Nessuna è nella factory `queryKeys.ts`.

**Fix:** Aggiungere sezione `aiAgents` nella factory e migrare tutti gli usi nei componenti e hooks.

---

### Bug 6 (P2): Analytics seleziona `*` — carica transcript e metadata pesanti
**File:** `src/modules/ai-agents/components/AgentAnalyticsTab.tsx`, riga 29

La query carica `.select("*")` dalla tabella `ai_agent_conversations`, inclusi campi `transcript` (array JSON potenzialmente grande), `metadata`, `summary`. Per la tabella KPI servono solo 6 campi.

**Fix:** Usare `.select("id, status, duration_seconds, messages_count, appointment_created, started_at, elevenlabs_conversation_id, contact_id")`.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/modules/ai-agents/pages/AgentEditorPage.tsx` | Validazione prerequisiti pre-publish | Coerenza stato |
| `src/modules/ai-agents/hooks/useAgents.ts` | Invertire ordine delete (local first, EL second) | Integrità dati |
| `src/modules/ai-agents/components/AgentKBTab.tsx` | Sync KB docs con ElevenLabs via proxy | Integrazione esterna |
| `src/modules/ai-agents/types/agent.types.ts` | Aggiungere `link_phone_number` a ProxyAction | Type safety |
| `src/lib/queryKeys.ts` | Aggiungere sezione `aiAgents` | Standard |
| `src/modules/ai-agents/components/AgentAnalyticsTab.tsx` | Ottimizzare select analytics | Performance |
| + migrare query keys in: `useAgents.ts`, `AgentKBTab.tsx`, `AgentTestTab.tsx`, `PhoneNumberManager.tsx`, `useEdiliziaIntegration.ts` | | |

7+ file, 6 bug. Nessun cambio UX sostanziale. Backward-compatible.

