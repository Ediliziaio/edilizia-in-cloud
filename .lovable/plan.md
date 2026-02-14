

# Task Management - Implementazione Completa

## Panoramica

Nuova sezione **Attivita** nell'area azienda con gestione task assegnabili a utenti, collegabili a ordini, magazzino (articoli stock), costi e pagamenti. Ogni task ha titolo, note, priorita, scadenza e assegnatario.

---

## 1. Database

### Nuova tabella: `tasks`

| Colonna | Tipo | Obbligatorio | Default | Note |
|---------|------|-------------|---------|------|
| id | uuid | Si | gen_random_uuid() | PK |
| company_id | uuid | Si | - | FK companies, tenant isolation |
| title | text | Si | - | Titolo task |
| notes | text | No | null | Note/descrizione |
| status | text | Si | 'da_fare' | da_fare, in_corso, completata |
| priority | text | Si | 'normale' | bassa, normale, alta, urgente |
| due_date | date | No | null | Scadenza |
| assigned_to | uuid | No | null | FK profiles.id |
| order_id | uuid | No | null | FK orders.id |
| stock_item_id | uuid | No | null | FK warehouse_stock.id |
| cost_id | uuid | No | null | FK company_costs.id |
| category | text | Si | 'generale' | ordini, magazzino, pagamenti, costi, generale |
| created_by | uuid | Si | - | Chi ha creato la task |
| completed_at | timestamptz | No | null | Data completamento |
| created_at | timestamptz | Si | now() | |
| updated_at | timestamptz | Si | now() | |

### RLS Policies

- **Company admin**: ALL su propria azienda
- **Staff con can_view_orders**: SELECT su propria azienda
- **Staff con can_edit_orders**: ALL su propria azienda
- **Dipendenti**: SELECT dove assigned_to = proprio user_id
- **Super admin**: ALL

### Trigger

- Riuso del trigger `update_updated_at_column` gia esistente

---

## 2. File da creare

### `src/pages/azienda/Tasks.tsx`

Pagina principale con:
- Header: titolo + contatore task attive + pulsante "Nuova Attivita"
- **StatCards**: totale attive, in scadenza (prossime 48h), scadute, completate settimana
- **Filtri**: stato, priorita, assegnatario, categoria (ordini/magazzino/costi/pagamenti/generale)
- **Tabella**: titolo, assegnatario, elemento collegato (ordine/articolo/costo), priorita (badge colorato), scadenza, stato
- Badge rosso per task scadute
- Click su riga apre dialog modifica
- Checkbox rapida per completare (da_fare -> completata)
- Empty state con CTA

### `src/components/tasks/TaskDialog.tsx`

Dialog creazione/modifica:
- Titolo (obbligatorio)
- Note (textarea)
- Priorita (select: bassa/normale/alta/urgente)
- Categoria (select: generale/ordini/magazzino/pagamenti/costi)
- Scadenza (datepicker)
- Assegna a (select con profili aziendali + dipendenti)
- Collegamento condizionale in base a categoria:
  - ordini -> select ordine
  - magazzino -> select articolo magazzino
  - costi/pagamenti -> select costo aziendale
  - generale -> nessun collegamento
- Stato (select, solo in modifica)
- Pulsante elimina (solo in modifica)

### `src/components/tasks/TaskStatCards.tsx`

4 card riassuntive: attive, in scadenza, scadute, completate questa settimana.

---

## 3. File da modificare

### `src/App.tsx`

Aggiungere rotta: `<Route path="attivita" element={<Tasks />} />` nel blocco azienda.

### `src/components/layouts/CompanyLayout.tsx`

Aggiungere nav item "Attivita" con icona `CheckSquare`, dopo "Dipendenti", con `permissionKey: "canViewOrders"` e `moduleKey: "orders"`.

---

## 4. UX

- Badge priorita: bassa (grigio), normale (blu), alta (arancione), urgente (rosso)
- Righe scadute: sfondo rosso leggero
- Cambio stato rapido con checkbox
- Toast conferma su ogni azione
- Empty state con illustrazione e CTA "Crea la tua prima attivita"
- Collegamento cliccabile all'ordine/costo/articolo associato

---

## 5. Riepilogo modifiche

| Azione | File |
|--------|------|
| Migrazione DB | Tabella tasks + RLS + trigger |
| Creare | `src/pages/azienda/Tasks.tsx` |
| Creare | `src/components/tasks/TaskDialog.tsx` |
| Creare | `src/components/tasks/TaskStatCards.tsx` |
| Modificare | `src/App.tsx` |
| Modificare | `src/components/layouts/CompanyLayout.tsx` |

