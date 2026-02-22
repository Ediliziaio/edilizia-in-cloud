
# Aggiungere badge conteggio su Note e Documenti nelle card opportunita

## Cosa cambia

Attualmente solo l'icona Etichette (Tag) mostra un badge con il numero. Le icone Note (StickyNote) e Documenti (Folder) non mostrano alcun conteggio. Dopo questa modifica, tutte e tre le icone mostreranno un badge numerico quando ci sono elementi associati.

## Modifiche tecniche

### 1. File: `src/hooks/useOpportunitiesData.ts` - Arricchire i dati con conteggi

Dopo aver caricato le opportunita nella funzione `useOpportunities`, aggiungere due query batch per recuperare i conteggi di note e documenti per ogni opportunita:

- Query su `marketing_contact_notes` filtrata per `opportunity_id` in lista IDs
- Query su `marketing_documents` filtrata per `opportunity_id` in lista IDs
- Aggregare i risultati e aggiungere `notes_count` e `documents_count` ad ogni opportunita

### 2. File: `src/components/opportunities/OpportunityCard.tsx` - Mostrare i badge

Modificare l'array `actionIcons` per aggiungere la proprieta `badge` anche alle icone Note e Documenti:

- **StickyNote (Note)**: `badge: opportunity.notes_count > 0 ? opportunity.notes_count : null`
- **Folder (Documenti)**: `badge: opportunity.documents_count > 0 ? opportunity.documents_count : null`

Il rendering del badge e gia implementato (lo stesso usato per le etichette), quindi non servono modifiche al template.

## Risultato visivo

Ogni icona nella barra azioni della card mostrera un piccolo badge circolare blu con il numero, identico a quello gia presente sulle etichette, quando ci sono elementi associati. Se non ce ne sono, nessun badge viene mostrato.
