

# Miglioramenti UX Ticket

## Stato Attuale
Il caricamento file e gia implementato in tutti e tre i punti: creazione ticket azienda, creazione ticket cliente, e chat (icona graffetta). Funziona correttamente.

## Miglioramenti UX Proposti

### 1. Empty State nella Conversazione
Quando la conversazione e vuota (come nello screenshot), mostrare un messaggio guida con icona invece di uno spazio bianco vuoto. Es: "Nessun messaggio. Scrivi il primo messaggio per iniziare la conversazione."

### 2. Consolidare la Sidebar del Ticket Detail
Attualmente ci sono 5-6 card separate nella sidebar (Stato, Priorita, Assegnato a, Cliente, Ordine, Note). Ridurre a 2-3 card raggruppando:
- Card 1: Stato + Priorita + Assegnato a (gestione ticket)
- Card 2: Cliente + Ordine collegato (contesto)
- Card 3: Note interne (separata perche editabile)

### 3. Feedback Visivo Upload nella Chat
Aggiungere un tooltip/hint sull'icona graffetta per rendere piu evidente la funzionalita di upload ("Allega file").

### File da Modificare
| File | Modifica |
|------|----------|
| `src/components/tickets/TicketChat.tsx` | Empty state, tooltip su paperclip |
| `src/pages/azienda/TicketDetail.tsx` | Consolidare sidebar cards |

