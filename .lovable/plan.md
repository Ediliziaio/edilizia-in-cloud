
# Fix Import Error + Custom Fields in Import

## Bug 1: "Component is not a function" quando si clicca Import

**Causa**: Le componenti `ImportWizard`, `StepStart` e `StepIndicator` sono state wrappate con `React.forwardRef` nelle modifiche precedenti, ma nessun parent passa un ref a queste componenti. Il `forwardRef` non necessario causa problemi con l'HMR (Hot Module Replacement) di Vite e puo produrre l'errore "Component is not a function" durante il re-render.

**Fix**: Rimuovere `React.forwardRef` da tutte e tre le componenti, tornando a semplici function components. Nessuno le usa con un ref.

### File modificati:

| File | Modifica |
|------|----------|
| `src/components/shared/ImportWizard.tsx` | Rimuovere `React.forwardRef`, tornare a semplice function export |
| `src/components/shared/import-wizard/StepStart.tsx` | Rimuovere `React.forwardRef`, tornare a semplice function export |
| `src/components/shared/import-wizard/StepIndicator.tsx` | Rimuovere `React.forwardRef` e `displayName`, tornare a semplice function export |

## Bug 2: Campi personalizzati mancanti nell'importazione CSV

**Causa**: Le liste `CSV_FIELDS` (contatti) e `OPP_IMPORT_FIELDS` (opportunita) sono hardcoded e non includono i campi personalizzati creati dall'utente (es. "Citta", o qualsiasi campo custom definito in Impostazioni > Campi personalizzati).

**Fix**: In `MarketingContacts.tsx` e `MarketingOpportunities.tsx`, usare i hook `useContactCustomFields()` e `useOpportunityCustomFields()` per recuperare i campi personalizzati dal database, e concatenarli ai campi statici prima di passarli al wizard.

### File modificati:

| File | Modifica |
|------|----------|
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Importare `useContactCustomFields`, creare lista dinamica di import fields che include i campi personalizzati |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Usare il gia importato `useOpportunityCustomFields`, creare lista dinamica di import fields che include i campi personalizzati |

## Dettagli tecnici

### ImportWizard.tsx - Rimuovere forwardRef

Da:
```text
export const ImportWizard = React.forwardRef<HTMLDivElement, ImportWizardProps>(function ImportWizard({
  open, onClose, ...
}: ImportWizardProps, ref) {
  ...
  return <div ref={ref} className="flex flex-col ...">
});
```

A:
```text
export function ImportWizard({
  open, onClose, ...
}: ImportWizardProps) {
  ...
  return <div className="flex flex-col ...">
}
```

### StepStart.tsx - Rimuovere forwardRef

Da:
```text
export const StepStart = React.forwardRef<HTMLDivElement, StepStartProps>(
  function StepStart({ objectType, onObjectTypeChange }, ref) {
    return <div ref={ref} className="max-w-xl ...">
  }
);
```

A:
```text
export function StepStart({ objectType, onObjectTypeChange }: StepStartProps) {
  return <div className="max-w-xl ...">
}
```

### StepIndicator.tsx - Rimuovere forwardRef

Da:
```text
export const StepIndicator = React.forwardRef<HTMLDivElement, StepIndicatorProps>(
  ({ currentStep }, ref) => {
    return <div ref={ref} className="flex ...">
  }
);
StepIndicator.displayName = "StepIndicator";
```

A:
```text
export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return <div className="flex ...">
}
```

### MarketingContacts.tsx - Aggiungere campi personalizzati

Aggiungere import e useMemo:
```text
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";

// Dentro il componente:
const { data: contactCustomFields = [] } = useContactCustomFields();

const importFields = useMemo(() => {
  const customImportFields = contactCustomFields.map(f => ({
    key: `custom_${f.id}`,
    label: f.name,
    required: false,
    type: "text" as const,
  }));
  return [...CSV_FIELDS, ...customImportFields];
}, [contactCustomFields]);
```

Passare `importFields` al posto di `CSV_FIELDS` nel componente `ImportWizard`.

Aggiornare anche `onImportContacts` per salvare i valori dei campi personalizzati in `marketing_contact_field_values`.

### MarketingOpportunities.tsx - Aggiungere campi personalizzati

Il hook `useOpportunityCustomFields` e gia importato (riga 16). Aggiungere un `useMemo`:
```text
const importFields = useMemo(() => {
  const customImportFields = oppCustomFields.map(f => ({
    key: `custom_${f.id}`,
    label: f.name,
    required: false,
    type: "text" as const,
  }));
  return [...OPP_IMPORT_FIELDS, ...customImportFields];
}, [oppCustomFields]);
```

Passare `importFields` al posto di `OPP_IMPORT_FIELDS` al wizard e aggiornare `onImportOpportunities` per salvare i valori custom in `marketing_opportunity_field_values`.

## Riepilogo

- **3 file** per fix "Component is not a function" (rimozione forwardRef inutile)
- **2 file** per aggiungere campi personalizzati all'importazione
- **5 file totali** modificati
- Nessun cambiamento funzionale al comportamento esistente
