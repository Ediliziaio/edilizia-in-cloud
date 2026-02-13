

# Fix: Articoli ordine raddoppiati alla modifica

## Il problema
Quando modifichi un ordine, il sistema cerca di cancellare tutti gli articoli e reinserirli da zero. Ma la cancellazione fallisce perche la tabella `warehouse_movements` ha un vincolo di chiave esterna verso `order_items`. Il codice non controlla l'errore della cancellazione e procede comunque con l'inserimento, creando cosi articoli duplicati.

## La soluzione
Invece di cancellare e reinserire tutto (strategia "delete + insert"), usare una strategia "upsert + delete selettivo":

1. **Aggiornare** gli articoli esistenti che sono ancora presenti
2. **Inserire** solo gli articoli nuovi (quelli senza un ID esistente nel database)
3. **Cancellare** solo gli articoli che sono stati rimossi dall'utente, gestendo il vincolo FK:
   - Prima eliminare i `warehouse_movements` collegati
   - Poi eliminare i `order_item_attachments` collegati
   - Infine eliminare l'articolo

## Dettaglio tecnico

### File da modificare
`src/pages/azienda/EditOrder.tsx` - la funzione `mutationFn` dentro `updateOrderMutation`

### Logica attuale (righe 465-494)
```text
1. DELETE tutti gli order_items dell'ordine  <-- FALLISCE (FK constraint)
2. INSERT tutti gli items                    <-- CREA DUPLICATI
```

### Nuova logica
```text
1. Determinare quali articoli sono da aggiornare (hanno un ID esistente nel DB)
2. Determinare quali sono nuovi (senza ID nel DB)
3. Determinare quali sono stati rimossi (presenti nel DB ma non piu nel form)
4. Per ogni articolo rimosso:
   a. Cancellare warehouse_movements collegati
   b. Cancellare order_item_attachments collegati
   c. Cancellare l'articolo
5. Per ogni articolo esistente: UPDATE
6. Per ogni articolo nuovo: INSERT
```

### Benefici
- Nessun rischio di duplicazione articoli
- Preserva gli ID degli articoli esistenti, mantenendo i collegamenti con warehouse_movements e allegati
- Gestisce correttamente la rimozione di articoli con dipendenze FK

