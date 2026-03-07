

# FIX 10: Conversazioni AI nel Profilo Contatto — Analisi

## Stato attuale

La funzionalità richiesta è **già parzialmente implementata**:

- `contact_id` esiste già nella tabella `ai_agent_conversations` con FK a `marketing_contacts`
- Il tab "Conversazioni AI" esiste già nella sidebar destra del profilo contatto (riga 281)
- Il componente `ContactAIConversations` è importato e renderizzato (riga 1186-1188)
- Il webhook `elevenlabs-webhook` salva già `contact_id` quando elabora tool calls

## Cosa manca

La tabella `ai_agent_conversations` **non ha** i campi `summary`, `transcript`, `metadata`/`sentiment`. Il componente attuale mostra solo info base (durata, messaggi, status). Per completare il FIX servono:

### 1. Migrazione DB — aggiungere colonne
```sql
ALTER TABLE ai_agent_conversations
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS transcript jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
```

### 2. Aggiornare `elevenlabs-webhook/index.ts`
- Il webhook riceve già `transcript` e `metadata` dal body ma non li salva
- Aggiungere `summary`, `transcript`, `metadata` nell'INSERT della conversazione
- Generare `summary` dal transcript (primi 100 chars dell'ultimo messaggio agente, o campo dal payload)

### 3. Migliorare `ContactAIConversations.tsx`
- Mostrare il `summary` sotto ogni card
- Aggiungere pulsante "Dettagli" che espande con `Collapsible` mostrando il transcript formattato (ruolo + testo per ogni messaggio)
- Se `metadata.sentiment` è presente, mostrare un Badge colorato (positivo/neutro/negativo)
- Aggiungere l'interfaccia `Conversation` con i nuovi campi

### File coinvolti

| File | Azione |
|------|--------|
| SQL Migration | 3 nuove colonne su `ai_agent_conversations` |
| `supabase/functions/elevenlabs-webhook/index.ts` | Salvare summary, transcript, metadata |
| `src/modules/ai-agents/components/ContactAIConversations.tsx` | Espandere UI con dettagli, transcript, sentiment |

