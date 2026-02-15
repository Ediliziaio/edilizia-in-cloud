

# Selezione Multipla e Azioni Rapide sui Costi

## Panoramica

Aggiungere due funzionalita' principali alla sezione Costi:

1. **Eliminazione in blocco dei ricorrenti**: un pulsante "Elimina tutti con stesso nome" che cancella tutte le righe con lo stesso nome (es. tutti i 12 mesi di "Affitto Ufficio")
2. **Selezione multipla con barra azioni rapide**: checkbox su ogni riga per selezionare piu' costi e applicare azioni in blocco (elimina, segna pagati, segna non pagati)

---

## Cosa viene aggiunto

### 1. Eliminazione gruppo ricorrenti

Nella riga di ogni costo non proveniente da ordine, accanto al pulsante Elimina singolo, aggiungere un'opzione nel menu contestuale (DropdownMenu) con:
- **"Elimina singolo"**: comportamento attuale
- **"Elimina tutti '[nome]'"**: elimina tutti i costi della stessa azienda con lo stesso nome

Quando cliccato, mostra un AlertDialog di conferma: "Stai per eliminare X costi con il nome 'Affitto Ufficio'. Questa azione non puo' essere annullata."

### 2. Selezione multipla + Barra azioni

**Checkbox nelle tabelle:**
- Checkbox nell'header per selezionare/deselezionare tutto
- Checkbox per ogni riga (solo costi non provenienti da ordini)

**Barra azioni (sticky in alto quando ci sono selezioni):**
Appare sopra la tabella quando almeno 1 costo e' selezionato. Mostra:
- Contatore: "X costi selezionati"
- Pulsante "Segna pagati" (verde)
- Pulsante "Segna non pagati" (arancione)
- Pulsante "Elimina selezionati" (rosso)
- Pulsante "Deseleziona"

---

## Dettaglio Tecnico

### File modificato: `src/components/forecast/CompanyCostsManager.tsx`

**1. Nuovi stati**

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [deleteGroupName, setDeleteGroupName] = useState<string | null>(null);
const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
```

**2. Nuove mutations**

- `deleteGroupMutation`: riceve un nome, cancella tutti i `company_costs` con `company_id` + `name` corrispondente. Toast: "Eliminati X costi 'nome'"
- `bulkDeleteMutation`: riceve array di ID, cancella tutti con `.in("id", ids)`
- `bulkMarkPaidMutation`: aggiorna `is_paid = true, paid_date = today` per tutti gli ID selezionati
- `bulkMarkUnpaidMutation`: aggiorna `is_paid = false, paid_date = null` per tutti gli ID selezionati

Tutte le mutation resettano `selectedIds` e invalidano le query al completamento.

**3. Conteggio gruppo per nome**

Un `useMemo` che conta quante righe esistono per ogni nome:
```typescript
const costNameCounts = useMemo(() => {
  const map = new Map<string, number>();
  costs.forEach(c => map.set(c.name, (map.get(c.name) || 0) + 1));
  return map;
}, [costs]);
```

**4. Modifica `renderCostsTable`**

- Aggiungere colonna Checkbox come prima colonna
- Header checkbox per select all/none (solo costi non-order nella vista corrente)
- Per ogni riga non-order: checkbox controllata da `selectedIds`
- Sostituire il pulsante Elimina singolo con un DropdownMenu:
  - "Elimina" (singolo)
  - "Elimina tutti 'X'" (visibile solo se `costNameCounts.get(name) > 1`)

**5. Barra azioni rapide**

Componente JSX posizionato subito sopra la tabella (dentro `renderCostsTable`), visibile solo se `selectedIds.size > 0`:

```
[X costi selezionati] [Segna pagati] [Segna non pagati] [Elimina] [Deseleziona]
```

Stile: barra con background primary/muted, bordo arrotondato, padding, flex layout con gap.

**6. Nuovi import**

- `Checkbox` da `@/components/ui/checkbox`
- `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger` da `@/components/ui/dropdown-menu`
- `MoreHorizontal` da lucide-react (per il trigger del dropdown)

**7. Reset selezione**

`selectedIds` viene resettato quando cambiano i filtri (periodo, stato, ricerca, fornitore, categoria) tramite un `useEffect`.

---

## Nuovi AlertDialog

- **Elimina gruppo**: "Eliminare tutti i X costi con il nome '[nome]'? Questa azione non puo' essere annullata."
- **Elimina selezionati**: "Eliminare X costi selezionati? Questa azione non puo' essere annullata."

---

## Nessuna modifica al database

Tutte le operazioni usano le API esistenti (`delete`, `update`) sulla tabella `company_costs`.

