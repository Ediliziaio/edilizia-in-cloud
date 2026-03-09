

# Prompt 1 di 6 — Database Schema Fatturazione

Eseguo solo il primo prompt: la migrazione SQL completa per creare tutte le tabelle, funzioni, trigger, indici e policy RLS del modulo fatturazione.

## Correzione necessaria

Il prompt originale referenzia `contacts(id)` nella tabella `invoices`, ma nel progetto la tabella si chiama `marketing_contacts`. Correggo il foreign key a `marketing_contacts(id)`.

## Oggetti da creare nella migrazione

| Tipo | Nome | Note |
|------|------|------|
| Tabella | `billing_integrations` | Config integrazione per company, con credenziali e sync settings |
| Tabella | `invoices` | Fatture con numerazione, stato, importi, collegamenti ordini/preventivi |
| Tabella | `invoice_lines` | Righe fattura con IVA italiana |
| Tabella | `invoice_payments` | Pagamenti registrati |
| Tabella | `billing_sync_log` | Log sincronizzazione provider |
| Funzione | `generate_invoice_number` | Numerazione con advisory lock anti-duplicati |
| Funzione | `recalculate_invoice_totals` | Ricalcolo automatico subtotal/tax/total |
| Trigger | `trg_invoice_lines_totals` | Su invoice_lines → ricalcola totali fattura |
| Funzione/Trigger | `trg_update_paid_amount` | Su invoice_payments → aggiorna paid_amount e stato |
| Funzione RPC | `get_scadenzario` | Query scadenze con urgenza |
| RLS | 5 policy | Tutte basate su `get_user_company_id(auth.uid())` come pattern esistente |
| Indici | 8 indici | Performance su company, status, client, due_date, year |

## Esecuzione

Una singola migrazione SQL tramite il migration tool con tutto il contenuto del Prompt 1 (righe 39-399 del file), con la correzione `contacts(id)` → `marketing_contacts(id)`.

