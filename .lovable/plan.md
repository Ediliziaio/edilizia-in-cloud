

# Layout fisso toolbar + scroll orizzontale indipendente per le colonne pipeline

## Problema
Quando ci sono molte fasi (es. 20), scrollando orizzontalmente per vedere le colonne della pipeline, la toolbar con filtri, ricerca e selettore pipeline si sposta fuori dalla vista. L'utente perde accesso ai controlli. Come in GHL, la parte superiore deve restare fissa e solo l'area delle colonne deve scrollare orizzontalmente.

## Soluzione

**File: `src/pages/azienda/marketing/MarketingOpportunities.tsx`**

Il container principale (riga 365) usa `flex flex-col h-full`. Il problema è che `OpportunityKanbanView` ha `overflow-x-auto` ma il suo wrapper non limita l'altezza, quindi il contenuto può spingere tutto.

Modifiche:
- Aggiungere `shrink-0` a tutti gli elementi della toolbar (righe 366-553: selettore pipeline, stats strip, tabs elenco, filtri/ricerca, barra selezione bulk) per impedire che si riducano
- Wrappare il `OpportunityKanbanView` (riga 590) in un div con `flex-1 min-h-0 overflow-hidden` che contenga lo scroll orizzontale

**File: `src/components/opportunities/OpportunityKanbanView.tsx`**

- Il div wrapper (riga 127) cambia da `w-full overflow-x-auto` a `w-full h-full overflow-x-auto overflow-y-hidden`
- La scrollbar orizzontale appare in fondo all'area pipeline, non in fondo alla pagina

```text
┌─────────────────────────────────────────────┐
│ Pipeline selector │ badge │ bottoni    FISSO │
│ Stats strip                           FISSO │
│ Tabs (Tutto / Elenco)                FISSO │
│ Filtri │ Ricerca                      FISSO │
├─────────────────────────────────────────────┤
│ ← Col1 │ Col2 │ Col3 │ Col4 │ ...  →       │  scroll orizzontale
│         │      │      │      │              │  indipendente
│         │      │      │      │              │
├═════════════════════════════════════════════┤
│ ◀━━━━━━━━━━━ scrollbar ━━━━━━━━━━━━━━━━━▶  │
└─────────────────────────────────────────────┘
```

### Dettagli implementativi

1. **`MarketingOpportunities.tsx`** — aggiungere `shrink-0` alle sezioni toolbar e wrappare la vista kanban:
   - Riga 366 div toolbar: aggiungere `shrink-0`
   - Riga 459 StatsStrip: wrappare in `<div className="shrink-0">` o aggiungere classe
   - Riga 461 tabs elenco: aggiungere `shrink-0`
   - Riga 505 filtri/ricerca: aggiungere `shrink-0`
   - Riga 566 barra bulk selection: aggiungere `shrink-0`
   - Riga 589-591: wrappare `OpportunityKanbanView` in `<div className="flex-1 min-h-0">` per contenere lo scroll

2. **`OpportunityKanbanView.tsx`** — riga 127: cambiare a `h-full overflow-x-auto overflow-y-hidden`

Due file da modificare, modifiche CSS minimali.

