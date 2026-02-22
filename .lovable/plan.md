

# Stabilizzazione e Fix - Modulo Opportunita Marketing

## Bug critici identificati

### 1. Tag contatto non fetchati nella query opportunita (CAUSA ROOT del problema tag)

Nel hook `useOpportunities` (file `src/hooks/useOpportunitiesData.ts`, riga 37), la select dei contatti e:
```
marketing_contacts(id, first_name, last_name, email, phone, city, source, company_name)
```
Manca il campo `tags`. Questo significa che:
- L'auto-sync nel `OpportunityDetailDialog` non puo mai vedere i tag del contatto
- La sincronizzazione all'apertura del dialog non funziona
- Il tag "facebook" di Enrico Goldoni non appare mai

**Fix**: Aggiungere `tags` alla select: `marketing_contacts(id, first_name, last_name, email, phone, city, source, company_name, tags)`

**File**: `src/hooks/useOpportunitiesData.ts` riga 37

### 2. Warning console: DialogTitle mancante

I dialog `OpportunityDetailDialog` e `OpportunityDialog` usano `DialogContent` senza `DialogTitle` come componente Radix. Anche se hanno un `<h2>` manuale, Radix richiede il componente specifico per l'accessibilita.

**Fix**: Importare `DialogTitle` e `DialogDescription` da `@/components/ui/dialog` e wrappare i titoli esistenti, oppure usare `VisuallyHidden` dove necessario.

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx` righe 330-337
**File**: `src/components/opportunities/OpportunityDialog.tsx` righe 204-208

### 3. Import `UserCircle` non utilizzato

In `OpportunityListView.tsx`, l'import `UserCircle` da lucide-react non viene usato nel componente.

**Fix**: Rimuovere l'import inutilizzato.

**File**: `src/components/opportunities/OpportunityListView.tsx` riga 4

### 4. Variabili non utilizzate

- `OpportunityDialog.tsx`: `noResults` (riga 192) dichiarato ma mai usato
- `OpportunityCard.tsx`: `toast` importato da sonner ma le funzioni `handleComingSoon` possono essere semplificate

---

## Miglioramenti UX

### 5. Auto-sync tags migliorato con invalidazione cache

L'auto-sync attuale nel `OpportunityDetailDialog` (righe 144-161) persiste i tag nel DB ma non invalida la cache di react-query. Il risultato e che chiudendo e riaprendo il dialog i dati non sono aggiornati fino al prossimo refetch.

**Fix**: Dopo il `.then()` della update, chiamare `queryClient.invalidateQueries` per `marketing_opportunities`.

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

### 6. Checkbox indeterminate nella lista

Il componente `Checkbox` di Radix non supporta `indeterminate` come prop. Il `@ts-ignore` a riga 77-78 di `OpportunityListView.tsx` nasconde il problema ma la funzionalita non funziona.

**Fix**: Usare `ref` per impostare `indeterminate` natively sull'elemento DOM, oppure usare l'approccio `data-state="indeterminate"` supportato da Radix.

**File**: `src/components/opportunities/OpportunityListView.tsx`

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/hooks/useOpportunitiesData.ts` | Aggiungere `tags` alla select dei contatti (riga 37) |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Aggiungere `DialogTitle`/`DialogDescription`, migliorare invalidazione cache auto-sync |
| `src/components/opportunities/OpportunityDialog.tsx` | Aggiungere `DialogTitle`/`DialogDescription`, rimuovere `noResults` |
| `src/components/opportunities/OpportunityListView.tsx` | Rimuovere import `UserCircle`, fix checkbox indeterminate |

## Dettagli tecnici

- Il fix principale (punto 1) e una modifica di una sola parola nella query che risolve il problema di sincronizzazione tag segnalato dall'utente
- I fix di accessibilita (punto 2) risolvono i warning in console
- Il fix del checkbox indeterminate (punto 6) usa `useEffect` + `ref` per impostare la proprieta nativa `indeterminate` dell'elemento `<input>` sottostante
- Tutte le modifiche sono retrocompatibili e non cambiano il comportamento funzionale

