

## Fix: Allineamento label subcategory + larghezza sidebar

### Problemi (dallo screenshot)
1. Le label "FATTURAZIONE E DOCUMENTI" e "MARKETING & VENDITA" appaiono centrate quando il testo va a capo su due righe — servono allineate a sinistra come "CONTABILITÀ" e "CANTIERI & LAVORI".
2. Il `pl-2` sui children della subcategory aggiunge indentazione non necessaria.
3. La sidebar a `14rem` è troppo stretta per queste label lunghe.

### Fix

**File: `src/components/ui/sidebar.tsx`**
- `SIDEBAR_WIDTH`: `"14rem"` → `"15rem"`

**File: `src/components/layouts/SidebarSubcategory.tsx`**
- Aggiungere `text-left` alla label `<span>` (riga 19) per forzare allineamento sinistro anche su testo multi-riga
- Rimuovere `pl-2` dal wrapper children (riga 34) per allineare le voci di menu sotto la label

