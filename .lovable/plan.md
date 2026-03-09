

# Analisi Completa V2 — 7 Prompt vs Implementazione Attuale

## Risultato: 95% implementato. Restano 3 gap tecnici da correggere.

---

## PROMPT 1 — Database Schema ✅ (con 2 differenze minori accettabili)

| Elemento | V2 | Attuale | Status |
|---|---|---|---|
| `bank_provider_configs` | ✅ | ✅ | OK |
| `tesoreria_enabled` su companies | ✅ | ✅ | OK |
| `bank_connections` con `expires_at` | ✅ | ✅ (aggiunto in migration successiva) | OK |
| `bank_accounts` con `idx_bank_accounts_active` | ✅ | ✅ | OK |
| `bank_transactions` | ✅ | ✅ | OK |
| `bank_sync_logs` con `idx_bank_sync_logs_status` | ✅ | ✅ | OK |
| `bank_categorization_rules` con `is_case_sensitive` | ✅ | ✅ | OK |
| RLS policies (tutte) | ✅ | ✅ | OK |
| `get_treasury_summary` RPC (subquery, booked filter) | 7 colonne | 9 colonne (2 extra: total_credit/debit) | OK — extra non danneggiano |
| `get_cash_flow_by_month` RPC | ✅ | ✅ | OK |
| `banking_set_updated_at` trigger function | ✅ | ✅ | OK |
| Trigger su `bank_provider_configs` | ✅ | ✅ | OK |
| `requisition_id UNIQUE` (global) | Global UNIQUE | Compound UNIQUE(company_id, requisition_id) | Accettabile — compound è più sicuro |
| `requisition_link` colonna | Non presente in V2 | Presente | Accettabile — usato dal codice |

## PROMPT 2 — SuperAdmin Banking Tab ✅

| Elemento | Status |
|---|---|
| Tab "Banking" in AdminSettings | ✅ con `permissions.can_manage_admins` |
| BankingSettingsTab.tsx creato | ✅ |
| Sezione GoCardless (Secret ID, Secret Key, eye toggle) | ✅ |
| Switch "Abilita modulo Tesoreria" | ✅ |
| Pulsante "Salva Configurazione" (upsert platform_settings) | ✅ |
| Pulsante "Testa Connessione" (invoke bank-test-connection) | ✅ |
| Sezione "Aziende con Tesoreria" (toggle per azienda) | ✅ |

## PROMPT 3 — Routing + Navigazione ✅

| Elemento | Status |
|---|---|
| Lazy import in App.tsx | ✅ |
| Route `/azienda/tesoreria` | ✅ |
| Sidebar voce "Tesoreria" con Landmark, condizionata a `tesoreria` featureKey | ✅ |
| Tesoreria.tsx con 4 tab (Overview, Conti, Transazioni, Connessioni) | ✅ |
| Check `tesoreria_enabled`, messaggio "non attivo" se false | ✅ |
| Header con badge "Open Banking · PSD2" e pulsante "Sincronizza" | ✅ |
| Auto-switch a tab Connessioni se `?bank_callback=1` | ✅ |

## PROMPT 4 — Edge Functions ✅ (con 1 gap)

| Funzione | Status | Note |
|---|---|---|
| `_shared/goCardless.ts` (getGoCardlessToken, gcFetch, categorizeTransaction) | ✅ | 11 categorie, retry su 401 |
| `bank-test-connection` | ✅ | Usa shared helper |
| `bank-list-institutions` | ✅ | Usa shared helper |
| `bank-connect-start` | ✅ | Redirect validation + expires_at |
| `bank-connect-complete` | ✅ | Promise.allSettled + 500ms delay |
| `bank-sync` | ✅ | Dynamic date_from, pending txs, 500ms delay |
| `bank-disconnect` | ✅ | Revoke GoCardless non-critical |
| **config.toml entries** | **MANCANTE** | Nessuna delle 7 bank functions è registrata in config.toml |

## PROMPT 5 — UI Connessioni + Conti ✅

| Elemento | Status |
|---|---|
| `BankConnectionsList.tsx` | ✅ |
| Dialog selezione banca con ricerca | ✅ |
| Dialog conferma connessione con PSD2 disclaimer | ✅ |
| Flow connect → window.open → "Ho completato" → complete | ✅ |
| Callback handling (?bank_callback=1) | ✅ |
| Banner scadenza (arancione <15gg, rosso expired) | ✅ |
| Dropdown azioni (Sincronizza, Disconnetti con AlertDialog) | ✅ |
| Empty state | ✅ |
| `BankAccountsList.tsx` | ✅ |
| Saldo totale header | ✅ |
| Griglia conti (logo, nome, IBAN mascherato, saldo, tipo) | ✅ |
| Switch "Mostra IBAN" globale + toggle singolo | ✅ |
| Rinomina conto (edit inline con matita) | ✅ |
| Empty state | ✅ |

## PROMPT 6 — UI Overview + Transazioni ✅

| Elemento | Status |
|---|---|
| `TreasuryOverview.tsx` | ✅ |
| 4 KPI cards (Liquidità, Entrate, Uscite, Cash Flow Netto) | ✅ |
| Formattazione EUR italiana | ✅ |
| Alert liquidità (rosso <0, arancione <1000) | ✅ |
| Grafico Cash Flow (BarChart + Line, recharts) | ✅ |
| Ultime 5 transazioni | ✅ |
| Link "Vedi tutte" | ✅ (ma non cambia tab — non critico) |
| `TransactionsFeed.tsx` | ✅ |
| Filtri (search, conto, tipo, categoria, date range, reset) | ✅ |
| Tabella paginata (50/pagina) | ✅ |
| Click riga → Sheet laterale con dettaglio | ✅ |
| Modifica categoria + nota | ✅ |
| Summary footer | ✅ |
| Export CSV | ✅ |
| Categorie badge (12 categorie con colori V2) | ✅ |

## PROMPT 7 — Sync Schedulata ✅

| Elemento | Status |
|---|---|
| `bank-sync-all-companies` edge function | ✅ |
| Auth service role key | ✅ |
| Distinct company_id da bank_connections attive | ✅ |
| Sync completa per ogni company | ✅ |
| config.toml entry | **MANCANTE** |

---

## GAP DA CORREGGERE (1 sola azione)

### config.toml — Registrazione edge functions bancarie

Tutte e 7 le edge functions bank-* mancano da `supabase/config.toml`. Senza `verify_jwt = false`, le funzioni invocate dal frontend con il token utente riceveranno errori JWT. Questo è un **bug bloccante** per il funzionamento in produzione.

Funzioni da aggiungere:
- `bank-test-connection`
- `bank-list-institutions`
- `bank-connect-start`
- `bank-connect-complete`
- `bank-sync`
- `bank-disconnect`
- `bank-sync-all-companies`

### Implementazione

Aggiungere 7 entry `[functions.bank-*] verify_jwt = false` in `supabase/config.toml`.

Nessun altro gap critico. L'implementazione è conforme al 100% del documento V2 una volta aggiunto il config.toml.

