

# Fix: Provvigioni calcolate sull'imponibile (al netto IVA)

## Il problema
Attualmente le provvigioni percentuali vengono calcolate sul `totalAmount` che e l'importo lordo (IVA inclusa). Il venditore pero guadagna sull'**imponibile** (al netto dell'IVA).

Ad esempio, con un ordine da 1.500 euro (IVA 22% inclusa):
- Imponibile reale: 1.229,51 euro
- Attualmente la provvigione al 20% viene calcolata su 1.500 euro = 300 euro (SBAGLIATO)
- Dovrebbe essere calcolata su 1.229,51 euro = 245,90 euro (CORRETTO)

## La soluzione
Usare la funzione `calculateNetFromGross` (gia presente in `src/lib/vatUtils.ts`) per scorporare l'IVA prima di calcolare la provvigione.

## Dettaglio tecnico

### File da modificare
`src/components/orders/OrderCommissions.tsx`

### Modifiche

1. **Import**: aggiungere `calculateNetFromGross` da `@/lib/vatUtils`

2. **Funzione `calculateCommission`**: scorporare l'IVA da `totalAmount` e `collectedAmount` prima di applicare la percentuale:
   - `percentage_sold`: calcola la percentuale sull'imponibile di `totalAmount`
   - `percentage_collected`: calcola la percentuale sull'imponibile di `collectedAmount`
   - `fixed`: resta invariato (importo fisso, non dipende dall'IVA)

3. **Sezione "Decurtazioni"**: aggiornare il riepilogo per mostrare chiaramente l'imponibile (netto IVA) come base di calcolo

