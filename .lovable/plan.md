

# Pulizia, Fix e Stabilizzazione del Progetto

## Problemi identificati

### 1. Sidebar "Assistenza" nel CompanyLayout naviga ancora a `/azienda/assistenza`
La voce di menu nella sidebar punta ancora alla route `/azienda/assistenza` (TicketsList dei clienti), ma ora il bottone "Assistenza" nell'header apre la chat con il Super Admin. Ci sono due concetti diversi sullo stesso nome:
- **Sidebar "Assistenza"** = ticket dei clienti dell'azienda (TicketsList)
- **Header "Assistenza"** = chat interna con il Super Admin

Questo crea confusione UX. La sidebar deve distinguere chiaramente: rinominare la voce sidebar in **"Ticket Clienti"** per differenziarla dalla chat di supporto nell'header.

### 2. Sidebar Admin "Ticket" non allineata al nuovo contenuto
La voce "Ticket" nella sidebar dell'AdminLayout punta a `/admin/ticket` che ora mostra "Assistenza Aziende". Il label dovrebbe essere aggiornato a **"Assistenza"** per coerenza.

### 3. Bug duplicazione messaggi realtime in SupportChatSheet
Quando l'utente invia un messaggio, il `handleSend` fa un insert e poi il realtime listener aggiunge lo stesso messaggio alla lista. Ma il messaggio viene anche aggiunto implicitamente perche il fetch iniziale lo include se il componente rimane aperto. Manca un check di deduplicazione come in `AdminSupportChatSheet`.

### 4. Bug duplicazione messaggi realtime in AdminSupportChatList
La query `admin-support-messages` non viene invalidata quando il super admin invia un messaggio dalla chat sheet, quindi la lista conversazioni potrebbe non aggiornarsi con l'ultimo messaggio.

### 5. AdminLayout: import `useLocation` non necessario
`useLocation` e importato ma non utilizzato nel componente `AdminSidebar`.

---

## Piano delle modifiche

### File: `src/components/layouts/CompanyLayout.tsx`
- Rinominare la voce sidebar da "Assistenza" a **"Ticket Clienti"** (riga 54) per distinguerla dalla chat di supporto nell'header

### File: `src/components/layouts/AdminLayout.tsx`
- Rinominare la voce sidebar da "Ticket" a **"Assistenza"** (riga 31) per allinearla al contenuto della pagina
- Rimuovere l'import inutilizzato `useLocation` (riga 1)

### File: `src/components/layouts/SupportChatSheet.tsx`
- Aggiungere deduplicazione nel listener realtime (check `prev.some(m => m.id === newMsg.id)`) come gia fatto in `AdminSupportChatSheet`

### File: `src/components/admin/support/AdminSupportChatList.tsx`
- Aggiungere `refetchInterval` o invalidazione della query quando si chiude la chat sheet per mantenere la lista aggiornata

---

## Dettagli tecnici

### Rinomina sidebar azienda (CompanyLayout.tsx, riga 54)
```typescript
// Da:
{ title: "Assistenza", url: "/azienda/assistenza", ... }
// A:
{ title: "Ticket Clienti", url: "/azienda/assistenza", ... }
```

### Rinomina sidebar admin (AdminLayout.tsx, riga 31)
```typescript
// Da:
{ title: "Ticket", url: "/admin/ticket", icon: MessageSquare },
// A:
{ title: "Assistenza", url: "/admin/ticket", icon: MessageSquare },
```

### Fix deduplicazione realtime (SupportChatSheet.tsx, riga 69)
```typescript
// Da:
setMessages((prev) => [...prev, payload.new as SupportMessage]);
// A:
setMessages((prev) => {
  const newMsg = payload.new as SupportMessage;
  if (prev.some((m) => m.id === newMsg.id)) return prev;
  return [...prev, newMsg];
});
```

### Rimuovere import inutilizzato (AdminLayout.tsx, riga 1)
```typescript
// Da:
import { Link, useLocation, Outlet } from "react-router-dom";
// A:
import { Link, Outlet } from "react-router-dom";
```

E rimuovere `const location = useLocation();` dal corpo di `AdminSidebar` (riga 42).

---

## Riepilogo

| Tipo | Descrizione |
|------|------------|
| Fix UX | Sidebar azienda: "Assistenza" rinominata in "Ticket Clienti" |
| Fix UX | Sidebar admin: "Ticket" rinominata in "Assistenza" |
| Fix Bug | Deduplicazione messaggi realtime in SupportChatSheet |
| Pulizia | Rimosso import e variabile `useLocation` inutilizzati da AdminLayout |

