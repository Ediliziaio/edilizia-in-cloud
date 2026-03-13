

## FLOW-EXT-02 — Catalogo Completo Trigger + Azioni

### Obiettivo
Sostituire il catalogo parziale in `src/lib/flow-node-catalog.ts` (che dipende da `automationBuilder.ts`) con un catalogo self-contained che copre tutti i domini aziendali: 34 trigger, 22 azioni, 2 condizioni.

### Approccio

Il file attuale esporta tipi e funzioni usati da 8 file. Riscriveremo il catalogo mantenendo **backward-compatible exports** per evitare di rompere i consumer.

### File da modificare

**1. `src/lib/flow-node-catalog.ts`** — Riscrittura completa:
- Rimuovere la dipendenza da `@/types/automationBuilder` (TRIGGER_CATEGORIES, ACTION_CATEGORIES, etc.)
- Definire nuovi tipi: `TriggerDefinition`, `ActionDefinition`, `ConditionDefinition` con `outputVariables`, `dbTable`, `dbEvent`, `helpText`, nuovi field types (`user_select`, `entity_select`, `tag_input`, `json_editor`, `date`, `time`)
- Popolare `TRIGGER_CATALOG` (34 items), `ACTION_CATALOG` (22 items), `CONDITION_CATALOG` (2 items) come da spec
- Aggiungere helper maps: `TRIGGER_MAP`, `ACTION_MAP`, `TRIGGERS_BY_CATEGORY`, `ACTIONS_BY_CATEGORY`
- **Mantenere backward-compatible exports**: `CatalogItem` (type alias che unifica trigger/action/condition), `FlowNodeKind`, `getCatalogItem()`, `FULL_CATALOG`, `NOTE_CATALOG_ITEM`, `NODE_KIND_STYLES`, `ConfigFieldSchema` (esteso con nuovi types)

**2. `src/components/flow-builder/FlowBuilderSidebar.tsx`** — Aggiornare per usare i nuovi gruppi:
- Importare `TRIGGERS_BY_CATEGORY`, `ACTIONS_BY_CATEGORY`, `CONDITION_CATALOG` 
- Generare i gruppi dinamicamente dalle categorie invece di usare `TRIGGER_CATALOG`/`ACTION_CATALOG` flat
- Aggiungere tab "Condizioni" o includerle nella tab Azioni
- Aggiungere icone per le nuove categorie (ordini, fatturazione, assistenza, hr, preventivi, magazzino)

**3. `src/components/flow-builder/FlowBuilderConfigPanel.tsx`** — Supportare i nuovi field types:
- `user_select` → Select dropdown (placeholder, same UI as select)
- `entity_select` → Text input con supporto variabili (for now, select con placeholder)
- `tag_input` → reuse existing tags logic
- `json_editor` → Textarea con placeholder JSON
- `date` → Input type="date"
- `time` → Input type="time"
- Mostrare `helpText` sotto i campi quando presente

### Compatibilità backward

I consumer esistenti (`useFlowAdapter`, node components, `FlowBuilderPage`) usano:
- `getCatalogItem(id)` → restituirà un `CatalogItem` unificato (con `kind`, `category`, `categoryLabel`, `configSchema`)
- `NODE_KIND_STYLES` → invariato
- `FlowNodeKind` → invariato
- `ConfigFieldSchema` → esteso con nuovi `type` values

Questo viene garantito aggiungendo una sezione "bridge" nel nuovo file che converte `TriggerDefinition`/`ActionDefinition` in `CatalogItem` per i consumer che usano ancora quel tipo.

### Cosa NON cambia
- Tutti i node components (TriggerNode, ActionNode, ConditionNode, NoteNode)
- `useFlowAdapter.ts`
- `FlowBuilderPage.tsx`
- `src/types/automationBuilder.ts` (non viene eliminato, solo non più importato dal catalogo)

