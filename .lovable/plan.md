
# Sincronizzazione Note e nuova sezione Attivita Marketing

## Parte 1: Sincronizzazione note tra Contatti e Opportunita

### Problema attuale
Le note dei contatti (`marketing_contact_notes`) e delle opportunita (`marketing_opportunity_notes`) sono completamente separate. L'utente vuole che siano condivise: una nota aggiunta in un'opportunita deve apparire anche nel contatto collegato e viceversa.

### Soluzione
Unificare le note in un'unica tabella `marketing_contact_notes` aggiungendo una colonna opzionale `opportunity_id`. In questo modo:
- Una nota con solo `contact_id` = nota generica del contatto
- Una nota con `contact_id` + `opportunity_id` = nota collegata anche all'opportunita
- Nel dettaglio contatto si vedono TUTTE le note (con e senza opportunita)
- Nel dettaglio opportunita si vedono solo le note con quel `opportunity_id` + quelle generiche del contatto

### Modifiche Database

```sql
-- Aggiungere opportunity_id alla tabella note contatti
ALTER TABLE marketing_contact_notes 
  ADD COLUMN opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL;

-- La tabella marketing_opportunity_notes diventa obsoleta
-- Non la eliminiamo subito, ma migriamo i dati esistenti
INSERT INTO marketing_contact_notes (contact_id, company_id, content, created_by, created_at, opportunity_id)
SELECT mo.contact_id, mon.company_id, mon.content, mon.created_by, mon.created_at, mon.opportunity_id
FROM marketing_opportunity_notes mon
JOIN marketing_opportunities mo ON mo.id = mon.opportunity_id;
```

### File da modificare

| File | Modifica |
|------|----------|
| `src/hooks/useOpportunitiesData.ts` | `useOpportunityNotes` legge da `marketing_contact_notes` filtrato per `opportunity_id`. `useAddOpportunityNote` inserisce in `marketing_contact_notes` con `opportunity_id` + `contact_id` |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | La query note rimane uguale (legge tutte le note del contatto). Mostrare un badge se la nota e collegata a un'opportunita |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Mostrare sia le note specifiche dell'opportunita sia quelle generiche del contatto, distinguendole visivamente |

---

## Parte 2: Sezione Attivita Marketing

### Concetto
Creare una pagina "Attivita" nel menu Marketing, simile alla sezione Attivita interna ma collegata a contatti e opportunita anziche a ordini/magazzino/costi.

### Modifiche Database

```sql
-- Aggiungere colonne per collegare i task a contatti e opportunita
ALTER TABLE tasks 
  ADD COLUMN contact_id uuid REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL;
```

Aggiungere nuove categorie al sistema task: `marketing`, `contatti`, `opportunita`.

### Nuovi file

| File | Scopo |
|------|-------|
| `src/pages/azienda/marketing/MarketingTasks.tsx` | Pagina principale Attivita Marketing (simile a `Tasks.tsx` ma filtrata per categorie marketing e con link a contatti/opportunita) |

### File da modificare

| File | Modifica |
|------|----------|
| `src/lib/sidebarConfig.ts` | Aggiungere voce "Attivita" nel menu `marketingNavItems` con icona `CheckSquare` e url `/azienda/marketing/attivita` |
| `src/App.tsx` | Aggiungere route `marketing/attivita` che punta a `MarketingTasks` |
| `src/components/tasks/TaskDialog.tsx` | Aggiungere categorie "marketing", "contatti", "opportunita" + selettori per contatto e opportunita (come gia esistono per ordine/magazzino/costo) |
| `src/components/tasks/LinkedTasks.tsx` | Supportare `contactId` e `opportunityId` come props per mostrare task collegati |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Nella sidebar destra, rendere funzionale il pannello "activities" mostrando i task collegati al contatto (usando `LinkedTasks`) |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Aggiungere tab "activities" con i task collegati all'opportunita |

### Dettagli tecnici

#### MarketingTasks.tsx
- Layout identico a `Tasks.tsx` con stat cards, filtri, tabella
- Filtri per stato, priorita, categoria (marketing/contatti/opportunita)
- Colonne: titolo, priorita, stato, scadenza, contatto collegato, opportunita collegata, assegnato a
- Click su contatto/opportunita navigano al dettaglio

#### TaskDialog.tsx - Nuove categorie
```text
CATEGORIES = [
  { value: "generale", label: "Generale" },
  { value: "ordini", label: "Ordini" },
  { value: "magazzino", label: "Magazzino" },
  { value: "pagamenti", label: "Pagamenti" },
  { value: "costi", label: "Costi" },
  { value: "marketing", label: "Marketing" },       // NUOVO
  { value: "contatti", label: "Contatti" },          // NUOVO
  { value: "opportunita", label: "Opportunita" },    // NUOVO
];
```

Quando la categoria e "contatti" o "opportunita", mostrare un selettore per collegare un contatto o un'opportunita (stessa logica dei selettori ordine/magazzino/costo gia esistenti).

#### LinkedTasks.tsx - Nuovi props
```text
interface LinkedTasksProps {
  orderId?: string;
  stockItemId?: string;
  costId?: string;
  contactId?: string;       // NUOVO
  opportunityId?: string;   // NUOVO
  category: string;
  companyId?: string;
}
```

## Riepilogo delle modifiche

| Area | File | Tipo modifica |
|------|------|---------------|
| Database | Migrazione | Aggiungere `opportunity_id` a `marketing_contact_notes`, `contact_id` e `opportunity_id` a `tasks` |
| Note sync | `useOpportunitiesData.ts` | Leggere/scrivere da `marketing_contact_notes` |
| Note sync | `MarketingContactDetail.tsx` | Badge opportunita sulle note |
| Note sync | `OpportunityDetailDialog.tsx` | Mostrare note unificate |
| Attivita | `MarketingTasks.tsx` (nuovo) | Pagina attivita marketing |
| Attivita | `sidebarConfig.ts` | Voce menu |
| Attivita | `App.tsx` | Route |
| Attivita | `TaskDialog.tsx` | Nuove categorie + selettori |
| Attivita | `LinkedTasks.tsx` | Supporto contatti/opportunita |
| Attivita | `MarketingContactDetail.tsx` | Panel attivita nella sidebar |
| Attivita | `OpportunityDetailDialog.tsx` | Tab attivita |
