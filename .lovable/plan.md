

# Pulizia, Fix e Stabilizzazione del Progetto

## 1. Bug e Warning da Correggere

### BUG-1: Console Warning "Function components cannot be given refs" (FinancialSummary.tsx)
I componenti `PaymentStatusRow` e `DatePickerField` dentro `FinancialSummary.tsx` vengono usati come figli di componenti che tentano di passare ref. Entrambi sono function component senza `forwardRef`.

**Fix**: Wrappare `PaymentStatusRow` e `DatePickerField` con `React.forwardRef` per eliminare i warning in console.

### BUG-2: Funzioni duplicate in 3 file
Le funzioni `getAmountDue`, `getAmountCollected` e `getPendingPayments` sono duplicate identiche in:
- `src/pages/azienda/OrdersList.tsx`
- `src/components/orders/OrdersTable.tsx`
- `src/components/orders/OrdersPipelineCard.tsx`

**Fix**: Estrarre queste funzioni in un file utility condiviso (es. `src/lib/orderUtils.ts`) e importarle nei 3 file, rimuovendo le copie locali.

### BUG-3: Interface `OrderWithDetails` duplicata
La stessa interface e definita in `OrdersList.tsx` e `OrdersTable.tsx`.

**Fix**: Spostarla nel file utility condiviso ed esportarla da li.

## 2. Pulizia Codice

### CLEAN-1: Funzioni inutilizzate in OrdersList.tsx
Le funzioni `getAmountDue`, `getAmountCollected`, `getPendingPayments` in `OrdersList.tsx` sono usate solo nelle stats e nell'export CSV. Dopo l'estrazione in utility, le copie locali vanno rimosse.

### CLEAN-2: Interface `OrderCosts` gia esportata correttamente
L'export di `OrderCosts` in `OrdersTable.tsx` e corretto e non serve duplicazione.

## 3. Miglioramenti UX

### UX-1: Tabella ordini - overflow orizzontale
La tabella con 12 colonne puo risultare stretta su schermi piccoli. Gia presente `overflow-x-auto` -- verificato OK.

### UX-2: Margine con colore e percentuale
Gia implementato con colori verde/rosso e percentuale. Nessun intervento necessario.

## Dettaglio Tecnico

### Nuovo file: `src/lib/orderUtils.ts`
Conterra:
- Interface `OrderWithDetails`
- Funzione `getAmountDue(order): number`
- Funzione `getAmountCollected(order): number`
- Funzione `getPendingPayments(order): string[]`

### File: `src/components/orders/FinancialSummary.tsx`
- Wrappare `DatePickerField` con `React.forwardRef`
- Wrappare `PaymentStatusRow` con `React.forwardRef`

### File: `src/pages/azienda/OrdersList.tsx`
- Rimuovere interface `OrderWithDetails` locale (righe 22-47)
- Rimuovere funzioni `getAmountDue`, `getAmountCollected`, `getPendingPayments` locali (righe 54-76)
- Importare da `@/lib/orderUtils`

### File: `src/components/orders/OrdersTable.tsx`
- Rimuovere interface `OrderWithDetails` locale (righe 27-52)
- Rimuovere funzioni `getPendingPayments`, `getAmountDue`, `getAmountCollected` locali (righe 54-76)
- Importare da `@/lib/orderUtils`

### File: `src/components/orders/OrdersPipelineCard.tsx`
- Rimuovere funzione `getPendingPayments` locale
- Importare da `@/lib/orderUtils`

## Riepilogo Interventi

| Categoria | Cosa | Dove |
|---|---|---|
| Bug fix | forwardRef warning | FinancialSummary.tsx |
| Pulizia | Funzioni duplicate x3 | OrdersList, OrdersTable, OrdersPipelineCard |
| Pulizia | Interface duplicata x2 | OrdersList, OrdersTable |
| Rifattorizzazione | Nuovo file utility | lib/orderUtils.ts |

## Vincolo
Nessun cambiamento al comportamento funzionale. Solo pulizia, deduplicazione e fix warning.

