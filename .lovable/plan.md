

# Sezione Calendario Marketing (stile GHL)

## Panoramica

Trasformare la pagina placeholder `MarketingCalendar.tsx` in una sezione completa con 3 tab nella barra superiore, ispirata a GoHighLevel:

1. **Visualizza calendario** - Vista settimanale con appuntamenti, pannello filtri a destra
2. **Vista elenco Appuntamento** - Tabella appuntamenti con filtri, stato, paginazione
3. **Impostazioni del calendario** - Link diretto che naviga a `/azienda/impostazioni/calendari`

---

## Modifiche al Database

### Aggiunta colonna `calendar_id` alla tabella `appointments`

Per collegare appuntamenti ai calendari marketing serve una colonna opzionale:

| Colonna | Tipo | Note |
|---------|------|------|
| calendar_id | uuid | FK -> marketing_calendars, nullable |
| status | text | Default 'confermato', valori: confermato, annullato, riprogrammato, completato |
| contact_id | uuid | FK -> marketing_contacts, nullable (per collegare contatti CRM) |

Queste colonne sono nullable per retrocompatibilita con gli appuntamenti esistenti (dal calendario Gestione Interna).

---

## Nuovi File

### 1. `src/pages/azienda/marketing/MarketingCalendar.tsx` (riscrittura completa)

Pagina con 3 tab nella barra superiore (non Tabs component, ma navigazione inline stile GHL):

- **Header**: "Calendari" con 3 link tab: "Visualizza calendario" | "Vista elenco Appuntamento" | icona ingranaggio "Impostazioni del calendario"
- Pulsante "+ Nuovo" in alto a destra

**Tab "Visualizza calendario":**
- Vista settimanale (griglia oraria 08-21, colonne Lun-Dom)
- Navigazione data: "Oggi" + frecce + range settimana
- Appuntamenti renderizzati come blocchi colorati nella griglia
- Pannello laterale destro "Gestisci visualizzazione":
  - Radio: Tutto / Appuntamenti / Fasce orarie bloccate
  - Filtri: ricerca utenti/calendari/gruppi
  - Sezione "Utenti" (espandibile)
  - Sezione "Calendari" con checkbox per ogni calendario marketing

**Tab "Vista elenco Appuntamento":**
- Sotto-tab: Prossimo / Annullato / Tutti
- Filtri avanzati + Ordina per + Cerca per titolo + Gestisci colonne
- Tabella: #, Titolo, Contatto, Stato (select), Ora appuntamento, Calendario, Titolare
- Paginazione: "Mostra da X a Y di Z risultati" + Precedente/Prossimo + righe per pagina

**Tab "Impostazioni del calendario":**
- Non un vero tab con contenuto: al click naviga a `/azienda/impostazioni/calendari` tramite `useNavigate`

### 2. `src/components/marketing/MarketingCalendarWeekView.tsx`

Vista settimanale del calendario marketing:
- Griglia oraria con slot da 1 ora
- Header con giorni della settimana e data
- Blocchi appuntamenti posizionati in base a data/ora
- Colori diversi per calendario di appartenenza
- Click su appuntamento apre dialog di modifica
- Click su slot vuoto apre dialog di creazione

### 3. `src/components/marketing/MarketingCalendarFilters.tsx`

Pannello laterale destro con filtri:
- Toggle "Gestisci visualizzazione"
- Filtro per tipo (Tutto/Appuntamenti/Fasce bloccate)
- Ricerca utenti e calendari
- Checkbox per selezionare/deselezionare calendari
- Sezione utenti espandibile

### 4. `src/components/marketing/MarketingAppointmentsList.tsx`

Vista elenco appuntamenti:
- Sotto-filtri per stato (Prossimo/Annullato/Tutti)
- Tabella con colonne: #, Titolo, Contatto, Stato, Ora, Calendario, Titolare
- Stato modificabile inline tramite select
- Paginazione client-side
- Ricerca per titolo

---

## Modifiche a File Esistenti

### `src/App.tsx`
- La route `marketing/calendario` punta gia a `MarketingCalendar`, nessuna modifica necessaria

### `src/components/appointments/AppointmentDialog.tsx`
- Aggiungere campo opzionale `calendar_id` per associare l'appuntamento a un calendario marketing
- Aggiungere campo opzionale `contact_id` per collegare un contatto CRM
- Aggiungere campo `status` con select (Confermato/Annullato/Riprogrammato)

---

## Dettaglio Tecnico

### Query principali

1. **Appuntamenti marketing**: query `appointments` filtrata per `company_id`, con join su `marketing_calendars` (via `calendar_id`) e `profiles` (via `assigned_to`) e `marketing_contacts` (via `contact_id`)
2. **Calendari disponibili**: riusa query `marketing-calendars` gia esistente
3. **Filtri**: stato locale per calendari selezionati, utenti selezionati, range data

### Integrazione con Impostazioni

- I calendari creati in Impostazioni appaiono come filtri nel pannello destro
- La disponibilita configurata nelle impostazioni determina le fasce orarie visibili
- Il click su "Impostazioni del calendario" naviga direttamente a `/azienda/impostazioni/calendari`

### Flusso UX

1. Utente apre "Calendario" dal menu Marketing e Vendita
2. Vede la vista settimanale con gli appuntamenti
3. Puo filtrare per calendario o utente dal pannello destro
4. Puo passare alla vista elenco per gestire appuntamenti in tabella
5. Puo accedere alle impostazioni calendari direttamente dal tab
6. Il pulsante "+ Nuovo" apre il dialog di creazione appuntamento (con campi calendario e contatto)

