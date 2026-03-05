

# Allegati Ticket + Attività Collegate ai Ticket

## Stato Attuale

- **Allegati**: gia' completamente implementati in `TicketChat.tsx` — bottone clip, upload a bucket `ticket-attachments`, preview immagini, download file. Il bucket storage esiste. **Nessuna modifica necessaria.**
- **Tasks/Attivita'**: il componente `LinkedTasks` esiste e supporta `orderId`, `stockItemId`, `costId`, `contactId`, `opportunityId`. Ma la tabella `tasks` **non ha `ticket_id`** e il componente non supporta ticket.

## Piano

### 1. Migrazione DB — Aggiungere `ticket_id` alla tabella `tasks`

```sql
ALTER TABLE public.tasks ADD COLUMN ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_ticket_id ON public.tasks (ticket_id);
```

### 2. Aggiornare `LinkedTasks.tsx`

- Aggiungere prop `ticketId?: string`
- Aggiungere logica query per filtrare per `ticket_id`
- Passare `defaultTicketId` a `TaskDialog`

### 3. Aggiornare `TaskDialog.tsx`

- Aggiungere `ticket_id` a `TaskData` interface
- Aggiungere `defaultTicketId` prop
- Includere `ticket_id` nell'insert/update

### 4. Integrare `LinkedTasks` nel `TicketDetail.tsx` (lato azienda)

- Aggiungere il componente `LinkedTasks` nella sidebar, sotto le note interne, con `ticketId={ticket.id}`

### 5. Integrare `LinkedTasks` nel `CustomerTicketDetail.tsx` (lato cliente)

- Aggiungere una sezione attivita' sotto il ticket (solo visualizzazione se opportuno)

### File modificati

| File | Modifica |
|------|----------|
| Migrazione SQL | `ticket_id` su `tasks` + indice |
| `src/components/tasks/LinkedTasks.tsx` | Prop `ticketId`, filtro query |
| `src/components/tasks/TaskDialog.tsx` | `ticket_id` in data + default prop |
| `src/pages/azienda/TicketDetail.tsx` | Aggiungere `LinkedTasks` nella sidebar |

