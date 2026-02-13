
# Piano: Fix Warning e Miglioramenti UX Magazzino

## 1. Fix Warning Console

### WarehouseListView.tsx
Il warning "Function components cannot be given refs" si genera perche `WarehouseListView` e un componente funzione senza `forwardRef`. React tenta di passare un ref quando viene renderizzato nel contesto del Warehouse.

**Fix**: Wrappare con `React.forwardRef`.

---

## 2. Pulizia Codice

| File | Elemento | Azione |
|------|----------|--------|
| `src/components/warehouse/WarehouseStats.tsx` | Riga 100 vuota | Rimuovere |

---

## 3. Miglioramenti UX Calendario

### WarehouseCalendarView.tsx - Dark mode e consistenza visiva

Attualmente la vista Calendario usa:
- Emoji (🟢🔵🟠) per indicare gli stati
- Colori hardcoded senza varianti dark mode (`bg-amber-100 text-amber-800`)

**Fix**:
- Aggiungere varianti `dark:` ai colori delle card ordine nel calendario
- Aggiungere varianti `dark:` ai colori della legenda

---

## Riepilogo File da Modificare

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/warehouse/WarehouseListView.tsx` | Modifica | Wrappare con forwardRef |
| `src/components/warehouse/WarehouseStats.tsx` | Modifica | Rimuovere riga vuota residua |
| `src/components/warehouse/WarehouseCalendarView.tsx` | Modifica | Aggiungere dark mode ai colori |

---

## Dettagli Tecnici

### WarehouseListView.tsx - forwardRef

```text
// Da:
export default function WarehouseListView({ ... }: WarehouseListViewProps) {

// A:
import { useState, forwardRef } from "react";

const WarehouseListView = forwardRef<HTMLDivElement, WarehouseListViewProps>(
  function WarehouseListView({ orderGroups, onStatusChange, ... }, ref) {
    // contenuto invariato, ma il div root riceve ref
    return <div ref={ref} className="space-y-2">...</div>;
  }
);

export default WarehouseListView;
```

### WarehouseCalendarView.tsx - Dark mode

```text
// Card ordine - Da:
"bg-amber-100 text-amber-800"
"bg-green-100 text-green-800"

// A:
"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"

// Legenda - Da:
<span className="w-3 h-3 rounded bg-green-100">
<span className="w-3 h-3 rounded bg-amber-100">

// A:
<span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30">
<span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30">
```

### Verifiche Post-Modifica

- Console priva del warning "Function components cannot be given refs" per WarehouseListView
- Vista Calendario leggibile in dark mode
- Tutte le viste (Lista, Kanban, Calendario, Giacenze) funzionanti
- Nessuna regressione funzionale
