

# Fix barra di scorrimento — Costi Aziendali

## Problema

La tabella ha 14-15 colonne senza larghezze fissate. Il componente `Table` di shadcn wrappa in `overflow-auto`, che genera la scrollbar orizzontale. `overflow-hidden` sul wrapper esterno non basta perché il div interno ha `overflow-auto`.

## Soluzione

Applicare lo stesso pattern usato in `MarginTab.tsx`: `table-fixed` + larghezze percentuali su ogni colonna. Le colonne meno importanti (IVA, Ritardo, Origine) ricevono larghezze ridotte; le colonne testuali (Nome, Fornitore) ricevono `truncate` per evitare wrap.

### `src/components/forecast/CostsTable.tsx`

1. **Aggiungere `table-fixed`** al componente `Table` (riga 275):
   ```
   <Table className="table-fixed">
   ```

2. **Assegnare larghezze percentuali** a tutte le `TableHead` / `SortableTableHead`:
   - Checkbox: `w-[3%]`
   - Nome: `w-[13%]` + truncate sulle celle
   - Origine: `w-[6%]`
   - Tipo (solo tab "all"): `w-[6%]`
   - Fornitore: `w-[9%]` + truncate
   - Categoria: `w-[7%]` + truncate
   - Imponibile: `w-[8%]`
   - IVA: `w-[5%]`
   - Totale Lordo: `w-[8%]`
   - Ricorrenza: `w-[7%]`
   - Scadenza: `w-[8%]`
   - Stato: `w-[8%]`
   - Ritardo: `w-[5%]`
   - Ordine: `w-[7%]`
   - Azioni: `w-[6%]`

3. **Aggiungere `truncate`** alle `TableCell` di Nome, Fornitore e Categoria per evitare che testi lunghi forzino l'espansione.

4. **Aggiungere `text-xs`** ai badge più larghi (Origine, Ricorrenza) per comprimere il contenuto.

### File da modificare
- `src/components/forecast/CostsTable.tsx` — aggiungere `table-fixed`, larghezze colonne, truncate

