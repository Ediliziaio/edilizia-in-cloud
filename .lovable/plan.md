

# Visibilità documenti in fase di creazione + limite 20 file

## Modifiche

### 1. Aumentare limite file da 10 a 20
- **`OrderAttachments.tsx`**: cambiare `MAX_FILES_PER_ORDER = 20`

### 2. PendingFilesUpload — aggiungere toggle visibilità per ogni file
- Cambiare l'interfaccia: invece di `File[]`, usare un tipo `PendingFile = { file: File; visibleToCustomer: boolean }` 
- Ogni riga file avrà uno Switch + Badge (Visibile/Privato), identico al dettaglio ordine
- Default: `visibleToCustomer = false` (privato)

### 3. CreateOrder — propagare la visibilità al DB
- Aggiornare il tipo di `pendingFiles` state da `File[]` a `PendingFile[]`
- Nel loop di upload (linee 369-400), usare `pf.visibleToCustomer` per il campo `visible_to_customer` dell'insert

### 4. useOrderDraft — aggiornare il draft
- Il draft attualmente non salva i pendingFiles (sono File objects, non serializzabili), quindi nessuna modifica necessaria al draft

### File modificati
| File | Modifica |
|------|----------|
| `OrderAttachments.tsx` | `MAX_FILES_PER_ORDER = 20` |
| `PendingFilesUpload.tsx` | Nuovo tipo `PendingFile`, Switch visibilità per file, aggiornamento UI |
| `CreateOrder.tsx` | Tipo state aggiornato, propagazione `visible_to_customer` nell'upload |

