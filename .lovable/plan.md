

## Fix: Scrollbar mancante nello Step 3 (Permessi) del wizard Nuovo Utente

**Problema**: La sezione Marketing e il toggle "Solo elementi assegnati" non sono visibili perche il contenuto eccede l'altezza del dialog senza attivare lo scroll. Il fix precedente (`min-h-0`) non e sufficiente.

**Causa root**: Il `DialogContent` base usa `grid` layout (dalla classe di shadcn), che sovrascrive il `flex flex-col` aggiunto. In un contesto `grid`, `flex-1` sulla `ScrollArea` non funziona per limitare l'altezza.

**Fix** — Un solo file, `src/components/users/CreateUserWizard.tsx`:

1. **Riga 201**: Aggiungere `overflow-hidden` al `DialogContent` per forzare il contenimento del contenuto entro `max-h-[85vh]`:
   ```tsx
   <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
   ```

2. **Riga 227**: Dare alla `ScrollArea` un'altezza massima esplicita invece di affidarsi a `flex-1`, cosi da funzionare correttamente anche in un layout grid:
   ```tsx
   <ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-4">
   ```

Queste due modifiche garantiscono che il contenuto dello step Permessi sia scrollabile e tutte le sezioni (Marketing, Permessi Granulari, Solo Assegnati) siano raggiungibili.

