

## Analisi: Stato del modulo fatturazione vs piano approvato

### Implementato correttamente

| Componente | Stato |
|---|---|
| **InvoicesList.tsx** — Lista sola lettura, bottone Sincronizza, badge provider, banner connessione | ✅ OK |
| **InvoiceDetail.tsx** — Vista read-only con dati cliente, righe, totali, stato sync | ✅ OK |
| **Scadenzario.tsx** — Monitoraggio scadenze, KPI, aging, "Incassa" rapido | ✅ OK |
| **BillingReports.tsx** — Dashboard analytics, grafici, export CSV, filtro anno | ✅ OK |
| **SettingsBilling.tsx** — Gestione integrazioni provider, test connessione, sync log | ✅ OK |
| **billing-import/** — Edge function per pull fatture da provider | ✅ OK |
| **billing-connect/** — Edge function connessione provider | ✅ OK |
| **billing-sync/** — Edge function sincronizzazione stato | ✅ OK |
| **billing-webhook/** — Webhook ricezione notifiche provider | ✅ OK |
| **send-invoice-email/** — Invio fattura via email | ✅ OK |
| **generate-invoice-pdf/** — Generazione PDF | ✅ OK |
| **billingAdapter.ts** — Adapter pattern per 4 provider | ✅ OK |
| **Routing** — Route `/nuova` rimossa, `:id` punta a InvoiceDetail | ✅ OK |
| **Sidebar** — Fatturazione, Scadenzario, Report Fatture presenti | ✅ OK |

### Problemi trovati

| Problema | Dettaglio |
|---|---|
| **InvoiceEditor.tsx ancora presente** | Il file di 730 righe con form di creazione/modifica fatture esiste ancora come dead code. Non e referenziato nel routing ma va eliminato per pulizia. |
| **billing-sync** ancora operativa per invio | La edge function `billing-sync` contiene ancora logica per **inviare** fatture ai provider (`action: sync/status`), che non ha senso in un sistema di sola integrazione. Andrebbe semplificata per fare solo il check status. |

### Piano di pulizia

1. **Eliminare `src/pages/azienda/billing/InvoiceEditor.tsx`** — dead code, 730 righe inutili
2. **Semplificare `billing-sync`** — rimuovere la logica di invio fattura (`createInvoice` / `syncInvoice` nell'adapter), mantenere solo `checkStatus` per verificare lo stato delle fatture importate

Nessuna funzionalita mancante rispetto al piano. Il modulo e completo come piattaforma di monitoraggio/integrazione stile Agicap.

