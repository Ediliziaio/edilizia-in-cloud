

# Semplificare la pagina Ticket del Super Admin

## Problema

La pagina `/admin/ticket` mostra due tab: "Ticket Clienti" (ticket dei clienti finali delle aziende) e "Chat Aziende" (messaggi di assistenza dalle aziende). Il Super Admin non ha bisogno di vedere i ticket dei clienti delle aziende -- gli interessa solo le richieste di assistenza che le aziende inviano direttamente a lui.

## Soluzione

Rimuovere il sistema a tab e mostrare direttamente la lista delle conversazioni con le aziende come contenuto principale della pagina.

## Modifiche

### File: `src/pages/admin/GlobalTickets.tsx`

1. Rimuovere il componente `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`
2. Rimuovere tutta la sezione "Ticket Clienti" (filtri, tabella ticket, query ai ticket)
3. Rimuovere le stat SLA (che si riferivano ai ticket clienti)
4. Rimuovere le query `admin-global-tickets` e `admin-companies-list` e tutto lo stato associato (searchQuery, selectedCompany, selectedStatus, filteredTickets, ecc.)
5. Aggiornare il titolo da "Ticket Globali" a "Assistenza Aziende"
6. Mostrare direttamente il componente `AdminSupportChatList` come contenuto principale della pagina
7. Rimuovere le importazioni non piu necessarie (Table, differenceInHours, ecc.)

### Risultato finale

La pagina mostrera:
- Titolo "Assistenza Aziende" con descrizione
- Lista delle conversazioni con le aziende (componente `AdminSupportChatList` gia funzionante)
- Click su un'azienda apre la chat laterale per rispondere

