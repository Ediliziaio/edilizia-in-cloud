# Ufficio: menu e modello di flusso — 27 ottobre 2026

## Interfaccia

- Sostituiti i menu nativi visibili con il Select condiviso della piattaforma, tramite `OfficeSelect`: trigger arrotondati, menu con ombra e voci selezionabili da tastiera. Lo stile è locale al modulo, senza modificare i componenti globali.
- Aggiornati fase, responsabile, priorità e predecessore della nuova attività, gruppo nel dettaglio e tutti i menu dell’editor.
- «Io» conserva il valore vuoto interno previsto dal salvataggio; nessun valore tecnico viene inviato come assegnatario. La persona corrente non appare duplicata nell’elenco.
- Editor ridisegnato con sequenza verticale numerata, schede, campi distinti per avvio/responsabile/giorni, ambito operativo o ufficio, riepilogo leggibile e opzioni avanzate espandibili. Intestazione e azioni restano fuori dall’area scorrevole.
- Nessuna modifica al contratto della RPC di salvataggio atomico dei modelli.

## Correzione rilevata durante i controlli

Un successore con due prerequisiti poteva far fallire l’intero ciclo del vecchio trigger di sblocco: il controllo sullo stato impediva correttamente lo sblocco anticipato, ma l’eccezione intercettata dal trigger annullava anche gli aggiornamenti degli altri successori.

La migrazione `20261027093146_office_dependencies_release_consistent.sql` filtra prima del ciclo solo i successori effettivamente pronti. Conserva gli identificativi dei trigger, le notifiche e la gestione preesistente della riapertura. Le due funzioni sono interne ai trigger, senza permesso di esecuzione diretta per anon e authenticated. È stata applicata al database condiviso dopo i test isolati, secondo l’autorizzazione ricevuta.

Testati entrambi gli ordini di completamento: prima attività e poi cantiere, oppure viceversa. Il passo con due prerequisiti aspetta entrambi; gli altri si sbloccano senza essere trattenuti. Controllate scadenza italiana e notifiche senza duplicazione su aggiornamenti ripetuti.

## Verifica e limiti

- 77 test superati in 9 file: selezioni reali del componente, ritorno a «Io», salvataggio di gruppo/priorità/predecessore, logica isolata SQL e regressioni della commessa.
- Build di produzione completata senza distribuzione. Nessun errore ESLint nei file controllati.
- Browser locale su Demo Azienda 2: scelta della fase confermata nell’interfaccia, editor standard importato nella sola bozza, opzioni avanzate aperte. Nessun salvataggio di attività o modelli aziendali, nessuna comunicazione inviata.
- Il test jsdom limita il rimbalzo di focus tra copie locali di Radix, come già previsto in altri test del repository. Il comportamento visivo è verificato separatamente nel browser.
- Non è una certificazione di tutti i possibili flussi o dell’intero database. Nessun push o distribuzione dell’app eseguiti in questo intervento.
