

# Revisione Completa — CompaniesList & Componenti Admin

Dopo un'analisi approfondita del codice, ecco i problemi identificati e le ottimizzazioni da implementare, raggruppati per categoria.

---

## A) Bug da correggere

### 1. mailto: usa `company.name` invece di `company.email`
**File:** `CompanyQuickActions.tsx` linea 98
`mailto:${company.name}` apre un link con il nome dell'azienda come indirizzo email. Deve essere `mailto:${company.email}`.
Richiede anche aggiornare l'interfaccia `QuickActionsProps` per includere `email: string`.

### 2. Calcolo onboarding duplicato e inline
**File:** `CompaniesList.tsx` linee 644-659
Il calcolo dell'onboarding % e la relativa progress bar sono duplicati inline (stessa formula ripetuta 2 volte). Estrarre in una funzione `getOnboardingPct(hd)` riutilizzabile.

### 3. Query `latestNotes` non limitata
**File:** `CompaniesList.tsx` linee 234-237
La query scarica TUTTE le note di TUTTE le aziende senza `.limit()`. Con molte note questo diventa un problema di performance. Soluzione: aggiungere un approccio con subquery o `.limit(100)` e prendere solo la prima nota per company tramite logica server-side (o limitare lato client ma con un tetto ragionevole).

---

## B) Ottimizzazioni Performance

### 1. Memoizzare componenti expanded row pesanti
Il rendering della expanded row include sparkline charts (recharts `AreaChart`) che vengono ri-renderizzati ad ogni re-render del parent. Estrarre la expanded row in un componente React separato con `React.memo`.

### 2. Memoizzare `SortIcon`
`SortIcon` e definito come funzione inline dentro il componente — viene ricreato ad ogni render. Estrarlo fuori dal componente o wrapparlo in `useMemo`/`useCallback`.

### 3. Troppi import di icone inutilizzate
`CompaniesList.tsx` importa icone non usate nel file: `Globe`, `Phone`, `FileText` (usate solo condizionalmente nella expanded row ma gia coperte dal testo). Rimuovere import non necessari.

---

## C) Code Quality / Refactoring

### 1. Estrarre ExpandedRow in componente dedicato
La expanded row (linee 586-781, ~195 righe) e un IIFE inline dentro JSX. Estrarlo in `CompanyExpandedRow.tsx` migliora leggibilita, testabilita e performance (con React.memo).

### 2. Centralizzare health color/label logic
La logica `healthColor`/`healthLabel` basata su `daysSince` e ripetuta in piu punti. Creare una utility `getHealthIndicator(daysSince)` in `companyUtils.ts`.

### 3. Rimuovere `useState` per `open` in CompanyTagsCell
`useState` e usato per `open` ma il Popover gia gestisce il proprio stato internamente. Se non serve controllo programmatico (e non sembra servire tranne per il reset dopo add), va bene ma verificare che `setOpen(false)` dopo add sia necessario — lo e, quindi OK.

---

## D) UX Improvements

### 1. Email QuickAction con conferma visiva
Dopo il fix del mailto, aggiungere feedback toast: "Email aperta per {company.name}".

### 2. Empty state expanded row
Se nessun dato e disponibile (no health, no stats, no notes), mostrare un messaggio "Nessun dato disponibile" invece di card vuote con "0" ovunque.

### 3. Sparkline fallback migliorato
Quando `companySparkline` e undefined (non solo tutti zeri), mostrare "Caricamento..." o un placeholder skeleton invece di "Nessun dato".

---

## Piano Implementazione

### File modificati:
1. **`src/pages/admin/CompaniesList.tsx`**
   - Estrarre `SortIcon` fuori dal componente
   - Estrarre calcolo onboarding in funzione `getOnboardingPct`
   - Estrarre expanded row in componente `CompanyExpandedRow`
   - Aggiungere `.limit(200)` alla query `latestNotes`
   - Rimuovere import icone inutilizzate (`Globe`, `Phone`, `FileText` se non usate)

2. **`src/components/admin/company/CompanyQuickActions.tsx`**
   - Fix `mailto:${company.email}` (non `.name`)
   - Aggiungere `email` all'interfaccia props

3. **Nuovo: `src/components/admin/company/CompanyExpandedRow.tsx`**
   - Componente memoizzato con tutta la logica della expanded row
   - Include funzione `getOnboardingPct` locale o importata

4. **`src/lib/companyUtils.ts`**
   - Aggiungere `getHealthIndicator(daysSince)` utility

### Nessuna migrazione DB necessaria
### Nessun breaking change funzionale

