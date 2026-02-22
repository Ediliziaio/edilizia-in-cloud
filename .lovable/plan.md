

# Stabilizzazione Opportunita + Pulizia Codebase

## Bug identificati e fix

### 1. Console Warning: ref su ImportWizard e StepStart
**Problema**: Due warning in console "Function components cannot be given refs" per `ImportWizard` e `StepStart`. React tenta di passare un ref a questi componenti ma non usano `forwardRef`.

**File da modificare**:
- `src/components/shared/ImportWizard.tsx`: wrappare con `React.forwardRef`
- `src/components/shared/import-wizard/StepStart.tsx`: wrappare con `React.forwardRef`

### 2. CSVImportDialog: codice duplicato legacy
**Problema**: `CSVImportDialog` contiene funzioni `autoMatch` e `parseFileData` identiche a quelle in `ImportWizard.tsx`. Il componente `CSVImportDialog` e ancora usato da 3 pagine (CustomersList, OrdersList, CompanyCostsManager), quindi non puo essere rimosso, ma la duplicazione di logica e inutile.

**Azione**: Nessuna rimozione (e usato altrove), ma nessun fix necessario - la duplicazione e accettabile dato che i due componenti servono contesti diversi.

### 3. OpportunityDialog: stage_id non si aggiorna quando stages cambiano
**Problema**: `stageId` viene inizializzato con `stages[0]?.id || ""` al mount del componente. Se `stages` arriva vuoto e poi si popola (async), lo state resta `""`. Questo puo causare un errore silenzioso alla creazione.

**Fix**: Aggiungere un `useEffect` che aggiorna `stageId` quando `stages` cambia e `stageId` e vuoto o non valido.

**File**: `src/components/opportunities/OpportunityDialog.tsx`

### 4. OpportunityDetailDialog: auto-sync tag potenzialmente causa loop e write non necessarie
**Problema**: L'`useEffect` alle righe 146-163 che sincronizza i tag dal contatto all'opportunita scrive direttamente nel DB ad ogni apertura del dialog, anche se non necessario. Questo causa invalidation della cache e potenziali race condition.

**Fix**: Aggiungere un guard per evitare la sync se i tag sono gia allineati. Spostare il check prima della write.

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

## Pulizia codice

### 5. Import inutili
- `src/components/opportunities/OpportunityDialog.tsx` riga 16: `useNavigate` importato ma mai usato per la navigazione (solo dichiarato, non chiamato)
- `src/components/opportunities/OpportunityDetailDialog.tsx` riga 32: `useNavigate` importato e dichiarato ma non usato nelle funzioni

**Fix**: Rimuovere import e dichiarazioni di `useNavigate` da entrambi i file.

### 6. OpportunityCard: variabile `stopProp` non necessaria come funzione separata
**Azione**: Nessuna modifica - e usata in piu punti, e giustificata.

## Miglioramenti UX

### 7. OpportunityDialog: feedback durante il salvataggio
**Problema**: Il pulsante "Crea Opportunita" non mostra stato di loading durante il salvataggio.

**Fix**: Aggiungere `disabled={createOpportunity.isPending}` e icona `Loader2` al pulsante di submit.

**File**: `src/components/opportunities/OpportunityDialog.tsx` (riga del pulsante submit, circa riga 490)

### 8. ImportWizard: transizione tra step
**Problema**: Il passaggio tra step e istantaneo senza feedback visivo.

**Fix**: Aggiungere una transizione CSS con `transition-opacity duration-200` sul container del contenuto degli step.

**File**: `src/components/shared/ImportWizard.tsx`

## Riepilogo file modificati

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/shared/ImportWizard.tsx` | Bug fix + UX | Aggiungere `forwardRef` + transizione step |
| `src/components/shared/import-wizard/StepStart.tsx` | Bug fix | Aggiungere `forwardRef` |
| `src/components/opportunities/OpportunityDialog.tsx` | Bug fix + Cleanup + UX | Fix stageId init + rimuovere useNavigate + loading button |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Bug fix + Cleanup | Guard auto-sync tag + rimuovere useNavigate |

## Dettagli tecnici

### ImportWizard.tsx - forwardRef
Wrappare il componente:
```text
export const ImportWizard = React.forwardRef<HTMLDivElement, ImportWizardProps>(
  function ImportWizard({ open, onClose, ... }, ref) {
    // ... corpo esistente
    return <div ref={ref} className="flex flex-col ...">
  }
);
```

### StepStart.tsx - forwardRef
Wrappare il componente:
```text
export const StepStart = React.forwardRef<HTMLDivElement, StepStartProps>(
  function StepStart({ objectType, onObjectTypeChange }, ref) {
    return <div ref={ref} className="max-w-xl ...">
  }
);
```

### OpportunityDialog.tsx - stageId sync
Aggiungere dopo la dichiarazione dello state:
```text
useEffect(() => {
  if (stages.length > 0 && !stages.some(s => s.id === stageId)) {
    setStageId(stages[0].id);
  }
}, [stages]);
```

### OpportunityDetailDialog.tsx - guard auto-sync
Modificare l'useEffect tag-sync (righe 146-163) per controllare se i tag mancanti sono davvero mancanti prima di fare la write.

