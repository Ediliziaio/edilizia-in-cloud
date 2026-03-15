

## Piano: UNIF-AGE-02 — AgentCard Avanzata + Wizard Creazione Multi-Step

Implementazione delle specifiche dal documento caricato. Due componenti principali da riscrivere.

---

### 1. AgentCard Avanzata (`AgentCardUnified.tsx`)

Riscrivere la card attuale con il design specificato nel documento:

- **Header colorato per tipo** (bg diverso per vocale/chat/whatsapp/interno/campagna)
- **Avatar + badge tipo** con icona e label colorata
- **Toggle attivo/pausa** (bottone Play/Pause in-line, no dropdown)
- **Menu kebab** con: Configura, Conversazioni, Duplica, Elimina
- **Badge stato** con dot animato per "attivo"
- **Badge EL** (Zap icon) se `elevenlabs_agent_id` presente
- **Descrizione** troncata a 2 righe
- **Voice nome** per tipo vocale
- **Metriche contestuali per tipo**: vocale/campagna mostrano Chiamate+Minuti+Tasso, chat/whatsapp mostrano Chat+Utenti+Soddisfazione, interno mostra Richieste+Tempo+Risolte
- **Footer** con 2 bottoni: "Configura" e "Chiamate"/"Chat" (in base al tipo)
- **Mutation Duplica**: seleziona l'agente, clona senza stats/ID, inserisce come bozza

Hook necessario: aggiungere `useDuplicateUnifiedAgent` in `useUnifiedAgents.ts`

### 2. Wizard Creazione Multi-Step (`AgentCreateModal.tsx`)

Sostituire il form single-step con un wizard adattivo:

**Step per tipo:**
- vocale: tipo -> identita -> voce -> comportamento -> review
- chat: tipo -> identita -> chat_config -> review
- whatsapp: tipo -> identita -> whatsapp_config -> review
- interno: tipo -> identita -> review
- campagna: tipo -> identita -> voce -> campagna_config -> review

**Step implementati:**
- `StepTipo`: 5 card grandi con icona, titolo, descrizione, esempi d'uso
- `StepIdentita`: nome, scopo (chip selezionabili che auto-popolano il system_prompt), prompt di sistema con textarea, primo messaggio, variabili dinamiche hint
- `StepVoce`: lista voci ElevenLabs italiane con preview audio play, slider temperatura
- `StepComportamento`: toggle risposta automatica, registra chiamate, trascrivi, rileva segreteria, squilli max, durata max
- `StepChatConfig`: titolo widget, colore (preset + custom picker), posizione (dropdown)
- `StepReview`: riepilogo con avatar, badge tipo, prompt, voce selezionata, note stato bozza

**UI wizard:**
- Progress bar in alto
- Step indicators numerati con check per completati
- Footer con Indietro/Avanti/Crea agente
- Dialog shadcn come contenitore (max-w-lg)

**DEFAULT_PROMPTS**: prompt pre-compilati per ogni combinazione tipo+scopo (dal documento)

### 3. AgentiTab — Aggiornamento

Minimo: aggiornare import per usare la nuova AgentCard (passare `onDuplicate` e `onNavigateConversations`).

### File da modificare

| File | Azione |
|---|---|
| `src/components/agenti/AgentCardUnified.tsx` | Riscrivere con header colorato, toggle, stats contestuali, footer, duplica |
| `src/components/agenti/AgentCreateModal.tsx` | Riscrivere come wizard multi-step adattivo |
| `src/components/agenti/AgentiTab.tsx` | Aggiornare props card + aggiungere handler duplica |
| `src/hooks/useUnifiedAgents.ts` | Aggiungere `useDuplicateUnifiedAgent` |

