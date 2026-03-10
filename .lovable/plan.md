
# Analisi: Firma Digitale Preventivi — Stato Attuale vs Prompt v3

## Risultato: Implementazione già completa e allineata

Dopo un confronto dettagliato tra il prompt caricato (FD1-FD5) e il codice attuale, **tutti i componenti richiesti sono già implementati** e adattati alle convenzioni del progetto:

| Prompt | Componente | Stato | Adattamento |
|--------|-----------|-------|-------------|
| FD1 | Migrazione DB (colonne, indice, bucket) | ✅ Completo | Bucket `quote-signed-pdfs` creato, indice `idx_quotes_signature_token` presente |
| FD2 | Edge fn `send-quote-signature` | ✅ Completo | Usa email provider interno (non Resend); accetta `recipient_email`, `recipient_name`, `custom_message`, `expires_days` |
| FD3 | Edge fn `quote-sign` | ✅ Completo | View/sign/refuse funzionanti; notifiche via `create_notification` con firma corretta (`p_user_id` = `quote.created_by`) |
| FD4 | `QuoteSignPage.tsx` | ✅ Completo | Header blu, tabella prodotti con sconti/IVA, box firma dark (`#1e3a5f`), disclaimer eIDAS, dialog rifiuto |
| FD5 | `useSignatureActions` + `SendSignatureDialog` + `QuoteSignatureStatusCard` + integrazione `QuoteDetail` | ✅ Completo | Usa `supabase.functions.invoke` (non fetch diretto); timeline verticale con stati; dialog con link copiabile post-invio |

### Differenze intenzionali rispetto al prompt (adattamenti migliorativi)

1. **Email provider**: il prompt usa Resend direttamente, il codice usa il provider email interno tramite `loadProviderSettings` / `sendViaProvider` — più flessibile
2. **API calls**: il prompt usa `fetch()` diretto, il codice usa `supabase.functions.invoke()` — più robusto e gestisce auth automaticamente
3. **Env vars**: il prompt usa `VITE_SUPABASE_ANON_KEY`, il codice usa `VITE_SUPABASE_PUBLISHABLE_KEY` — coerente con il progetto
4. **Field names items**: il prompt usa `discount_percentage`/`total_price`/`position`, il DB reale ha `discount_percent`/`line_total`/`sort_order` — il codice è allineato allo schema reale
5. **`create_notification`**: il prompt ha firma semplificata `(company_id, type, title, body, link)`, il DB reale ha `(company_id, user_id, type, title, body, entity_type, entity_id, action_url)` — il codice usa la firma corretta

**Non ci sono gap funzionali da colmare.** Tutti i 5 prompt del file sono stati implementati.
