

# Scroll indipendente per colonna Kanban (stile GHL)

## Problema
Attualmente le colonne del Kanban crescono in altezza senza limite. Con centinaia di opportunità in una fase, l'utente deve scrollare l'intera pagina. In GHL, ogni colonna della pipeline ha il proprio scroll verticale indipendente.

## Soluzione

**File: `src/components/opportunities/OpportunityKanbanView.tsx`**

Modificare `StageColumn`:
- Dare alla colonna un'altezza fissa che occupi lo spazio disponibile: `h-[calc(100vh-280px)]` (sottraendo header, toolbar, stats strip)
- L'header della colonna (nome fase + conteggio) resta fisso in alto
- L'area cards sotto l'header diventa scrollabile con `overflow-y-auto` e una scrollbar sottile custom
- Rimuovere `flex-1` dall'area cards e sostituire con altezza che riempie il resto della colonna

Struttura risultante per ogni colonna:
```text
┌─────────────────┐
│ Header (fisso)  │  ← nome fase, conteggio, valore
├─────────────────┤
│ Card 1          │  ↑
│ Card 2          │  │ scroll indipendente
│ Card 3          │  │
│ ...             │  ↓
└─────────────────┘
```

Modifiche concrete:
- Div esterno colonna: aggiungere `h-[calc(100vh-280px)]` + `flex flex-col`
- Div cards (ref droppable): `flex-1 overflow-y-auto` + scrollbar styling con classi Tailwind (`scrollbar-thin` o CSS custom)

Un solo file da modificare.

