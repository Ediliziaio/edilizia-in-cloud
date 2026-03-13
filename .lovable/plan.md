

## AI-UNIF-01 — Analisi Critica e Piano

### Problema Fondamentale

Il prompt assume una tabella `ai_agents` unificata con campi come `capabilities`, `modello`, `provider`, `temperatura`, `system_prompt`, `chat_abilitata`, etc. Ma la realtà è diversa:

| Tabella esistente | Schema reale |
|---|---|
| `ai_agents` | Agenti ElevenLabs voice: `elevenlabs_id`, `voice_id`, `auto_end_on_silence`, `language`, `first_message`, etc. — 40+ campi specifici ElevenLabs |
| `internal_ai_agents` | Agenti interni ElevenLabs: `agent_type`, `phone_number_id`, `elevenlabs_agent_id`, etc. |

Entrambe le tabelle sono **strettamente accoppiate** con l'integrazione ElevenLabs tramite edge function `elevenlabs-proxy`. Hanno 8 tabelle satellite ciascuna (conversations, knowledge_docs, phone_numbers, branches, credits, tests, audit_log, actions).

Il prompt propone di sostituire tutto con un sistema generico `ai_agents` con `modello: claude-sonnet-4-6` e `provider: anthropic` — questo **distruggerebbe** l'intera integrazione ElevenLabs.

### Stato Attuale della UI

`AgentiAIUnified.tsx` **esiste già** con 2 tab funzionanti:
- **Agenti Esterni** → modulo completo `AIAgentsModule` (con sidebar, editor, knowledge base, crediti, numeri telefono, WhatsApp, impostazioni)
- **Agenti Interni** → modulo completo `InternalAIAgentsModule`

### Cosa si può fare in sicurezza

Aggiungere una **Template Gallery** come layer visuale sopra i moduli esistenti, senza toccare le tabelle. Questo richiederebbe però una nuova tabella `ai_agent_templates` separata dalle tabelle ElevenLabs esistenti, e i template non potrebbero creare agenti reali (perché la creazione agenti passa per ElevenLabs API).

### Raccomandazione

**Non implementare questo prompt.** La pagina Agenti AI è già unificata con tab funzionanti. Il sistema ElevenLabs è complesso e maturo. Aggiungere un layer di template generico che non si collega al backend reale creerebbe confusione senza valore funzionale.

Se si vuole una template gallery per gli agenti, dovrebbe essere progettata specificamente per il flusso ElevenLabs (pre-compilare i campi del form di creazione agente ElevenLabs), non come sistema parallelo generico.

### Alternativa Minima (se si vuole procedere)

Se l'obiettivo è avere template pre-configurati per velocizzare la creazione agenti:

1. **Creare tabella `ai_agent_templates`** con campi generici (nome, descrizione, icona, system_prompt suggerito, categoria)
2. **Aggiungere un bottone "Crea da template"** nel modulo AIAgentsModule esistente che pre-compila il form di creazione agente ElevenLabs
3. **Seed con 12 template** per il settore edilizia
4. **Nessuna modifica** ai moduli esistenti, solo un entry point aggiuntivo

Questa alternativa richiederebbe circa 3 file nuovi e 1 migrazione, mantenendo intatta tutta l'architettura ElevenLabs.

