

# Miglioramento Caricamento Documenti Ordine

## Problemi identificati

1. **Bucket storage pubblico** — il bucket `order-attachments` è impostato come `public: true`, il che significa che chiunque con l'URL può scaricare qualsiasi file. Deve essere privato con URL firmati (signed URLs).
2. **Nessuna validazione MIME type** — i file vengono accettati basandosi solo sull'estensione nel tag `accept`, ma il tipo reale non viene verificato lato server.
3. **Nessun limite al numero di file** — un utente potrebbe caricare un numero illimitato di file.
4. **Storage policy troppo permissiva per DELETE** — qualsiasi utente autenticato può eliminare file di qualsiasi azienda.
5. **`PendingFilesUpload` manca validazione tipo MIME** — accetta qualsiasi file se rinominato.

## Piano di intervento

### 1. Database migration — Rendere il bucket privato + policy restrittive

- Aggiornare il bucket `order-attachments` da `public = true` a `public = false`
- Sostituire le storage policies:
  - **SELECT**: solo utenti autenticati della stessa company (join su `orders`)
  - **INSERT**: solo utenti autenticati (come ora)
  - **DELETE**: solo utenti che appartengono alla company dell'ordine (non qualsiasi utente autenticato)

### 2. Codice — Usare signed URLs invece di public URLs

- **`OrderAttachments.tsx`**: Sostituire `getPublicUrl()` con `createSignedUrl()` (durata 1 ora). I link di download e anteprima useranno URL firmati temporanei.
- **`CreateOrder.tsx`** (onSuccess upload): Stessa modifica — salvare il `filePath` nel DB (non l'URL pubblico) e generare signed URL al momento della visualizzazione.
- **`CustomerOrderAttachments`**: Generare signed URLs on-the-fly per i download dei clienti.

### 3. Codice — Validazione file robusta

- **`PendingFilesUpload.tsx`**:
  - Aggiungere whitelist MIME types (`application/pdf`, `image/jpeg`, `image/png`, `image/gif`, `application/msword`, ecc.)
  - Validare `file.type` oltre all'estensione
  - Limite massimo: 10 file per ordine
  - Mostrare errore chiaro se tipo non valido

- **`OrderAttachments.tsx`** (upload handler):
  - Stessa validazione MIME type
  - Stessa logica signed URL

### 4. Codice — Salvataggio path relativo nel DB

- Cambiare da salvare `publicUrl` a salvare il `filePath` relativo (es. `orders/{id}/timestamp-file.pdf`)
- Al momento della visualizzazione, generare signed URL dal path salvato
- Questo garantisce che anche se il bucket diventa privato, i file restano accessibili solo tramite URL temporanei

### 5. Storage policy più sicura per DELETE

La nuova policy DELETE verificherà che il file appartenga a un ordine della company dell'utente, non solo che l'utente sia autenticato.

### File modificati

| File | Modifiche |
|------|-----------|
| `migration SQL` (nuovo) | Bucket privato, policy storage restrittive |
| `src/components/orders/OrderAttachments.tsx` | Signed URLs, validazione MIME, salvataggio path relativo |
| `src/components/orders/PendingFilesUpload.tsx` | Validazione MIME type, limite 10 file |
| `src/pages/azienda/CreateOrder.tsx` | Signed URL nel flusso upload, salvataggio path relativo |

### Risultato

- File protetti: accessibili solo tramite URL firmati temporanei (1h)
- Validazione tipo file sia client-side che nella logica di upload
- Limite file per ordine
- Storage policy tenant-scoped per DELETE
- Path relativo nel DB per flessibilita futura

