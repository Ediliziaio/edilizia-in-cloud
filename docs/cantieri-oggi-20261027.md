# Cantieri oggi — verifica del 27 ottobre 2026

## Intervento locale

La pagina è una vista operativa della selezione restituita da `ufficio_cantieri_oggi`, non un nuovo elenco di tutte le commesse aperte. La RPC esistente e il database condiviso non sono stati modificati.

- Quattro indicatori filtrabili: operativi oggi, cantieri da verificare, elementi da approvare nei monitorati e cantieri con squadre previste.
- «Operativi oggi» comprende persone previste, persone rilevate/rapportini della giornata o lavorazioni aperte con date che comprendono oggi. Non significa che una squadra sia fisicamente presente adesso.
- I contatori mancanti o non validi rimangono sconosciuti; errori delle fonti non diventano zeri. Le timbrature e i rapportini contano rilevazioni giornaliere, non presenza in tempo reale né copertura nominativa certificata.
- Un segnale vecchio non basta a dichiarare fermo il cantiere. Le date di fine superate richiedono verifica dell’avanzamento reale. Il confronto dei giorni usa il calendario italiano lun–ven, non le festività o il calendario specifico del cantiere.
- Nome del lavoro in evidenza, codice secondario, indirizzi senza ripetizioni quando riconoscibili, prossima azione per ogni riga.
- Filtri, ricerca, responsabile e dettaglio conservati nei parametri URL; pagina da 25 righe senza scartare le successive. Vista compatta a schede sui display piccoli.
- Pannello laterale con giornata, lavorazioni, ufficio e approvazioni. I moduli reali di approvazione vengono caricati solo quando necessari e solo per gli utenti autorizzati; le regole di conferma restano quelle esistenti.
- Il componente rapportini conserva il comportamento standard. La nuova opzione `soloDaApprovare` filtra `stato=inviato` e usa una cache distinta, coerente con il conteggio della RPC.

## Integrazione e prestazioni

Una RPC esistente, seguita da letture raggruppate di ordini, fasi e attività d’ufficio: massimo 100 identificativi per gruppo, pagine da 500 record e nessuna query per singola riga. Cache di 60 secondi e aggiornamento periodico di 5 minuti. I componenti più pesanti delle approvazioni sono lazy-loaded.

Le query condividono il prefisso d’invalidazione già usato per le modifiche del cantiere; anche le modifiche alle attività d’ufficio invalidano il riepilogo giornaliero. Il giorno nella chiave di cache e nella RPC è quello di Europe/Rome, aggiornato anche se la pagina attraversa la mezzanotte.

## Verifiche concluse

- 106 test superati in 13 file, tra logica della giornata, batch/paginazione delle letture, errori, permessi, filtri, pannello, separazione della cache dei rapportini e regressioni su attività e approvazioni.
- Zero diagnostiche nei controlli TypeScript selezionati; nessun errore ESLint nei nuovi file controllati e nessun errore di whitespace nelle modifiche verificate.
- Build di produzione completata in una directory temporanea, senza distribuzione. Rimangono avvisi preesistenti degli strumenti su Browserslist/configurazione Vite.
- Browser locale su Demo Azienda 2: 29 monitorati, 8 operativi/pianificati e 5 elementi da approvare al momento della prova. Il filtro approvazioni mostra tre commesse; il badge da due apre i due rapportini effettivi. Verificati anche date delle lavorazioni e collegamento all’Ufficio.
- Nessuna approvazione, registrazione di ore, modifica di squadre o altro dato aziendale eseguiti. Nessuna migrazione, push o pubblicazione dell’app.

## Limiti espliciti

La completezza dei monitorati dipende dalla selezione della RPC esistente: non è un censimento di tutti gli ordini aperti. Non vengono dedotte presenze nominative dai soli totali o assegnate squadre automaticamente. I test non costituiscono una certificazione di ogni flusso del gestionale né un benchmark di carico su grandi volumi reali.
