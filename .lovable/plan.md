

# Stato: Gia Implementato

Tutti i 7 step richiesti sono gia presenti nel codebase:

| Step | Componente | Stato |
|------|-----------|-------|
| 1 | Tabella `subscription_invoices` | Creata (migrazione gia eseguita) |
| 2 | Webhook Stripe sync fatture | `upsertSubscriptionInvoice` + handler `invoice.paid`, `invoice.payment_failed`, `invoice.created` in `stripe-webhook/index.ts` |
| 3 | Edge Function billing portal | `customer-portal/index.ts` gia esistente |
| 4 | Hook `useBilling.ts` | Presente con `useBillingInfo`, `useInvoices`, `useOpenBillingPortal` |
| 5 | Pagina UI | `SettingsSubscriptionBilling.tsx` con card piano corrente, storico fatture, banner dunning |
| 6 | Rotta | `/azienda/impostazioni/abbonamento` registrata in `companyRoutes.tsx` |
| 7 | Link sidebar | Voce "Abbonamento" gia presente nel menu impostazioni |

**Nessun intervento necessario.** La sezione "Abbonamento" e accessibile da Impostazioni > Abbonamento e include tutte le funzionalita richieste: piano corrente con badge di stato, banner trial/dunning, redirect al Customer Portal Stripe, e storico fatture con download PDF.

