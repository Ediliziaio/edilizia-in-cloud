
# Completare "Gestisci Campi" con tutti i campi contatto + campi opportunita

## Problema

Il pannello "Gestisci campi" mostra solo 8 colonne (Nome, Telefono, Email, Azienda, Creato, Ultima Attivita, Tag, Fonte) ma mancano molti campi del contatto presenti nel database e non ci sono campi relativi alle opportunita.

## Campi mancanti da aggiungere

### Campi contatto
| Campo DB | Label | Tipo rendering |
|----------|-------|----------------|
| `city` | Citta | testo |
| `province` | Provincia | testo |
| `address` | Indirizzo | testo |
| `postal_code` | CAP | testo |
| `country` | Paese | testo |
| `contact_type` | Tipo contatto | badge (lead/cliente/etc) |
| `date_of_birth` | Data di nascita | data |
| `website` | Sito web | testo |
| `notes` | Note | testo troncato |
| `assigned_to` | Assegnato a | testo (nome utente) |

### Campi opportunita (nuovi, richiedono join)
| Campo | Label | Tipo rendering |
|-------|-------|----------------|
| `opp_name` | Opportunita | testo (nome prima opp) |
| `opp_value` | Valore opportunita | valuta |
| `opp_status` | Stato opportunita | badge |
| `opp_pipeline` | Pipeline | testo |
| `opp_stage` | Fase pipeline | testo |

## File da modificare

| File | Modifica |
|------|----------|
| `src/components/marketing/ContactsTable.tsx` | Aggiungere nuove colonne a COLUMNS, estendere MarketingContact interface, aggiungere rendering per ogni nuovo campo nel switch/case |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiornare la query per fetchare i nuovi campi contatto + fare un join/lookup delle opportunita per ogni contatto |

## Dettagli tecnici

### 1. ContactsTable.tsx - Estendere COLUMNS

Aggiungere tutte le colonne mancanti all'array `COLUMNS`:

```text
// Campi contatto aggiuntivi
{ key: "city", label: "Citta" },
{ key: "province", label: "Provincia" },
{ key: "address", label: "Indirizzo" },
{ key: "postal_code", label: "CAP" },
{ key: "country", label: "Paese" },
{ key: "contact_type", label: "Tipo contatto" },
{ key: "date_of_birth", label: "Data di nascita" },
{ key: "website", label: "Sito web" },
{ key: "notes", label: "Note" },

// Campi opportunita
{ key: "opp_name", label: "Opportunita" },
{ key: "opp_value", label: "Valore opp." },
{ key: "opp_status", label: "Stato opp." },
{ key: "opp_pipeline", label: "Pipeline" },
{ key: "opp_stage", label: "Fase pipeline" },
```

### 2. ContactsTable.tsx - Estendere MarketingContact

Aggiungere i nuovi campi all'interfaccia:

```text
// Campi contatto aggiuntivi
city: string | null;
province: string | null;
address: string | null;
postal_code: string | null;
country: string | null;
contact_type: string;
date_of_birth: string | null;
website: string | null;

// Campi opportunita (calcolati lato query)
opp_name: string | null;
opp_value: number | null;
opp_status: string | null;
opp_pipeline: string | null;
opp_stage: string | null;
```

### 3. ContactsTable.tsx - Aggiungere rendering nel switch

Per ogni nuovo campo, aggiungere il case nel switch di rendering delle celle:
- Testo semplice per city, province, address, postal_code, country, website
- Badge colorato per contact_type e opp_status
- Data formattata per date_of_birth
- Testo troncato per notes
- Valuta formattata per opp_value

### 4. MarketingContacts.tsx - Aggiornare query

- Aggiungere i nuovi campi alla select del contatto: `city, province, address, postal_code, country, contact_type, date_of_birth, website`
- Fare una query separata per le opportunita raggruppate per contact_id (prendendo la prima/piu recente per ogni contatto)
- Unire i dati opportunita ai contatti prima di passarli alla tabella

### 5. DEFAULT_VISIBLE resta invariato

I nuovi campi non saranno visibili di default. Appariranno nella sezione "Aggiungi campi" del pannello "Gestisci campi" e l'utente potra attivarli.

## Risultato atteso

- Il pannello "Gestisci campi" mostra tutti i campi contatto + i campi opportunita
- L'utente puo attivare/disattivare qualsiasi colonna
- Le colonne opportunita mostrano i dati della prima opportunita associata al contatto
- Nessun impatto sulle colonne visibili di default
