

# Migliorare UX Opportunità: Mini-statistiche + colori

## Cosa cambia

### 1. Aggiungere strip di mini-statistiche sopra il PipelineSelector (nuovo componente)

**Nuovo file: `src/components/opportunities/OpportunityStatsStrip.tsx`**

Una riga di 6 mini-card compatte (non invasive, `h-auto`, padding minimo) calcolate dai dati già disponibili in `filteredOpportunities`:

| Card | Icona | Calcolo | Colore accent |
|------|-------|---------|---------------|
| Aperte | CircleDot | count status=open | blue |
| Vinte | Trophy | count status=won | green |
| Perse | XCircle | count status=lost | red |
| Abbandonate | Ban | count status=abandoned | gray |
| Valore Pipeline | Euro | sum value (open) | blue |
| Fatturato Vinto | TrendingUp | sum value (won) | green |

Design: cards orizzontali con `border-l-2` colorato, sfondo `bg-muted/30`, numero grande (`text-lg font-bold`), label piccola (`text-[10px]`). Responsive: griglia `grid-cols-3 md:grid-cols-6`.

Props: `opportunities: any[]` — tutto calcolato client-side con `useMemo`.

### 2. Inserire la strip nel layout della pagina

**File: `src/pages/azienda/marketing/MarketingOpportunities.tsx`**

- Importare `OpportunityStatsStrip`
- Inserirla tra la toolbar (riga 365) e la barra pipeline selector — prima del `div` che contiene `PipelineSelector` (riga 365), subito dopo l'apertura di `<div className="flex flex-col h-full gap-3">`.

### 3. Migliorare colori nelle OpportunityCard

**File: `src/components/opportunities/OpportunityCard.tsx`**

- Aggiungere un sottile `border-l-3` colorato alla card basato sullo `status`:
  - `open` → `border-l-blue-500`
  - `won` → `border-l-green-500`
  - `lost` → `border-l-red-500`
  - `abandoned` → `border-l-gray-400`
- Mostrare un piccolo badge colorato con la data di ultimo aggiornamento (`updated_at`) nella parte inferiore della card, tipo "Agg. 2g fa" con `formatDistanceToNow` da date-fns.

### 4. Migliorare colori nelle colonne Kanban

**File: `src/components/opportunities/OpportunityKanbanView.tsx` (StageColumn)**

- Aggiungere una `border-t-2` colorata all'header della colonna usando `hashColor(stage.name)` già esistente in `types/opportunities.ts`.

