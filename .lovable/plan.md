
# Aggiungere percentuale margine nella tabella Ordini

## Modifica

Nel file `src/components/orders/OrdersTable.tsx`, nella cella del Margine (riga 156-160), aggiungere la percentuale calcolata come `(grossMargin / total_amount) * 100`.

Il risultato sara visualizzato cosi: **2.669,31 EUR - 48,9%**

## Dettaglio tecnico

### File: `src/components/orders/OrdersTable.tsx`

Alla riga 120, calcolare la percentuale:
```
const marginPercent = order.total_amount > 0 
  ? (grossMargin / order.total_amount) * 100 
  : 0;
```

Alla riga 158, modificare il contenuto della cella da:
```
{formatCurrency(grossMargin)}
```
a:
```
{formatCurrency(grossMargin)} - {marginPercent.toFixed(1)}%
```

Nessun altro file coinvolto.
