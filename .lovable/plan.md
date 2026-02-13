

# Piano: Rimozione Grafico e Stabilizzazione Progetto

## Panoramica

Rimuovere il grafico andamento mensile dalla pagina Ordini, correggere il warning console su `DateRangeFilter`, e pulire import/codice inutilizzato.

---

## 1. Rimozione Grafico Andamento Mensile (OrdersList.tsx)

- Rimuovere il blocco JSX del grafico (Card con BarChart, righe 448-477)
- Rimuovere il `useMemo` per `monthlyData` (righe 347-365)
- Rimuovere gli import di recharts: `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`
- Rimuovere `CardHeader` e `CardTitle` dagli import (non piu usati dopo rimozione grafico)

Le stats cards, i filtri, la tabella e la pipeline rimangono invariati.

---

## 2. Fix Warning Console: DateRangeFilter

Il warning "Function components cannot be given refs" appare perche `DateRangeFilter` viene usato in un contesto dove React tenta di passare un ref. La soluzione e wrappare il componente con `React.forwardRef`.

**File**: `src/components/orders/DateRangeFilter.tsx`

Wrappare l'export con `forwardRef` per eliminare il warning dalla console.

---

## 3. Pulizia Codice e Import

Analisi dei file modificati di recente per import inutili o codice morto:

| Elemento | File | Azione |
|----------|------|--------|
| Import recharts (6 simboli) | OrdersList.tsx | Rimuovere |
| `CardHeader`, `CardTitle` | OrdersList.tsx | Rimuovere dall'import |
| `monthlyData` useMemo | OrdersList.tsx | Rimuovere |
| Grafico JSX (30 righe) | OrdersList.tsx | Rimuovere |

Nessun file da eliminare. Nessuna migrazione DB necessaria.

---

## 4. Riepilogo Modifiche

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/pages/azienda/OrdersList.tsx` | Modifica | Rimuovere grafico, import recharts, monthlyData |
| `src/components/orders/DateRangeFilter.tsx` | Modifica | Aggiungere forwardRef per eliminare warning console |

---

## Dettagli Tecnici

### OrdersList.tsx - Elementi rimossi

```text
- import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer }
- import CardHeader, CardTitle
- const monthlyData = useMemo(...)
- <Card> con grafico BarChart </Card>
```

### DateRangeFilter.tsx - Fix

Trasformare da:
```text
export function DateRangeFilter({ label, range, onRangeChange }: DateRangeFilterProps) { ... }
```
A:
```text
export const DateRangeFilter = React.forwardRef<HTMLButtonElement, DateRangeFilterProps>(
  function DateRangeFilter({ label, range, onRangeChange }, ref) { ... }
);
```

### Verifiche Post-Modifica

- Console priva di errori e warning relativi a ref
- Stats cards funzionanti (usano `getAmountCollected` e `getAmountDue` che restano)
- Filtro mese funzionante (usa `MONTHS` che resta)
- Pipeline e tabella invariate
- Nessuna regressione funzionale
