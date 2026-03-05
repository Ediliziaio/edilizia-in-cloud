

# Aggiungere Upload Documenti alla Creazione Ticket

## Contesto
Entrambi i form di creazione ticket (lato azienda `CreateCompanyTicket.tsx` e lato cliente `CreateTicket.tsx`) non hanno la possibilita di allegare file. Il bucket `ticket-attachments` e la logica di upload esistono gia in `TicketChat.tsx`.

## Piano

### Modifiche a `CreateCompanyTicket.tsx`
- Aggiungere stato `pendingFiles: File[]` per i file selezionati prima dell'invio
- Aggiungere un input file con bottone (icona Paperclip), accetta immagini/PDF/documenti, multiplo
- Mostrare lista file selezionati con possibilita di rimuoverli (nome + dimensione + X)
- Nel `mutationFn`, dopo la creazione del ticket e del messaggio iniziale, uploadare ogni file al bucket `ticket-attachments` sotto `{ticketId}/{uuid}-{filename}` e inserire un record in `ticket_messages` con `attachment_url` per ciascun file
- Validazione: max 5 file, max 10MB per file, tipi consentiti (immagini, PDF, doc/docx)

### Modifiche a `CreateTicket.tsx` (lato cliente)
- Stessa logica: stato `pendingFiles`, input file, lista preview, upload su submit
- Stessi vincoli di validazione

### File coinvolti
| File | Modifica |
|------|----------|
| `src/pages/azienda/CreateCompanyTicket.tsx` | Aggiungere file picker + upload post-creazione |
| `src/pages/cliente/CreateTicket.tsx` | Aggiungere file picker + upload post-creazione |

Nessuna migrazione DB necessaria: il bucket e la colonna `attachment_url` su `ticket_messages` esistono gia.

