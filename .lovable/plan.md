

# Contatore Messaggi Non Letti + Notifiche Email Ticket

## Stato Attuale

- **Notifiche email**: L'edge function `ticket-notify` e i trigger DB (`trg_ticket_message_notify`, `trg_ticket_status_notify`) sono gia' implementati. La funzione logga le notifiche ma non invia email reali (manca un servizio email transazionale).
- **Contatore non letti**: Non esiste nessun meccanismo di tracking "ultimo messaggio letto" per i ticket lato azienda.

## Piano

### 1. DB — Tabella `ticket_read_status` per tracciare ultima lettura

```sql
CREATE TABLE public.ticket_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);
ALTER TABLE public.ticket_read_status ENABLE ROW LEVEL SECURITY;
-- Policy: users can read/write their own rows
CREATE POLICY "Users manage own read status" ON public.ticket_read_status
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### 2. Hook `useUnreadTicketCounts` — conta messaggi non letti per ticket

- Per ogni ticket dell'azienda, conta i `ticket_messages` con `created_at > last_read_at` (dal `ticket_read_status` dell'utente corrente)
- Espone `unreadByTicket: Record<string, number>` e `totalUnread: number`
- Sottoscrizione realtime su `ticket_messages` INSERT per aggiornare il contatore in tempo reale

### 3. `TicketsList.tsx` — Badge non letto nella tabella

- Mostrare un badge numerico (pallino blu) accanto all'oggetto del ticket se ci sono messaggi non letti
- Mostrare il totale non letti nella card "Totale" o come indicatore nell'header

### 4. `TicketDetail.tsx` — Mark as read all'apertura

- Quando l'utente apre il dettaglio ticket, fare un upsert su `ticket_read_status` con `last_read_at = now()`
- Invalidare la query dei conteggi non letti

### 5. Notifiche Email — Stato attuale e prossimi passi

L'infrastruttura e' gia' completa:
- Trigger DB invocano `ticket-notify` via `pg_net`
- L'edge function identifica i destinatari corretti
- Attualmente le email vengono loggate server-side

Per attivare l'invio reale servira' un servizio email transazionale (Resend/SendGrid). L'implementazione attuale e' production-ready per essere collegata a un provider email con minime modifiche.

### File coinvolti

| File | Modifica |
|------|----------|
| Migrazione SQL | Crea `ticket_read_status` + RLS |
| `src/hooks/useUnreadTicketCounts.ts` | Nuovo hook per conteggi non letti |
| `src/pages/azienda/TicketsList.tsx` | Badge non letti per ogni ticket |
| `src/pages/azienda/TicketDetail.tsx` | Mark as read all'apertura |

