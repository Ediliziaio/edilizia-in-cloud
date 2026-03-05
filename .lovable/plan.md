

# Aggiungere Sezione Allegati nella Vista Ticket Lato Cliente

## Piano

Riutilizzare il componente `TicketAttachments` gia creato per la vista azienda. Basta importarlo e aggiungerlo nella pagina `CustomerTicketDetail.tsx`, posizionato dopo la card dell'ordine collegato e prima della chat.

### File da modificare

| File | Modifica |
|------|----------|
| `src/pages/cliente/CustomerTicketDetail.tsx` | Importare `TicketAttachments` e renderizzarlo prima di `TicketChat` |

Modifica minima: 2 righe (1 import + 1 render).

