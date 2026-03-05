

# Aggiungere Sezione Allegati alla Pagina Dettaglio Ticket

## Contesto
La chat ha già il supporto per allegati tramite l'icona graffetta, ma non c'è una sezione dedicata che mostri tutti gli allegati del ticket in un unico posto. L'utente vuole una card "Allegati" nella sidebar che permetta di caricare file e visualizzare tutti i file allegati al ticket (estratti dai messaggi).

## Piano

### 1. Nuova card "Allegati" nella sidebar (`TicketDetail.tsx`)
- Aggiungere una card tra "Note Interne" e "Linked Tasks"
- Mostra tutti gli allegati del ticket (filtrati da `ticket_messages` con `attachment_url` non null)
- Ogni allegato mostra: nome file, anteprima se immagine, link per scaricare
- Bottone per caricare nuovi file (upload al bucket `ticket-attachments`, crea un messaggio automatico con allegato)
- Supporto multi-file, max 10MB per file, tipi: immagini/PDF/documenti

### File da modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/TicketDetail.tsx` | Aggiungere card "Allegati" con lista file e upload |

Nessuna migrazione DB: il bucket e la struttura messaggi con `attachment_url` esistono già.

