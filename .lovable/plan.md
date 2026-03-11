

# SO6 — Sostituzione PipelineStagesConfig.tsx

## Differenze chiave rispetto al file attuale

Il file attuale (293 righe) ha già i campi `win_probability` e `stalled_threshold_days` nella `Stage` interface, ma il layout del `SortableStage` è su una singola riga (`flex items-center`). La versione SO6 (339 righe di codice) introduce:

1. **Layout a due righe per ogni stage** — riga principale (nome, auto_status, delete) + riga Sales OS sotto (prob. win %, alert ferma gg)
2. **Callback rinominato**: `onFieldChange` → `onSalesOSChange` con tipo più stretto (`'win_probability' | 'stalled_threshold_days'`)
3. **handleSalesOSChange** dedicato nel componente padre (sostituisce il generico `handleFieldChange`)
4. **Salvataggio** include esplicitamente `win_probability` e `stalled_threshold_days` sia in update che in insert
5. **Commento `// SO6: Sales OS fields`** nell'interface

## Piano

1. Sovrascrivere `src/components/settings/PipelineStagesConfig.tsx` con il contenuto esatto delle righe 11–348 del prompt SO6
2. Nessun altro file toccato

