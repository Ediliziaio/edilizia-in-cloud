

# Impostazioni Calendario Marketing (stile GHL)

## Panoramica

Creare una nuova pagina di impostazioni "Calendari" nella categoria "Marketing e Vendita" della sidebar impostazioni. La pagina sara ispirata a GoHighLevel con 4 tab principali: Calendari, Preferenze, Disponibilita e Collegamenti. Sara collegata esclusivamente al calendario Marketing (non a quello di Gestione Interna).

---

## Struttura a Tab (da GHL)

### Tab 1: Calendari
- Lista dei calendari marketing configurati in una tabella
- Colonne: Nome calendario, Gruppo, Durata, Tipo (Personale/Team), Stato (Attivo/Inattivo), Data aggiornamento, Azioni (modifica, condividi, impostazioni, menu)
- Filtri in alto: Stato, Tipo, Proprietario
- Barra di ricerca
- Pulsante "+ Nuovo calendario"
- Sezione "Gruppi" nella sidebar sinistra con "Non raggruppato" e "+ Nuovo gruppo"

### Tab 2: Preferenze
- Preferenze dell'app: giorno di inizio settimana (select)
- Toggle servizi: Menu dei servizi, Stanze, Attrezzature
- Preferenze widget: Lingua, Formato ora, Giorno inizio settimana

### Tab 3: Disponibilita
- Selezione utente (select)
- Ore lavorative settimanali: 7 righe (Lun-Dom) con checkbox attivo, ora inizio, ora fine, azioni (+, copia, elimina)
- Ore specifiche per data: lista override con "+ Aggiungi ore specifiche per data"

### Tab 4: Collegamenti
- Placeholder per futura integrazione Google Calendar / altri calendari esterni
- Sezione "Calendari collegati" e "Configurazione del calendario" (calendario collegato + calendari dei conflitti)

---

## Modifiche al Database

### Nuova tabella: `marketing_calendars`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| company_id | uuid | FK -> companies |
| name | text | Nome calendario |
| group_name | text | Gruppo (nullable) |
| duration_minutes | integer | Durata default (30, 60, etc.) |
| calendar_type | text | 'personal' o 'team' |
| is_active | boolean | Stato attivo/inattivo |
| owner_id | uuid | Proprietario (nullable) |
| description | text | Descrizione (nullable) |
| created_by | uuid | Chi l'ha creato |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

RLS: company_admin e super_admin possono gestire, staff con permesso can_view_marketing possono visualizzare.

### Nuova tabella: `marketing_calendar_availability`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| company_id | uuid | FK -> companies |
| calendar_id | uuid | FK -> marketing_calendars |
| day_of_week | integer | 0=Dom, 1=Lun... 6=Sab (nullable per override date) |
| start_time | time | Ora inizio |
| end_time | time | Ora fine |
| is_enabled | boolean | Giorno attivo |
| specific_date | date | Per override specifiche (nullable) |
| created_at | timestamptz | Default now() |

RLS: stesse policy di marketing_calendars.

### Nuova tabella: `marketing_calendar_preferences`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| company_id | uuid | FK -> companies (unique) |
| week_start_day | text | Default 'monday' |
| time_format | text | Default '24h' |
| language | text | Default 'it' |
| show_services_menu | boolean | Default true |
| show_rooms | boolean | Default true |
| show_equipment | boolean | Default true |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

RLS: company_admin puo gestire, staff con permesso can_view_marketing possono visualizzare.

---

## Nuovi File

### 1. `src/pages/azienda/settings/SettingsMarketingCalendars.tsx`
- Pagina wrapper che renderizza il componente principale

### 2. `src/components/settings/MarketingCalendarsConfig.tsx`
- Componente principale con 4 tab (Calendari, Preferenze, Disponibilita, Collegamenti)
- **Tab Calendari**: tabella con filtri, CRUD calendari, dialog creazione/modifica
- **Tab Preferenze**: form con select e toggle, salvataggio preferenze
- **Tab Disponibilita**: griglia 7 giorni con orari, override per date specifiche
- **Tab Collegamenti**: placeholder per integrazioni future

### 3. `src/components/settings/CalendarDialog.tsx`
- Dialog per creare/modificare un calendario marketing
- Campi: nome, gruppo, durata, tipo, descrizione, proprietario

---

## Modifiche a File Esistenti

### `src/App.tsx`
- Aggiungere import di `SettingsMarketingCalendars`
- Aggiungere route: `<Route path="calendari" element={<SettingsMarketingCalendars />} />`

### `src/components/layouts/CompanyLayout.tsx`
- Aggiungere voce "Calendari" nella sezione "Marketing e Vendita" delle impostazioni (dopo "Sequenze")
- Import dell'icona `CalendarDays` (gia importata nel file sidebarConfig)
- Nuova `NavLink` verso `/azienda/impostazioni/calendari`

---

## Dettaglio Tecnico

### Flusso dati
1. I calendari creati nelle impostazioni saranno visibili SOLO nella pagina Marketing Calendar (`/azienda/marketing/calendario`)
2. Il calendario di Gestione Interna (`/azienda/calendario`) continua a funzionare indipendentemente con le date degli ordini
3. Le disponibilita definite nelle impostazioni determineranno gli slot disponibili nel calendario marketing

### Query e Hook
- `useMarketingCalendars()` - lista calendari con filtri
- `useMarketingCalendarPreferences()` - preferenze salvate per company
- `useMarketingCalendarAvailability(calendarId)` - disponibilita per calendario
- Tutte le mutazioni con toast di feedback

### UX
- Skeleton loading durante il caricamento
- Toast di conferma per ogni operazione CRUD
- Empty state con CTA per creare il primo calendario
- Dialog di conferma per eliminazione
- Responsive: tabella scrollabile su mobile
