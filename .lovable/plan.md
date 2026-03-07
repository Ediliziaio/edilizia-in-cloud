

# FIX 5: Pulsanti Ordina e +Elenco funzionanti

## Cosa cambia

### 1. Pulsante "Ordina" — Sorting client-side con DropdownMenu
- Sostituire il pulsante disabled (righe 369-378) con un `DropdownMenu` contenente le opzioni: Nome A-Z, Nome Z-A, Valore ↑, Valore ↓, Data creazione, Ultima modifica
- Aggiungere stato `sortField` e `sortDir` nel componente
- Applicare l'ordinamento nel `filteredOpportunities` useMemo (dopo i filtri), evitando di modificare la query DB — l'ordinamento client-side è sufficiente perché i dati sono già tutti caricati per pipeline

### 2. Pulsante "+Elenco" — Creazione elenchi con tabella DB
- **Nuova tabella** `marketing_opportunity_lists`: `id uuid PK`, `company_id uuid FK`, `pipeline_id uuid FK`, `name text`, `description text`, `filters jsonb`, `created_at`, `updated_at`
- RLS: authenticated users possono CRUD sulla propria company
- Riutilizzare il componente `CreateListDialog` già esistente in `src/components/marketing/CreateListDialog.tsx`
- Sostituire il pulsante disabled (righe 349-356) con un pulsante che apre il dialog + tab per ogni elenco salvato
- Quando si clicca su un elenco, i filtri salvati vengono applicati come filtri attivi
- Aggiungere query per caricare gli elenchi della pipeline corrente e mutation per crearli/eliminarli

### File da modificare/creare

| File | Azione |
|------|--------|
| SQL Migration | Creare tabella `marketing_opportunity_lists` con RLS |
| `MarketingOpportunities.tsx` | Aggiungere sorting dropdown, stato elenchi, tabs elenchi, dialog creazione |

### Dettaglio tecnico

**Sorting**: si aggiunge `.sort()` nel useMemo `filteredOpportunities` basato su `sortField`/`sortDir`. Opzioni: `name`, `value`, `created_at`, `updated_at`.

**Elenchi**: ogni elenco salva i filtri correnti (`OpportunityFilters`) come JSON. Cliccando un tab elenco, i filtri vengono ripristinati. Il tab "Tutto" resetta ai filtri vuoti.

