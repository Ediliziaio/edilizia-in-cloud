

# Fix: Errore caricamento messaggi ticket

## Problema
La query su `ticket_messages` usa il hint `profiles!ticket_messages_sender_id_fkey` per fare il join col profilo del mittente. Ma la foreign key `ticket_messages_sender_id_fkey` punta a `auth.users`, non a `public.profiles`. PostgREST non riesce a risolvere la relazione e restituisce errore 400.

Questo errore si verifica sia nel dettaglio ticket lato azienda che lato cliente.

## Soluzione
Rimuovere il hint esplicito della FK e fare il join implicito `sender:profiles(...)` — PostgREST puo risolvere la relazione tramite il campo `sender_id` che corrisponde a `profiles.id` (stesso UUID di `auth.users.id`). In alternativa, se il join implicito non funziona (perche non c'e FK diretta verso profiles), si puo fare una query separata per i nomi dei sender e mapparli client-side.

L'approccio piu sicuro: **creare una FK** da `ticket_messages.sender_id` verso `profiles.id`, oppure **rimuovere il join** e fare 2 query separate (messaggi + profili dei sender).

Approccio scelto: **Migrazione SQL** per aggiungere una FK verso `profiles.id` (che ha lo stesso ID di `auth.users.id`), poi il hint funzionera.

Ma c'e un problema: non possiamo avere due FK sullo stesso campo. Quindi dobbiamo:
1. Droppare la FK esistente verso `auth.users`
2. Creare una nuova FK verso `public.profiles`

Oppure piu semplice: **rimuovere il hint dalla query** e usare il join senza hint, oppure fare 2 query.

**Approccio finale piu sicuro (zero migrazione):** Rimuovere il hint FK e fare il fetch dei nomi sender separatamente, poi mapparli.

## File da modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/TicketDetail.tsx` | Rimuovere hint FK, fare query messaggi senza join profiles, poi fetch sender names separato |
| `src/pages/cliente/CustomerTicketDetail.tsx` | Stessa modifica |

In pratica: fetch messaggi senza il join `sender:profiles!...`, poi con i `sender_id` unici fare una query a `profiles` per ottenere i nomi, e mapparli nei messaggi.

