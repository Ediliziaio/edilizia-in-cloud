

## Piano: [N3] Notifiche — Trigger Automatici

Creazione di 4 trigger PostgreSQL che generano notifiche automatiche per eventi chiave.

### Trigger 1: Nuovo ticket → notifica staff
- Funzione `notify_new_ticket()` AFTER INSERT su `tickets`
- Se `assigned_to` presente: notifica solo l'assegnatario
- Altrimenti: notifica tutti i `company_admin` e `company_staff` della company
- Recupera nome cliente da `profiles`
- action_url: `/azienda/ticket/{id}`

### Trigger 2: Risposta ticket → notifica controparte
- Funzione `notify_ticket_reply()` AFTER INSERT su `ticket_messages`
- Recupera ticket con `company_id`, `assigned_to`, `customer_id`, `subject`
- Se il sender non e' l'assigned_to e assigned_to esiste: notifica assigned_to
- Se il sender non e' il customer: notifica customer_id
- action_url: `/azienda/ticket/{ticket_id}`

### Trigger 3: Task assegnato → notifica assegnatario
- Funzione `notify_task_assigned()` AFTER INSERT su `tasks`
- Solo se `assigned_to IS NOT NULL` e diverso da `created_by`
- Include scadenza nel body se presente
- action_url: `/azienda/task`

### Trigger 4: Ordine cambia stato → notifica assigned_to
- Funzione `notify_order_status_change()` AFTER UPDATE su `orders`
- Solo se `current_status_id` e' cambiato (OLD vs NEW)
- Recupera nome nuovo stato da `order_statuses`
- Notifica `assigned_to` (non `created_by` che non esiste sulla tabella orders)
- Non notifica se l'utente corrente (`auth.uid()`) e' lo stesso dell'assegnatario
- action_url: `/azienda/ordini/{id}`

### Note tecniche
- Tutti i trigger usano `SECURITY DEFINER` per poter chiamare `create_notification()`
- La tabella `orders` non ha `created_by`, quindi il trigger ordini notifica `assigned_to`
- La tabella `tasks` ha sia `assigned_to` che `created_by`
- Singola migrazione SQL con tutte e 4 le funzioni + trigger

