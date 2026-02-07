
# Piano: Pulizia Codice e Correzione Dashboard

## Problemi Identificati

### 1. Query Urgent Items - BUG CRITICO

**File**: `src/pages/azienda/CompanyDashboard.tsx`

La query per gli articoli urgenti nella Dashboard cerca solo `work_start_date`:

```typescript
.lte("order.work_start_date", sevenDaysFromNow.toISOString().split("T")[0])
.gte("order.work_start_date", now.toISOString().split("T")[0])
```

Ma nel database molti ordini hanno solo `expected_date` (come ORD-2026-001, ORD-2026-002, ORD-2026-003). Questo significa che la Dashboard NON mostra gli articoli urgenti di questi ordini.

**Soluzione**: Modificare la query per considerare anche `expected_date`, oppure usare una logica post-fetch simile a WarehouseAlerts.

---

### 2. formatCurrency Duplicato

**File**: `src/components/warehouse/WarehouseStats.tsx`

Ha una funzione locale `formatCurrency` (linee 99-106) invece di importare quella centralizzata.

**Soluzione**: Rimuovere la funzione locale e importare da `@/lib/formatters`.

---

### 3. Calcolo Cash Flow - Potenziale Problema

**File**: `src/pages/azienda/CompanyDashboard.tsx`

Il calcolo include pagamenti dal primo del mese, non solo dal giorno corrente. Questo significa che mostra anche pagamenti con date nel passato (es. se oggi e il 7 febbraio, mostra anche quelli del 1-6 febbraio).

**Coerenza con CashFlowForecast**: 
- CashFlowForecast usa `isWithinInterval` con `startOfMonth` - quindi include tutto il mese
- Dashboard fa lo stesso con `depositDate <= thisMonthEnd`

Questo e coerente quindi **non e un bug**, ma la logica e corretta.

---

### 4. Calcolo daysLeft - Bug Minore

Nel processing degli urgent items, `daysLeft` usa `Math.ceil` ma non gestisce il caso di date passate (che darebbero numeri negativi). Tuttavia la query filtra gia date >= now, quindi non dovrebbe accadere.

---

## Modifiche Proposte

### File da Modificare

| File | Modifica |
|------|----------|
| `CompanyDashboard.tsx` | Correggere query urgent items per includere `expected_date` |
| `WarehouseStats.tsx` | Usare `formatCurrency` centralizzato |

---

## Dettagli Tecnici

### 1. Fix Query Urgent Items

**Problema**: La query Supabase non puo fare OR su relazioni in modo semplice. 

**Soluzione**: Rimuovere i filtri su `work_start_date` dalla query e fare il filtraggio in JavaScript:

```typescript
// PRIMA (ignora expected_date)
supabase
  .from("order_items")
  .select(`...`)
  .eq("order.company_id", company.id)
  .neq("status", "installato")
  .neq("status", "in_magazzino")
  .lte("order.work_start_date", sevenDaysFromNow.toISOString().split("T")[0])
  .gte("order.work_start_date", now.toISOString().split("T")[0])

// DOPO (fetch tutti, filtra in JS)
supabase
  .from("order_items")
  .select(`
    id,
    name,
    status,
    order:orders!inner(
      id,
      order_code,
      work_start_date,
      expected_date,
      company_id,
      customer:profiles!orders_customer_id_fkey(first_name, last_name)
    )
  `)
  .eq("order.company_id", company.id)
  .neq("status", "installato")
  .neq("status", "in_magazzino")
```

Poi nel processing:

```typescript
urgentItemsRes.data?.forEach((item: unknown) => {
  const typedItem = item as {
    id: string;
    name: string;
    order: {
      order_code: string | null;
      work_start_date: string | null;
      expected_date: string | null;
      customer: { first_name: string; last_name: string };
    };
  };
  
  // Usa expected_date O work_start_date (come WarehouseAlerts)
  const expectedDate = typedItem.order.expected_date || typedItem.order.work_start_date;
  
  if (expectedDate) {
    const date = new Date(expectedDate);
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Filtra solo urgenti (entro 7 giorni e >= oggi)
    if (daysLeft >= 0 && daysLeft <= 7) {
      processedUrgentItems.push({
        id: typedItem.id,
        name: typedItem.name,
        orderCode: typedItem.order.order_code,
        customerName: `${typedItem.order.customer.first_name} ${typedItem.order.customer.last_name}`,
        daysLeft,
      });
    }
  }
});
```

---

### 2. Fix WarehouseStats.tsx

```typescript
// PRIMA (locale)
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// DOPO (centralizzato)
import { formatCurrency } from "@/lib/formatters";
// Rimuovere la funzione locale
```

---

## Verifica Funzionamento

### Dati attuali nel DB

Ho verificato che ci sono ordini con articoli urgenti:
- ORD-2026-003: `expected_date = 2026-02-10` (tra 3 giorni) con 3 articoli non pronti
- ORD-2026-001: `expected_date = 2026-02-12` (tra 5 giorni) con 2 articoli non pronti

Questi NON appaiono nella Dashboard attuale perche la query cerca solo `work_start_date` che e NULL per questi ordini.

### Dopo la Correzione

Gli articoli urgenti appariranno correttamente nella Dashboard:
- 3 articoli per ORD-2026-003 (urgente - 3g)
- 2 articoli per ORD-2026-001 (5g)

---

## Impatto

1. **Dashboard mostra articoli urgenti corretti**: Non piu mancanti
2. **Coerenza con Magazzino**: Stessa logica di WarehouseAlerts
3. **Codice piu pulito**: formatCurrency centralizzato
4. **Zero breaking changes**: Solo bug fix

---

## Riepilogo Modifiche

| File | Tipo | Descrizione |
|------|------|-------------|
| `CompanyDashboard.tsx` | Bug Fix | Query urgent items include expected_date |
| `WarehouseStats.tsx` | Cleanup | Usa formatCurrency centralizzato |
