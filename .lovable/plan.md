

# Fix Bug "Flow non disponibile" - Salvataggio Non Funzionante

## Causa radice

Quando l'utente va su `/nuova`, il flow viene creato nel database e il `navigate` verso `/:uuid` viene chiamato. Ma nel frattempo, il loading screen scompare perche `createFlowMutation.data` e truthy, mostrando il builder con `flowId = undefined`. Qualsiasi azione dell'utente (rinominare, salvare, aggiungere nodi + autosave) chiama mutazioni che falliscono perche `flowId` non esiste.

Il toast "Operazione non riuscita: Flow non disponibile" viene dal `MutationCache.onError` globale in `App.tsx`.

## Fix (2 file)

### 1. `src/components/marketing/automations/AutomationBuilder.tsx` - Linea 268

Cambiare la condizione di loading per mantenere lo spinner **sempre** quando `id === "nuova"`:

**Prima:**
```typescript
if (isLoading || (id === "nuova" && (createFlowMutation.isPending || !createFlowMutation.data))) {
```

**Dopo:**
```typescript
if (isLoading || id === "nuova") {
```

Questo impedisce al builder di renderizzarsi mentre siamo ancora su `/nuova`. L'utente vede "Creazione automazione in corso..." fino a quando il `navigate` cambia l'URL a `/:uuid`, a quel punto il componente si ri-monta con il `flowId` corretto.

### 2. `src/hooks/useAutomationBuilder.ts` - Linea 293

Aggiungere un guard silenzioso nel `updateFlowMutation` invece di lanciare un errore (che poi viene catturato dal `MutationCache` globale):

**Prima:**
```typescript
mutationFn: async (updates: Partial<AutomationFlow>) => {
  if (!flowId) throw new Error("Flow non disponibile.");
```

**Dopo:**
```typescript
mutationFn: async (updates: Partial<AutomationFlow>) => {
  if (!flowId || flowId === "nuova") {
    console.warn("updateFlowMutation called without valid flowId, skipping");
    return;
  }
```

### 3. `src/components/marketing/automations/AutomationBuilder.tsx` - `handleFlowNameBlur`

Aggiungere guard per impedire la chiamata a `updateFlowMutation` quando il flow non e pronto:

**Prima:**
```typescript
if (flowName && flowName !== flow?.name) {
  updateFlowMutation.mutate({ name: flowName });
}
```

**Dopo:**
```typescript
if (flowName && flowName !== flow?.name && canPersist && flow) {
  updateFlowMutation.mutate({ name: flowName });
}
```

## Risultato atteso

- Lo spinner "Creazione automazione in corso..." resta visibile fino al redirect
- Nessun errore "Flow non disponibile" mai piu
- Il salvataggio funziona correttamente una volta su `/:uuid`
- Le mutazioni non lanciano errori quando il contesto non e pronto
