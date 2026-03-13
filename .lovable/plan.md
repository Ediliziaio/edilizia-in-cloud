

## AUT-FLOW-01 — Redesign Lista Workflow

### Stato attuale
- La tabella `automation_flows` ha già: `id, name, status (draft/published/archived), folder_id, category, company_id, created_at, updated_at`
- La tabella `automation_folders` esiste già con RLS
- I conteggi iscritti vengono calcolati dinamicamente da `automation_enrollments` (già implementato)
- Le emoji sono usate ovunque per le categorie (CATEGORY_MAP)

### DB: nessuna migrazione necessaria
Lo schema attuale copre già tutto. Il campo `status` corrisponde a `stato`, i conteggi iscritti sono calcolati al volo da `automation_enrollments`. Non servono colonne aggiuntive. La tabella `workflow_folders` richiesta nel ticket corrisponde a `automation_folders` già esistente.

### Redesign UI — File da modificare

**1. `src/components/marketing/automations/AutomationFlowsList.tsx`** — Riscrittura completa:
- Rimuovere tutte le emoji da `CATEGORY_MAP` → sostituire con icone Lucide (`Users, Megaphone, ClipboardList, Coins, Package, HardHat, Headphones, Warehouse, UserCog, CheckSquare, Bell, Settings`)
- Sub-tab "Tutti/Necessita revisione/Eliminato" → **filter chips** nella toolbar (Tutti, Bozza, Pubblicato, Archiviato, Necessita revisione) con conteggio badge
- Aggiungere **colonna "Cartella"** nella tabella che mostra il nome della cartella associata (query join o lookup separato)
- Folders come **righe accordion espandibili** nella tabella (chevron apri/chiudi) invece di navigazione drill-down
- Toggle **vista lista/griglia** con icone `List` / `Grid3x3`
- Rimuovere navigazione drill-down cartelle → mostrare tutto flat con accordion

**2. `src/pages/azienda/AutomazioniUnified.tsx`** — Aggiornamento header:
- Rimuovere emoji dalle `CATEGORIE` → icone Lucide
- Aggiungere bottoni "Crea Cartella" e "Crea tramite AI" nella toolbar
- Passare props aggiuntive a `AutomationFlowsList`

**3. `src/pages/azienda/marketing/MarketingAutomations.tsx`** — Allineamento:
- Rimuovere le sub-tab "Flussi di lavoro / Impostazioni globali" come tab principali
- I filtri stato diventano chips inline nella toolbar (come AutomazioniUnified)

### Layout risultante
```text
┌──────────────────────────────────────────────────────────┐
│  Elenco Flusso di lavoro    [Crea Cartella] [+ Crea]     │
├──────────────────────────────────────────────────────────┤
│  [Tutti] [Bozza] [Pubblicato] [Archiviato]  [Cerca...]  │
│                                          [Lista|Griglia] │
├──────────────────────────────────────────────────────────┤
│  □  Nome        Stato      Cartella   Iscritti  Agg.     │
│  □  ▶ Pipeline  ─────────  ─────────  ────────  ────     │  folder row
│  □    Lead New  Bozza      Pipeline   1.240     ieri     │  workflow
│  □  ▶ Marketing ─────────  ─────────  ────────  ────     │  folder row
│  □  Senza cart. ─────────  ─────────  ────────  ────     │
└──────────────────────────────────────────────────────────┘
```

### Icone Lucide per categorie (zero emoji)
| Categoria | Icona Lucide |
|-----------|-------------|
| CRM | `Users` |
| Marketing | `Megaphone` |
| Preventivi | `ClipboardList` |
| Fatturazione | `Coins` |
| Ordini | `Package` |
| Cantieri | `HardHat` |
| Assistenza | `Headphones` |
| Magazzino | `Warehouse` |
| HR | `UserCog` |
| Task | `CheckSquare` |
| Notifiche | `Bell` |
| Generale | `Settings` |

