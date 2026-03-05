

# Allegati Ticket + Notifiche Email — Piano

## 1. Allegati File ai Messaggi Ticket

### DB Migration
- Creare bucket storage `ticket-attachments` (privato)
- RLS storage: upload/download per customer (proprio ticket) e staff (company tickets)
- La colonna `attachment_url` esiste già su `ticket_messages` — nessuna modifica schema necessaria

### Frontend — `TicketChat.tsx`
- Aggiungere bottone clip (Paperclip) accanto al campo messaggio
- Input file hidden, accept: `image/*,.pdf,.doc,.docx,.xls,.xlsx`
- Max 10MB per file
- Upload a `ticket-attachments/{ticketId}/{uuid}-{filename}`
- Salvare URL in `attachment_url` al momento dell'insert del messaggio
- Visualizzare allegati nei messaggi: anteprima immagine inline, link download per altri file
- Indicatore upload in corso (spinner/progress)

### Tipo `TicketMessage`
- Aggiungere `attachment_url?: string | null` al tipo

### Query messaggi
- Includere `attachment_url` nelle select di `TicketDetail.tsx` e `CustomerTicketDetail.tsx`

## 2. Notifiche Email su Aggiornamenti Ticket

### Edge Function `ticket-notify`
- Trigger: chiamata da DB trigger via `pg_net` su:
  - `ticket_messages` INSERT → notifica il destinatario (se staff ha risposto → notifica cliente, se cliente ha risposto → notifica staff/assigned_to)
  - `tickets` UPDATE su `status` → notifica cliente del cambio stato
- Recupera email destinatario da `profiles`
- Recupera subject del ticket
- Invia email usando Lovable AI (modello leggero) per generare corpo email professionale, oppure template statico HTML
- Richiede un servizio email transazionale — useremo `LOVABLE_API_KEY` con un endpoint di invio se disponibile, altrimenti predisporremo l'infrastruttura per integrazione futura con un servizio email

### DB Migration
- Trigger function `notify_ticket_update()` che chiama `net.http_post` verso l'edge function
- Abilitare estensione `pg_net` se non già attiva
- Trigger su `ticket_messages` AFTER INSERT
- Trigger su `tickets` AFTER UPDATE OF status

### config.toml
- Aggiungere `[functions.ticket-notify]` con `verify_jwt = false`

## File modificati

| File | Modifica |
|------|----------|
| Migrazione SQL | Bucket storage + RLS + trigger notifiche |
| `supabase/functions/ticket-notify/index.ts` | Edge function notifiche email |
| `supabase/config.toml` | Registrazione edge function |
| `src/types/tickets.ts` | `attachment_url` su `TicketMessage` |
| `src/components/tickets/TicketChat.tsx` | Upload file + visualizzazione allegati |
| `src/pages/azienda/TicketDetail.tsx` | Select `attachment_url` |
| `src/pages/cliente/CustomerTicketDetail.tsx` | Select `attachment_url` |

