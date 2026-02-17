

# Fix: Scroll del dialog permessi Super Admin

## Problema
Il dialog dei permessi Super Admin non permette di scorrere correttamente la lista delle aziende. Ci sono due problemi principali:

1. **ScrollArea nidificata**: la lista aziende ha un proprio `overflow-y-auto` con `max-h-48` all'interno di un `ScrollArea` esterno, creando un conflitto di scroll
2. **Altezza insufficiente**: su schermi piu piccoli, il contenuto viene tagliato e la barra di scorrimento non funziona correttamente

## Soluzione

### Modifiche a `src/components/admin/settings/SuperAdminPermissionsDialog.tsx`

- Rimuovere il `max-h-48` dalla lista aziende interna, lasciando che il `ScrollArea` esterno gestisca tutto lo scroll
- Aumentare il `max-h` del `ScrollArea` principale da `55vh` a `60vh` per dare piu spazio
- Rimuovere `overflow-y-auto` dalla lista aziende per evitare lo scroll nidificato

### Dettagli tecnici

Riga ~193, la classe della lista aziende cambia da:
```
className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto"
```
a:
```
className="rounded-lg border p-3 space-y-2"
```

Riga ~152, il ScrollArea cambia da:
```
<ScrollArea className="flex-1 -mx-6 px-6 max-h-[55vh]">
```
a:
```
<ScrollArea className="flex-1 -mx-6 px-6 max-h-[60vh]">
```

Questo permette allo `ScrollArea` principale di gestire lo scroll di tutto il contenuto, inclusa la lista aziende, senza conflitti.

