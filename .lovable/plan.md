

## Piano: Scroll orizzontale isolato alla tabella

### Problema
Il componente `Table` in `src/components/ui/table.tsx` ha già un wrapper con `overflow-auto`. Questo, combinato con `overflow-x-auto` sul div esterno in `CostsTable.tsx`, fa sì che lo scroll si propaghi a livello di pagina.

### Soluzione

**File: `src/components/forecast/CostsTable.tsx`** (riga 292)
- Cambiare il wrapper da `overflow-x-auto` a `overflow-x-auto max-w-full` e assicurarsi che il contenitore limiti la larghezza

Ma il vero fix è nel componente Table stesso: il suo wrapper interno ha `overflow-auto` che crea lo scroll a livello pagina quando la tabella è più larga del viewport.

**Approccio corretto:** Sovrascrivere il comportamento del wrapper interno del `Table` passando una className che forzi `overflow-visible` sulla table, e lasciare che sia SOLO il div esterno in `CostsTable.tsx` a gestire lo scroll:

**File: `src/components/forecast/CostsTable.tsx`** (riga 292-293)
- Wrapper esterno: `<div className="rounded-md border overflow-x-auto max-w-full">`
- Sulla `<Table>`: NON serve cambiare nulla, ma il div interno del Table con `overflow-auto` crea conflitto.

**Soluzione più pulita — File: `src/components/forecast/CostsTable.tsx`**
- Rimuovere il componente `<Table>` e usare direttamente `<table>` dentro il wrapper con scroll, oppure:
- Wrappare il tutto in un div con `overflow-x-auto` e `max-w-full`, e sovrascrivere il div interno del Table aggiungendo `[&>div]:overflow-visible` sul wrapper esterno per neutralizzare lo scroll del componente Table.

**Modifica concreta** (riga 292):
```tsx
<div className="rounded-md border overflow-x-auto max-w-full [&>div]:!overflow-visible">
```

Questo usa un selettore Tailwind per forzare `overflow-visible` sul div figlio diretto (il wrapper interno di `<Table>`), mantenendo lo scroll solo sul contenitore esterno.

