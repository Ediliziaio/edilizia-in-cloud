

# Piano: Allineamento Firma Digitale al Prompt Completo

## Analisi Gap

Confrontando il codice attuale con il prompt caricato, le differenze principali sono:

| Area | Attuale | Prompt richiede |
|---|---|---|
| `send-quote-signature` | Usa solo `quote.client_email`, email template basic | Accetta `recipient_email`, `recipient_name`, `custom_message`, `expires_days`; template email ricco con box importo e CTA |
| `SendSignatureDialog` | Form semplice (solo visualizza destinatario) | Form completo: email, nome, messaggio custom, giorni validità, post-invio con link copiabile |
| `QuoteSignPage` | UX funzionale, tema standard | Header blu, box firma dark (bg-blue-900), tabella prodotti con sconti visibili, disclaimer legale eIDAS |
| `useSignatureActions` | Passa solo `quote_id` | Deve passare i nuovi parametri (email, nome, messaggio, giorni) |

## Implementazione (4 file)

### 1. `supabase/functions/send-quote-signature/index.ts`
- Accettare parametri: `recipient_email`, `recipient_name`, `custom_message`, `expires_days`
- Usare `recipient_email` (con fallback a `quote.client_email`)
- Calcolare `expires_at` da `expires_days` (default 30)
- Salvare `signature_link` nella quote
- Template email migliorato: header blu, box importo con valuta formattata, CTA "Visualizza e Firma", link di backup, footer

### 2. `src/hooks/useSignatureActions.ts`
- Aggiungere interfaccia `SendParams` con `recipientEmail`, `recipientName`, `customMessage`, `expiresDays`
- Passare i nuovi parametri nel body della mutation

### 3. `src/components/marketing/preventivi/SendSignatureDialog.tsx`
- Form completo: campo email, nome, textarea messaggio, input giorni validità
- Post-invio: mostra box verde successo + input link copiabile con pulsante copia
- Stato `signatureLink` gestito internamente dopo `onSend`

### 4. `src/pages/public/QuoteSignPage.tsx`
- Header `bg-blue-900` con logo, numero offerta e badge "In attesa di firma"
- Card info azienda + validità in griglia 2 colonne
- Tabella prodotti con colonna sconto (se presente), totali con subtotale/IVA/totale
- Box firma dark (bg-blue-900 text-white): input nome, disclaimer eIDAS, bottoni Accetta + Rifiuta
- Pagine stato (signed/refused/expired) con icone colorate centrate

### 5. Integrazione `QuoteDetail.tsx`
- Aggiornare la chiamata a `SendSignatureDialog` per passare `onSend` con i nuovi parametri
- Gestire `signatureLink` restituito dalla mutation

