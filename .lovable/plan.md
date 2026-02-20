

# Piano: Selezione Multipla e Azioni Rapide sugli Ordini

## Cosa faremo

Aggiungeremo la possibilita di selezionare piu righe nella tabella ordini e applicare azioni in blocco tramite una barra di azioni rapide.

### Funzionalita

1. **Checkbox di selezione** su ogni riga + checkbox "seleziona tutti" nell'header
2. **Barra azioni rapide** che appare quando almeno un ordine e selezionato, con:
   - **Cambia stato**: seleziona uno stato da applicare a tutti gli ordini selezionati
   - **Elimina**: eliminazione in blocco con conferma
   - Contatore ordini selezionati + pulsante "Deseleziona tutto"
3. La barra appare in alto sulla tabella (sticky) per rimanere visibile durante lo scroll

---

## Dettagli tecnici

### Modifiche a `OrdersTable.tsx`

- Aggiungere stato `selectedIds: Set<string>` gestito internamente
- Aggiungere colonna checkbox come prima colonna (header = seleziona tutti, riga = seleziona singola)
- Aggiungere barra azioni rapide sopra la tabella quando `selectedIds.size > 0`
- Nuove props: `statuses` (per il cambio stato), `onBulkStatusChange`, `onBulkDelete`

### Modifiche a `OrdersList.tsx`

- Aggiungere mutazione `bulkStatusChange` che aggiorna lo stato di N ordini in parallelo
- Aggiungere mutazione `bulkDelete` che elimina N ordini in parallelo (riutilizzando la logica esistente)
- Passare `statuses`, `onBulkStatusChange`, `onBulkDelete` a `OrdersTable`

### Componenti UI utilizzati
- `Checkbox` (gia disponibile da Radix)
- `DropdownMenu` per il menu "Cambia stato"
- `AlertDialog` per conferma eliminazione in blocco
- `Badge` per contatore selezione

### File coinvolti

| File | Intervento |
|------|-----------|
| `src/components/orders/OrdersTable.tsx` | Aggiungere checkbox, barra azioni rapide, nuove props |
| `src/pages/azienda/OrdersList.tsx` | Aggiungere mutazioni bulk e passare props |

