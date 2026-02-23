
# Fix: Bottoni Disabilitati con "Caricamento in corso..." + Warning forwardRef

## Problemi trovati

### 1. `canPersist` dipende da `effectiveCompany` che puo essere null per super admin
In `useAutomationBuilder.ts` linea 146:
```typescript
const canPersist = Boolean(flowId && flowId !== "nuova" && effectiveCompany);
```
Per un super admin che impersona un'azienda, `effectiveCompany` dipende da `impersonatedCompany` che viene caricato in modo asincrono nel `AuthContext`. Questo significa che:
- Le query del flow si completano PRIMA che `impersonatedCompany` sia caricato
- `isLoading` diventa false, il builder si renderizza
- Ma `effectiveCompany` e ancora null, quindi `canPersist = false`
- Tutti i bottoni restano disabilitati con tooltip "Caricamento in corso..."
- Anche quando `effectiveCompany` si risolve, se il componente non si ri-renderizza correttamente, resta bloccato

**Fix**: Rimuovere `effectiveCompany` da `canPersist`. I check su `effectiveCompany` sono gia presenti dentro `saveAll` e `togglePublish`. Il gating dei bottoni deve dipendere solo da `flowId` e `flow` (il dato caricato dal DB):
```typescript
const canPersist = Boolean(flowId && flowId !== "nuova" && flow);
```

### 2. Warning `forwardRef` su `TriggerPickerDialog`
Il componente `TriggerPickerDialog` e una function component senza `forwardRef`. Quando usato dentro il builder con `TooltipProvider`, React tenta di passare un ref che viene ignorato, generando il warning.

**Fix**: Wrappare `TriggerPickerDialog` con `React.forwardRef`.

### 3. Stessa cosa per `ActionPickerDialog`
Verificare e applicare lo stesso fix se necessario.

## Modifiche

### File 1: `src/hooks/useAutomationBuilder.ts`
- Linea 146: cambiare `canPersist` da `Boolean(flowId && flowId !== "nuova" && effectiveCompany)` a `Boolean(flowId && flowId !== "nuova" && flow)`
- Questo rende i bottoni attivi non appena il flow e caricato dal DB, indipendentemente dal timing dell'auth context

### File 2: `src/components/marketing/automations/TriggerPickerDialog.tsx`
- Wrappare il componente con `React.forwardRef` per eliminare il warning

### File 3: `src/components/marketing/automations/ActionPickerDialog.tsx`
- Stesso fix `forwardRef` se necessario

## Risultato
- I bottoni Salva, Archivia e Bozza/Pubblicata funzionano immediatamente quando il flow e caricato
- Nessun "Caricamento in corso..." falso positivo
- Warning React eliminato dalla console
