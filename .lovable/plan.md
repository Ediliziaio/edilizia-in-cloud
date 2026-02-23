

# Automazioni Marketing - Visual Builder stile GoHighLevel

## Panoramica

Ricostruzione completa della sezione "Marketing > Automazioni" con un Automation Builder visuale ispirato a GoHighLevel: canvas con nodi collegati, trigger picker categorizzato, azioni configurabili e dashboard di gestione con tab dedicate.

## Fase 1 - Database (nuove tabelle)

### Tabelle da creare

**automation_flows** - Definizione del flusso
- id, tenant (company_id), name, description, status (draft/published/archived), version (int), created_by, created_at, updated_at

**automation_nodes** - Nodi del builder
- id, flow_id, company_id, node_type (trigger/action/condition/delay/goal), position_x, position_y, config_json (jsonb), label, created_at, updated_at

**automation_connections** - Connessioni tra nodi
- id, flow_id, company_id, from_node_id, to_node_id, label (es: "true"/"false" per branch), created_at

**automation_enrollments** - Iscrizioni contatto/opportunita
- id, company_id, flow_id, flow_version, entity_type, entity_id, status (active/paused/completed/canceled), created_at, updated_at

**automation_execution_log** - Log esecuzioni
- id, company_id, flow_id, enrollment_id, node_id, node_type, status (ok/error/skipped), input_json, output_json, error_message, created_at

RLS su tutte le tabelle filtrate per company_id.

La vecchia tabella `automations` resta attiva per il modulo "Gestione Interna" senza modifiche.

## Fase 2 - Routing e Navigazione

### Nuove rotte in App.tsx
```
/azienda/marketing/automazioni           -> Dashboard automazioni
/azienda/marketing/automazioni/nuova      -> Builder (nuovo flusso)
/azienda/marketing/automazioni/:id        -> Builder (modifica flusso)
/azienda/marketing/automazioni/:id/log    -> Log di esecuzione
```

### Sidebar
La voce "Automazioni" nella sidebar marketing resta invariata, punta alla dashboard.

## Fase 3 - Dashboard Automazioni

### File: `src/pages/azienda/marketing/MarketingAutomations.tsx` (riscrittura)

Pagina con:
- Header con titolo + CTA "Nuova Automazione"
- Tab: **Tutte** | **Attive** | **Bozza** | **Archiviate**
- Tabella/lista con: nome, trigger, stato (badge), ultimo aggiornamento, toggle attiva/disattiva, azioni (modifica, duplica, archivia, elimina)
- Empty state con CTA
- Al click su "Nuova Automazione" -> redirect al builder `/automazioni/nuova`
- Al click su un'automazione esistente -> redirect al builder `/automazioni/:id`

### File: `src/components/marketing/automations/AutomationFlowsList.tsx`
Lista/tabella dei flussi con filtri e azioni rapide.

## Fase 4 - Visual Builder (Canvas)

### Architettura componenti

```
src/components/marketing/automations/
  AutomationBuilder.tsx          -- Layout principale (header + canvas + sidebar)
  AutomationCanvas.tsx           -- Canvas con griglia, nodi, connessioni SVG
  AutomationNode.tsx             -- Singolo nodo renderizzato (drag, select, delete)
  AutomationConnectionLine.tsx   -- Linea SVG tra due nodi
  AutomationNodeConfig.tsx       -- Pannello laterale configurazione nodo selezionato
  TriggerPickerDialog.tsx        -- Dialog modale per scegliere il trigger
  ActionPickerDialog.tsx         -- Dialog modale per aggiungere azione
  AutomationBuilderToolbar.tsx   -- Toolbar basso (zoom, fit, minimap)
```

### AutomationBuilder.tsx (pagina builder)
- Header: "< Indietro" | Nome flusso (editabile inline) | Tab: Builder / Impostazioni / Log | Toggle Bozza/Pubblica
- Canvas centrale con griglia puntinata
- All'apertura di un nuovo flusso: mostra nodo "+" con "Aggiungi il primo passaggio" (come in screenshot GHL)
- Al click sul "+": apre TriggerPickerDialog
- Pannello destro: configurazione del nodo selezionato
- Auto-save con debounce 2s
- Undo/Redo (stack 50 stati)

### Canvas (senza librerie esterne per grafi)
- Implementazione custom con div posizionati + SVG per le connessioni
- Drag nodi con mouse (onMouseDown/Move/Up)
- Zoom con transform scale
- Pan con scroll/drag sfondo
- "+" button sotto ogni nodo per aggiungere il successivo
- Connessioni visive con path SVG curvati (bezier)

### AutomationNode.tsx
Ogni nodo mostra:
- Icona + tipo (trigger/azione/condizione/delay)
- Label configurata
- Riepilogo configurazione (1 riga)
- Handle di connessione (sopra/sotto)
- Al click: apre pannello configurazione
- Hover: mostra delete/duplica

### TriggerPickerDialog.tsx (come screenshots GHL)
Dialog modale con:
- Barra ricerca in alto
- Categorie collapsabili:
  - **Contatto**: Creato, Modificato, Tag aggiunto/rimosso, Campo personalizzato aggiornato, Promemoria compleanno
  - **Opportunita**: Creata, Cambio fase, Vinta, Persa, Stagnante
  - **Appuntamenti**: Prenotato, Stato modificato, Cancellato
  - **Comunicazioni**: Email aperta, Email cliccata, WhatsApp ricevuto, Risposta cliente
  - **Sistema**: Webhook in entrata, Scheduler, Modulo inviato
