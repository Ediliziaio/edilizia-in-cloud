

# Fix: filtro "Da Lavorare" troppo restrittivo

## Problema
Nel diff precedente, il blocco `else if (quickFilter === "urgent")` ha perso il suo `else if` ed e stato fuso dentro il blocco `active`. Risultato: il filtro "Da Lavorare" prima esclude installati/completati, poi applica ANCHE il filtro urgenza (solo articoli entro 7 giorni dalla posa e non in magazzino), eliminando quasi tutto.

## Soluzione
Righe 170-176 di `useWarehouseData.ts`: aggiungere `} else if (quickFilter === "urgent") {` prima del secondo blocco filter, separando le due logiche.

**Prima** (bug):
```
if (quickFilter === "active") {
  filtered = filtered.filter(...); // esclude installati + ordini completati
  filtered = filtered.filter(...); // BUG: filtra anche per urgenza
} else if (quickFilter === "overdue") {
```

**Dopo** (fix):
```
if (quickFilter === "active") {
  filtered = filtered.filter(...); // esclude installati + ordini completati
} else if (quickFilter === "urgent") {
  filtered = filtered.filter(...); // urgenza separata
} else if (quickFilter === "overdue") {
```

### File modificato
- `src/hooks/useWarehouseData.ts` -- riga 169-170: aggiungere `} else if (quickFilter === "urgent") {`

