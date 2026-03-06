

# Mostrare "Data fine contratto" anche in modifica

## Problema
La condizione `!editingCost` a riga 297 nasconde il campo "Data fine contratto" quando si modifica un costo esistente. L'utente non può quindi rigenerare le occorrenze ricorrenti o cambiare la durata del contratto in fase di editing.

## Modifiche

### `src/components/forecast/CostFormDialog.tsx` (riga 297)
- Rimuovere `&& !editingCost` dalla condizione che nasconde il campo data fine contratto
- Cambiare da: `{formData.recurrence !== "once" && !editingCost && (`
- A: `{formData.recurrence !== "once" && (`
- Aggiornare il testo di preview per la modifica: in editing, mostrare "Verranno creati X nuovi costi" per chiarire che si generano nuove occorrenze aggiuntive

### `src/components/forecast/CostFormDialog.tsx` (riga 345)
- Aggiornare la condizione `disabled` del bottone: rimuovere `&& !editingCost` dal check su `end_date`
- Da: `(formData.recurrence !== "once" && !editingCost && !formData.end_date)`
- A: `(formData.recurrence !== "once" && !formData.end_date)`

### `src/hooks/useCompanyCostsMutations.ts` (mutazione save, ramo editing)
- Nel ramo `editingCostId`, dopo l'update del singolo record, se `end_date` è valorizzata e la ricorrenza non è "once", generare le nuove occorrenze mancanti (stessa logica del ramo creazione) — solo date future che non esistono già come duplicati

