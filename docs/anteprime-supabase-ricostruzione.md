# Ricostruzione delle anteprime Supabase

Le anteprime vuote eseguono i file in ordine di versione. Nello storico sono presenti lotti applicati in produzione con un ordine diverso: alcune estensioni, viste, indici e policy precedono le loro dipendenze.

La correzione conserva tutte le versioni, senza riscrivere il registro di produzione:

- Le estensioni attendono la tabella quando manca e vengono completate nella relativa fondazione. Dove più lotti dipendono dalla stessa tabella, viene anticipata la definizione originale, con RLS attiva.
- Gli indici e le ottimizzazioni RLS operano solo su colonne e policy disponibili; le fondazioni successive completano i casi rinviati. Non vengono creati accessi permissivi sostitutivi.
- I seed destinati a un’azienda terminano senza inserire dati se l’azienda non esiste. Non si copiano aziende o utenti di produzione.
- Le etichette enum necessarie alle policy vengono confermate in una migrazione precedente. Definire un’etichetta non assegna un ruolo a utenti.

La suite `vitest.supabase.config.ts` esegue SQL reale con PGlite in Node, separatamente dai test dell’interfaccia. Copre creazione da vuoto, completamento delle dipendenze, idempotenza, vincoli e accessi. La verifica completa richiede anche il replay remoto di tutti i file.

Quando si corregge il contenuto di una migrazione già eseguita da un’anteprima, quella versione non viene rieseguita automaticamente. Per verificare il nuovo storico va ricreata l’anteprima temporanea senza dati, come previsto dal workflow Supabase. Non applicare le vecchie migrazioni alla produzione e non modificare il suo registro per effettuare questa prova.
