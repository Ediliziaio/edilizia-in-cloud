

# Fix: Sezione "Aziende visibili" non scrollabile

## Problema
La sezione "Aziende visibili" nel dialog dei permessi Super Admin viene tagliata: il toggle "Tutte le aziende" e la lista checkbox delle aziende non sono visibili perche finiscono sotto il footer del dialog. Lo `ScrollArea` non permette di scorrere fino in fondo.

## Causa
Il `ScrollArea` non ha abbastanza spazio verticale e manca padding in fondo al contenuto, facendo si che gli ultimi elementi vengano nascosti dai bottoni del footer.

## Soluzione

### Modifica: `SuperAdminPermissionsDialog.tsx`

1. Aggiungere `pb-4` (padding-bottom) al contenuto dentro lo `ScrollArea` per garantire spazio sotto l'ultimo elemento
2. Cambiare il layout del `DialogContent` per dare priorita allo scroll: aggiungere `overflow-hidden` e assicurare che `ScrollArea` occupi lo spazio disponibile con `max-h` calcolato
3. Aggiungere `className="h-[50vh]"` allo `ScrollArea` per forzare un'altezza fissa scrollabile

### Dettaglio tecnico

- Riga 152: cambiare `ScrollArea` da `className="flex-1 -mx-6 px-6"` a `className="flex-1 -mx-6 px-6 max-h-[55vh]"`
- Riga 153: aggiungere `pb-6` al div `space-y-4` interno per padding in fondo

Queste due modifiche garantiranno che tutto il contenuto (toggle permessi + sezione aziende + lista checkbox) sia raggiungibile tramite scroll.

