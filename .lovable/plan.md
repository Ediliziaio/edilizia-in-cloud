
# Piano: Stabilizzazione e Ottimizzazione - Ordini, Magazzino, Clienti, Assistenza, Dipendenti

## Panoramica

Dopo un'analisi approfondita del codebase delle sezioni ordini, magazzino, clienti, assistenza e dipendenti, ho identificato diverse aree di miglioramento. Complessivamente il codice e ben strutturato, ma ci sono alcune ottimizzazioni da implementare.

---

## 1. Problemi Identificati

### 1.1 Import Inutilizzati e Codice Legacy

| File | Problema |
|------|----------|
| `OrdersList.tsx` | Import `Eye` da lucide-react non utilizzato |
| `CreateOrder.tsx` | Import `Paperclip` da lucide-react non utilizzato |
| `EditOrder.tsx` | Import `Paperclip` da lucide-react non utilizzato |
| `CustomerOrders.tsx` | Usa `useEffect` e `useState` invece di `useQuery` (inconsistenza) |

### 1.2 Inconsistenze UX

| Sezione | Problema |
|---------|----------|
| `CustomerOrders.tsx` | Non usa React Query come le altre pagine - perde benefici di caching e staleTime |
| `TicketsList.tsx` | Manca `staleTime` nella query - potenziali chiamate eccessive |
| `CustomerSupport.tsx` | Manca `staleTime` nella query |
| `CustomerTicketDetail.tsx` | Manca `staleTime` nelle query |
| `CustomerOrderDetail.tsx` | Manca `staleTime` nelle query |

### 1.3 Stati di Caricamento

Tutte le pagine hanno loading states appropriati. Nessun problema critico identificato.

### 1.4 Gestione Errori

I componenti gestiscono correttamente gli errori con try/catch e toast notifications.

---

## 2. Ottimizzazioni da Implementare

### 2.1 Rimozione Import Inutilizzati

**OrdersList.tsx (riga 4)**
```typescript
// Prima
import { Plus, Search, Package, Eye, LayoutList, Columns3, X, Euro } from "lucide-react";

// Dopo
import { Plus, Search, Package, LayoutList, Columns3, X, Euro } from "lucide-react";
```

**CreateOrder.tsx (riga 4)**
```typescript
// Prima
import { ArrowLeft, CalendarIcon, Plus, Paperclip } from "lucide-react";

// Dopo
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
```

**EditOrder.tsx (riga 4)**
```typescript
// Prima
import { ArrowLeft, CalendarIcon, Plus, Paperclip } from "lucide-react";

// Dopo
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
```

### 2.2 Migrazione CustomerOrders a React Query

Attualmente `CustomerOrders.tsx` usa `useEffect` + `useState`, mentre tutte le altre pagine usano `useQuery`. Questo causa:
- Nessun caching automatico
- Nessuna gestione ottimizzata delle richieste
- Inconsistenza nel codebase

**Soluzione**: Migrare a `useQuery` con `staleTime` per coerenza e performance.

### 2.3 Aggiunta staleTime alle Query

Aggiungere `staleTime` alle query per ridurre chiamate API superflue:

| File | Query | staleTime Proposto |
|------|-------|-------------------|
| `TicketsList.tsx` | company-tickets | 2 minuti |
| `TicketDetail.tsx` | admin-ticket, admin-ticket-messages | 30 secondi |
| `CustomerSupport.tsx` | customer-tickets | 2 minuti |
| `CustomerTicketDetail.tsx` | ticket, ticket-messages | 30 secondi |
| `CustomerOrderDetail.tsx` | customer-order, order-statuses, order-status-history | 2 minuti |

---

## 3. File da Modificare

| File | Operazione |
|------|------------|
| `src/pages/azienda/OrdersList.tsx` | Rimuovere import `Eye` |
| `src/pages/azienda/CreateOrder.tsx` | Rimuovere import `Paperclip` |
| `src/pages/azienda/EditOrder.tsx` | Rimuovere import `Paperclip` |
| `src/pages/cliente/CustomerOrders.tsx` | Migrare a useQuery + aggiungere staleTime |
| `src/pages/azienda/TicketsList.tsx` | Aggiungere staleTime |
| `src/pages/azienda/TicketDetail.tsx` | Aggiungere staleTime |
| `src/pages/cliente/CustomerSupport.tsx` | Aggiungere staleTime |
| `src/pages/cliente/CustomerTicketDetail.tsx` | Aggiungere staleTime |
| `src/pages/cliente/CustomerOrderDetail.tsx` | Aggiungere staleTime |

---

## Sezione Tecnica

### Fix OrdersList.tsx

Riga 4:
```typescript
import { Plus, Search, Package, LayoutList, Columns3, X, Euro } from "lucide-react";
```

### Fix CreateOrder.tsx

Riga 4:
```typescript
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
```

### Fix EditOrder.tsx

Riga 4:
```typescript
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
```

### Migrazione CustomerOrders.tsx

