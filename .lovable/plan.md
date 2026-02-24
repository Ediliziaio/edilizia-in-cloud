

# Piano: Pulizia, Bug Fix e Stabilizzazione

## Analisi completata

Ho scansionato l'intero codebase e identificato le seguenti problematiche.

---

## 1. Bug da correggere

### 1.1 — Console Warning: CalendarSuggestions ref
**File:** `src/components/marketing/CalendarSuggestions.tsx`
**Problema:** Il componente è una funzione semplice ma viene usato in contesti dove React tenta di passargli un ref, generando il warning "Function components cannot be given refs".
**Fix:** Nessun ref è effettivamente necessario dal consumatore. Il warning viene dal rendering in contesti come dialog/scroll-area che propagano ref ai figli. Tuttavia il fix corretto è semplicemente non cambiare nulla nel componente perché il warning non causa errori — ma se vogliamo una console pulita, si può wrappare con `React.forwardRef` senza cambiare il comportamento.

### 1.2 — `src/components/ui/use-toast.ts` è un file morto
**File:** `src/components/ui/use-toast.ts`
**Problema:** Re-esporta `useToast` e `toast` da `@/hooks/use-toast`, ma nessun file nel progetto lo importa (tutti i 69 file importano direttamente da `@/hooks/use-toast`).
**Fix:** Eliminare il file.

---

## 2. Codice morto da rimuovere

| # | File | Motivo |
|---|------|--------|
| 1 | `src/components/ui/use-toast.ts` | Re-export non importato da nessun file |

Tutto il resto del codebase (componenti, hook, utility, pagine, tipi, edge functions) è correttamente utilizzato. La pulizia precedente ha già rimosso asset orfani e test placeholder.

---

## 3. Miglioramenti UX/Stabilità

### 3.1 — Console pulita: forwardRef su CalendarSuggestions
Wrappare `CalendarSuggestions` con `React.forwardRef` per eliminare il warning dalla console. Il componente non usa il ref internamente, ma React lo richiede perché si trova dentro un dialog con scroll-area che propaga ref.

---

## 4. Piano di intervento

| Azione | File | Dettaglio |
|--------|------|-----------|
| Eliminare | `src/components/ui/use-toast.ts` | File morto, mai importato |
| Aggiungere forwardRef | `src/components/marketing/CalendarSuggestions.tsx` | Eliminare warning console |

### Impatto
- Zero rischio regressione
- Console pulita (nessun warning)
- Nessuna modifica DB, nessuna modifica backend

### Verifica finale
- Dopo le modifiche: verificare che la console non mostri più il warning "Function components cannot be given refs"
- Verificare che CalendarSuggestions funzioni identicamente in Opportunità e nel dialog Marketing

