

# Liste Contatti (Smart Lists) - Come GHL

## Cosa viene creato

Un sistema di liste per raggruppare contatti. L'utente puo creare liste (es. "Contatti vecchi", "Contatti Milano"), aggiungere/rimuovere contatti dalle liste, e filtrare la vista contatti per lista.

## Struttura

### 1. Database - Nuova tabella `marketing_contact_lists`

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| company_id | uuid | FK |
| name | text | Nome lista |
| description | text | Opzionale |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

### 2. Database - Tabella ponte `marketing_contact_list_members`

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| list_id | uuid | FK a marketing_contact_lists |
| contact_id | uuid | FK a marketing_contacts |
| added_at | timestamptz | Default now() |

Con vincolo UNIQUE su (list_id, contact_id) per evitare duplicati.

### 3. RLS Policies

- Company admins: ALL su entrambe le tabelle (filtro company_id)
- Staff con can_view_orders: SELECT
- Super admins: ALL

### 4. UI - Tab "Liste" nella pagina Contatti

In `MarketingContacts.tsx`:
- Aggiungere tab switcher sopra la tabella: **Tutti** | **Liste**
- Tab "Tutti" mostra la vista attuale
- Tab "Liste" mostra l'elenco delle liste con conteggio contatti

### 5. Componente `ContactListsView.tsx`

Vista griglia/lista delle liste con:
- Nome lista, descrizione, numero contatti, data creazione
- Pulsante "Crea Lista" con dialog per nome + descrizione
- Click su lista filtra la tabella contatti mostrando solo i membri
- Menu azioni: rinomina, elimina lista

### 6. Componente `CreateListDialog.tsx`

Dialog semplice con:
- Campo nome (obbligatorio)
- Campo descrizione (opzionale)
- Pulsante Crea

### 7. Aggiungere contatti a liste

- Nella bulk actions bar (quando contatti selezionati), aggiungere pulsante "Aggiungi a lista"
- Dropdown che mostra le liste esistenti + opzione "Crea nuova lista"
- Nella pagina dettaglio contatto, mostrare le liste di appartenenza

### 8. Filtro per lista nella vista contatti

- Quando si clicca su una lista, la vista torna su "Tutti" ma filtrata per quella lista
- Badge che mostra il filtro attivo con possibilita di rimuoverlo

## File coinvolti

| File | Azione |
|------|--------|
| Migrazione SQL | Creare 2 tabelle + RLS + indici |
| `src/components/marketing/ContactListsView.tsx` | NUOVO - Vista liste |
| `src/components/marketing/CreateListDialog.tsx` | NUOVO - Dialog creazione lista |
| `src/components/marketing/AddToListDropdown.tsx` | NUOVO - Dropdown per aggiungere a lista |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiungere tabs Tutti/Liste, filtro per lista, bulk action |
| `src/components/marketing/ContactsTable.tsx` | Aggiungere pulsante "Aggiungi a lista" nelle bulk actions |

## Flusso UX

1. Utente va su Contatti e vede tab "Tutti" (default) e "Liste"
2. Clicca "Liste" e vede elenco liste (o vuoto con CTA)
3. Crea una nuova lista con nome e descrizione
4. Torna su "Tutti", seleziona contatti con checkbox
5. Nella barra bulk actions clicca "Aggiungi a lista" e sceglie la lista
6. Clicca su una lista per vedere solo i suoi contatti (filtro attivo con badge rimovibile)

