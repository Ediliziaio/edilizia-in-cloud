

# Miglioramento Sezione Assistenza — Piano

## Stato Attuale

Il sistema ticket esiste ma e' basilare:
- **DB**: tabella `tickets` (id, order_id, company_id, customer_id, subject, status, created_at, updated_at) + `ticket_messages` (id, ticket_id, sender_id, message, attachment_url, created_at)
- **3 status**: aperto, in_lavorazione, risolto
- **Company side** (`/azienda/assistenza`): lista tabellare, dettaglio con chat e sidebar info cliente/ordine, cambio stato inline
- **Customer side** (`/cliente/assistenza`): lista ticket, creazione con ordine opzionale, dettaglio con chat
- **RLS**: company_admin + customer + super_admin (manca company_staff)
- **Nessuna**: priorita', assegnazione operatore, note interne, notifiche realtime, conteggio messaggi non letti, categoria/tipo, possibilita' per l'azienda di creare ticket per conto del cliente

## Problemi Identificati

1. **RLS manca company_staff** — operatori con `can_view_tickets` non possono accedere ai ticket
2. **Nessuna priorita'** — tutti i ticket hanno la stessa urgenza
3. **Nessuna assegnazione** — non si sa chi sta gestendo un ticket
4. **Nessuna nota interna** — staff non puo' comunicare internamente sul ticket
5. **No realtime** — bisogna ricaricare per vedere nuovi messaggi
6. **No contatore non letti** lato azienda
7. **Azienda non puo' creare ticket** per conto di un cliente
8. **No categoria/tipo ticket**

## Piano Interventi

### 1. Migrazione DB — nuove colonne + enum priorita'

```sql
-- Enum priorita'
CREATE TYPE public.ticket_priority AS ENUM ('bassa', 'normale', 'alta', 'urgente');

-- Nuove colonne su tickets
ALTER TABLE public.tickets 
  ADD COLUMN priority ticket_priority NOT NULL DEFAULT 'normale',
  ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN category TEXT DEFAULT NULL,
  ADD COLUMN last_message_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN internal_notes TEXT DEFAULT NULL;

-- Indici
CREATE INDEX idx_tickets_company_status ON public.tickets (company_id, status);
CREATE INDEX idx_tickets_assigned_to ON public.tickets (assigned_to);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- RLS: company_staff con permesso can_view_tickets
CREATE POLICY "Staff can view company tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'can_view_tickets') 
    AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can update company tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'can_edit_tickets') 
    AND company_id = get_user_company_id(auth.uid()));

-- Stesse policy per ticket_messages
CREATE POLICY "Staff can view company ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'can_view_tickets') 
    AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id 
    AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff can insert ticket messages"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'can_edit_tickets') 
    AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id 
    AND t.company_id = get_user_company_id(auth.uid())));
```

### 2. Miglioramenti `TicketsList.tsx` (company side)

- Aggiungere colonna **Priorita'** con badge colorato (bassa=grigio, normale=blu, alta=arancione, urgente=rosso)
- Aggiungere colonna **Assegnato a** con avatar/nome operatore
- Filtro per priorita' e per operatore assegnato
- Bottone **"Crea Ticket"** per aprire ticket per conto di un cliente (seleziona cliente + ordine)
- Ordinamento default per `last_message_at DESC` (ticket con attivita' recente in cima)

### 3. Miglioramenti `TicketDetail.tsx` (company side)

- Sidebar: aggiungere **selettore priorita'**, **selettore assegnato a** (dropdown staff), campo **note interne** (visibili solo staff)
- **Realtime**: subscription su `ticket_messages` per il ticket corrente — nuovi messaggi appaiono live
- Aggiungere indicatore visivo messaggi cliente vs staff

### 4. Nuovo componente: `CreateCompanyTicket.tsx`

- Form per creare ticket lato azienda: seleziona cliente, ordine, oggetto, priorita', messaggio iniziale
- Route `/azienda/assistenza/nuovo`

### 5. Miglioramenti `TicketChat.tsx`

- **Realtime subscription** per nuovi messaggi (auto-scroll)
- Supporto **Enter per inviare** (Shift+Enter per a capo)
- Indicatore "sta scrivendo" (opzionale, P2)

### 6. Miglioramenti lato Cliente

- Mostrare priorita' nel dettaglio ticket
- Realtime per nuovi messaggi nella chat

### 7. Aggiornamento tipi `types/tickets.ts`

- Aggiungere `priority`, `assigned_to`, `category`, `last_message_at`, `internal_notes` ai tipi

### File modificati

| File | Modifica |
|------|----------|
| Migrazione SQL | Enum priority, colonne, indici, RLS staff |
| `types/tickets.ts` | Nuovi campi |
| `TicketsList.tsx` | Priorita', assegnato, filtri, bottone crea |
| `TicketDetail.tsx` | Sidebar priority/assigned/notes, realtime |
| `TicketChat.tsx` | Realtime subscription, Enter-to-send |
| `CreateCompanyTicket.tsx` (nuovo) | Creazione ticket lato azienda |
| `CustomerTicketDetail.tsx` | Realtime chat |
| `CustomerSupport.tsx` | Mostra priorita' |
| `App.tsx` | Nuova route `/azienda/assistenza/nuovo` |

