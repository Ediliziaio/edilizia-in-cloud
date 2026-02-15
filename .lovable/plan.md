

# Riepilogo Pagamenti Fornitori + Pulizia e Stabilizzazione

## 1. Nuova Feature: Widget "Pagamenti Fornitori" nella Dashboard

Aggiungere una card nella dashboard aziendale che mostra un riepilogo dei pagamenti ai fornitori, basato sui dati `order_items` con i campi `is_paid`, `paid_date`, `payment_method` e `supplier_id`.

### Implementazione

**Nuovo componente**: `src/components/dashboard/SupplierPaymentsSummary.tsx`

Questo componente:
- Esegue una query su `order_items` filtrando per `company_id` (via join su `orders`)
- Raggruppa per fornitore (`supplier_id`) con join su `suppliers` per il nome
- Calcola per ciascun fornitore:
  - Totale pagato (`is_paid = true`)
  - Totale da pagare (`is_paid = false`)
  - Modalita di pagamento prevalente
- Mostra una lista con barre di progresso (pagato vs totale)
- Badge colorati: verde per "Pagato", arancione per "Da pagare"
- Link a "Vedi dettaglio" che porta al previsionale

**Modifica**: `src/pages/azienda/CompanyDashboard.tsx`

- Aggiungere la query per i dati pagamenti fornitori nel `Promise.all` esistente
- Inserire il widget nella griglia bottom row (trasformandola da 2 a 3 colonne, oppure aggiungendo una nuova riga)

### Layout proposto

La bottom row attuale ha 2 colonne (Alert Magazzino + Azioni Rapide). Aggiungere il widget come terza colonna:

```text
[Alert Magazzino] [Pagamenti Fornitori] [Azioni Rapide]
```

### Query dati

```sql
SELECT 
  s.id, s.name,
  oi.purchase_price, oi.quantity, oi.is_paid, oi.payment_method
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN suppliers s ON s.id = oi.supplier_id
WHERE o.company_id = :companyId
```

Poi raggruppamento lato client per fornitore.

---

## 2. Pulizia e Bug Fix

### Codice da verificare e pulire

| File | Azione |
|------|--------|
| `OrderEconomics.tsx` | Verificare che la sezione "Margine Previsto vs Consuntivo" sia stata rimossa correttamente |
| `OrderItemsList.tsx` | Verificare che i legacy fields (`unit_price`, `discount_percent`, `standard_cost`) non generino problemi nella UI |
| `EditOrder.tsx` | Verificare coerenza con CreateOrder per i nuovi campi `is_paid`, `paid_date`, `payment_method` |
| `useOrderDraft.ts` | Verificare che l'interfaccia `OrderDraftData` includa i nuovi campi item |

### Validazioni da verificare

- Articolo senza fornitore: il widget deve raggruppare sotto "Senza fornitore"
- Articolo con `purchase_price = 0`: non deve causare errori di calcolo
- Fornitore con tutti articoli pagati: mostrare progresso al 100%

---

## 3. UX e Stabilita

- Il widget mostra uno stato empty chiaro ("Nessun articolo con fornitore associato") se non ci sono dati
- Loading state con skeleton durante il caricamento
- I totali sono formattati con `formatCurrency`
- Badge pagamento coerenti con quelli usati in OrderItemsList

---

## 4. Riepilogo file

| Azione | File |
|--------|------|
| Creare | `src/components/dashboard/SupplierPaymentsSummary.tsx` |
| Modificare | `src/pages/azienda/CompanyDashboard.tsx` (aggiungere widget + query) |
| Verificare | `OrderEconomics.tsx`, `EditOrder.tsx`, `useOrderDraft.ts` (coerenza campi) |

