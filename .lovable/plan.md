

# Collegamento Chat Assistenza al Pannello Ticket Super Admin

## Problema attuale

La pagina Ticket del Super Admin (`/admin/ticket`) mostra solo i ticket creati dai clienti (tabella `tickets`), ma NON mostra i messaggi di assistenza inviati dalle aziende tramite la chat interna (tabella `support_messages`). I due sistemi sono scollegati.

## Soluzione

Aggiungere alla pagina GlobalTickets un secondo tab/sezione "Chat Aziende" che mostra tutte le conversazioni di supporto dalla tabella `support_messages`, raggruppate per azienda. Il super admin potra aprire ogni conversazione in uno Sheet laterale e rispondere direttamente.

## Struttura

La pagina `/admin/ticket` avra due tab:
- **Ticket Clienti** (tab attuale, invariato)
- **Chat Aziende** (nuovo tab con lista conversazioni + chat inline)

---

## Dettagli tecnici

### File da creare: `src/components/admin/support/AdminSupportChatList.tsx`
Componente che:
1. Carica tutti i `support_messages` raggruppati per `company_id`
2. Per ogni azienda mostra: nome azienda, ultimo messaggio, data, conteggio messaggi non letti
3. Al click su un'azienda, apre un `AdminSupportChatSheet`

### File da creare: `src/components/admin/support/AdminSupportChatSheet.tsx`
Sheet laterale (simile al `SupportChatSheet` lato azienda) ma con:
- `sender_role: "super_admin"` quando il super admin invia un messaggio
- Realtime subscription sulla conversazione selezionata
- Messaggi del super admin a destra, messaggi dell'azienda a sinistra (invertito rispetto al lato azienda)

### File da modificare: `src/pages/admin/GlobalTickets.tsx`
- Aggiungere `Tabs` (da `@/components/ui/tabs`) con due tab:
  - "Ticket Clienti": contenuto attuale
  - "Chat Aziende": il nuovo `AdminSupportChatList`
- Le SLA stats restano visibili sopra i tab (si riferiscono ai ticket clienti)

### Nessuna migrazione database
La tabella `support_messages` esiste gia con le RLS corrette per il super admin (`has_role(auth.uid(), 'super_admin'::app_role)`).

---

## Flusso utente

```text
Super Admin apre /admin/ticket
  -> Vede le stat SLA in alto
  -> Tab "Ticket Clienti" (default): tabella attuale
  -> Tab "Chat Aziende": lista conversazioni per azienda
     -> Click su azienda -> Sheet con chat realtime
     -> Scrive messaggio -> sender_role = "super_admin"
     -> Azienda lo riceve in tempo reale nel suo SupportChatSheet
```

## File coinvolti

1. **Creare** `src/components/admin/support/AdminSupportChatList.tsx` - lista conversazioni
2. **Creare** `src/components/admin/support/AdminSupportChatSheet.tsx` - chat sheet lato admin
3. **Modificare** `src/pages/admin/GlobalTickets.tsx` - aggiungere Tabs
