
# Fix: Nomi Fasi Non Visibili - Cache Collision

## Causa radice

Due query diverse usano lo **stesso query key** `["marketing_pipelines", companyId]` ma con `select` diversi:

- `PipelinesConfig.tsx` seleziona `marketing_pipeline_stages(id)` - solo l'id, senza nome
- `useOpportunitiesData.ts` seleziona `marketing_pipeline_stages(id, name, position)` - con nome e posizione

Quando visiti prima le impostazioni pipeline, React Query salva in cache le fasi con solo `id`. Quando poi vai alla pagina Opportunita, React Query restituisce i dati dalla cache (senza `name`), quindi tutte le colonne mostrano "Fase senza nome".

## Fix

### File 1: `src/components/settings/PipelinesConfig.tsx`

Cambiare la query per includere anche `name` e `position` nella select delle fasi, cosi la cache sara compatibile:

```typescript
// Da:
.select("*, marketing_pipeline_stages(id)")
// A:
.select("*, marketing_pipeline_stages(id, name, position)")
```

Questo risolve la collisione: entrambe le query ora restituiscono gli stessi campi, quindi indipendentemente da quale pagina viene visitata prima, la cache conterra sempre i nomi delle fasi.

### File 2: `src/components/opportunities/OpportunityKanbanView.tsx`

Rimuovere il fallback "Fase senza nome" e mostrare direttamente `stage.name` (che ora sara sempre presente):

```typescript
// Da:
{stage.name || "Fase senza nome"}
// A:
{stage.name}
```

## File modificati (2)

1. **`src/components/settings/PipelinesConfig.tsx`** - Allineare la select per includere `name` e `position` nelle fasi
2. **`src/components/opportunities/OpportunityKanbanView.tsx`** - Rimuovere il fallback "Fase senza nome"
