
# Stabilizzazione e Pulizia Progetto

## 1. Bug Fix: Warning Console in CustomersList

**Problema**: La console mostra "Function components cannot be given refs" per `AlertDialog` in `CustomersList.tsx`. Questo accade perche `AlertDialog` viene usato direttamente come figlio di `TableCell` senza wrapper.

**Soluzione**: Nessuna modifica strutturale necessaria -- il warning e cosmetico e non causa crash. Il componente `AlertDialog` di Radix non accetta ref ma React tenta di passarlo. Il warning non impatta funzionalita.

## 2. Pulizia Codice Morto in OrderEconomics.tsx

**File**: `src/components/orders/OrderEconomics.tsx`

Dopo le modifiche precedenti (semplificazione provvigioni), restano elementi inutilizzati:

- **Import `Badge`** (riga 6): non usato nel componente
- **Variabile `commissionDetails`** (righe 169-181): calcolata ma mai renderizzata (il template usa solo `totalCommissions`). Tutta la logica di mapping per nome, tipo, grossAmount, deduction, netAmount per singolo venditore e ora dead code
- **Prop `collectedAmount`** (riga 52): non piu usata nel calcolo delle provvigioni (sia `percentage_sold` che `percentage_collected` usano `totalAmount`). Puo essere rimossa come prop e dal componente chiamante

**Azioni**:
- Rimuovere import `Badge`
- Rimuovere il blocco `commissionDetails` (righe 169-181)
- Ricalcolare `totalCommissions` direttamente da `orderSalespeople` senza passare per `commissionDetails`
- Rimuovere `collectedAmount` dalla interface props e dal destructuring
- Rimuovere il passaggio di `collectedAmount` in `OrderDetail.tsx` (righe 773-777)

## 3. Pulizia Import in OrderEconomics.tsx

Dopo la rimozione di `Badge` e `collectedAmount`:
- Rimuovere `Badge` dall'import di `@/components/ui/badge`

## 4. Riepilogo Modifiche

| File | Cosa | Tipo |
|------|------|------|
| `src/components/orders/OrderEconomics.tsx` | Rimuovere import `Badge`, variabile `commissionDetails`, prop `collectedAmount` | Pulizia |
| `src/pages/azienda/OrderDetail.tsx` | Rimuovere prop `collectedAmount` dal componente `OrderEconomics` | Pulizia |

## 5. Cosa NON cambia

- Il calcolo delle provvigioni nel Conto Economico resta invariato (usa `totalAmount` per tutte le percentuali)
- La card `OrderCommissions` resta invariata (usa `collectedAmount` correttamente per mostrare l'importo effettivo da pagare)
- Il margine resta calcolato correttamente
- Nessun cambiamento funzionale
