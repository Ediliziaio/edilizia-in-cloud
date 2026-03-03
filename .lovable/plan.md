

# Analisi Pagamenti Fornitori — Findings

## Situazione Attuale

Ci sono **due sezioni** che parlano di fornitori nella dashboard:

1. **Card "Pagamenti Fornitori"** (`SupplierPaymentsSummary.tsx`) — Questa e' **corretta**: raggruppa gli `order_items` per `supplier_id`, mostra pagato vs da pagare, con progress bar e metodo di pagamento. I dati arrivano direttamente dalla tabella `order_items` con join su `suppliers`.

2. **Widget "Scadenze Settimana" > sezione fornitori** — Questa ha un **problema di naming/dati**: la query (riga 145-151 di `CompanyDashboard.tsx`) legge da `company_costs` (costi aziendali generici), NON dai pagamenti fornitori reali (articoli degli ordini non pagati). Il campo si chiama `supplierPayments` ma mostra costi aziendali con scadenza entro 7 giorni.

## Problema Concreto

Quando un fornitore ha un articolo da pagare (es. Marysoryna con 5.100 EUR da pagare), questa scadenza **non appare** nel widget "Scadenze Settimana" perche' gli `order_items` non hanno un campo `due_date` — solo `is_paid`. Quindi le scadenze fornitori nel widget settimanale sono vuote a meno che non ci siano `company_costs` in scadenza.

## Piano di Fix

### Modificare `CompanyDashboard.tsx`

Aggiungere una query per `order_items` non pagati con `deposit_expected_date` / `balance_expected_date` dell'ordine padre entro 7 giorni, e unirli ai `company_costs` nella sezione `weeklySupplierPayments`. In alternativa, dato che gli order_items non hanno date di scadenza proprie, rinominare la sezione da "fornitori" a "Costi Aziendali" per riflettere i dati reali.

**Approccio consigliato**: rinominare `supplierPayments` in `companyCosts` nel `WeeklyDeadlines` component e aggiornare le icone/label per essere accurati. I pagamenti fornitori veri sono gia' visibili nella card `SupplierPaymentsSummary` dedicata.

### File da modificare

| File | Modifica |
|------|----------|
| `WeeklyDeadlines.tsx` | Rinominare prop `supplierPayments` label da "Pagamento:" a "Costo:" e icona da `Truck` a icona costi |
| `CompanyDashboard.tsx` | Nessun cambio strutturale — la query company_costs e' corretta per quello che mostra |

Nessun cambio funzionale. Solo allineamento naming.

