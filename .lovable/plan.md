

## Analisi: Spec TXT vs Implementazione Attuale (solo integrazione, no creazione fatture)

### Riepilogo: cosa c'e e cosa manca

Il documento specifica 6 prompt. Escludendo tutta la logica di **creazione fatture** (InvoiceEditor, pushInvoice, cancelInvoice, mapInvoiceToProviderData, route `/nuova`), ecco lo stato:

| Componente (da spec) | Stato | Note |
|---|---|---|
| **DB Schema** — tabelle `billing_integrations`, `invoices`, `invoice_lines`, `invoice_payments`, `billing_sync_log` | ✅ Presente | Migrazione completa con RLS, trigger, funzioni, indici |
| **DB** — `generate_invoice_number()` RPC | ✅ Presente | Non usata in modalita integrazione, ma innocua |
| **DB** — `recalculate_invoice_totals()` + trigger | ✅ Presente | Utile per import |
| **DB** — `trg_update_paid_amount()` trigger | ✅ Presente | Funziona con invoice_payments |
| **DB** — `get_scadenzario()` RPC | ✅ Presente | Usata da Scadenzario.tsx |
| **DB** — Storage bucket `invoices-pdf` | ❌ **MANCANTE** | Nessuna migrazione crea il bucket |
| **DB** — `get_cruscotto_invoice_stats()` RPC | ❌ **MANCANTE** | Funzione RPC per statistiche fatture nel cruscotto |
| **billingAdapter.ts** — testConnection + fetchStatus | ✅ Presente | Pulito: solo lettura/monitoraggio |
| **billing-connect/** — OAuth2 FIC, API key setup, test, disconnect, set_primary, toggle_auto_sync | ✅ Presente | Tutte le action implementate |
| **billing-sync/** — fetch_status (solo pull) | ✅ Presente | Semplificato correttamente |
| **billing-import/** — pull fatture da provider | ✅ Presente | Import per tutti i 4 provider |
| **billing-webhook/** — notifiche push FIC + Invoicetronic | ✅ Presente | Aggiorna stato SDI |
| **generate-invoice-pdf/** — genera PDF con pdf-lib | ✅ Presente | Ma il bucket storage manca |
| **send-invoice-email/** — invio email fattura | ✅ Presente | Funzionante |
| **InvoicesList.tsx** — lista sola lettura, sync, badge | ✅ Presente | |
| **InvoiceDetail.tsx** — vista read-only | ✅ Presente | |
| **SettingsBilling.tsx** — gestione multi-provider | ✅ Presente | |
| **Scadenzario.tsx** — monitoraggio scadenze, segna pagato | ✅ Presente | |
| **BillingReports.tsx** — analytics/grafici | ✅ Presente | |
| **Cruscotto** — banner fatture scadute/in scadenza | ⚠️ **PARZIALE** | C'e un alert generico `overduePayments` ma NON usa dati reali dalla tabella `invoices`. Manca la RPC `get_cruscotto_invoice_stats` |
| **Contatti** — Tab "Fatture" nel dettaglio contatto | ❌ **MANCANTE** | Nessun tab fatture nel dettaglio contatto |
| **Ordini → Fattura** | ⛔ ESCLUSO | Creazione fatture non prevista |
| **Preventivi → Fattura** | ⛔ ESCLUSO | Creazione fatture non prevista |

### Cosa manca (da implementare)

1. **Storage bucket `invoices-pdf`** — migrazione SQL per creare il bucket + policy RLS (necessario per `generate-invoice-pdf` che gia lo usa)
2. **RPC `get_cruscotto_invoice_stats`** — funzione DB per statistiche fatture (crediti totali, scaduti, pagati nel mese, emesse nel mese)
3. **Cruscotto: integrazione dati fatture reali** — collegare il cruscotto alla RPC sopra, mostrare banner scadute + KPI fatturazione
4. **Contatti: tab "Fatture"** — nel dettaglio contatto, aggiungere un tab che mostra le fatture emesse a quel cliente con totali fatturato/incassato/da incassare

### Piano di implementazione

**Step 1 — Migrazione DB**
- Creare bucket `invoices-pdf` con policy RLS per company
- Creare funzione `get_cruscotto_invoice_stats(p_company_id, p_month)`

**Step 2 — Cruscotto: KPI fatturazione reali**
- Aggiornare `useCruscottoData` (o hook equivalente) per chiamare la RPC
- Aggiornare `CruscottoAlerts` per mostrare banner fatture scadute con link allo Scadenzario

**Step 3 — Contatti: tab Fatture**
- Aggiungere tab "Fatture" nel dettaglio contatto con lista fatture del cliente, totali fatturato/incassato/residuo