- Ogni voce con icona + label + chevron destro
- Al click: seleziona il trigger e chiude il dialog, crea il nodo trigger sul canvas

### ActionPickerDialog.tsx
Stesso pattern del trigger, categorie:
- **Comunicazione**: Invia Email, Invia WhatsApp, Invia Notifica
- **CRM**: Crea opportunita, Sposta opportunita, Aggiorna campo, Aggiungi/rimuovi tag, Assegna utente, Crea attivita
- **Logica**: Delay (attendi X giorni/ore), If/Else (condizione con 2 rami), Termina automazione
- **Integrazione**: Webhook uscita

### AutomationNodeConfig.tsx (pannello laterale destro)
- Si apre al click su un nodo
- Mostra form di configurazione specifico per tipo nodo
- Per trigger: filtri avanzati AND/OR
- Per azioni: campi specifici (template email, tag, pipeline/fase, utente, ecc.)
- Per delay: input giorni/ore
- Per If/Else: condizioni con campo/operatore/valore e 2 uscite (true/false)
- Salva al blur/change (auto-save)

## Fase 5 - Persistenza e Auto-save

### Hook: `useAutomationBuilder.ts`
- Carica flow + nodes + connections dal DB
- Gestisce stato locale (nodi, connessioni, selezione)
- Auto-save con debounce 2s
- Undo/Redo con stack 50 livelli
- CRUD nodi e connessioni
- Publish/Unpublish (cambia status del flow)

### Salvataggio
- Flow: upsert su `automation_flows`
- Nodi: bulk upsert/delete su `automation_nodes`
- Connessioni: bulk upsert/delete su `automation_connections`
- Versioning: incrementa `version` al publish

## Fase 6 - Pulizia codice legacy

### File da rimuovere (solo marketing automations)
- `src/components/marketing/MarketingAutomationsConfig.tsx` -> sostituito dalla nuova dashboard
- `src/components/marketing/MarketingAutomationDialog.tsx` -> sostituito dal builder
- `src/components/marketing/MarketingActionBlock.tsx` -> sostituito dai componenti nodo

### File che restano invariati (Gestione Interna)
- `src/components/settings/AutomationsConfig.tsx` - resta per automazioni commesse
- `src/components/settings/AutomationDialog.tsx` - resta per automazioni commesse
- `src/components/settings/AutomationActionBlock.tsx` - resta per automazioni commesse
- `src/pages/azienda/Automations.tsx` - resta per automazioni commesse

## Fase 7 - Execution Log (UI)

### Pagina log: `/automazioni/:id/log`
- Tabella con: contatto/entita, stato esecuzione, nodo corrente, data inizio, data fine, errori
- Filtri: stato (ok/errore/in corso), date
- Dettaglio step-by-step al click su un'esecuzione

## Dettagli tecnici

### Struttura nodo nel DB (config_json)
```json
// Trigger - Contatto creato con filtro tag
{
  "trigger_category": "contact",
  "trigger_event": "contact_created",
  "filters": [
    { "field": "tags", "operator": "contains", "value": "VIP" }
  ]
}

// Azione - Invia email
{
  "action_type": "send_email",
  "template_id": "uuid",
  "subject_override": "..."
}

// Logica - If/Else
{
  "condition_field": "opportunity_value",
  "condition_operator": "greater_than",
  "condition_value": "5000"
}

// Delay
{
  "delay_value": 3,
  "delay_unit": "days"
}
```

### Rendering connessioni SVG
- Ogni nodo ha un anchor point in basso (output) e in alto (input)
- Le connessioni usano path SVG con curve bezier
- Per If/Else: 2 output (true a sinistra, false a destra) con label sul path
- Le connessioni si aggiornano in tempo reale durante il drag dei nodi

### Performance
- Canvas usa `transform: translate(x,y) scale(z)` per pan/zoom senza re-render
- Nodi posizionati con `position: absolute` + `left/top`
- SVG overlay per connessioni
- Solo il nodo selezionato triggera re-render del pannello config

## Riepilogo file nuovi

| File | Scopo |
|------|-------|
| `src/pages/azienda/marketing/MarketingAutomations.tsx` | Dashboard (riscrittura) |
| `src/pages/azienda/marketing/MarketingAutomationBuilder.tsx` | Pagina builder |
| `src/components/marketing/automations/AutomationFlowsList.tsx` | Lista flussi |
| `src/components/marketing/automations/AutomationBuilder.tsx` | Layout builder |
| `src/components/marketing/automations/AutomationCanvas.tsx` | Canvas con griglia |
| `src/components/marketing/automations/AutomationNode.tsx` | Nodo singolo |
| `src/components/marketing/automations/AutomationConnectionLine.tsx` | Linea SVG |
| `src/components/marketing/automations/AutomationNodeConfig.tsx` | Pannello config |
| `src/components/marketing/automations/TriggerPickerDialog.tsx` | Picker trigger |
| `src/components/marketing/automations/ActionPickerDialog.tsx` | Picker azione |
| `src/components/marketing/automations/AutomationBuilderToolbar.tsx` | Toolbar |
| `src/hooks/useAutomationBuilder.ts` | Hook gestione stato |

## Note implementative

- Il motore di esecuzione backend (event-driven, queue, retry) verra implementato in una fase successiva tramite Edge Functions. Questa fase si concentra sulla UI del builder e sulla persistenza dei flussi.
- La tabella `automations` esistente non viene toccata: il modulo "Gestione Interna > Automazioni" continua a funzionare come prima.
- Le nuove tabelle (`automation_flows`, `automation_nodes`, `automation_connections`) sono completamente separate e dedicate al builder visuale marketing.

