
# Implementazione Pipeline/Sequenze + Opportunita (stile GHL)

## Panoramica

Costruire un sistema completo di pipeline di vendita ispirato a GoHighLevel con:
1. **Impostazioni > Sequenze**: gestione delle pipeline e relative fasi
2. **Opportunita**: vista kanban con card contatto, collegata ai contatti marketing

---

## FASE 1: Database - Nuove Tabelle

### Tabella `marketing_pipelines`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| company_id | uuid | FK companies |
| name | text | Nome della sequenza/pipeline |
| position | integer | Ordine di visualizzazione |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

### Tabella `marketing_pipeline_stages`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| pipeline_id | uuid | FK marketing_pipelines |
| company_id | uuid | FK companies (per RLS) |
| name | text | Nome della fase |
| position | integer | Ordine nella pipeline |
| show_in_reports | boolean | Default true |
| created_at | timestamptz | Default now() |

### Tabella `marketing_opportunities`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| company_id | uuid | FK companies |
| contact_id | uuid | FK marketing_contacts |
| pipeline_id | uuid | FK marketing_pipelines |
| stage_id | uuid | FK marketing_pipeline_stages |
| name | text | Nome opportunita |
| value | numeric | Valore in EUR, default 0 |
| status | text | 'open', 'won', 'lost' default 'open' |
| source | text | Fonte dell'opportunita |
| assigned_to | uuid | Titolare |
| follower_id | uuid | Follower |
| company_name | text | Nome azienda (opzionale) |
| notes | text | Note |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

### RLS Policies
Stesse pattern delle altre tabelle marketing:
- company_admin: ALL con company_id match
- staff con `can_view_orders`: SELECT
- super_admin: ALL

---

## FASE 2: Impostazioni - Sezione "Sequenze"

### Nuovi file
| File | Descrizione |
|---|---|
| `src/pages/azienda/settings/SettingsPipelines.tsx` | Pagina wrapper (come SettingsOrderStatus) |
| `src/components/settings/PipelinesConfig.tsx` | Componente principale: lista pipeline con CRUD |
| `src/components/settings/PipelineStagesConfig.tsx` | Gestione fasi di una singola pipeline (drag-and-drop) |

### Modifiche esistenti
| File | Modifica |
|---|---|
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere voce "Sequenze" nella sidebar impostazioni sotto "Marketing e Vendita" con icona `GitBranch` |
| `src/App.tsx` | Aggiungere route `impostazioni/sequenze` |

### Funzionalita
- Lista pipeline con nome, numero fasi, data aggiornamento
- Pulsante "+ Crea Sequenza" (dialog con nome)
- Click su pipeline -> vista dettaglio fasi
- Fasi: drag-and-drop per riordinare, aggiungere, eliminare
- Pulsante freccia indietro per tornare alla lista pipeline

---

## FASE 3: Pagina Opportunita (Kanban)

### Nuovi file
| File | Descrizione |
|---|---|
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Riscrittura completa della pagina |
| `src/components/opportunities/OpportunityKanbanView.tsx` | Vista kanban con colonne per fase |
| `src/components/opportunities/OpportunityCard.tsx` | Card singola opportunita con dati contatto |
| `src/components/opportunities/OpportunityDialog.tsx` | Dialog creazione/modifica opportunita |
| `src/components/opportunities/PipelineSelector.tsx` | Select per scegliere la pipeline in alto a sinistra |
| `src/hooks/useOpportunitiesData.ts` | Hook per fetch opportunita e pipeline |

### Layout pagina (dall'immagine GHL)
- **Header**: selettore pipeline a sinistra, conteggio lead, pulsanti vista (griglia/lista), "Importa", "+ Aggiungi opportunita"
- **Filtri**: filtri avanzati, ordinamento, ricerca
- **Kanban**: colonne orizzontali scrollabili, una per ogni fase della pipeline selezionata
- **Card opportunita**: nome contatto + citta, fonte, valore, email, telefono, icona utente assegnato

### Dialog "Aggiungi Opportunita"
Due sezioni:
1. **Contatto**: selezione contatto esistente (combobox con ricerca) oppure creazione rapida nuovo contatto (nome, email, telefono)
2. **Dettagli opportunita**: nome, sequenza (select), fase (select filtrata), stato, valore, titolare, follower, azienda, fonte

### Drag & Drop
- Spostamento card tra colonne (cambio fase)
- Usa @dnd-kit come gia implementato per OrdersPipelineView

---

## FASE 4: Integrazione con Dettaglio Contatto

### Modifica
| File | Modifica |
|---|---|
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Tab "Opportunita" nella sidebar destra: mostra lista opportunita collegate al contatto con link e stato |

---

## Riepilogo file coinvolti

### Nuovi file (8)
1. `src/pages/azienda/settings/SettingsPipelines.tsx`
2. `src/components/settings/PipelinesConfig.tsx`
3. `src/components/settings/PipelineStagesConfig.tsx`
4. `src/components/opportunities/OpportunityKanbanView.tsx`
5. `src/components/opportunities/OpportunityCard.tsx`
6. `src/components/opportunities/OpportunityDialog.tsx`
7. `src/components/opportunities/PipelineSelector.tsx`
8. `src/hooks/useOpportunitiesData.ts`

### File modificati (4)
1. `src/App.tsx` - nuova route impostazioni/sequenze
2. `src/components/layouts/CompanyLayout.tsx` - voce sidebar "Sequenze"
3. `src/pages/azienda/marketing/MarketingOpportunities.tsx` - riscrittura completa
4. `src/pages/azienda/marketing/MarketingContactDetail.tsx` - tab opportunita funzionante

### Migrazioni database (1)
- Creazione tabelle `marketing_pipelines`, `marketing_pipeline_stages`, `marketing_opportunities` con RLS

## Cosa NON cambia
- Nessuna modifica ai moduli esistenti (ordini, magazzino, etc.)
- Nessuna modifica ai contatti marketing esistenti
- Nessuna modifica alla struttura di autenticazione
