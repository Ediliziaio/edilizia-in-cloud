

# Filtro "Da Lavorare" come default nel Magazzino

## Problema
Quando apri il magazzino vedi TUTTI gli articoli (anche installati e completati). Con 1000 ordini storici, i 10 da completare si perdono nel rumore.

## Soluzione

### 1. Nuovo QuickFilter "active" (Da Lavorare)
- Aggiungere `"active"` al tipo `QuickFilter` in `useWarehouseData.ts`
- Filtra escludendo `installato` — mostra solo `da_ordinare`, `ordinato`, `in_magazzino`
- **Impostarlo come default** invece di `"all"`

### 2. Logica filtro nel hook
Nel blocco `filteredItems` aggiungere:
```
if (quickFilter === "active") {
  filtered = filtered.filter(item => item.status !== "installato");
}
```

### 3. Bottone UI nella toolbar
Aggiungere un bottone "Da Lavorare" (con icona) come primo bottone dopo "Tutti", con variant `secondary` quando attivo. Sarà selezionato di default all'apertura.

### 4. Conteggio nel bottone
Mostrare il count degli articoli attivi (non installati) come badge, così l'utente sa subito quanti ne ha da gestire.

### File modificati
- `src/hooks/useWarehouseData.ts` — tipo QuickFilter + default + logica filtro
- `src/pages/azienda/Warehouse.tsx` — bottone "Da Lavorare" nella toolbar

