

# Piano di Implementazione — Banking Integration Service (Tesoreria Open Banking)

## Panoramica
Modulo completo di tesoreria bancaria con integrazione GoCardless PSD2 per collegare conti bancari, sincronizzare saldi e transazioni, e visualizzare cash flow in tempo reale.

---

## Fase 1 — Database Schema
Migration SQL con 6 nuove tabelle + 2 RPC functions + colonna `tesoreria_enabled` su companies:

| Tabella | Scopo |
|---|---|
| `bank_provider_configs` | Config provider (GoCardless), gestita da SuperAdmin |
| `bank_connections` | Connessioni banca per azienda (requisition GoCardless) |
| `bank_accounts` | Conti bancari con saldo, IBAN, valuta |
| `bank_transactions` | Transazioni sincronizzate con categorizzazione |
| `bank_sync_logs` | Log sincronizzazioni |
| `bank_categorization_rules` | Regole auto-categorizzazione per azienda |

RPC: `get_treasury_summary(company_id)`, `get_cash_flow_by_month(company_id, months)`

RLS tenant-scoped su tutte le tabelle, SuperAdmin bypass.

---

## Fase 2 — SuperAdmin Banking Settings
Nuovo tab "Banking" in `AdminSettings.tsx` con componente `BankingSettingsTab.tsx`:
- Configurazione credenziali GoCardless (Secret ID/Key) salvate in `platform_settings`
- Test connessione via edge function
- Lista aziende con tesoreria attiva + toggle enable/disable

---

## Fase 3 — Routing + Navigazione
- Lazy import `Tesoreria` in `App.tsx` + route `/azienda/tesoreria`
- Voce "Tesoreria" con icona `Landmark` in `sidebarConfig.ts` (visibile solo se `tesoreria_enabled`)
- Pagina skeleton `Tesoreria.tsx` con 4 tab: Overview, Conti, Transazioni, Connessioni
- Guard: se `tesoreria_enabled = false` mostra messaggio "non attivo"

---

## Fase 4 — Edge Functions (6 funzioni)
Tutte seguono il pattern esistente: `corsHeaders` + `secureHeaders` da `_shared/headers.ts`, `getPlatformSetting` per credenziali, `Deno.serve()`.

| Function | Scopo |
|---|---|
| `bank-test-connection` | Testa credenziali GoCardless (token/new) |
| `bank-connect-start` | Crea requisition GoCardless, salva in bank_connections |
| `bank-connect-complete` | Completa connessione, scarica account + saldi |
| `bank-sync` | Sincronizza saldi e transazioni per tutti i conti |
| `bank-disconnect` | Disconnette connessione, marca inattivi |
| `bank-list-institutions` | Lista banche disponibili per paese |

---

## Fase 5 — UI Connessioni + Conti
- `BankConnectionsList.tsx`: card per connessione con status, azioni (sync/disconnect), dialog selezione banca con ricerca
- Flow connessione: selezione banca → conferma PSD2 → redirect login banca → completamento
- Gestione callback URL (`?bank_callback=1`)
- `BankAccountsList.tsx`: griglia card conti con saldo, IBAN mascherato, toggle visibilità, rinomina

---

## Fase 6 — UI Overview + Transazioni
- `TreasuryOverview.tsx`: 4 KPI cards (liquidità, entrate, uscite, netto), grafico cash flow 6 mesi (recharts BarChart + Line), ultime 5 transazioni, alert liquidità
- `TransactionsFeed.tsx`: tabella paginata con filtri (testo, conto, tipo, categoria, date), Sheet dettaglio, modifica categoria/note, export CSV, summary footer

---

## File da creare/modificare

**Nuovi file (10):**
- `src/components/admin/settings/BankingSettingsTab.tsx`
- `src/pages/azienda/Tesoreria.tsx`
- `src/components/tesoreria/BankConnectionsList.tsx`
- `src/components/tesoreria/BankAccountsList.tsx`
- `src/components/tesoreria/TreasuryOverview.tsx`
- `src/components/tesoreria/TransactionsFeed.tsx`
- `supabase/functions/bank-test-connection/index.ts`
- `supabase/functions/bank-connect-start/index.ts`
- `supabase/functions/bank-connect-complete/index.ts`
- `supabase/functions/bank-sync/index.ts`
- `supabase/functions/bank-disconnect/index.ts`
- `supabase/functions/bank-list-institutions/index.ts`

**File modificati (3):**
- `src/pages/admin/AdminSettings.tsx` — nuovo tab Banking
- `src/App.tsx` — lazy import + route Tesoreria
- `src/lib/sidebarConfig.ts` — voce Tesoreria con Landmark

**Migration (1):**
- Tutte le 6 tabelle, RLS, RPC, indici, trigger, seed in una singola migration

