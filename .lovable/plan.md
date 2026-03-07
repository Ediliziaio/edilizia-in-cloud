

# FIX 6: Messaggistica Diretta dal Profilo Contatto

## Cosa cambia

### 1. Nuova tabella DB `contact_messages`
- `id uuid PK`, `contact_id uuid FK → marketing_contacts`, `company_id uuid FK → companies`, `channel text` (whatsapp/email/sms), `content text`, `subject text` (nullable, per email), `sent_at timestamptz`, `status text` (sent/delivered/failed/pending), `sent_by uuid FK → auth.users`, `created_at timestamptz`
- RLS: authenticated users CRUD sulla propria company (via join con marketing_contacts.company_id oppure company_id diretto)
- **Nota**: aggiungo `company_id` direttamente per evitare join nelle policy RLS

### 2. Nuova edge function `send-contact-message`
- Accetta `{ contact_id, channel, content, subject? }`
- Valida autenticazione e company ownership
- Per **email**: usa la stessa logica di `send-test-email` (legge provider/api_key da platform_settings, chiama SendGrid/Brevo/Resend)
- Per **whatsapp**: chiama l'API WhatsApp Cloud (legge config da `messaging_whatsapp_config` per phone_number_id e token)
- Per **sms**: placeholder con status "pending" (non c'è provider SMS configurato)
- Inserisce record in `contact_messages` con status risultante
- Registra attività in `marketing_contact_activities` (tipo `message_sent`)

### 3. Modifica `MarketingContactDetail.tsx`

**Barra messaggi (righe 1019-1026)**:
- Rimuovi `disabled` dall'input
- Aggiungi stato `messageText`, `messageChannel` (default: "whatsapp" se ha phone, altrimenti "email")
- Aggiungi `DropdownMenu` sul pulsante canale (icona Mail) con opzioni: WhatsApp (se contact.phone), Email (se contact.email), SMS (se contact.phone)
- Per email: mostra anche un campo soggetto inline
- Al click "Invia": chiama edge function `send-contact-message`, mostra toast, invalida queries

**Cronologia messaggi nel centro timeline**:
- Query `contact_messages` per il contatto corrente
- Mescola i messaggi nella timeline esistente (stessa visualizzazione delle attività) con icona canale (MessageSquare per WhatsApp, Mail per email, Phone per SMS) e badge status

**Pannello Impostazioni (righe 1132-1135)**:
- Sostituisci il placeholder con 3 campi:
  - Lingua preferita (select: italiano, inglese, tedesco, francese, spagnolo)
  - Canale preferito (select: whatsapp, email, sms)
  - Opt-out toggles: WhatsApp, Email (switch on/off)
- Salva in `marketing_contacts` — richiede 3 nuove colonne: `preferred_language text`, `preferred_channel text`, `optout_whatsapp boolean`, `optout_email boolean`

### 4. Migrazione colonne su `marketing_contacts`
- `ALTER TABLE marketing_contacts ADD COLUMN preferred_language text DEFAULT 'italiano'`
- `ALTER TABLE marketing_contacts ADD COLUMN preferred_channel text DEFAULT 'whatsapp'`
- `ALTER TABLE marketing_contacts ADD COLUMN optout_whatsapp boolean DEFAULT false`
- `ALTER TABLE marketing_contacts ADD COLUMN optout_email boolean DEFAULT false`

## File coinvolti

| File | Azione |
|------|--------|
| SQL Migration | Tabella `contact_messages` + colonne su `marketing_contacts` |
| `supabase/functions/send-contact-message/index.ts` | Nuova edge function |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Barra messaggi, cronologia, pannello impostazioni |

