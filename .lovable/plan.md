
# Fix: Provvigioni in OrderEconomics calcolate sull'imponibile

## Il problema
Il componente "Conto Economico" (`OrderEconomics`) calcola gia le provvigioni e le include nel margine, ma usa `totalAmount` (lordo IVA) come base per le percentuali, invece dell'imponibile (netto IVA). Questo e lo stesso bug appena corretto in `OrderCommissions`.

## La soluzione
Applicare la stessa correzione: scorporare l'IVA da `totalAmount` e `collectedAmount` prima di calcolare le provvigioni percentuali.

## Dettaglio tecnico

### File da modificare
`src/components/orders/OrderEconomics.tsx`

### Modifiche

1. **Calcolo importi netti**: Aggiungere il calcolo degli importi netti usando `calculateNetFromGross` (gia importata nel file):
   - `netTotalAmount` = imponibile di `totalAmount`
   - `netCollectedAmount` = imponibile di `collectedAmount`

2. **Funzione `calculateCommission`** (riga 154-164): Aggiornare per usare gli importi netti:
   - `percentage_sold`: usa `netTotalAmount` invece di `totalAmount`
   - `percentage_collected`: usa `netCollectedAmount` invece di `collectedAmount`
   - `fixed`: resta invariato

Questo allinea il calcolo del margine nel Conto Economico con quello mostrato nella sezione Provvigioni Venditori.
