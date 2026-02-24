

# Audit Enterprise - Sezione Ordini

## Stato Attuale (AS-IS)

La sezione Ordini e' una delle piu' complesse del progetto, con:
- Lista ordini (703 righe) con vista tabella e pipeline, paginazione, filtri avanzati, import/export CSV
- Dettaglio ordine (995 righe) con progress tracker, articoli inline editing, conto economico, allegati, manodopera, provvigioni, errori, task, appuntamenti, pagamenti fornitori
- Creazione ordine (815 righe) con draft auto-save, creazione atomica DB (RPC), validazione
- Modifica ordine (1124 righe) con draft restore, sync venditore, update atomico
- Pipeline view con drag & drop (dnd-kit)
- Multi-tenancy con company_id isolato

## Problemi Identificati

### P1 - Duplicazione: `OrderStatus` interface in 4 file
**File**: `orderUtils.ts`, `OrdersTable.tsx`, `CreateOrder.tsx`, `calendar.ts` (+ export in `OrderProgressTracker.tsx`)
**Problema**: L'interfaccia `OrderStatus` e' definita separatamente in 4+ file con variazioni minime (alcuni hanno `icon`, `position` opzionale, ecc.). Gia' esiste un export in `orderUtils.ts` ma non viene usato ovunque.
**Fix**: Definire un tipo unico completo `OrderStatus` in `orderUtils.ts` (con `icon?`, `position?`) e importarlo ovunque. Rimuovere le definizioni locali.

### P1 - Duplicazione: `OrderItemData` interface in 2 file
**File**: `OrderDetail.tsx` (riga 176-201), `EditOrder.tsx` (riga 80-102)
**Problema**: La stessa interfaccia da 22 campi e' copiata identica in 2 file.
**Fix**: Estrarre in `orderUtils.ts` e importare in entrambi.

### P1 - Duplicazione: `Customer` interface in 2 file
**File**: `CreateOrder.tsx` (riga 39-44), `EditOrder.tsx` (riga 39-44)
**Problema**: Interfaccia identica `{ id, first_name, last_name, email }` in 2 file.
**Fix**: Estrarre in `orderUtils.ts`.

### P1 - Duplicazione: logica di delete cascading in 2 file
**File**: `OrdersList.tsx` (righe 240-258, funzione `deleteOneOrder`), `OrderDetail.tsx` (righe 390-412, mutation inline)
**Problema**: La stessa sequenza di 10+ delete cascading (item attachments, items, history, employees, external teams, salespeople, attachments, errors, tasks, appointments, order) e' duplicata in 2 file.
**Fix**: Estrarre una funzione `deleteOrderCascading(orderId: string)` in `orderUtils.ts` e usarla in entrambi i file.

### P1 - Duplicazione: `mapDbItemToOrderItem` usato solo in EditOrder
**File**: `EditOrder.tsx` (riga 104-128)
**Problema**: Funzione di mapping che potrebbe servire anche altrove. Non e' duplicata ma e' una utility che appartiene al data layer, non al componente.
**Fix**: Spostare in `orderUtils.ts` per coerenza architetturale.

### P2 - `OrderDetail` interface locale (163 righe di tipo)
**File**: `OrderDetail.tsx` (righe 122-163)
**Problema**: Interfaccia `OrderDetail` molto dettagliata (41 campi), diversa dalla `OrderWithDetails` in `orderUtils.ts`. `OrderData` in `EditOrder.tsx` (righe 46-78) e' simile ma non identica.
**Stato**: Queste interfacce hanno divergenze reali (OrderDetail include `customer.id/phone/address`, OrderData include `assigned_to`). Si allineeranno con un tipo unico che copre tutti i campi. Intervento P2 per minimizzare rischio.

