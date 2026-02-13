
# Fix: Provvigioni nel Conto Economico - usare importo totale, non incassato

## Il problema
Nel Conto Economico, le provvigioni di tipo "% sull'incassato" vengono calcolate solo sull'importo gia incassato (3.000 EUR --> 300 EUR). Ma il Conto Economico deve mostrare il **costo totale previsto** della commessa, cioe la provvigione calcolata sull'intero imponibile (8.181,82 EUR --> 818,18 EUR).

La card "Provvigioni Venditori" (OrderCommissions) resta invariata: mostra correttamente l'importo da pagare al venditore in base a quanto incassato finora.

## La soluzione

### File: `src/components/orders/OrderEconomics.tsx`
Nella funzione `calculateCommission`, cambiare il caso `percentage_collected` per usare `totalAmount` invece di `collectedAmount`. In questo modo tutte le provvigioni percentuali nel Conto Economico usano l'imponibile totale come base, dando il costo pieno previsto per il calcolo del margine.

```typescript
case "percentage_collected":
  return totalAmount * (value / 100);  // era: collectedAmount
```

Questo e l'unico file da modificare. Il calcolo del margine usera automaticamente il valore corretto perche gia dipende da `totalCommissions`.

## Impatto
- Conto Economico: provvigioni mostreranno 818,18 EUR invece di 300 EUR
- Card Provvigioni Venditori: invariata (continua a mostrare 300 EUR, l'importo effettivo da pagare)
- Margine: calcolato correttamente sul costo totale previsto
