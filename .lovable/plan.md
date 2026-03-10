

# Piano: Firma Digitale Preventivi — Completamento

## Stato attuale
Analizzando il codice, molte parti sono **già implementate**:

| Componente | Stato | Note |
|---|---|---|
| Colonne firma su `quotes` | ✅ Esistenti | signature_token, sent_at, signed_at, etc. |
| `generate_quote_number()` | ✅ Esistente | |
| `create_notification()` | ✅ Esistente | Firma diversa dal prompt (accetta `p_user_id`) |
| `send-quote-signature` edge fn | ✅ Esistente | Usa email provider interno, non Resend |
| `quote-sign` edge fn | ✅ Esistente | Funzionante |
| `QuoteSignPage.tsx` | ✅ Esistente | Versione funzionale ma basilare |
| Route `/offerta/:token` | ✅ Esistente | |
| `QuoteDetail.tsx` | ✅ Esistente | Ha già bottone "Invia per Firma" base |

**Mancano** (da FD5 del prompt):

| Componente | Stato |
|---|---|
| `useSignatureActions` hook | ❌ Mancante |
| `SendSignatureDialog` | ❌ Mancante |
| `QuoteSignatureStatusCard` | ❌ Mancante |
| Bucket `quote-signed-pdfs` | ❌ Mancante |
| RLS policy `public_read_quote_by_token` | ❌ Mancante (non necessaria, quote-sign usa service_role) |

**Da migliorare:**
| Componente | Azione |
|---|---|
| `QuoteSignPage.tsx` | Upgrade UX: versione più ricca dal prompt (header blu, tabella prodotti, box firma stilizzato) |
| `QuoteDetail.tsx` | Integrare `SendSignatureDialog` + `QuoteSignatureStatusCard` al posto dell'invio diretto |
| `quote-sign` edge fn | La notifica usa `create_notification` con firma diversa — va adattata |

## Implementazione (5 task)

### 1. Migrazione DB
- Creare bucket `quote-signed-pdfs` con policy storage
- Creare indice `idx_quotes_signature_token` (se non esiste)
- Nessuna modifica a `create_notification` (la edge function adatterà la chiamata)

### 2. Creare `src/hooks/useSignatureActions.ts`
- Hook con `useMutation` che chiama `send-quote-signature` via `supabase.functions.invoke`
- Invalida queries `["quote", quoteId]` e `["quotes"]` on success
- Adattato al sistema esistente (usa `supabase.functions.invoke`, non fetch diretto)

### 3. Creare `SendSignatureDialog` e `QuoteSignatureStatusCard`
- `src/components/marketing/preventivi/SendSignatureDialog.tsx` — Dialog con form email/nome/messaggio/giorni validità + stato post-invio con link copiabile
- `src/components/marketing/preventivi/QuoteSignatureStatusCard.tsx` — Card timeline con stato firma (inviato → visualizzato → firmato/rifiutato)

### 4. Aggiornare `QuoteDetail.tsx`
- Sostituire il bottone `handleSendForSignature` inline con `SendSignatureDialog`
- Aggiungere `QuoteSignatureStatusCard` nel tab "Attività"
- Usare `useSignatureActions` hook

### 5. Upgrade `QuoteSignPage.tsx`
- Sostituire con la versione dal prompt: header blu con logo, tabella prodotti styled, box firma dark, dialog rifiuto
- Adattare per usare `supabase.functions.invoke` (come l'attuale) invece di fetch diretto
- Mantenere variabile env `VITE_SUPABASE_PUBLISHABLE_KEY` (non `VITE_SUPABASE_ANON_KEY`)

### 6. Aggiornare `quote-sign` edge function
- Adattare la chiamata `create_notification` alla firma esistente: `(p_company_id, p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_action_url)` — serve trovare un user_id destinatario (es. il created_by della quote)

