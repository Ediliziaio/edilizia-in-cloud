

# Audit Completo Modulo AI Agents — Piano di Fix

## Analisi completata: 19 componenti, 4 hook, 3 lib, 3 types, 7 pagine, 3 edge functions

---

## 1. CODICE MORTO / NON UTILIZZATO DA RIMUOVERE

### File `ediliziaSync.ts` — Completamente inutilizzato
Nessun file importa `ediliziaSync.ts`. Le funzioni `syncConversationToCRM`, `decrementCredits`, `getConversationsForContact`, `getAgentUsageStats` non sono mai chiamate. La logica equivalente è gestita server-side nel webhook e client-side nei hook dedicati (`useEdiliziaIntegration.ts`, `useAgentCredits.ts`).

**Azione**: Eliminare `src/modules/ai-agents/lib/ediliziaSync.ts`

### File `ConversationPlayer.tsx` — Mai importato
Nessun componente usa `ConversationPlayer`. È un placeholder "in sviluppo".

**Azione**: Eliminare `src/modules/ai-agents/components/ConversationPlayer.tsx`

### File `useElevenLabsProxy.ts` vs `elevenLabsClient.ts` — Duplicazione
`useElevenLabsProxy.ts` e `elevenLabsClient.ts` fanno la stessa cosa (invoke `elevenlabs-proxy`). Il proxy hook è usato da `useAgents.ts`, il client è usato da `PlatformSettingsPage.tsx` (solo `testConnection`).

**Azione**: Consolidare — `elevenLabsClient.ts` è un wrapper ridondante. Cambiare `PlatformSettingsPage` per usare `callElevenLabsProxy` direttamente, poi eliminare `elevenLabsClient.ts`.

### Type `AIAgentPhoneNumber` — Alias non usato
In `phoneNumber.types.ts`, `AIAgentPhoneNumber` è un alias di `PhoneNumber` mai importato.

**Azione**: Rimuovere l'alias.

### `decrementCredits()` in `ediliziaSync.ts` usa la tabella legacy `ai_agent_credits`
Anche se il file verrà eliminato, è importante notare che questa funzione usa la vecchia tabella invece di `ai_credits` + `deduct_ai_credits` RPC.

---

## 2. BUG FUNZIONALI DA CORREGGERE

### BUG 1: `AnalyticsTable.tsx` — React fragment senza key
Riga 96: `<>` wrappa due `<TableRow>` dentro un `.map()` senza `key` sul fragment. React emetterà un warning e potrebbe avere problemi di rendering.

**Fix**: Usare `<Fragment key={conv.id}>` invece di `<>`.

### BUG 2: `AgentsListPage.tsx` — `useUpdateAgent` si ricrea ad ogni render
Riga 33: `useUpdateAgent(archiveId ?? undefined)` cambia ad ogni cambio di `archiveId`, causando la ricreazione della mutation. Questo è un antipattern: la mutation potrebbe perdersi a metà esecuzione se `archiveId` cambia.

**Fix**: Usare un pattern stabile — passare l'id direttamente nella `mutationFn` piuttosto che nel hook.

### BUG 3: `AgentTab.tsx` — `defaultPersonality` e `transcriptionEnabled` non salvati
Le variabili `defaultPersonality` e `transcriptionEnabled` sono solo `useState` locale, mai persistite. L'utente li toglia e al refresh tornano ai valori iniziali.

**Fix**: O rimuoverli come toggle cosmetici (con nota "prossimamente") o aggiungerli al save debounced.

### BUG 4: `VoiceSelector` — Voice settings (stability, speed, similarity) non persistite
I slider nello Sheet chiamano `onStabilityChange`, `onSpeedChange`, `onSimilarityChange` che non sono passati da `AgentTab`. I valori non vengono mai salvati.

**Fix**: Passare le callback da `AgentTab` che triggherano il save debounced, oppure disabilitare temporaneamente i slider con nota "prossimamente".

