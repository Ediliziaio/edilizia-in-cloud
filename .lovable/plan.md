

# Fix barra di scorrimento orizzontale — Sezione Costi Aziendali

## Problema

La tabella dei costi ha 15 colonne (checkbox, nome, origine, tipo, fornitore, categoria, imponibile, IVA, lordo, ricorrenza, scadenza, stato, ritardo, ordine, azioni). Il contenitore `<div className="rounded-md border">` vincola la larghezza ma non gestisce l'overflow, causando una scrollbar orizzontale visibile che le altre sezioni non hanno.

## Soluzione

### `src/components/forecast/CostsTable.tsx` (riga 274)

Cambiare il wrapper della tabella da:
```
<div className="rounded-md border">
```
a:
```
<div className="rounded-md border overflow-hidden">
```

Questo permette al wrapper interno del componente `Table` (che ha già `overflow-auto`) di gestire lo scroll in modo pulito, nascondendo la scrollbar esterna visibile. Il comportamento è identico a quello usato in `OrdersTable`, `OpportunityListView` e altre sezioni del progetto che usano `overflow-hidden` sul border container.

### File da modificare
- `src/components/forecast/CostsTable.tsx` — una riga, cambio classe CSS

