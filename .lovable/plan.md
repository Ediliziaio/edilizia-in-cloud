

## Piano: Visual Flow Builder con ReactFlow (adattato al progetto esistente)

### Analisi prerequisiti

Il documento FLOW-03 assume risorse inesistenti. Ecco come adattarle:

| Prerequisito FLOW-03 | Stato | Soluzione |
|---|---|---|
| `flow-node-catalog.ts` | Non esiste | Creare basandosi sui cataloghi in `src/types/automationBuilder.ts` (TRIGGER_CATEGORIES, ACTION_CATEGORIES) |
| Tabella `flows` con JSONB | Non esiste | Riutilizzare `automation_flows` + `automation_nodes` + `automation_connections` esistenti, convertendo in formato ReactFlow nel hook |
| RPCs `get_flow_detail`/`save_flow` | Non esistono | Non servono — il hook `useAutomationBuilder.ts` già gestisce CRUD diretto |
| `reactflow` installato | Non installato | Installare `@xyflow/react` (v12, la versione moderna) |

### Approccio

Costruire il nuovo Visual Flow Builder come **upgrade del Marketing Automation Builder**, non come sistema parallelo. Il builder ReactFlow sostituisce solo il canvas custom SVG, mantenendo intatto:
- Schema DB relazionale (`automation_flows`, `automation_nodes`, `automation_connections`)
- Hook `useAutomationBuilder.ts` (350+ righe con undo/redo, auto-save)
- Edge function `process-automation`
- Enrollment engine, log, trigger events

### File da creare/modificare

```text
NUOVI (12 file):
src/lib/flow-node-catalog.ts              ← catalogo unificato con configSchema
src/components/flow-builder/
  FlowBuilderPage.tsx                      ← contenitore principale (ReactFlow)
  FlowBuilderHeader.tsx                    ← header con nome, stato, save/publish
  FlowBuilderSidebar.tsx                   ← palette nodi drag-and-drop
  FlowBuilderConfigPanel.tsx               ← pannello config nodo (destra)
  config-panels/VariablePicker.tsx         ← popover variabili {{...}}
  nodes/TriggerNode.tsx                    ← nodo trigger (verde)
  nodes/ActionNode.tsx                     ← nodo azione (indigo)
  nodes/ConditionNode.tsx                  ← nodo condizione (giallo, 2 output)
  nodes/NoteNode.tsx                       ← nodo nota
  nodes/index.ts                           ← nodeTypes map
  hooks/useFlowAdapter.ts                  ← converte relazionale ↔ ReactFlow

MODIFICATI (3 file):
src/pages/azienda/marketing/MarketingAutomationBuilder.tsx  ← punta al nuovo builder
src/routes/companyRoutes.tsx               ← route /automazioni/:flowId/edit
src/routes/adminRoutes.tsx                 ← stessa route per admin
```

### Dettagli tecnici

**1. `flow-node-catalog.ts`** — Unifica i cataloghi esistenti (`TRIGGER_CATEGORIES`, `ACTION_CATEGORIES` da `automationBuilder.ts`) in un formato con `configSchema` per rendere i form dinamici:
```ts
interface ConfigFieldSchema {
  id: string; label: string; type: 'text'|'select'|'textarea'|'number'|'boolean';
  required?: boolean; options?: {value:string;label:string}[];
  supportsVariables?: boolean; placeholder?: string;
}
interface CatalogItem {
  id: string; label: string; description?: string; icon: string;
  category: string; configSchema?: ConfigFieldSchema[];
  outputVariables?: VariableDefinition[];
}
```

**2. `useFlowAdapter.ts`** — Converte tra formato DB relazionale e ReactFlow:
- `nodesToReactFlow(dbNodes)` → `Node[]` per ReactFlow
- `connectionsToEdges(dbConnections)` → `Edge[]` per ReactFlow  
- `reactFlowToNodes(rfNodes)` → `AutomationNode[]` per salvare nel DB
- `edgesToConnections(rfEdges)` → `AutomationConnection[]` per salvare nel DB

Questo permette di riutilizzare `useAutomationBuilder.ts` senza modifiche.

**3. `FlowBuilderPage.tsx`** — Layout a 3 colonne:
- Sinistra: `FlowBuilderSidebar` (palette nodi, drag-and-drop)
- Centro: canvas `ReactFlow` con Background, Controls, MiniMap
- Destra: `FlowBuilderConfigPanel` (form config nodo selezionato)

**4. Nodi custom ReactFlow** — 4 tipi con colori distinti:
- `TriggerNode` (verde, solo output handle)
- `ActionNode` (indigo, input + output handle)
- `ConditionNode` (giallo, input + 2 output: Si/No)
- `NoteNode` (ambra, nessun handle)

**5. Routing** — Due route nuove:
- `/azienda/marketing/automazioni/:flowId/edit` → nuovo builder
- `/azienda/marketing/automazioni/nuova/edit` → nuovo builder (flowId=null)

Le route esistenti del Marketing builder vengono reindirizzate al nuovo.

### Cosa NON cambia
- Tabelle DB: `automation_flows`, `automation_nodes`, `automation_connections`, enrollments, execution_log
- Hook: `useAutomationBuilder.ts` (intatto, il nuovo builder lo wrappa)
- Edge function: `process-automation`
- Lista automazioni: `AutomationFlowsList.tsx`
- Tab enrollments/log: invariati