```typescript
// Prima: useEffect + useState
import { useEffect, useState } from "react";
...
const [orders, setOrders] = useState<Order[]>([]);
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  if (!user) return;
  async function fetchOrders() { ... }
  fetchOrders();
}, [user]);

// Dopo: useQuery
import { useQuery } from "@tanstack/react-query";
...
const { data: orders = [], isLoading } = useQuery({
  queryKey: ["customer-orders", user?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, description, total_amount, deposit_amount, balance_amount,
        expected_date, created_at,
        status:order_statuses(name, color, icon)
      `)
      .eq("customer_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as Order[];
  },
  enabled: !!user,
  staleTime: 2 * 60 * 1000, // 2 minuti
});
```

### Aggiunta staleTime - TicketsList.tsx

```typescript
const { data: tickets = [], isLoading } = useQuery({
  ...
  enabled: !!effectiveCompany?.id,
  staleTime: 2 * 60 * 1000, // 2 minuti
});
```

### Aggiunta staleTime - TicketDetail.tsx

```typescript
// Query ticket
const { data: ticket, isLoading: ticketLoading } = useQuery({
  ...
  enabled: !!id,
  staleTime: 30 * 1000, // 30 secondi - messaggi cambiano frequentemente
});

// Query messages
const { data: messages = [], isLoading: messagesLoading } = useQuery({
  ...
  enabled: !!id,
  staleTime: 30 * 1000,
});
```

### Aggiunta staleTime - CustomerSupport.tsx

```typescript
const { data: tickets = [], isLoading } = useQuery({
  ...
  enabled: !!user,
  staleTime: 2 * 60 * 1000,
});
```

### Aggiunta staleTime - CustomerTicketDetail.tsx

```typescript
const { data: ticket, isLoading: ticketLoading } = useQuery({
  ...
  enabled: !!id,
  staleTime: 30 * 1000,
});

const { data: messages = [], isLoading: messagesLoading } = useQuery({
  ...
  enabled: !!id,
  staleTime: 30 * 1000,
});
```

### Aggiunta staleTime - CustomerOrderDetail.tsx

```typescript
const { data: order, isLoading: orderLoading } = useQuery({
  ...
  enabled: !!id && !!user,
  staleTime: 2 * 60 * 1000,
});

const { data: statuses = [] } = useQuery({
  ...
  enabled: !!order?.company_id,
  staleTime: 10 * 60 * 1000, // 10 minuti - statuses cambiano raramente
});

const { data: statusHistory = [] } = useQuery({
  ...
  enabled: !!id,
  staleTime: 2 * 60 * 1000,
});
```

---

## 4. Verifiche Effettuate

### Funzionalita Verificate

| Area | Stato | Note |
|------|-------|------|
| Ordini - Lista | OK | Filtri, ricerca, pipeline view funzionanti |
| Ordini - Creazione | OK | Validazioni presenti, feedback immediato |
| Ordini - Dettaglio | OK | Progress tracker, allegati, economics |
| Ordini - Modifica | OK | Precompilazione form corretta |
| Magazzino | OK | Tre viste (lista, kanban, calendario), filtri rapidi |
| Clienti - Lista | OK | Ricerca, reset password funzionante |
| Clienti - Creazione | OK | Dialog con password generata |
| Dipendenti | OK | Due tab (interni/esterni), CRUD completo |
| Assistenza Azienda | OK | Stats cards, filtri, dettaglio conversazione |
| Assistenza Cliente | OK | Creazione ticket, conversazione, stati |
| Profilo Cliente | OK | Validazione campi, salvataggio corretto |

### Loading States

Tutte le pagine hanno loading states appropriati:
- Skeleton loaders per contenuti strutturati
- Spinner con testo per caricamenti generici
- Empty states con CTA chiare

### Gestione Errori

- Toast notifications per errori
- Try/catch in tutte le mutations
- Feedback visivo immediato

### Responsiveness

- Grid responsive con breakpoints appropriati
- Layout flessibili con flex-wrap
- Mobile-first design applicato

---

## 5. Riepilogo Modifiche

### Codice Rimosso
1. Import `Eye` da `OrdersList.tsx`
2. Import `Paperclip` da `CreateOrder.tsx`
3. Import `Paperclip` da `EditOrder.tsx`
4. Pattern `useEffect` + `useState` da `CustomerOrders.tsx` (sostituito)

### Bug Corretti
Nessun bug critico identificato. Il codebase e stabile.

### Miglioramenti UX/Performance
1. Migrazione `CustomerOrders.tsx` a React Query
2. Aggiunta `staleTime` a 9 query per ridurre chiamate API
3. Caching consistente su tutte le pagine

---

## 6. Conferma Test Finale

Dopo l'implementazione verificare:

- [ ] Ordini: lista, creazione, dettaglio, modifica
- [ ] Magazzino: cambio vista, filtri, drag-and-drop
- [ ] Clienti: lista, creazione, reset password
- [ ] Dipendenti: CRUD interni ed esterni
- [ ] Assistenza: creazione ticket, risposta, cambio stato
- [ ] Console: nessun errore JavaScript
- [ ] Performance: nessun lag evidente

**Stato attuale del codebase**: Stabile, ben strutturato, con miglioramenti minori da applicare per ottimizzazione.
