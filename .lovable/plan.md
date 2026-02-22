
# Aggiungere ruolo "Call Center" come terza assegnazione per Contatti e Opportunita

## Contesto

Attualmente contatti e opportunita supportano due figure di assegnazione:
- **Titolare** (`assigned_to`): puo gestire e modificare tutto
- **Follower** (`follower_id`): puo solo visualizzare

L'utente vuole una terza figura:
- **Call Center** (`call_center_id`): puo gestire e spostare come il Titolare, utile per tracciare statisticamente chi chiama e gestisce i contatti/opportunita

## Modifiche Database

Aggiungere la colonna `call_center_id` (uuid, nullable) a:
- `marketing_contacts`
- `marketing_opportunities`

## File da modificare

| File | Modifica |
|------|----------|
| **Database** | Aggiungere `call_center_id` a `marketing_contacts` e `marketing_opportunities` |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Aggiungere selettore "Call Center" accanto a Titolare e Follower (griglia 3 colonne) |
| `src/components/marketing/ContactDialog.tsx` | Nessuna modifica (dialog semplificato per creazione rapida) |
| `src/components/opportunities/OpportunityDialog.tsx` | Aggiungere selettore "Call Center" nella sezione Owner/Follower (griglia 3 colonne) + stato + submit |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Aggiungere selettore "Call Center" nella sezione Titolare/Follower (griglia 3 colonne) + stato + submit |
| `src/components/opportunities/OpportunityFiltersSheet.tsx` | Aggiungere filtro "Call Center" nell'interfaccia e nel tipo `OpportunityFilters` |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Aggiungere logica filtro per `callCenterId` |
| `src/components/marketing/ContactsTable.tsx` | Aggiungere colonna "Call Center" in COLUMNS |
| `src/components/marketing/ContactFiltersSheet.tsx` | Aggiungere filtro "Call Center" nei filtri contatti |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Fetchare nomi utenti per `call_center_id` e passarli alla tabella |

## Dettagli tecnici

### 1. Migrazione Database

```sql
ALTER TABLE marketing_contacts ADD COLUMN call_center_id uuid REFERENCES auth.users(id);
ALTER TABLE marketing_opportunities ADD COLUMN call_center_id uuid REFERENCES auth.users(id);
```

### 2. MarketingContactDetail.tsx - Selettore Call Center

Nella sezione "Titolare & Follower" (attualmente grid 2 colonne), cambiare a grid 3 colonne e aggiungere il terzo selettore:

```text
<div className="grid grid-cols-3 gap-2">
  <div> Titolare </div>
  <div> Follower </div>
  <div> Call Center </div>  // NUOVO
</div>
```

Il selettore Call Center usa la stessa lista `staff` gia disponibile nel componente.

### 3. OpportunityDialog.tsx - Creazione opportunita

Aggiungere stato `callCenterId` e selettore nella sezione Owner/Follower. Cambiare da grid 2 a grid 3 colonne. Passare `call_center_id` nel submit.

### 4. OpportunityDetailDialog.tsx - Dettaglio opportunita

Aggiungere stato `callCenterId`, sincronizzarlo con `opportunity.call_center_id` nel useEffect di init, aggiungere selettore nella grid Titolare/Follower (3 colonne), includere nel payload di salvataggio.

### 5. OpportunityFiltersSheet.tsx - Filtri opportunita

- Aggiungere `callCenterId: string` al tipo `OpportunityFilters`
- Aggiungere selettore "Call Center" nella sezione filtri assegnazione
- Aggiornare `countActiveFilters` per contare anche `callCenterId`

### 6. MarketingOpportunities.tsx - Logica filtro

Aggiungere:
```text
if (filters.callCenterId) {
  result = result.filter((o) => o.call_center_id === filters.callCenterId);
}
```

### 7. ContactsTable.tsx - Colonna Call Center

Aggiungere colonna `{ key: "call_center", label: "Call Center", group: "Contatto" }` all'array COLUMNS e renderizzare il nome dell'utente assegnato.

### 8. ContactFiltersSheet.tsx - Filtro Call Center nei contatti

Aggiungere il campo "Call Center" tra le opzioni di filtro disponibili per i contatti.

### 9. MarketingContacts.tsx - Fetch nomi Call Center

Nella query contatti, includere `call_center_id` e risolvere il nome dell'utente per visualizzarlo nella tabella.

## Permessi

Il Call Center ha gli stessi permessi del Titolare (puo gestire, spostare, modificare). Questo e coerente con il modello esistente dove `assigned_to` = gestione completa e `follower_id` = solo visualizzazione. Non servono modifiche RLS perche le policy sono basate su `company_id`, non su `assigned_to`.

## Risultato atteso

- Contatti e opportunita possono avere 3 figure: Titolare, Follower, Call Center
- Call Center visibile in creazione, dettaglio, filtri e tabella
- Utile per statistiche: quanti contatti/opportunita gestiti dal call center vs titolare
- Nessun impatto sulle policy di sicurezza esistenti
