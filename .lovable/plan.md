
# Migliorare la tabella Contatti in stile GHL

## Modifiche previste

### 1. Linee separatrici sottili tra colonne e righe

Aggiungere bordi verticali e orizzontali molto sottili (opacity bassa) alla tabella contatti, replicando lo stile GHL dove ogni cella e visivamente separata da linee appena percepibili.

**File**: `src/components/marketing/ContactsTable.tsx`
- Aggiungere `border-r border-border/30` a ogni `TableHead` e `TableCell` (escluso l'ultimo)
- Le righe hanno gia `border-b` dal componente Table base

### 2. Frecce di ordinamento su ogni colonna

Aggiungere icone freccia su/giu (ChevronUp + ChevronDown) accanto al nome di ogni colonna header. Cliccando si ordina la tabella per quella colonna (ascendente/discendente).

**File**: `src/components/marketing/ContactsTable.tsx`
- Aggiungere stato `sortField` e `sortDirection` al componente
- Nuove props `onSort(field, direction)` e `sortField/sortDirection` nell'interfaccia
- Ogni TableHead diventa cliccabile con le due frecce impilate verticalmente (come GHL)

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx`
- Aggiungere stato per il sort e passarlo alla query Supabase (`.order(sortField, { ascending })`)
- Passare le props di sort a ContactsTable

### 3. Pulsante "Gestisci campi" per selezione colonne visibili

Aggiungere un link/pulsante "Gestisci campi" in alto a destra (accanto alla barra di ricerca) che apre un popover/sheet con la lista di tutte le colonne disponibili, ognuna con un toggle per mostrarla o nasconderla.

**File**: `src/components/marketing/ContactsTable.tsx`
- Nuovo componente inline o separato `ColumnVisibilityPopover`
- Lista delle colonne con Checkbox/Switch per ciascuna
- Le colonne "Nome del Contatto" e checkbox sono sempre visibili (non disattivabili)
- Stato `visibleColumns` gestito con `useState` e salvato in `localStorage`

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx`
- Aggiungere il pulsante "Gestisci campi" con icona ingranaggio nella barra sopra la tabella, allineato a destra

### Colonne disponibili per visibilita

| Colonna | Chiave | Default visibile |
|---------|--------|-----------------|
| Nome del Contatto | name | Si (fissa) |
| Telefono | phone | Si |
| Email | email | Si |
| Azienda | company_name | Si |
| Creato | created_at | Si |
| Ultima Attivita | last_activity_at | Si |
| Tag | tags | Si |
| Fonte | source | No (nuova colonna) |

### Colonne per ordinamento

| Colonna | Campo DB |
|---------|----------|
| Nome del Contatto | first_name |
| Telefono | phone |
| Email | email |
| Azienda | company_name |
| Creato | created_at |
| Ultima Attivita | last_activity_at |

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/ContactsTable.tsx` | Aggiungere bordi sottili, frecce sort, colonne condizionali, popover gestisci campi |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiungere stato sort, pulsante "Gestisci campi", passare sort alla query |

## Dettagli tecnici

- Le frecce di sort saranno due icone `ChevronUp` e `ChevronDown` impilate (8px ciascuna), la freccia attiva evidenziata in colore primario
- I bordi verticali useranno `border-r border-border/30` per essere appena visibili
- La persistenza delle colonne visibili sara in `localStorage` con chiave `contacts-visible-columns`
- Il "Gestisci campi" sara un Popover con lista di Checkbox + etichetta colonna
