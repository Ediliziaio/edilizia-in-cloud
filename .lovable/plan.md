

# Caricamento documenti durante la creazione ordine

## Problema attuale
Nella pagina "Nuovo Ordine", la sezione documenti mostra solo il messaggio "I documenti potranno essere caricati dopo aver salvato l'ordine." L'utente deve prima creare l'ordine e poi tornare a caricare i file — un passaggio in più che genera attrito.

## Soluzione
Aggiungere un'area di staging file nel form di creazione ordine. I file vengono selezionati e mostrati in anteprima prima del salvataggio. Al momento della creazione dell'ordine, i file vengono caricati automaticamente nello storage e salvati in `order_attachments`.

## Modifiche

### File: `src/pages/azienda/CreateOrder.tsx`

1. **Nuovo state per file in staging**: `pendingFiles: File[]` — array di file selezionati dall'utente prima della creazione.

2. **Sostituzione sezione documenti (righe 685-701)**: Invece del messaggio statico, mostrare:
   - Un pulsante "Carica File" che apre il file picker
   - La lista dei file selezionati con nome, dimensione, icona tipo e pulsante rimuovi
   - Validazione dimensione (max 10MB per file) e formati supportati

3. **Modifica `onSuccess` della mutation (riga 359-364)**: Dopo la creazione dell'ordine, caricare automaticamente i `pendingFiles` su storage (`order-attachments/orders/{orderId}/...`) e inserire i record in `order_attachments`. Mostrare toast di conferma o errore per ogni file.

4. **Post-creazione**: Se `createdOrderId` è presente, continuare a mostrare il componente `OrderAttachments` esistente (come ora) per eventuali upload aggiuntivi.

### Flusso utente risultante
1. Compila il form ordine
2. Seleziona uno o più documenti (appaiono in lista con possibilità di rimuovere)
3. Clicca "Crea Ordine"
4. L'ordine viene creato → i file vengono caricati automaticamente
5. Appare il componente `OrderAttachments` completo per gestione post-creazione

Nessuna modifica al database o alle RLS necessaria — si usano le stesse tabelle e bucket esistenti.

