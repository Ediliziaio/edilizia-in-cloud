

# Chat Interna Assistenza con Super Admin

## Cosa cambia

Il bottone "Assistenza" nell'header del layout azienda non navighera piu a `/azienda/assistenza` ma aprira uno **Sheet (pannello laterale destro)** con una chat in tempo reale collegata direttamente al supporto del Super Admin.

---

## Struttura Database

### Nuova tabella: `support_messages`

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| company_id | uuid | FK -> companies, NOT NULL |
| sender_id | uuid | NOT NULL (user id) |
| sender_role | text | `company` o `super_admin` |
| message | text | NOT NULL |
| created_at | timestamptz | DEFAULT now() |

### RLS Policies
- Super Admin: CRUD completo su tutti i messaggi
- Company Admin: CRUD solo sui messaggi della propria azienda (`company_id = get_user_company_id(auth.uid())`)
- Company Staff con permesso `can_view_tickets`: SELECT sui messaggi della propria azienda

### Realtime
- Abilitare realtime sulla tabella `support_messages` per aggiornamenti istantanei

---

## Interfaccia Utente

### Bottone Header (gia presente)
- Al click, anziche navigare, apre uno **Sheet** laterale destro
- Badge con conteggio messaggi non letti (futuro, non in v1)

### Sheet "Assistenza"
- **Header**: titolo "Assistenza" + descrizione "Chat con il supporto"
- **Area messaggi**: scroll verticale con bolle stile chat
  - Messaggi dell'azienda: allineati a destra, sfondo primary
  - Messaggi del super admin: allineati a sinistra, sfondo muted
  - Ogni messaggio mostra: testo, orario
- **Form invio**: Textarea + bottone Send in basso
- **Loading**: Skeleton durante il caricamento
- **Stato vuoto**: messaggio "Scrivi un messaggio per iniziare la conversazione"

### Lato Super Admin (GlobalTickets o area dedicata)
- I messaggi appaiono nella sezione ticket globali esistente, oppure una sezione dedicata futura
- Per v1: il super admin vede i messaggi nella tabella `support_messages` tramite impersonazione o una nuova sottosezione

---

## File da Creare

### `src/components/layouts/SupportChatSheet.tsx`
Componente Sheet con:
- Query per caricare messaggi da `support_messages` filtrati per `company_id`
- Mutation per inviare nuovi messaggi
- Subscription realtime per ricevere risposte in tempo reale
- Auto-scroll ai nuovi messaggi
- Form con Textarea e bottone Send

---

## File da Modificare

### `src/components/layouts/CompanyLayout.tsx`
- Importare `SupportChatSheet`
- Sostituire il `navigate("/azienda/assistenza")` con `setState` per aprire/chiudere lo Sheet
- Il bottone "Assistenza" diventa il trigger dello Sheet

---

## Dettagli Tecnici

### Migrazione SQL
```sql
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  sender_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'company',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY "Super admins can manage all support messages"
  ON public.support_messages FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Company admin can manage their messages
CREATE POLICY "Company admins can manage their support messages"
  ON public.support_messages FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  );

-- Staff can view if permitted
CREATE POLICY "Staff can view support messages if permitted"
  ON public.support_messages FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_tickets'::text)
    AND company_id = get_user_company_id(auth.uid())
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
```

### Realtime subscription nel componente
```typescript
supabase
  .channel('support-messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'support_messages',
    filter: `company_id=eq.${companyId}`
  }, (payload) => {
    // Aggiungi messaggio alla lista
  })
  .subscribe();
```

---

## Ordine di Implementazione

1. Migrazione database (tabella + RLS + realtime)
2. Creare `SupportChatSheet.tsx`
3. Modificare `CompanyLayout.tsx` per usare lo Sheet invece della navigazione

