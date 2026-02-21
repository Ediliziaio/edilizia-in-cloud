

# Sezione Contatti Marketing - Implementazione Completa

## Panoramica
Creare una pagina Contatti completa per la sezione Marketing e Vendita, ispirata allo screenshot di riferimento: tabella con avatar, nome, telefono, email, azienda, data creazione, ultima attivita, tag, ricerca, importazione CSV, aggiunta manuale e paginazione.

---

## 1. Database - Nuova tabella `marketing_contacts`

Creare la tabella con i seguenti campi:

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | default gen_random_uuid() |
| company_id | uuid FK companies(id) ON DELETE CASCADE | NOT NULL |
| first_name | text | NOT NULL |
| last_name | text | nullable |
| phone | text | nullable |
| email | text | nullable |
| company_name | text | nullable (nome azienda del contatto) |
| tags | text[] | default '{}' (es: "lead", "energiapiu", "facebook") |
| notes | text | nullable |
| source | text | nullable (es: "manuale", "importazione", "facebook") |
| last_activity_at | timestamptz | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**RLS Policies:**
- SELECT/INSERT/UPDATE/DELETE: solo utenti la cui company_id nel profilo corrisponde a quella del contatto (stesso pattern usato per `orders`, `customers`, ecc.)

**Indici:**
- `company_id` per le query filtrate
- `created_at` per ordinamento

---

## 2. Frontend - Pagina Contatti

### File: `src/pages/azienda/marketing/MarketingContacts.tsx`

Riscrittura completa del placeholder. Struttura della pagina:

**Header:**
- Titolo "Contatti" con conteggio totale (es. "324 Contatti" in badge blu)
- Bottone "Importa" (outline) e bottone "+ Aggiungi Contatto" (primary)

**Barra filtri:**
- Input di ricerca con icona lente
- Ricerca su nome, telefono, email, azienda

**Tabella:**
- Colonne: Checkbox, Nome del Contatto (con avatar iniziali colorato), Telefono, Email, Nome dell'azienda, Creato, Ultima attivita, Tag
- Ogni riga ha checkbox per selezione multipla
- Avatar con iniziali colorate (stile screenshot: cerchio con 2 lettere)
- Tag mostrati come badge
- Azioni su hover o tramite bulk actions bar (elimina selezionati)

**Paginazione:**
- Select per numero righe per pagina (25, 50, 100)
- Navigazione pagine (Prev/Next + indicatore pagina corrente)

### File: `src/components/marketing/ContactDialog.tsx` (nuovo)

Dialog per aggiungere/modificare un contatto con i campi:
- Nome (required), Cognome, Telefono, Email, Nome azienda, Tag (input con chips), Note, Fonte

### File: `src/components/marketing/ContactsTable.tsx` (nuovo)

Componente tabella dedicato con:
- Checkbox select-all / select-singolo
- Avatar con iniziali colorate
- Rendering tag come badge
- Bulk actions bar (elimina selezionati)
- Paginazione integrata

---

## 3. Import CSV

Riutilizzare il componente `CSVImportDialog` gia esistente, configurandolo con i campi del contatto marketing:
- first_name (required), last_name, phone, email, company_name, tags, notes, source

---

## File coinvolti

| File | Azione |
|------|--------|
| Database migration | Nuova tabella `marketing_contacts` + RLS |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Riscrittura - pagina completa |
| `src/components/marketing/ContactDialog.tsx` | Nuovo - dialog aggiungi/modifica |
| `src/components/marketing/ContactsTable.tsx` | Nuovo - tabella con avatar, tag, paginazione |

## Cosa NON cambia
- Nessuna modifica a pagine o componenti esistenti
- Nessuna modifica al routing (route gia configurata)
- Nessuna modifica alla sidebar

