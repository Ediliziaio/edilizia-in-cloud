

# Task Integrate in Ordini, Costi e Magazzino

## Panoramica

Creare un componente riutilizzabile `LinkedTasks` che mostra le task collegate a un'entita specifica (ordine, costo, articolo magazzino) e permette di crearne di nuove direttamente dal contesto. Il componente viene inserito nelle pagine dettaglio ordine, gestione costi e magazzino stock.

---

## 1. Nuovo componente: `src/components/tasks/LinkedTasks.tsx`

Componente compatto e riutilizzabile che riceve:
- `orderId?` / `stockItemId?` / `costId?` - per filtrare le task collegate
- `category` - categoria pre-impostata alla creazione (ordini/magazzino/costi/pagamenti)
- `companyId` - per il filtro tenant

Funzionalita:
- Mostra lista task collegate con titolo, assegnatario, priorita (badge), scadenza, stato
- Checkbox rapida per completare
- Pulsante "Aggiungi attivita" che apre il `TaskDialog` gia precompilato con la categoria e l'entita collegata
- Click su task apre il `TaskDialog` in modifica
- Query dedicata con filtro sull'entita collegata
- Contatore task attive nel titolo della card
- Badge scadute in rosso

---

## 2. Modifiche al `TaskDialog`

Aggiungere props opzionali per pre-impostare valori:
- `defaultCategory?` - categoria pre-selezionata
- `defaultOrderId?` / `defaultStockItemId?` / `defaultCostId?` - collegamento pre-impostato
- Questi valori vengono usati come default quando si crea una nuova task (non in modifica)

---

## 3. Integrazione nelle pagine esistenti

### `src/pages/azienda/OrderDetail.tsx`
- Aggiungere `<LinkedTasks orderId={id} category="ordini" />` nella colonna destra (sidebar), dopo "Note Interne"
- Mostra tutte le task collegate a quell'ordine specifico

### `src/components/forecast/CompanyCostsManager.tsx`
- Nella tabella costi, aggiungere un pulsante azione "Task" per ogni costo
- Clicking apre un piccolo pannello/dialog con le task collegate a quel costo
- In alternativa: aggiungere `<LinkedTasks costId={cost.id} category="costi" />` in un dialog espandibile per ogni riga costo

### `src/components/warehouse/WarehouseStockTab.tsx`
- Nella colonna azioni di ogni articolo stock, aggiungere un pulsante "Task" (icona CheckSquare)
- Clicking apre un dialog con `<LinkedTasks stockItemId={item.id} category="magazzino" />`

---

## 4. Riepilogo file

| Azione | File |
|--------|------|
| Creare | `src/components/tasks/LinkedTasks.tsx` |
| Modificare | `src/components/tasks/TaskDialog.tsx` (aggiungere default props) |
| Modificare | `src/pages/azienda/OrderDetail.tsx` (inserire LinkedTasks in sidebar) |
| Modificare | `src/components/forecast/CompanyCostsManager.tsx` (pulsante task per costo) |
| Modificare | `src/components/warehouse/WarehouseStockTab.tsx` (pulsante task per articolo) |

---

## 5. Sincronizzazione

- Tutte le query usano la stessa query key `["tasks"]` per invalidazione automatica
- Creazione/modifica/completamento da qualsiasi contesto aggiorna tutte le viste
- La pagina principale Attivita mostra tutto, le viste embedded mostrano solo le task di quell'entita
- Il `TaskDialog` viene riutilizzato ovunque con gli stessi dati e la stessa logica

