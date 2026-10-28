# Ufficio della commessa — verifica del 27 ottobre 2026

## Flusso implementato

- Le attività d’ufficio sono gli stessi record `tasks` dell’agenda, filtrati per azienda, commessa e ambito. Nessun archivio parallelo.
- Gruppi espliciti: Avvio, Acquisti, Preparazione, Amministrazione, Chiusura. I record preesistenti senza gruppo restano in «Da organizzare», senza classificazioni arbitrarie.
- Indicatori filtrabili: da fare adesso, scadute, in attesa, da assegnare. L’avanzamento dell’ufficio è distinto dall’avanzamento fisico del cantiere.
- Creazione con responsabile, scadenza, priorità e predecessore. Il dettaglio riusa checklist, allegati, commenti e storico dell’attività.
- «Applica modello» mostra un’anteprima della singola commessa. «Modello aziendale» configura le nuove commesse; la relativa applicazione automatica viene salvata insieme al modello, non quando si tocca l’interruttore.
- Le modifiche invalidano anche riepilogo commessa, agenda e prossima attività.

## Database

Applicate, dopo test su PostgreSQL isolato, le migrazioni:

1. `20261027084341_office_workspace_atomic_templates.sql`: gruppi, salvataggio atomico dei modelli, controllo versione, protezione delle dipendenze e compatibilità dei chiamanti precedenti.
2. `20261027090709_office_flow_application_atomic.sql`: applicazione atomica del flusso alla commessa e controllo permessi fail-closed.

Le RPC sono SECURITY INVOKER, con search path fisso; esecuzione anonima revocata. Restano attive le policy RLS esistenti. Nessun backfill delle attività o dei modelli aziendali. Gli advisor generali del progetto hanno segnalazioni preesistenti, fuori da questo intervento; non sono emerse segnalazioni riferite alle nuove funzioni.

L’applicazione verifica corrispondenze per titolo normalizzato: omonimie ambigue o prerequisiti di cantiere mancanti causano un errore senza creazioni parziali. Il titolo non è un identificativo universale del modello: verificare le omonimie nell’anteprima.

## Verifiche

- 154 test superati in 13 file: logica SQL isolata, rollback, permessi, concorrenza, dipendenze, aggiornamenti UI e regressioni collegate.
- Controllo TypeScript: zero diagnostiche nei 15 file selezionati.
- ESLint: nessun errore nei file dell’intervento controllati; non è una certificazione dell’intero repository.
- Build di produzione completata con esito positivo in una directory temporanea, senza distribuzione dell’app. Restano avvisi degli strumenti su configurazione Vite e dati Browserslist, non errori di compilazione.
- Browser locale, Demo Azienda 2: vista ufficio, dettaglio attività, nuovo modulo, azione rapida contestuale, editor e importazione del modello standard nella sola bozza non salvata, anteprima applicazione.
- Nessuna attività di prova creata e nessun modello aziendale salvato durante le verifiche browser. Nessuna comunicazione, fattura o pagamento inviati.

## Ambito e limiti

L’interfaccia resta locale, senza push o distribuzione dell’app in questo intervento. Le sole modifiche condivise sono le migrazioni autorizzate. I test di scrittura sono isolati; il percorso browser è stato verificato senza confermare scritture aziendali reali. I modelli standard non sostituiscono la verifica tecnica o normativa del singolo cantiere.
