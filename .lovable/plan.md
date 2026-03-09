

## Fix: Scrollbar non funzionante nello Step 3 Permessi

**Problema**: Lo screenshot conferma che la sezione Marketing e il toggle "Solo assegnati" sono tagliati. Le fix precedenti (`overflow-hidden`, `flex flex-col`, `max-h-[60vh]`) non bastano perche il `DialogContent` base di shadcn ha `grid` come layout, che sovrascrive `flex flex-col`.

**Causa root**: La classe base del `DialogContent` (riga 39 di dialog.tsx) include `grid`, che ha precedenza sul `flex flex-col` aggiunto in CreateUserWizard. In un `grid` layout, il figlio `ScrollArea` con `flex-1` non si comporta come atteso per limitare l'altezza.

**Fix** — File `src/components/users/CreateUserWizard.tsx`:

1. **Riga 201** — Sovrascrivere il layout grid con `!flex !flex-col` (usando `!important` di Tailwind) e assicurare il contenimento:
   ```tsx
   <DialogContent className="sm:max-w-[600px] max-h-[85vh] !flex !flex-col overflow-hidden">
   ```

2. **Riga 227** — Usare `overflow-y-auto` direttamente invece di affidarsi alla ScrollArea di Radix, che ha problemi con layout grid. Sostituire il `ScrollArea` con un semplice `div` scrollabile:
   ```tsx
   <div className="flex-1 min-h-0 overflow-y-auto pr-4">
   ```
   E chiudere con `</div>` al posto di `</ScrollArea>` (circa riga 500).

Questo approccio elimina la dipendenza dal componente `ScrollArea` di Radix (che richiede un'altezza fissa dal parent) e usa il native overflow del browser, garantendo lo scroll in ogni contesto di layout.

