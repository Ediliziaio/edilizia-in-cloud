
# Filtri Avanzati + Stato Automatico per Fase

## Panoramica

Due funzionalita principali:

1. **Pannello Filtri Avanzati** (Sheet laterale destra, stile GHL) - si apre cliccando "Filtri avanzati" con filtri per: Stato, Titolare, Follower, Fonte, Valore, Data creazione, Tags
2. **Mappatura Stato Automatico per Fase** - ogni fase della pipeline puo avere uno stato associato (Aperta/Vinta/Persa/Abbandonata). Quando un'opportunita viene spostata in quella fase (drag-and-drop o manualmente), lo stato si aggiorna automaticamente

## Dettaglio tecnico

### 1. Migrazione Database

Aggiungere colonna `auto_status` alla tabella `marketing_pipeline_stages`:

```sql
ALTER TABLE marketing_pipeline_stages 
ADD COLUMN auto_status text DEFAULT NULL;
```

Valori possibili: `null` (nessun cambio automatico), `open`, `won`, `lost`, `abandoned`.

### 2. Nuovo componente: `OpportunityFiltersSheet.tsx`

Pannello Sheet (lato destro) con i seguenti filtri espandibili (stile GHL come nello screenshot):
- **Stato**: checkbox multipli (Aperta, Vinta, Persa, Abbandonata)
- **Titolare**: select dal team aziendale
- **Follower**: select dal team aziendale
- **Fonte dell'opportunita**: input testo
- **Valore dell'opportunita**: range min/max
- **Creato il**: date range
- **Tags**: selezione multipla

Ogni filtro e una riga cliccabile che si espande mostrando i controlli. Include pulsanti "Applica" e "Resetta".

### 3. Modifiche a `MarketingOpportunities.tsx`

- Aggiungere stato filtri e stato apertura sheet
- Il bottone "Filtri avanzati" apre lo sheet a destra
- Mostrare badge con conteggio filtri attivi
- Logica di filtraggio: combinare ricerca testo + filtri avanzati nel `useMemo`

### 4. Modifiche a `PipelineStagesConfig.tsx`

Aggiungere a ogni fase un selettore "Stato automatico" con le opzioni:
- Nessuno (default)
- Aperta
- Vinta
- Persa
- Abbandonata

Visualizzato come un piccolo Select accanto al campo nome di ogni fase. Al salvataggio, il campo `auto_status` viene salvato insieme a nome e posizione.

### 5. Modifiche a `PipelinesConfig.tsx` (dialog creazione)

Nel dialog di creazione pipeline, aggiungere anche il selettore "Stato automatico" per ogni fase predefinita, cosi l'utente puo configurare la mappatura gia alla creazione.

### 6. Logica cambio stato automatico

In due punti dove avviene il cambio fase:

**a) `useUpdateOpportunityStage` in `useOpportunitiesData.ts`:**
- Quando si cambia la fase (drag-and-drop), recuperare l'`auto_status` della fase target
- Se presente, aggiornare anche il campo `status` dell'opportunita

**b) `OpportunityDetailDialog.tsx`:**
- Quando l'utente cambia la fase dal select nel dialog di dettaglio, controllare se la nuova fase ha un `auto_status` e aggiornare automaticamente il campo stato

## File coinvolti (6)

1. **Migrazione SQL** - Aggiungere `auto_status` a `marketing_pipeline_stages`
2. **`src/components/opportunities/OpportunityFiltersSheet.tsx`** - Nuovo componente pannello filtri
3. **`src/pages/azienda/marketing/MarketingOpportunities.tsx`** - Integrare filtri e sheet
4. **`src/components/settings/PipelineStagesConfig.tsx`** - Aggiungere selettore stato automatico per fase
5. **`src/components/settings/PipelinesConfig.tsx`** - Aggiungere stato automatico nel dialog creazione
6. **`src/hooks/useOpportunitiesData.ts`** - Modificare `useUpdateOpportunityStage` per applicare auto_status
7. **`src/components/opportunities/OpportunityDetailDialog.tsx`** - Auto-status al cambio fase nel dialog
