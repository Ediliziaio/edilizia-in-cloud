

# Spostare OpportunityStatsStrip sotto il PipelineSelector

## Cosa cambia

**File: `src/pages/azienda/marketing/MarketingOpportunities.tsx`**

Spostare la riga `<OpportunityStatsStrip>` dalla posizione attuale (riga 366, prima del PipelineSelector) a dopo la riga del PipelineSelector (dopo riga 373, dopo la chiusura del `div` che contiene PipelineSelector + Badge + bottoni).

Risultato layout:
```text
[PipelineSelector] [N lead] [Kanban|Lista] [Importa] [Aggiungi]
[Aperte] [Vinte] [Perse] [Abbandonate] [Pipeline] [Fatturato Vinto]
─────────────────────────────────────────────────────────────────
[Kanban / Lista contenuto]
```

Una sola riga da spostare.

