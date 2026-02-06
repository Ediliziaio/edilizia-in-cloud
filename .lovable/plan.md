
# Piano di Implementazione - Sistema Ticket Assistenza e Ottimizzazione UX

## Panoramica

Questo piano copre tre aree principali:
1. Test portale cliente (login e visualizzazione ordini)
2. Sistema ticket assistenza per clienti
3. Pulizia e ottimizzazione codice/UX

---

## 1. Stato Attuale Analizzato

### Database
- Le tabelle `tickets` e `ticket_messages` esistono gia con RLS policies corrette
- Enum `ticket_status`: `aperto`, `in_lavorazione`, `risolto`
- Campo `order_id` nullable per collegare ticket a ordini specifici

### Routing Esistente
- `/cliente/assistenza` mostra solo placeholder "Coming soon"
- `/azienda/assistenza` mostra solo placeholder "Coming soon"
- Il portale cliente ha gia `CustomerOrders.tsx` e `CustomerOrderDetail.tsx` funzionanti

### Problemi Identificati
1. **Codice duplicato**: `formatCurrency()` e `formatDate()` sono ripetuti in molti file
2. **Query inefficienti**: In `CustomersList.tsx` ci sono 3 query separate che potrebbero essere ottimizzate
3. **Import inutilizzati**: `CardDescription` importato ma non usato in `CustomerOrders.tsx`
4. **Placeholder routes**: Pagine "Coming soon" per assistenza e profilo
5. **UX inconsistente**: Lo stile delle date varia tra componenti

---

## 2. Struttura File da Creare

### Pagine Cliente
```
src/pages/cliente/CustomerSupport.tsx          - Lista ticket del cliente
src/pages/cliente/CustomerTicketDetail.tsx     - Dettaglio singolo ticket con chat
src/pages/cliente/CreateTicket.tsx             - Form creazione nuovo ticket
```

### Pagine Azienda
```
src/pages/azienda/TicketsList.tsx              - Lista tutti i ticket per admin
src/pages/azienda/TicketDetail.tsx             - Gestione ticket con risposta
```

### Utility condivise
```
src/lib/formatters.ts                          - Funzioni di formattazione riutilizzabili
```

---

## 3. Sistema Ticket Cliente

### CustomerSupport.tsx
Lista ticket del cliente con:
- Titolo sezione e pulsante "Nuovo Ticket"
- Card per ogni ticket con: oggetto, stato (badge colorato), ordine collegato, data
- Empty state quando non ci sono ticket
- Filtro per stato (tutti, aperti, risolti)

### CreateTicket.tsx
Form creazione ticket:
- Dropdown ordine (opzionale, per collegare ad ordine esistente)
- Campo oggetto (obbligatorio)
- Campo messaggio iniziale (textarea)
- Invio crea ticket + primo messaggio

### CustomerTicketDetail.tsx
Visualizzazione dettaglio con:
- Header con oggetto e stato
- Link all'ordine collegato (se presente)
- Timeline messaggi stile chat
- Form per rispondere (textarea + invio)

---

## 4. Sistema Ticket Admin Azienda

### TicketsList.tsx
Lista ticket per admin:
- Tabella con colonne: Cliente, Oggetto, Ordine, Stato, Data
- Filtri per stato e ricerca
- Badge colorati per stato
- Click per aprire dettaglio

### TicketDetail.tsx
Gestione ticket:
- Header con info cliente e ordine collegato
- Dropdown per cambiare stato
- Timeline messaggi
- Form risposta

---

## 5. Ottimizzazioni Codice

### Nuovo file: src/lib/formatters.ts
Centralizza funzioni ripetute:
- `formatCurrency(amount: number)`: Formatta importo in EUR
- `formatDate(date: string)`: Formato breve (d MMM yyyy)
- `formatDateTime(date: string)`: Con ora (d MMM yyyy, HH:mm)

### File da aggiornare per usare formatters:
- `src/pages/azienda/OrdersList.tsx`
- `src/pages/azienda/OrderDetail.tsx`
- `src/pages/azienda/CreateOrder.tsx`
- `src/pages/azienda/EditOrder.tsx`
- `src/pages/cliente/CustomerOrders.tsx`
- `src/pages/cliente/CustomerOrderDetail.tsx`

### Cleanup CustomerOrders.tsx
- Rimuovere import inutilizzato `CardDescription`

### Ottimizzazione CustomersList.tsx
- Unificare query con una singola chiamata che fa il join appropriato

---

## 6. Miglioramenti UX

### Customer Portal
- Aggiungere icona badge su ordine se ha ticket aperti
- Pulsante "Richiedi Assistenza" nel dettaglio ordine
- Notifica visiva per nuovi messaggi

### Ticket UI
- Stati con colori semantici:
  - `aperto`: Blu (primary)
  - `in_lavorazione`: Giallo (warning)
  - `risolto`: Verde (success)
- Messaggi con bubble chat differenziate per mittente
- Timestamp relativi ("2 ore fa") per messaggi recenti

### Responsive Design
- Layout mobile-first per pagine cliente
- Sidebar collassabile su mobile per admin

---

## 7. File da Modificare

### Routing (src/App.tsx)
Sostituire placeholder con nuove pagine:
- `/cliente/assistenza` -> CustomerSupport
- `/cliente/assistenza/nuovo` -> CreateTicket
- `/cliente/assistenza/:id` -> CustomerTicketDetail
- `/azienda/assistenza` -> TicketsList
- `/azienda/assistenza/:id` -> TicketDetail

### CustomerOrderDetail.tsx
Aggiungere pulsante "Richiedi Assistenza" che naviga a CreateTicket preselezionando l'ordine

---

## 8. Query Database per Ticket

### Lista ticket cliente
```sql
SELECT t.*, 
       o.description as order_description
FROM tickets t
LEFT JOIN orders o ON t.order_id = o.id
WHERE t.customer_id = auth.uid()
ORDER BY t.updated_at DESC
```

### Messaggi ticket
```sql
SELECT tm.*, 
       p.first_name, p.last_name
FROM ticket_messages tm
LEFT JOIN profiles p ON tm.sender_id = p.id
WHERE tm.ticket_id = [ticket_id]
ORDER BY tm.created_at ASC
```

---

## 9. Componenti Riutilizzati

- `Card`, `Badge`, `Button`, `Input`, `Textarea` (shadcn)
- `OrderProgressTracker` (esistente, read-only per cliente)
- `CustomerLayout` / `CompanyLayout` (esistenti)

---

## 10. Sicurezza

Le RLS policies esistenti sono gia corrette:
- Clienti possono creare/vedere solo i propri ticket
- Admin azienda possono gestire tutti i ticket della loro azienda
- Super admin accede a tutto

---

## Flusso di Test Previsto

1. Login come cliente
2. Visualizzare lista ordini (vuota o con ordini)
3. Andare a /cliente/assistenza
4. Creare nuovo ticket (collegato o meno a ordine)
5. Inviare messaggi nel ticket
6. Login come admin azienda
7. Visualizzare ticket nella lista
8. Rispondere al ticket e cambiare stato
9. Verificare che il cliente veda la risposta