### BUG 5: `LLMSelector` — `backupMode`, `thinkingBudget` sono solo stato locale
Stessa situazione: cambi persi al refresh.

**Fix**: Aggiungere nota visiva "Prossimamente" o persistere su DB.

### BUG 6: `AgentWidgetTab` — `position`, `primaryColor`, `showBranding` non usati nel codice embed
Questi state non influenzano il codice generato. `primaryColor` e `showBranding` non appaiono nel template.

**Fix**: Rimuovere i toggle inutilizzati oppure integrarli nel template embed.

---

## 3. MIGLIORAMENTI UX

### UX 1: `AgentToolsTab` — Loading state mancante
Riga 136: `if (isLoading) return null;` — nessun feedback visivo durante il caricamento. L'utente vede un flash vuoto.

**Fix**: Sostituire con Skeleton loader.

### UX 2: `AgentBranchTab` — Nessuna indicazione "demo"
Il tab Branch è completamente locale (useState), ma non c'è alcuna indicazione per l'utente che è in sviluppo.

**Fix**: Aggiungere banner "Funzionalità in fase di sviluppo" come nel tab WhatsApp.

### UX 3: `WorkflowCanvas` — Nessuna indicazione "demo"
Stessa situazione del Branch — canvas locale senza persistenza e senza nota.

**Fix**: Aggiungere banner.

### UX 4: `AgentWidgetTab` — Variabili `primaryColor` e `showBranding` unused
Creano confusione UX perché l'utente vede opzioni che non fanno nulla.

**Fix**: Rimuovere i toggle non funzionali.

### UX 5: `PhoneNumberManager` — Pulsante "Acquista numero" ha `disabled` + `onClick`
Il pulsante è disabilitato ma ha un `onClick` con toast che non verrà mai eseguito perché è `disabled`.

**Fix**: Rimuovere `disabled` e lasciare solo il toast informativo, oppure rimuovere `onClick`.

---

## 4. PULIZIA CODICE

### CLEAN 1: `AgentCreditsPage.tsx` — Import `supabase` diretto + casting `as never`
L'uso pervasivo di `as never` in tutto il modulo è necessario finché i tipi Supabase non vengono aggiornati. Non è un bug ma codice sporco — non va toccato perché funzionale.

### CLEAN 2: `AgentWidgetTab` — Variabili `primaryColor`, `showBranding` dichiarate ma mai usate nel render
Rimuovere le variabili non utilizzate.

---

## Piano di Implementazione (ordinato per impatto)

| # | Tipo | File | Cosa |
|---|------|------|------|
| 1 | Elimina | `ediliziaSync.ts` | File morto, 0 import |
| 2 | Elimina | `ConversationPlayer.tsx` | Componente mai usato |
| 3 | Fix | `AnalyticsTable.tsx` | Fragment key in map |
| 4 | Fix | `AgentsListPage.tsx` | Stabilizzare useUpdateAgent per archive |
| 5 | Fix | `AgentToolsTab.tsx` | Skeleton loader al posto di `return null` |
| 6 | Fix | `PhoneNumberManager.tsx` | Pulsante disabled/onClick conflitto |
| 7 | UX | `AgentBranchTab.tsx` | Banner "in sviluppo" |
| 8 | UX | `WorkflowCanvas.tsx` | Banner "in sviluppo" |
| 9 | Clean | `AgentWidgetTab.tsx` | Rimuovere state unused (`primaryColor`, `showBranding`) |
| 10 | Clean | `elevenLabsClient.ts` | Consolidare in `useElevenLabsProxy` |
| 11 | Clean | `phoneNumber.types.ts` | Rimuovere alias unused |
| 12 | UX | `AgentTab.tsx` | Marcare toggle non-persistiti come "prossimamente" |
| 13 | UX | `LLMSelector.tsx` | Marcare settings non-persistiti come "prossimamente" |

