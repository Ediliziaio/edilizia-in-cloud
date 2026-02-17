
# Fix: Scroll nel dialog permessi Super Admin

## Problema
Lo `ScrollArea` di Radix non sta abilitando lo scroll correttamente. Dalla screenshot si vede che il contenuto si ferma a "Statistiche Piattaforma" e la sezione "Aziende visibili" non e' raggiungibile. Il componente Radix `ScrollArea` richiede una altezza fissa esplicita per funzionare, e la combinazione `flex-1` + `max-h` dentro un dialog non gli fornisce il vincolo necessario.

## Soluzione
Sostituire il componente `ScrollArea` con un semplice `div` con `overflow-y-auto`, che funziona in modo piu affidabile in questo contesto.

### Modifica in `SuperAdminPermissionsDialog.tsx`

Riga 152, cambiare da:
```
<ScrollArea className="flex-1 -mx-6 px-6 max-h-[60vh]">
```
a:
```
<div className="flex-1 -mx-6 px-6 overflow-y-auto" style={{ maxHeight: "60vh" }}>
```

E il tag di chiusura corrispondente (riga ~203) da `</ScrollArea>` a `</div>`.

Rimuovere anche l'import di `ScrollArea` se non piu utilizzato.

Questo approccio garantisce che lo scroll nativo del browser funzioni correttamente per raggiungere la sezione "Aziende visibili" e la lista delle aziende selezionabili.
