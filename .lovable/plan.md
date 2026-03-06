

# Verifica: Data fine contratto e Data scadenza

## Stato attuale
Ho verificato il flusso completo tra i tre file coinvolti:

1. **`CostFormDialog.tsx`**: Il `periodsPreview` usa `useMemo` con dipendenze `[recurrence, due_date, end_date]` — si aggiorna correttamente quando cambiano le date. La funzione `calculatePeriodsFromDates` calcola i periodi in modo coerente.

2. **`useCompanyCostsMutations.ts`**: La `saveMutation` usa la stessa logica di calcolo periodi (righe 116-129) — coerente con il form.

3. **`CompanyCostsManager.tsx`**: `end_date` è inizializzato a `""` in `openCreate`, `openEdit`, e `openDuplicate`.

## Problema trovato
C'è un warning React in console: **"A component is changing an uncontrolled input to be controlled"** — probabilmente dal campo `end_date`. Questo succede quando il valore dell'input passa da `undefined` a una stringa.

Il problema è nel `defaultFormData` in `useCompanyCostsMutations.ts` che ha `end_date: ""`, ma in `openCreate` (riga 107) si usa `{ ...defaultFormData, cost_type: type }` che dovrebbe funzionare. Tuttavia, se `formData.end_date` diventa `undefined` in qualche percorso (es. da un vecchio stato), l'input date diventa uncontrolled.

## Fix proposto

### `src/components/forecast/CostFormDialog.tsx`
- Aggiungere fallback `value={formData.end_date || ""}` sul campo data fine contratto (riga 314)
- Aggiungere fallback `value={formData.due_date || ""}` sul campo data scadenza (riga 305)

Questo è un fix minimale che elimina il warning e garantisce che i campi siano sempre controllati, indipendentemente dallo stato del form.

