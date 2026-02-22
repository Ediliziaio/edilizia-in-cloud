

# Vista Lista + Miglioramento Selezione Opportunita

## 1. Nuova Vista Lista (come GHL)

Creare un nuovo componente `OpportunityListView` che replica la tabella vista nello screenshot GHL:

**Colonne**:
| Colonna | Contenuto |
|---------|-----------|
| Checkbox | Selezione multipla |
| Nome opportunita | Nome contatto + citta |
| Contatto | Avatar (iniziali colorate) + nome |
| Fase | Nome della fase corrente |
| Valore | EUR formattato |
| Stato | Badge (aperta/vinta/persa/abbandonata) |
| Titolare | Nome del profilo assegnato |
| Etichette | Badge tag con "+N" se piu di uno |
| Fonte | Sorgente lead |
| Creato il | Data formattata |
| Aggiornato il | Data formattata |

- Click su riga apre `OpportunityDetailDialog`
- Checkbox per selezione (condivide lo stesso `selectedIds` della vista Kanban)
- Header checkbox per "seleziona tutti visibili"

**Nuovo file**: `src/components/opportunities/OpportunityListView.tsx`

---

## 2. Toggle Vista Griglia/Lista

Aggiungere stato `viewMode: "kanban" | "list"` in `MarketingOpportunities.tsx`:
- Bottone `LayoutGrid` attiva kanban (default)
- Bottone `List` attiva lista
- Evidenziare il bottone attivo con `variant="default"` o `bg-muted`
- Rendering condizionale: se `viewMode === "list"` mostra `OpportunityListView`, altrimenti `OpportunityKanbanView`

**File modificato**: `src/pages/azienda/marketing/MarketingOpportunities.tsx`

---

## 3. Miglioramento Selezione

- Aggiungere checkbox "seleziona tutti" nell'header della lista
- In kanban: migliorare la visibilita del checkbox (renderlo sempre visibile, non solo su hover)
- La barra bulk actions gia esistente funziona con entrambe le viste perche condividono `selectedIds`
- Quando si cambia vista, mantenere la selezione attiva

---

## Riepilogo file

| File | Tipo |
|------|------|
| `src/components/opportunities/OpportunityListView.tsx` | Nuovo |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Modifica: stato viewMode, toggle, rendering condizionale |

## Dettagli tecnici

- `OpportunityListView` riceve le stesse props di `OpportunityKanbanView`: `stages`, `opportunities`, `selectedIds`, `onSelect`
- Usa i componenti `Table` di shadcn/ui gia presenti nel progetto
- Il formato date usa `date-fns` (gia installato) con locale italiano
- Avatar contatto: cerchio colorato con iniziale (colore derivato dal nome tramite hash semplice)
- La tabella e scrollabile orizzontalmente su mobile
