

# Ottimizzazione UX Pagina Dettaglio Ticket

## Problemi identificati dallo screenshot

1. **Header piatto** -- mancano badge di stato e priorita visibili nell'header, bisogna scorrere nella sidebar per vederli
2. **Sidebar troppo lunga** -- 5 card (Gestione, Contesto, Note, Allegati, Attivita) impilate verticalmente rendono la pagina molto piu lunga della chat, costringendo a scrollare
3. **Nessuna separazione visiva** -- header e contenuto non hanno gerarchia chiara
4. **Chat non occupa lo spazio disponibile** -- la chat ha un'altezza fissa `calc(100vh - 300px)` che non si adatta al layout
5. **Sidebar e chat scrollano insieme** -- non sono indipendenti, perdendo il contesto quando si scorre

## Piano di intervento

### 1. Header migliorato (`TicketDetail.tsx`)
- Aggiungere badge di stato e priorita accanto al titolo nell'header
- Aggiungere un sottile separatore sotto l'header

### 2. Layout a colonne con scroll indipendente
- Dare alla sidebar `overflow-y-auto` con altezza vincolata (`sticky top` o altezza calcolata)
- La chat gia ha il proprio scroll interno
- Usare `h-[calc(100vh-...)]` su entrambe le colonne per renderle indipendenti

### 3. Sidebar compatta
- Unire "Gestione Ticket" e "Contesto" in un'unica card con sezioni separate da `Separator`, riducendo lo spazio verticale
- Rendere i selettori piu compatti (rimuovere le label ridondanti quando il badge e gia visibile)

### 4. Note Interne collassabili
- Usare `Collapsible` per le Note Interne, collassate di default se vuote, risparmiando spazio

### File da modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/TicketDetail.tsx` | Header con badge, layout sticky, sidebar compatta con card unificata, note collassabili |

