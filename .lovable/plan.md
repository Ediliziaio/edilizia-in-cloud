

## Piano: Riconciliazione Bancaria (Fatture ↔ Transazioni)

### Obiettivo
Permettere di collegare transazioni bancarie a fatture importate, sia manualmente che con suggerimenti automatici basati su importo, IBAN e nome cliente.

### Infrastruttura esistente
- `bank_transactions` ha gia `linked_invoice_id` (nullable FK) — nessuna migrazione necessaria per il collegamento base.
- `invoices` ha `total`, `client_company_name`, `bank_iban`, `status`, `paid_amount`.

### Modifiche previste

**1. Nuova tabella `bank_reconciliations` (migrazione)**
- Tabella di log per tracciare le riconciliazioni: `id`, `company_id`, `transaction_id`, `invoice_id`, `matched_amount`, `match_type` (auto/manual), `matched_by`, `matched_at`, `notes`.
- RLS: tenant isolation su `company_id`.

**2. Nuovo tab "Riconciliazione" nella pagina Tesoreria**
- Aggiungere un 5° tab `riconciliazione` in `Tesoreria.tsx`.
- Nuovo componente `src/components/tesoreria/BankReconciliation.tsx`:
  - Vista split: colonna sinistra = transazioni non riconciliate, colonna destra = fatture non pagate.
  - KPI in alto: transazioni da riconciliare, fatture da incassare, importo riconciliato.
  - Bottone "Auto-match" che invoca la logica di matching automatico.
  - Click su una transazione → mostra suggerimenti di fatture compatibili (match per importo, IBAN, nome).
  - Conferma collegamento → aggiorna `linked_invoice_id` sulla transazione + inserisce record in `bank_reconciliations` + aggiorna `paid_amount`/`status` sulla fattura.
  - Possibilita di scollegare una riconciliazione.

**3. Logica di auto-matching (client-side)**
- Algoritmo di scoring: importo esatto (+50 punti), IBAN match (+30), nome cliente fuzzy match (+20).
- Soglia minima 50 punti per suggerire, 80+ per auto-match.
- Tolleranza importo: entro 1% o 5 EUR.

**4. Aggiornamento TransactionsFeed**
- Mostrare badge "Riconciliata" + numero fattura sulla riga della transazione se `linked_invoice_id` e valorizzato.
- Nel detail sheet, mostrare link alla fattura collegata.

**5. Aggiornamento InvoiceDetail**
- Mostrare sezione "Pagamenti bancari collegati" con lista delle transazioni riconciliate.

### File coinvolti
| File | Azione |
|---|---|
| Migrazione DB | Creare `bank_reconciliations` con RLS |
| `src/pages/azienda/Tesoreria.tsx` | Aggiungere tab Riconciliazione |
| `src/components/tesoreria/BankReconciliation.tsx` | Nuovo — vista principale riconciliazione |
| `src/components/tesoreria/TransactionsFeed.tsx` | Badge riconciliazione + link fattura nel detail |
| `src/pages/azienda/billing/InvoiceDetail.tsx` | Sezione pagamenti bancari collegati |

