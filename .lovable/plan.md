

## Piano: Scrollbar orizzontale isolata alla sola tabella costi

### Problema
La tabella ha `min-w-[1400px]` e `overflow-x-auto`, ma il componente `Table` in `ui/table.tsx` aggiunge un suo wrapper con `overflow-auto`, creando un doppio contenitore scroll. Inoltre, la sezione superiore (Situazione 2025, stats cards, filtri) potrebbe essere influenzata dalla larghezza minima della tabella.

### Soluzione

**File: `src/components/forecast/CostsTable.tsx`**
- Aggiungere `max-w-full` al div wrapper della tabella (riga 292) per assicurarsi che il contenitore non superi la larghezza del parent
- Risultato: `<div className="rounded-md border overflow-x-auto max-w-full">`

**File: `src/components/ui/table.tsx`** (opzionale, se il problema persiste)
- Passare `overflow-hidden` invece di `overflow-auto` sul wrapper interno della `Table` quando la tabella ha già un contenitore scroll esterno, oppure rimuovere il wrapper scroll dal componente `Table` e spostare `min-w-[1400px]` direttamente sulla `<table>` element

L'approccio più pulito: in `CostsTable.tsx`, togliere la classe `min-w-[1400px]` dalla `Table` e metterla su un `<div>` interno al wrapper `overflow-x-auto`, così il `Table` component usa il suo scroll interno naturalmente.

### Dettaglio tecnico

Riga 292-293 di `CostsTable.tsx`, cambiare:
```tsx
<div className="rounded-md border overflow-x-auto">
  <Table className="min-w-[1400px]">
```
in:
```tsx
<div className="rounded-md border overflow-x-auto max-w-full">
  <Table className="min-w-[1400px]">
```

E assicurarsi che il `CardContent` parent in `CompanyCostsManager.tsx` abbia `overflow-hidden` per contenere la larghezza.

