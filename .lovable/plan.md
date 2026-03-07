
# Verifica Modulo AI Agents — Stato aggiornato

## Completato in questo step

### Priorità 1 ✅
1. ✅ **Migration SQL**: Tabella `ai_agent_phone_numbers` + colonne `cost_per_minute_platform`/`cost_per_minute_billed` su `ai_agent_credits`
2. ✅ **Sidebar sottovoci**: Aggiunte voci "Agenti AI", "KB Globale", "Crediti AI" nella sidebar marketing
3. ✅ **VoiceSelector potenziato**: Filtri genere, search, pannello laterale con slider stabilità/velocità/somiglianza, famiglia TTS, toggle modalità espressiva
4. ✅ **LLMSelector potenziato**: Collapsible con temperatura slider, backup LLM, limite token, budget riflessione
5. ✅ **AgentTab completamento**: Toggle personalità predefinita, fuso orario, trascrizione post-chiamata
6. ✅ **Edge function auth fix**: Sostituito `getClaims()` con `getUser()`

### Priorità 2 ✅
7. ✅ **Tab Branch**: Tabella branch con divisione traffico + crea/elimina
8. ✅ **Tab Test**: Area test con esecuzioni precedenti
9. ✅ **Tab Workflow**: Canvas con nodi drag + toolbar zoom + nodi EdiliziaInCloud
10. ✅ **Tab Strumenti**: Strumenti sistema con toggle + strumenti nativi EdiliziaInCloud
11. ✅ **AgentAnalyticsTab potenziato**: Tabella conversazioni filtrabili con riga espandibile

### Componenti e tipi ✅
12. ✅ `knowledgeBase.types.ts` + `phoneNumber.types.ts`
13. ✅ `CreditUsageBar.tsx` + `AnalyticsTable.tsx` + `ConversationPlayer.tsx` + `WorkflowCanvas.tsx`
14. ✅ `useAgentCredits.ts` hook
15. ✅ `lib/creditCalculator.ts` + `lib/ediliziaSync.ts`

## Da fare (prossimi step)

### Priorità 3: Integrazioni
- `elevenlabs-webhook` edge function
- PlatformSettingsPage con salvataggio reale su DB
- Decremento crediti automatico via webhook
- Visualizzazione conversazioni nella scheda Lead CRM

### Priorità 4: Raffinamenti
- Sicurezza tab (whitelist domini, rate limiting)
- Avanzato tab (timeout, max durata)
- `/docs/ai-agents-module.md`
