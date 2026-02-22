

# Tabella Contatti identica a GHL

## Cosa cambia

### 1. Ridurre altezza righe

Le righe della tabella sono troppo alte. Ridurre il padding verticale delle celle (`py-1.5` invece del default) e l'avatar da `h-8 w-8` a `h-7 w-7` per un look compatto come GHL.

**File**: `src/components/marketing/ContactsTable.tsx`

### 2. "Gestisci campi" diventa uno Sheet a destra (come opportunita)

Sostituire il Popover attuale con uno Sheet che si apre da destra, identico al pattern `CardCustomizeSheet.tsx` delle opportunita:
- Barra di ricerca in alto
- Sezione "Campi nella tabella" con checkbox e drag handle (GripVertical)
- Nome del Contatto e checkbox fissi (Lock icon, non disattivabili)
- Sezione "Aggiungi campi" con campi non ancora visibili, raggruppati in accordion espandibili (Contatto, Informazioni generali, Attivita di Contatto)
- Footer con pulsanti "Annulla" e "Applica"

**File**: `src/components/marketing/ContactsTable.tsx` - Rimuovere il Popover e aggiungere logica per aprire lo Sheet
**Nuovo file**: `src/components/marketing/ContactFieldsSheet.tsx` - Sheet "Gestisci campi" ispirato a `CardCustomizeSheet.tsx`

### 3. Aggiungere barra filtri sopra la tabella (come opportunita)

Sotto la barra di ricerca, aggiungere una riga con:
- A sinistra: pulsante "Filtri avanzati" (con icona Filter e badge conteggio) + pulsante "Ordina" (con icona ArrowUpDown)
- A destra: campo di ricerca + link "Gestisci campi" (con icona Settings2)

Il layout replica esattamente quello delle opportunita (righe 347-369 di `MarketingOpportunities.tsx`).

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx` - Ristrutturare la barra sopra la tabella

### 4. Creare ContactFiltersSheet (come OpportunityFiltersSheet)

Uno Sheet a destra con filtri espandibili per:
- Fonte (input testo)
- Tag (chip selezionabili)
- Data creazione (da/a)
- Ultima attivita (da/a)
- Azienda (input testo)

**Nuovo file**: `src/components/marketing/ContactFiltersSheet.tsx` - Ispirato a `OpportunityFiltersSheet.tsx`

### 5. Spostare logica sort dal componente tabella alla barra filtri

Il pulsante "Ordina" nella barra filtri apre un Popover/Sheet per scegliere campo e direzione di ordinamento. Le frecce nella tabella restano come indicatori visivi ma il sort viene anche controllato dalla barra.

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/ContactsTable.tsx` | Ridurre altezza righe, rimuovere Popover "Gestisci campi", esternalizzare logica visibilita colonne |
| `src/components/marketing/ContactFieldsSheet.tsx` | NUOVO - Sheet "Gestisci campi" in stile GHL/CardCustomizeSheet |
| `src/components/marketing/ContactFiltersSheet.tsx` | NUOVO - Sheet "Filtri avanzati" in stile OpportunityFiltersSheet |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Ristrutturare barra sopra tabella con Filtri avanzati + Ordina + Cerca + Gestisci campi |

## Dettagli tecnici

### ContactFieldsSheet
- Props: `open`, `onOpenChange`, `visibleColumns: string[]`, `onApply(columns: string[])`
- Stato interno `draftFields` sincronizzato all'apertura
- Search bar filtra i campi
- Sezione "Campi nella tabella": campi attivi con checkbox checked, GripVertical per drag, Lock per "Nome del Contatto"
- Sezione "Aggiungi campi": Collapsible per ogni gruppo, checkbox unchecked
- Footer: Annulla + Applica

### ContactFiltersSheet
- Props: `open`, `onOpenChange`, `filters`, `onApply`
- Filtri: fonte, tag, data creazione, ultima attivita, azienda
- Footer: Resetta + Applica filtri

### Barra sopra tabella (in MarketingContacts.tsx)
```
[Filtri avanzati] [Ordina]          [Cerca contatti...] [Gestisci campi]
```

### Righe compatte
- TableCell: `className="py-1.5"` su tutte le celle
- Avatar: `h-7 w-7` con `text-[10px]`
- Font size celle: `text-sm` (gia presente in alcune)

