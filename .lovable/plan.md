

# Finanziamento: Saldo, Data Incasso e Costo Finanziaria

## Problemi Attuali

1. **Saldo sempre a zero**: quando selezioni "Finanziamento" e inserisci un acconto, il saldo risultante non viene mostrato (hardcoded a 0)
2. **Nessun tracciamento incasso finanziamento**: non puoi registrare quando la finanziaria ti pagherà (subito o in data futura)
3. **Nessun campo per il costo finanziaria**: se offri tasso zero al cliente, devi pagare una commissione alla finanziaria (es. 500 euro su 6000) ma non c'e dove registrarlo

## Soluzione

### A. Nuovo schema database (migrazione SQL)

Aggiungere 3 nuove colonne alla tabella `orders`:

| Colonna | Tipo | Default | Descrizione |
|---|---|---|---|
| `financing_paid` | boolean | false | Il finanziamento e stato incassato? |
| `financing_paid_date` | date | null | Data incasso dalla finanziaria |
| `financing_expected_date` | date | null | Data prevista incasso |
| `financing_cost` | numeric | 0 | Costo da pagare alla finanziaria (es. commissione tasso zero) |

### B. Logica Saldo Finanziamento

Il saldo con finanziamento verra calcolato correttamente:

```text
Totale con IVA = Imponibile + IVA
Finanziamento = importo coperto dalla finanziaria
Saldo cliente = Totale con IVA - Acconto - Finanziamento
```

Se il finanziamento copre tutto il residuo dopo l'acconto, il saldo sara zero. Ma se non lo copre completamente, il saldo mostrera la differenza.

### C. UI Finanziamento (FinancialSummary.tsx)

Nella sezione finanziamento verranno aggiunti:

1. **Riga "Incasso Finanziamento"**: con stato Pagato/Non Pagato + data incasso o data prevista (stesso pattern delle righe acconto/saldo)
2. **Campo "Costo Finanziaria"**: importo che l'azienda deve alla finanziaria (es. commissione tasso zero)
3. **Saldo cliente calcolato**: non piu hardcoded a zero, ma `TotaleIVA - Acconto - Finanziamento`

Il layout sara:

```text
Acconto (opzionale)      [campo euro]
  Stato Acconto          [Pagato/Non Pagato] [Data]

Valore Finanziamento     [campo euro]
  Incasso Finanziamento  [Pagato/Non Pagato] [Data]

Costo Finanziaria        [campo euro]
  (commissione tasso zero o altro costo)

Saldo Cliente            € calcolato (TotaleIVA - Acconto - Finanziamento)
  Stato Saldo            [Pagato/Non Pagato] [Data]  (se > 0)
```

### D. File da Modificare

1. **Migrazione SQL**: aggiunta colonne `financing_paid`, `financing_paid_date`, `financing_expected_date`, `financing_cost`
2. **`src/components/orders/FinancialSummary.tsx`**:
   - Nuove props per financing paid/date/expected + financing cost
   - Rimuovere "Saldo: 0" hardcoded, mostrare il saldo reale
   - Aggiungere `PaymentStatusRow` per incasso finanziamento
   - Aggiungere campo input per costo finanziaria
   - Aggiornare anche `FinancialSummaryReadOnly` con le stesse info
3. **`src/pages/azienda/CreateOrder.tsx`**:
   - Nuovi state per `financingPaid`, `financingPaidDate`, `financingExpectedDate`, `financingCost`
   - Ricalcolo balance: `totalWithVat - deposit - financing` (non piu 0)
   - Salvare i nuovi campi nel database all'insert
   - Aggiornare draft save/restore
4. **`src/pages/azienda/EditOrder.tsx`**:
   - Stessi nuovi state e calcolo balance
   - Caricare e salvare i nuovi campi dal/nel database
   - Aggiornare draft save/restore e `mapDbItemToOrderItem`
5. **`src/pages/azienda/OrderDetail.tsx`**: mostrare i nuovi campi nella vista read-only
6. **`src/components/orders/CustomerFinancialSummary.tsx`**: aggiornare il riepilogo cliente
7. **`src/hooks/useOrderDraft.ts`**: aggiungere i nuovi campi nel tipo `OrderDraftData`
8. **`src/hooks/useCashFlowData.ts`**: includere l'incasso finanziamento nelle entrate previste e il costo finanziaria nelle uscite
9. **`src/lib/orderUtils.ts`**: aggiornare `OrderWithDetails` con i nuovi campi e le funzioni di calcolo

### E. Integrazione con Previsionale Cassa

- **Incasso finanziamento non pagato** con data prevista: compare come entrata nel previsionale
- **Costo finanziaria**: compare come uscita nel previsionale (tipo "Costo Finanziaria")

### F. Impatto

- Nessun ordine esistente viene rotto (default: `financing_paid = false`, `financing_cost = 0`)
- Il calcolo saldo e retrocompatibile: ordini standard non cambiano
- Il costo finanziaria e opzionale (default 0)
