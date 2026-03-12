

## Problemi Identificati

### 1. Errore "children column" al salvataggio
Quando clicchi un nodo nell'albero dell'organigramma, il componente passa un `OrgTreeNode` (che contiene i campi extra `children` e `depth`) direttamente al form. Al salvataggio, `useUpdateHrProfilo` invia **tutti** i campi a Supabase, inclusi `children` e `depth` che non esistono nella tabella → errore.

### 2. Filtri non funzionanti nella vista Albero
I filtri di ricerca e reparto vengono applicati solo alla lista (`filtered`), ma la vista albero usa sempre `data.tree` ignorando completamente search e filterReparto.

---

## Piano di Fix

### A. Fix errore "children" — `HrProfiloSheet.tsx`
Nel `onSubmit`, prima di inviare i dati a Supabase, rimuovere i campi non-DB (`children`, `depth`, `sede`, `responsabile`, `employee_first_name`, `employee_last_name`, `employee_email`, `employee_phone`) dal payload. Destructuring per escluderli.

### B. Filtri albero — `TabOrganigramma.tsx` + `useOrganigramma.ts`
- Creare una funzione `filterTree(tree, search, reparto)` che filtra ricorsivamente l'albero, mantenendo i nodi che matchano **e** i loro antenati.
- Passare l'albero filtrato a `OrgTreeView` invece di `data.tree`.

### File modificati
- `src/components/hr/HrProfiloSheet.tsx` — sanitizzare dati prima dell'invio
- `src/pages/azienda/personale/tabs/TabOrganigramma.tsx` — aggiungere filtro ricorsivo sull'albero

