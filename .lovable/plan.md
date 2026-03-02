

# Revisione Completa del Progetto — Piano di Intervento

## 1. CODICE INUTILE / LEGACY DA RIMUOVERE

### A) File morti
- **`src/components/ui/toaster.tsx`** — Il vecchio sistema Radix Toast. NON importato da nessun file tranne se stesso. L'app usa solo `sonner`. File eliminabile.
- **`src/components/ui/toast.tsx`** — Componenti Radix Toast (Toast, ToastClose, ToastDescription, etc.) usati SOLO da `toaster.tsx` che e' morto. Eliminabile.

### B) Funzione DB inutilizzata
- **`get_company_order_sparklines`** — La funzione SQL esiste nel DB ma NON e' chiamata da nessun file del codebase (era per i trend sparkline rimossi). Verra' lasciata nel DB (non causa danni), ma segnalata.

### C) Funzione JS mai usata
- **`getHealthIndicator()`** in `src/lib/companyUtils.ts` — esportata ma mai importata da nessun componente `.tsx`. Eliminabile.

### D) Import inutilizzati in CompanyExpandedRow
- `CheckCircle2` importato ma usato; tuttavia `Activity` duplica logica gia' presente. Verificato: tutti gli import sono effettivamente usati nel file corrente. Nessun import morto.

### E) Dipendenza package.json
- **`@radix-ui/react-toast`** — La dipendenza Radix Toast puo' essere rimossa dopo eliminazione dei file `toast.tsx` e `toaster.tsx`. Tuttavia, la rimozione di dipendenze dal `package.json` potrebbe causare problemi se altri file shadcn la referenziano indirettamente. Approccio conservativo: rimuovere solo i file, lasciare la dipendenza.

---

## 2. BUG / PROBLEMI FUNZIONALI

### A) Health Score calcolo incoerente (Bassa Gravita')
Il calcolo dello score in `CompaniesList.tsx` (righe 150-167) usa una scala con max teorico 90 (15+10+20+15+10+20), non 100. Ma il `Math.min(score, 100)` non normalizza. Il `getHealthBreakdown` in `companyUtils.ts` usa `maxScore` sommato a 90 (25+20+15+10+20). I due calcoli NON sono allineati: la lista usa un algoritmo, il breakdown ne usa un altro.

**Fix**: Centralizzare il calcolo del health score in `companyUtils.ts`, riusandolo sia nella lista che nel breakdown. Eliminare la logica duplicata in `CompaniesList.tsx`.

### B) statusBadge className parsing fragile
In `CompanyExpandedRow.tsx` riga 136, il codice fa `.split(" ").find(c => c.startsWith("bg-"))` per estrarre classi dal config. Questo e' fragile e potrebbe fallire con classi composite. 

**Fix**: Separare `icon_bg` e `icon_text` nel `statusBadgeConfig` come proprieta' dedicate.

### C) Promise non awaited
In `AuthContext.tsx` riga 209, `supabase.functions.invoke("manage-super-admins", ...)` non e' awaited e non ha `.catch()`. Se fallisce silenziosamente, va bene (fire-and-forget), ma dovrebbe avere un `.catch(() => {})` esplicito per evitare unhandled promise rejection warnings.

---

## 3. OTTIMIZZAZIONI PERFORMANCE

### A) Health score calcolato N volte
In `CompaniesList.tsx`, il health score viene calcolato per ogni azienda nel `healthData` query callback. Poi, nella expanded row, `getHealthBreakdown` ricalcola fattori simili. Non c'e' memoizzazione.

**Fix**: Pre-calcolare il breakdown nella query e passarlo direttamente. Alternativa: i calcoli sono leggeri, ma la centralizzazione evita divergenze.

### B) `SortIcon` come useCallback che ritorna JSX
`SortIcon` in `CompaniesList.tsx` e' definito con `useCallback` ma contiene JSX. Dovrebbe essere un componente memo o inline, non un callback. Non causa bug ma e' un antipattern.

**Fix**: Convertire `SortIcon` in un componente `React.memo`.

### C) latestNotes query con limit(200)
La query `company_notes` con `limit(200)` e ordering potrebbe non restituire la nota piu' recente per tutte le aziende se ci sono piu' di 200 note totali.

**Fix**: Documentare il limite o usare una strategia diversa (RPC con DISTINCT ON).

---

## 4. MIGLIORAMENTI UX

### A) Nessun feedback al click "Nota rapida"
Il bottone "Nota rapida" nella expanded row naviga a `/admin/aziende/${id}?tab=notes` ma non c'e' indicazione visiva che sia un link di navigazione (vs. un'azione inline).

**Fix**: Aggiungere un'icona freccia o cambiare il testo in "Vai alle note →".

### B) Empty state per Health Score
Se `healthData` non e' disponibile per un'azienda, la sezione Health Score semplicemente non appare. L'utente potrebbe non capire perche'.

**Fix**: Mostrare un placeholder "Dati insufficienti" quando `hd` e' undefined.

---

## 5. PIANO IMPLEMENTAZIONE

### File da eliminare:
1. `src/components/ui/toaster.tsx`
2. `src/components/ui/toast.tsx`

### File da modificare:

**`src/lib/companyUtils.ts`**:
- Rimuovere `getHealthIndicator` (mai usata)
- Aggiungere `calculateHealthScore(hd)` centralizzato per eliminare duplicazione con `CompaniesList.tsx`

**`src/pages/admin/CompaniesList.tsx`**:
- Sostituire calcolo health score inline con `calculateHealthScore()` da companyUtils
- Convertire `SortIcon` da useCallback a componente memo
- Aggiungere `.catch` nota su latestNotes limit

**`src/components/admin/company/CompanyExpandedRow.tsx`**:
- Refactorare `statusBadgeConfig` con proprieta' separate per icon bg/text
- Aggiungere empty state per health score mancante

**`src/contexts/AuthContext.tsx`**:
- Aggiungere `.catch(() => {})` alla promise fire-and-forget di impersonation logging

### Nessuna migrazione DB necessaria.
### Nessun cambio funzionale — solo pulizia, stabilizzazione e allineamento.

