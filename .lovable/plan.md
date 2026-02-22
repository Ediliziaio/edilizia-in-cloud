
# Sidebar visibile durante importazione + Stabilizzazione

## Problema principale

Il wizard di importazione attuale usa `fixed inset-0 z-50`, coprendo l'intera pagina inclusa la sidebar. Nello screenshot GHL, la sidebar resta sempre visibile a sinistra e il wizard occupa solo l'area di contenuto principale.

## Modifiche

### 1. ImportWizard: da overlay a contenuto inline

**File**: `src/components/shared/ImportWizard.tsx`

Cambiare il wrapper da `fixed inset-0 z-50 bg-background` a un layout che occupa solo l'area di contenuto (senza `fixed`). Il componente diventa un semplice container flex-col che riempie lo spazio disponibile del parent (il `<main>` dentro `CompanyLayout`).

- Rimuovere `fixed inset-0 z-50`
- Usare `absolute inset-0 z-40 bg-background` oppure semplicemente un div che occupa `h-full w-full` in modo che il layout della sidebar resti intatto
- Aggiungere un titolo "Importazioni" con sottotitolo "Importare contatti e lead" come in GHL (visibile nello screenshot)

### 2. StepIndicator: aggiungere forwardRef per eliminare il warning

**File**: `src/components/shared/import-wizard/StepIndicator.tsx`

- Wrappare con `React.forwardRef` per eliminare il warning in console "Function components cannot be given refs"

### 3. StepIndicator: allineare testi a GHL

Aggiornare le descrizioni degli step per corrispondere esattamente allo screenshot GHL:
- Step 1: "Avvia" - "Seleziona gli oggetti e ulteriori informazioni"
- Step 2: "Carica" - "Carica il file e configura"
- Step 3: "Mappa" - "Mappa le colonne ai campi"
- Step 4: "Verifica" - "Conferma e finalizza la selezione"

### 4. StepReview: aggiungere opzioni mancanti (come GHL)

**File**: `src/components/shared/import-wizard/StepReview.tsx`

Nello screenshot GHL la sezione "Preferenze" include:
- "Crea un elenco intelligente per i nuovi contatti creati con l'importazione" (con campo data)
- "Aggiungi i contatti importati a un flusso di lavoro" (con select)
- "Aggiungi etichette ai contatti importati" (con select tag)

Aggiungere queste opzioni. Le prime due saranno placeholder visivi (checkbox disabilitate o con "Prossimamente"). La terza (tag) e gia implementata.

## Riepilogo file modificati

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/shared/ImportWizard.tsx` | UX Fix | Da overlay fullscreen a contenuto inline (sidebar visibile) + titolo pagina |
| `src/components/shared/import-wizard/StepIndicator.tsx` | Bug Fix | Aggiungere forwardRef + aggiornare testi step |
| `src/components/shared/import-wizard/StepReview.tsx` | UX | Aggiungere opzioni preferenze stile GHL |

## Dettaglio tecnico

### ImportWizard.tsx - Nuovo layout

Il div root passa da:
```text
<div className="fixed inset-0 z-50 bg-background flex flex-col">
```
a:
```text
<div className="absolute inset-0 z-40 bg-background flex flex-col overflow-hidden">
```

Questo lo posiziona sopra il contenuto della pagina ma dentro il container `<main>` del layout, mantenendo la sidebar visibile. Il `<main>` in CompanyLayout ha gia `position: relative` o lo aggiungeremo se necessario.

La top bar del wizard verra aggiornata con:
- Titolo "Importazioni" (h1, font-semibold)
- Sottotitolo "Importare contatti e lead" (text-sm, muted)
- Pulsante X a destra per chiudere

### CompanyLayout.tsx - relative sul main

Verificare che il container principale del contenuto abbia `relative` per ancorare l'`absolute` del wizard. Se non lo ha, aggiungere `relative` al wrapper dell'`<Outlet>`.
