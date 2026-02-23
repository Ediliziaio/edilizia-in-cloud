

# Refinamento Visivo GHL - Automazioni

## Differenze visive tra il codice attuale e lo screenshot GHL

Il codice gia implementa la struttura tabella con checkbox, colonne, paginazione e menu azioni. Serve un fine-tuning visivo per renderlo **identico** a GHL.

### 1. Badge "Published" verde, "Draft" grigio testo

Nello screenshot GHL:
- **Published** = badge verde con sfondo verde chiaro e testo verde ("Published" in pill verde)
- **Draft** = testo grigio semplice, senza sfondo colorato

Attualmente il codice usa `variant="default"` (blu) per Published e `variant="secondary"` per Draft.

**Fix**: Cambiare gli stili dei badge:
- Published: `className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100"`
- Draft: `variant="secondary"` con colore grigio neutro
- Archived: mantiene `variant="outline"`

### 2. Numeri "Totale Iscritto" in blu (link color)

In GHL i numeri come "24", "349", "67" sono in **blu** (colore link), non in nero.

**Fix**: Aggiungere `text-primary` ai TableCell dei conteggi.

### 3. Filter tabs con underline, non pill

In GHL le tab di filtro ("Tutti i flussi di la...", "Necessita revisi...", ecc.) usano **underline blu** per la tab attiva, non background colorato.

**Fix**: Cambiare lo stile da `bg-primary/10 text-primary rounded-md` a `border-b-2 border-primary text-primary` per la tab attiva.

### 4. Breadcrumb "Home" sopra la tabella

GHL mostra "Home" come breadcrumb tra i filtri e la tabella.

**Fix**: Aggiungere un semplice testo `Home` con freccia prima della tabella.

### 5. Paginazione - allineare stile

In GHL la paginazione e solo a destra: `Previous [1] 2 Next  10 / page`. Non c'e il contatore "X risultati" a sinistra.

**Fix**: Rimuovere il contatore risultati a sinistra, spostare tutto a destra, e aggiungere bordo attorno ai numeri pagina come in GHL.

### 6. Header tabella - sfondo piu leggero

In GHL l'header della tabella ha uno sfondo grigio molto chiaro con testo grigio medio e una piccola freccia dropdown accanto al checkbox.

**Fix**: Rendere `bg-muted/20` invece di `bg-muted/30`.

### 7. Link "Personalizza Elenco" a destra dei filtri

In GHL c'e un link "Personalizza Elenco" con icona a destra, nella stessa riga della ricerca.

**Fix**: Aggiungere un link/bottone ghost "Personalizza Elenco" accanto al campo Cerca.

## File da modificare

| File | Modifiche |
|------|-----------|
| `src/components/marketing/automations/AutomationFlowsList.tsx` | Badge Published verde, numeri blu, header piu leggero, paginazione solo a destra |
| `src/pages/azienda/marketing/MarketingAutomations.tsx` | Filter tabs con underline, breadcrumb "Home", link "Personalizza Elenco" |

Nessun file nuovo. Nessuna modifica al database. Solo refinamento CSS/classe.
