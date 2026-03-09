

# Allineare la UX del Builder Automazioni Interne a quella Marketing

## Differenze Identificate

Ho confrontato i due builder e trovato queste differenze chiave:

| Aspetto | Marketing Builder | Internal Builder |
|---------|------------------|-----------------|
| **Layout pagina** | Fullscreen (`fixed inset-0 z-50`), 2 barre header (back+name, tabs+toggle) | Dentro il layout normale, 1 barra header semplice |
| **Nodi canvas** | Componente dedicato `AutomationNode` con: handle input/output circolari, hover actions a destra, icone per tipo, branching visuale (Sì/No), badge esecuzioni, "+" su hover | Nodi inline nel canvas, azioni sopra il nodo, nessun handle, nessun branching visuale |
| **Connessioni** | Componente `AutomationConnectionLine` con colori per branch (verde/rosso), label Sì/No | Path SVG inline, grigio uniforme, nessun supporto branch |
| **Canvas** | Dot grid background, bottom toolbar (select, fit, zoom, settings), zoom % visibile, pulsante "Aggiungi" in alto a destra | Background piatto, toolbar zoom in alto a destra, nessun fit-to-screen |
| **Picker trigger/azioni** | Side panel integrato nel canvas (border-l, searchable, collapsible) | Dialog modale centrato |
| **Tabs** | Builder / Impostazioni / Cronologia iscrizioni / Registro esecuzioni | Nessun tab — solo builder + drawer log |
| **Header** | Nome editabile inline (click → input), undo/redo, archive, delete, test button | Input sempre visibile, nessun undo/redo |
| **Keyboard shortcuts** | Ctrl+Z, Ctrl+Y, Ctrl+S, Delete | Nessuno |
| **Undo/Redo** | Supportato via `useAutomationBuilder` | Non supportato |

## Piano di Implementazione

### 1. Creare `InternalAutomationNode.tsx`
Nuovo componente nodo dedicato (copia pattern da marketing `AutomationNode.tsx`):
- Handle circolari input/output
- Hover actions (duplicate, delete) a destra del nodo
- "+" button sotto il nodo su hover
- Supporto branching per nodi condition (Sì/No con 2 output handle)
- Icone per tipo azione dal catalogo
- Badge conteggio esecuzioni

### 2. Creare `InternalConnectionLine.tsx`
Nuovo componente connessione (copia pattern da marketing `AutomationConnectionLine.tsx`):
- Colori verde/rosso per branch yes/no
- Label "Sì"/"No" sui rami
- Supporto output position da branching nodes

### 3. Riscrivere `InternalAutomationCanvas.tsx`
Allineare al canvas marketing:
- Dot grid background (`radial-gradient`)
- Usare i nuovi componenti `InternalAutomationNode` e `InternalConnectionLine`
- Bottom toolbar con: select, fit-to-screen, zoom in/out, zoom %
- Pulsante "Aggiungi" in alto a destra
- Rimuovere rendering inline dei nodi

### 4. Convertire Trigger/Action picker in side panel
Riscrivere `InternalTriggerSelector.tsx` e `InternalActionSelector.tsx`:
- Da `Dialog` modale → side panel (`div` con `border-l`, `w-80`)
- Aggiungere search input con icona
- Categorie collapsible (come marketing)
- Chiusura con X button

### 5. Aggiornare `InternalAutomations.tsx` (FlowBuilderView)
- Layout fullscreen (`fixed inset-0 z-50`)
- Header a 2 righe: riga 1 (back + nome editabile inline + undo/redo/save/archive/delete), riga 2 (tabs + toggle publish)
- Aggiungere tabs: Builder / Impostazioni / Log
- Side panel trigger/action integrato nel canvas (non dialog)
- Keyboard shortcuts (Ctrl+Z, Ctrl+S, Delete)

### File da creare/modificare

| File | Azione |
|------|--------|
| `src/components/internalAutomationBuilder/InternalAutomationNode.tsx` | **Nuovo** — componente nodo con handle e hover actions |
| `src/components/internalAutomationBuilder/InternalConnectionLine.tsx` | **Nuovo** — connessione con colori branch |
| `src/components/internalAutomationBuilder/InternalAutomationCanvas.tsx` | Riscrivere con dot grid, bottom toolbar, nuovi componenti |
| `src/components/internalAutomationBuilder/InternalTriggerSelector.tsx` | Convertire da Dialog a side panel |
| `src/components/internalAutomationBuilder/InternalActionSelector.tsx` | Convertire da Dialog a side panel |
| `src/pages/azienda/InternalAutomations.tsx` | Fullscreen, 2-row header, tabs, keyboard shortcuts |