### P2 - Performance: OrdersList carica tutti gli ordini senza paginazione server-side
**File**: `OrdersList.tsx` (righe 62-80)
**Problema**: La query carica TUTTI gli ordini dell'azienda e poi filtra/pagina client-side. Per aziende con molti ordini questo sara' un collo di bottiglia.
**Stato**: Funzionale per volumi medio-bassi. Una migrazione a paginazione server-side richiederebbe un refactor significativo del filtro. Si documenta come P2 senza intervento immediato.

---

## Piano Interventi

### Intervento 1 - Centralizzare tipi e utility in `orderUtils.ts`

Aggiornare `src/lib/orderUtils.ts` con:
- `OrderStatus` completo (aggiungere `icon?: string`)
- `OrderItemData` (22 campi, dalla versione in EditOrder/OrderDetail)
- `OrderCustomer` (id, first_name, last_name, email)
- `deleteOrderCascading(orderId: string)` - funzione di delete cascading
- `mapDbItemToOrderItem(item: OrderItemData): OrderItem` - spostare da EditOrder

### Intervento 2 - Aggiornare OrdersTable.tsx
- Rimuovere `interface OrderStatus` locale (riga 41-46)
- Importare da `orderUtils.ts`

### Intervento 3 - Aggiornare CreateOrder.tsx
- Rimuovere `interface Customer` locale (riga 39-44)
- Rimuovere `interface OrderStatus` locale (riga 46-50)
- Importare `OrderCustomer` e `OrderStatus` da `orderUtils.ts`

### Intervento 4 - Aggiornare EditOrder.tsx
- Rimuovere `interface Customer` locale (riga 39-44)
- Rimuovere `interface OrderItemData` locale (riga 80-102)
- Rimuovere funzione `mapDbItemToOrderItem` locale (riga 104-128)
- Importare tutto da `orderUtils.ts`

### Intervento 5 - Aggiornare OrderDetail.tsx
- Rimuovere `interface OrderItemData` locale (riga 176-201)
- Sostituire la mutation di delete cascading con `deleteOrderCascading`
- Importare da `orderUtils.ts`

### Intervento 6 - Aggiornare OrdersList.tsx
- Sostituire `deleteOneOrder` con `deleteOrderCascading` importata
- Rimuovere la funzione locale

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query ordini (lista) | OK |
| company_id su query ordini (dettaglio) | N/A (query per ID) |
| company_id su insert ordini | OK (via RPC atomica) |
| company_id su import CSV | OK |
| company_id su export CSV | OK (filtra su dati gia' caricati) |
| company_id su order_statuses | OK |
| RLS su orders | OK |
| RLS su order_items | OK |
| RLS su order_statuses | OK |
| Validazione input (descrizione, importo) | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |
| Delete cascading protetta | OK (RLS sulla tabella orders) |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| OrderStatus interface | 4+ copie | 1 in orderUtils.ts |
| OrderItemData interface | 2 copie | 1 in orderUtils.ts |
| Customer interface | 2 copie | 1 in orderUtils.ts |
| Delete cascading | 2 copie (28 righe ciascuna) | 1 funzione condivisa |
| mapDbItemToOrderItem | locale in EditOrder | utility condivisa |
| Query ordini (paginazione) | Client-side | Invariato (P2 documentato) |

## File Modificati (Previsti)

1. `src/lib/orderUtils.ts` - aggiunta tipi e utility condivisi
2. `src/components/orders/OrdersTable.tsx` - import OrderStatus centralizzato
3. `src/pages/azienda/CreateOrder.tsx` - import Customer e OrderStatus
4. `src/pages/azienda/EditOrder.tsx` - import Customer, OrderItemData, mapDbItemToOrderItem
5. `src/pages/azienda/OrderDetail.tsx` - import OrderItemData, deleteOrderCascading
6. `src/pages/azienda/OrdersList.tsx` - import deleteOrderCascading

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving che eliminano duplicazioni e centralizzano tipi/utility. La paginazione server-side e' documentata come candidato per un intervento futuro ma non viene implementata per minimizzare il rischio di regressione.

