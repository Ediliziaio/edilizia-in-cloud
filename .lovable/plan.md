

# Analisi Completa — Documento "Integrazione Agenti AI ElevenLabs"

Il documento è diviso in 3 parti: (1) analisi di completezza, (2) prompt con 12 fix + 1 feature, (3) checklist post-deploy. Ecco la verifica punto per punto contro il codice attuale.

---

## PARTE 1: Stato Attuale — Conferma dell'Analisi del Documento

Il documento classifica correttamente ogni funzionalità. Confermo dopo ispezione del codice:

| Funzionalità | Documento dice | Codice reale | Match? |
|---|---|---|---|
| CreateAgentWizard | OK | ✅ Funziona | ✅ |
| AgentsListPage | OK | ✅ Funziona | ✅ |
| AgentEditorPage 10 tab | OK | ✅ 10 tab presenti | ✅ |
| Tab Agente auto-save | OK | ✅ Debounced 1.5s | ✅ |
| Tab KB | OK (manca sync EL) | ✅ Solo DB, no sync EL | ✅ |
| Tab Widget | OK | ✅ | ✅ |
| Tab Analytics | OK | ✅ | ✅ |
| Tab Strumenti | DEMO | ✅ Solo useState locale | ✅ |
| Tab Test | DEMO | ✅ Solo stato locale | ✅ |
| Tab Branch | DEMO | ✅ UI senza logica | ✅ |
| Tab Workflow | DEMO | ✅ Canvas placeholder | ✅ |
| Tab Sicurezza | DEMO | ✅ `toast.info('demo')` riga 104 | ✅ |
| Tab Avanzato | DEMO | ✅ `toast.info('demo')` riga 204 | ✅ |
| VoiceSelector | OK | ✅ | ✅ |
| LLMSelector | OK | ✅ | ✅ |
| AgentCreditsPage | OK | ✅ Funziona pay-per-use | ✅ |
| PlatformSettingsPage | PARZIALE | ✅ `handleSave` = solo toast | ✅ |
| handleArchive | MANCANTE | ✅ Funzione vuota riga 27 | ✅ |
| Auto-recharge UI | MANCANTE | ✅ Switch `disabled` riga 157 | ✅ |
| API key su DB | MANCANTE | ✅ Non salvata | ✅ |
| `platform_settings` table | MANCANTE (dice doc) | ❌ **GIÀ ESISTE** — tabella creata in migration precedente | Parziale |

**Nota importante**: Il documento dice che `platform_settings` è mancante, ma la tabella esiste già nel DB con migration `20260224070707` e viene usata da `manage-super-admins` per Meta e Maps settings. Inoltre esiste già `_shared/getPlatformSetting.ts` come utility.

---

## PARTE 2: I 12 Fix + 1 Feature — Cosa Fare

### FIX 1: `verify_jwt` su `elevenlabs-proxy`
Il documento chiede di cambiare da `false` a `true`. **ATTENZIONE**: nel contesto di Lovable Cloud, `verify_jwt = false` è la pratica standard perché il JWT signing-keys system non funziona con `verify_jwt = true`. La funzione già valida l'auth internamente con `getUser()`. **Questo fix NON va applicato** — il documento è errato su questo punto.

### FIX 2: Salvataggio API Key ElevenLabs su DB
- `platform_settings` esiste già → basta usare la tabella esistente
- `handleSave()` in `PlatformSettingsPage` è un toast placeholder → va implementato con upsert su `platform_settings` key='elevenlabs_api_key'
- `elevenlabs-proxy` già ha fallback pattern in `_shared/getPlatformSetting.ts` → va integrato
- Banner rosso se API key non configurata → da aggiungere
- **Complessità: Media**

### FIX 3: handleArchive in AgentsListPage
- Funzione vuota alla riga 27 → implementare con `useUpdateAgent` per status='archived'
- Aggiungere AlertDialog conferma + filtro/toggle archiviati
- **Complessità: Bassa**

### FIX 4: Tab Strumenti — Persistenza
- Toggle solo `useState` locale → creare tabella `ai_agent_tools_config` + upsert su toggle
- Aggiungere dialog "Aggiungi strumento personalizzato"
- **Complessità: Media**

### FIX 5: Tab Sicurezza + Avanzato — Persistenza
- Toast demo → salvare su colonne `ai_agents` (migration per aggiungere colonne)
- Convertire in componenti standalone con props agent/onSave
- **Complessità: Media**

### FIX 6: Tab Test — Implementazione reale
- Solo stato locale → tabella `ai_agent_tests` + form creazione + esecuzione simulata
- **Complessità: Alta** (richiede logica di esecuzione test)

### FIX 7: Auto-ricarica crediti — Form modificabile
- Switch `disabled` → abilitare + form soglia/importo/metodo
- Salvare con upsert su `ai_credits`
- **Complessità: Bassa**

### FIX 8: Sincronizzazione KB con ElevenLabs
- Aggiungere actions `add_kb_doc`, `remove_kb_doc`, `list_kb_docs`, `sync_kb` al proxy
- Badge "Sincronizzato"/"Solo locale" basato su `elevenlabs_doc_id`
- **Complessità: Media-Alta**

### FIX 9: Conversazioni AI nel CRM (tab Lead)
- Aggiungere sezione nel dettaglio contatto che mostra conversazioni AI
- Query su `ai_agent_conversations WHERE contact_id = ...`
- **Complessità: Media**

### FIX 10: Messaggio errore UI quando API key mancante
- Intercettare errore "Chiave API non configurata" nei hook e mostrare banner
- **Complessità: Bassa**

### FIX 11: Webhook HMAC signature verification
- Verificare `xi-signature` con HMAC-SHA256 nel webhook
- Fallback se secret non configurato
- **Complessità: Bassa**

### FIX 12: .env.example + SETUP.md
- Documentazione → creare file
- **Complessità: Bassa**

### FEATURE: MarketingAiAgent.tsx
- Pagina quasi vuota → aggiungere riepilogo saldo, link rapidi, stato connessione EL
- **Complessità: Bassa**

---

## PARTE 3: Checklist Post-Deploy

Questa parte NON è implementabile da Lovable — sono azioni manuali:
1. Aggiungere `ELEVENLABS_API_KEY` come secret
2. Configurare webhook URL su ElevenLabs dashboard
3. Deploy edge functions (automatico su Lovable Cloud)
4. Migrations (automatiche su Lovable Cloud)
5. Test end-to-end

---

## Piano di Implementazione Proposto

Data la dimensione (12 fix + 1 feature), propongo di suddividere in 3 blocchi:

**Blocco A — Critici e Quick Wins** (FIX 2, 3, 7, 10, 12, Feature MarketingAiAgent):
- API key save su DB + banner errore
- handleArchive implementato
- Auto-recharge form abilitato
- .env.example + SETUP.md
- MarketingAiAgent migliorato

**Blocco B — Persistenza Tab** (FIX 4, 5, 11):
- Tab Strumenti con DB persistence + custom tools dialog
- Tab Sicurezza/Avanzato con colonne DB + save reale
- Webhook HMAC verification

**Blocco C — Funzionalità Avanzate** (FIX 6, 8, 9):
- Tab Test con tabella DB + runner
- Sync KB con ElevenLabs API
- Conversazioni AI nel CRM

Vuoi procedere con tutti e 3 i blocchi in sequenza, o partire dal Blocco A?

