
# Dettaglio Contatto + Campi Personalizzati + Assegnazione Staff

## Panoramica
Implementare una pagina dettaglio contatto in stile GHL con layout a 3 colonne, campi personalizzati configurabili nelle impostazioni, assegnazione titolare/follower, e sidebar laterale con attivita, note, documenti.

Dato l'ampiezza della feature, la suddivido in blocchi implementativi.

---

## 1. Database - Nuove tabelle

### Tabella `marketing_custom_fields`
Definisce i campi personalizzati configurabili per azienda.

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| company_id | uuid FK companies | NOT NULL, ON DELETE CASCADE |
| name | text | NOT NULL (es. "Tipo di caldaia") |
| field_type | text | NOT NULL: text, select, date, number |
| options | text[] | Per i campi select (es. ['Condensazione', 'Tradizionale']) |
| section | text | Default 'general_info' (raggruppamento: contatto, general_info, additional_info) |
| position | integer | Default 0 (ordine di visualizzazione) |
| created_at | timestamptz | default now() |

RLS: company_admin ALL, staff SELECT, super_admin ALL.

### Tabella `marketing_contact_field_values`
Valori dei campi personalizzati per ogni contatto.

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| contact_id | uuid FK marketing_contacts | NOT NULL, ON DELETE CASCADE |
| field_id | uuid FK marketing_custom_fields | NOT NULL, ON DELETE CASCADE |
| value | text | nullable |
| created_at | timestamptz | default now() |

UNIQUE su (contact_id, field_id). RLS via join a marketing_contacts.company_id.

### Tabella `marketing_contact_notes`
Note sul contatto.

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| contact_id | uuid FK marketing_contacts | NOT NULL, ON DELETE CASCADE |
| company_id | uuid | NOT NULL |
| content | text | NOT NULL |
| created_by | uuid | NOT NULL |
| created_at | timestamptz | default now() |

### Tabella `marketing_contact_activities`
Timeline di attivita del contatto (log automatico).

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| contact_id | uuid FK marketing_contacts | NOT NULL, ON DELETE CASCADE |
| company_id | uuid | NOT NULL |
| activity_type | text | NOT NULL (es. 'created', 'updated', 'note_added', 'opportunity_linked', 'email_sent') |
| description | text | NOT NULL |
| metadata | jsonb | Default '{}' |
| created_by | uuid | nullable |
| created_at | timestamptz | default now() |

### Nuove colonne su `marketing_contacts`
- `assigned_to` uuid nullable (titolare - staff assegnato)
- `follower_id` uuid nullable (follower - chi puo solo vedere)
- `contact_type` text default 'lead' (lead, cliente, partner, ecc.)
- `address` text nullable
- `city` text nullable
- `province` text nullable
- `postal_code` text nullable
- `country` text nullable (default 'Italia')
- `website` text nullable
- `date_of_birth` date nullable
- `custom_fields` jsonb default '{}' (alternativa rapida per i valori)

---

## 2. Impostazioni - Campi Personalizzati

### Nuova pagina: `src/pages/azienda/settings/SettingsCustomFields.tsx`
Pagina wrapper.

### Nuovo componente: `src/components/settings/CustomFieldsConfig.tsx`
Interfaccia per:
- Vedere lista dei campi personalizzati con nome, tipo e sezione
- Aggiungere un nuovo campo con: nome, tipo (testo, select, data, numero), opzioni (per select), sezione
- Eliminare un campo
- Riordinare con drag (futuro, per ora position manuale)

### Route e Sidebar
- Aggiungere route `campi-personalizzati` sotto impostazioni in `App.tsx`
- Aggiungere voce "Campi Personalizzati" nella sidebar impostazioni in `CompanyLayout.tsx`

---

## 3. Pagina Dettaglio Contatto

### Nuova pagina: `src/pages/azienda/marketing/MarketingContactDetail.tsx`
Layout a 3 colonne come nello screenshot GHL:

**Colonna sinistra (w-80, scrollabile):**
- Header: freccia indietro "Contatto Dettagli" + navigazione prev/next (X/N)
- Avatar con iniziali + nome + bottone elimina
- Selettori "Titolare" e "Follower" (dropdown staff azienda)
- Etichette (tag) con possibilita di aggiungere/rimuovere
- Tabs: "Tutti i campi" | "DND" | "Azioni"
- Sotto tab "Tutti i campi": sezioni collassabili
  - **Contatto**: Nome, Cognome, Email, Telefono, Data di nascita, Source, Tipo di contatto
  - **General Info**: Nome azienda, Indirizzo, Citta, Provincia, CAP, Paese, Sito web
  - **Campi personalizzati**: Campi dinamici dalla tabella custom_fields
- In fondo: "Creato il: data" + "Creato da: fonte"

**Colonna centrale (flex-1):**
- Header con nome contatto + icone azioni (telefono, email, preferito)
- Timeline delle attivita ordinate per data
- Ogni entry mostra tipo, descrizione, data
- In basso: input "Digita un messaggio..." (placeholder per futuro)

**Colonna destra (w-72, sidebar con icone tab):**
- Tab verticali con icone: Documenti, Attivita, Note, Appuntamenti, Opportunita
- **Documenti**: upload file + lista documenti caricati
- **Note**: aggiungere/vedere note testuali
- **Appuntamenti**: lista appuntamenti collegati (futura integrazione)
- **Opportunita**: lista opportunita collegate (futura integrazione)

### Routing
- Route: `/azienda/marketing/contatti/:id`
- Click sul nome nella tabella contatti naviga a questa pagina

### Modifica inline
- I campi nella colonna sinistra sono editabili inline (click per modificare, blur/enter per salvare)
- Ogni modifica aggiorna il DB e aggiunge un'entry nella timeline attivita

---

## 4. Aggiornamento ContactsTable

### File: `src/components/marketing/ContactsTable.tsx`
- Il nome del contatto diventa un link cliccabile che naviga a `/azienda/marketing/contatti/:id`

---

## File coinvolti

| File | Azione |
|------|--------|
| Migration SQL | Nuove tabelle + colonne aggiuntive su marketing_contacts |
| `src/pages/azienda/settings/SettingsCustomFields.tsx` | Nuovo |
| `src/components/settings/CustomFieldsConfig.tsx` | Nuovo |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Nuovo - pagina dettaglio 3 colonne |
| `src/components/marketing/ContactsTable.tsx` | Modifica - nome cliccabile |
| `src/App.tsx` | Modifica - nuove route |
| `src/components/layouts/CompanyLayout.tsx` | Modifica - voce sidebar impostazioni |

## Cosa NON cambia
- Le pagine esistenti (Dashboard, Opportunita, ecc.) restano invariate
- Il dialog di creazione contatto rimane funzionante
- I tag e il sistema esistente non vengono toccati
