
# Fix: Escludere articoli da Giacenze dalla sezione Costi

## Problema

Gli articoli presi dal magazzino (Giacenze) hanno il campo `stock_item_id` valorizzato, il che significa che il costo e' gia' stato sostenuto al momento dell'acquisto dello stock. Questi articoli non devono apparire nella sezione Costi come "da pagare" perche' sono gia' pagati tramite l'inventario.

Esempio: "Motore Tapparelle mario" e' stato prelevato dalle Giacenze, quindi il suo costo e' gia' coperto e non deve comparire tra i costi variabili derivati dagli ordini.

## Soluzione

Aggiungere un filtro alla query degli articoli con fornitore in `CompanyCostsManager.tsx` (riga ~244) per escludere gli articoli provenienti dal magazzino:

```
.is("stock_item_id", null)
```

Questo filtro garantisce che solo gli articoli acquistati direttamente per l'ordine (non prelevati dallo stock) vengano mostrati come costi.

## Dettaglio tecnico

### File: `src/components/forecast/CompanyCostsManager.tsx`

Nella query che recupera gli `order_items` con fornitore (riga ~244), dopo `.not("supplier_id", "is", null)`, aggiungere:

```typescript
.is("stock_item_id", null)
```

Nessun altro file modificato. Nessuna modifica al database.
