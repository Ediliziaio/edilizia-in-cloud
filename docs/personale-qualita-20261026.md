# Personale & HR — interventi e criteri di completamento

Data: 26 ottobre 2026. Frontend locale, database condiviso aggiornato con autorizzazione esplicita dopo test locali. Nessun push, invio, assunzione, approvazione o cedolino reale creato durante queste verifiche.

## Obiettivo

Migliorare ogni scheda senza assegnare un “10/10” privo di prove. Un errore di lettura non deve diventare un archivio vuoto o un indicatore verde. Consultare una scheda non deve scrivere dati. Modifiche e decisioni HR devono restare esplicite, autorizzate e coerenti tra viste.

## Interventi

| Scheda | Implementato | Limite/controllo ancora necessario |
| --- | --- | --- |
| Regia HR | Errori espliciti; niente indice 100 durante caricamento; profili autonomi non penalizzati; collegamenti non validi separati; sedi attive distinte dalle coordinate GPS | L’indice è un indicatore dei dati caricati, non certificazione di conformità |
| Organigramma | Albero ortogonale, ricerca con antenati, elenco accessibile, cicli visibili senza alterare dati, permessi di modifica | Le relazioni non valide esistenti richiedono una decisione umana; non vengono corrette attribuendo responsabili arbitrari |
| Profili | Attivi di default, storico separato, 20 righe per pagina, tastiera, errori, blocco sola lettura, lettura completa oltre limite API | Contratti e saldi da validare con HR. Campi numerici vuoti rimangono sconosciuti e residui negativi non vengono azzerati o ripristinati a default |
| Timbrature | Errori live separati da zero presenze; ricerca ultima timbratura lineare; lettura paginata completa; massimo 12 persone per pagina nel pannello; nessuna timbratura non significa assenza ingiustificata | GPS/dispositivi e turni notturni richiedono prova operativa con dati autorizzati |
| Presenze | Calendario e ore di cantiere distinti; controllo mensile su richiesta; copertura sui calendari personali; richieste e anomalie coerenti; entrate senza uscita pregresse visibili nel filtro; chiusura server e riapertura solo amministrativa con motivo e storico | Nessun mese reale chiuso per test. Per chiudere occorrono mese concluso, calendario e date di assunzione configurati, registri completi, nessuna anomalia o richiesta in attesa |
| Richieste | Intervalli sovrapposti al mese inclusi; filtro revocate; calcolo lavorativo su settimana personale e festività; snapshot consumo e rimborso; nessun fallback client non atomico; autorizzazioni UI e server; richiesta senza profilo non approvabile | Importare/configurare calendario aziendale e settimana personale. Le revoche di richieste storiche senza snapshot mantengono il conteggio storico, evitando ricalcoli retroattivi |
| Cedolini | Mese corrente, 20 righe/pagina, lettura completa, persona selezionata tramite ID stabile (anche omonimi), errori e sola lettura; stato senza badge duplicato | Nessuna emissione/consegna provata su persone reali; la stima non sostituisce il consulente |
| Documenti | Scadenza apre direttamente l’archivio della persona, anche cessata; invalidazione globale coerente; letture paginati; errori espliciti; mutazioni vincolate a persona/azienda; sola lettura; allegato non rimosso prima di una cancellazione DB rifiutata | Pulizia storage può richiedere un secondo tentativo: viene segnalata, non mascherata. Dati clinici non usati per decisioni automatiche |
| Candidati | Collegamento candidato-profilo atomico e idempotente; nessuna nazionalità, contratto o monte ferie inventato; esiti dal dettaglio anziché trascinamento accidentale; successo solo dopo conferma server; errori; sola lettura | Non viene eseguita alcuna decisione di assunzione in autonomia. Verificare condizioni contrattuali prima del completamento del profilo |
| Test attitudinali | Niente generazione report o aggiornamento cache aprendo la vista; generazione mancanti esplicita; risposte locali non sovrascritte da effetto a ogni ricaricamento | Report di supporto, non decisione automatica sull’idoneità o assunzione |
| Uffici | Un’unica RPC per ufficio e membri; rollback totale; deduplicazione membri; responsabile incluso; membri vincolati alla stessa azienda; errori e sola lettura; conferma cancellazione chiusa solo su successo | Prove di salvataggio eseguite in database isolato, non su uffici aziendali reali |
| Sedi | Filtri, assegnazioni, inattivi, validazione GPS, mappa su richiesta compatibile React 18, errori e cancellazione protetta | Collegamento canonico fra sedi aziendali e sedi HR da progettare su identificatore stabile: nessuna fusione automatica per nome |
| Festività | Cambio mese/anno funzionante; ricorrenti proiettate correttamente; Pasqua e Lunedì dell’Angelo specifici dell’anno; importazione atomica e ripetibile; gestione una tantum di anni diversi; errori e permessi | Patrono locale, chiusure e accordi vanno configurati. Suggerimenti nazionali aggiornati anche al 4 ottobre dal 2026 |
| GPS opzionale | Mappe senza provider React 19 incompatibile; cartografia solo su richiesta; nessun reverse geocoding automatico; etichette sicure come testo; ultima posizione per tecnico senza taglio globale a 200 campioni; errori distinti da vuoto | Modulo non attivo in Demo Azienda 2, non attivato durante il lavoro. Restano prove su dispositivi, consenso, storico e aggiornamenti reali |

## Database

Applicate e confermate:

- `20261026200115_hr_affidabilita_atomica.sql`: `hr_salva_ufficio`, `hr_collega_candidato`, `hr_importa_festivita`, `hr_gps_ultime_posizioni`.
- `20261026200117_hr_richieste_calendario_verificato.sql`: mantiene autorizzazione/audit del flusso richieste, aggiunge snapshot dei consumi, calendario lavorativo e divieto di inventare ore lavorate da permessi.
- `20261026202733_hr_chiusura_mese_autorizzata.sql`: chiusure e storico protetti da RLS, RPC con controllo revisione, snapshot delle giornate, blocco server di inserimenti/rettifiche/cancellazioni su giornate, timbrature e richieste del periodo chiuso. Riapertura riservata agli amministratori autorizzati, con motivo obbligatorio e utente registrato. Nessuna riapertura automatica, nemmeno per elaborazioni in background.

Le quattro nuove RPC sono SECURITY INVOKER: conservano RLS e non hanno esecuzione anonima. I test PGlite provano rollback su errore membri/collegamento, ripetizioni, calendario, limite campioni GPS e ripristino saldo dopo cambio calendario. Le migrazioni non riscrivono saldi o documenti esistenti. Non modificare questi file già applicati: correzioni successive in nuove migrazioni.

Anche la RPC di transizione mese è SECURITY INVOKER e non eseguibile da anonimi. I due trigger privati hanno search_path fissato e nessun diritto di esecuzione per client; scrivono lo storico immutabile e verificano anche le scritture in background. Verifica post-migrazione: entrambe le tabelle con RLS attiva, zero chiusure e zero eventi creati nel database condiviso. I test isolati coprono utenti non amministratori/sola lettura, isolamento aziendale, arrivi tardivi, spostamento e cancellazione di giornate, motivazione vuota, revisione obsoleta, doppia chiusura dopo rettifica con conservazione di entrambi gli snapshot.

Advisors: nessuna segnalazione sulle quattro nuove funzioni. Sono presenti segnalazioni preesistenti su viste/funzioni di altre aree; non sono state “risolte” cambiando accessi fuori dal perimetro HR.

## Verifiche

- Browser Demo Azienda 2, sola lettura: Regia, attivi/pagine Profili, mese/form persona Cedolini (annullato), Documenti, cambio anno Festività, controllo mensile/filtro anomalie, Richieste, Test attitudinali senza generazione automatica. Settembre carica tutte le 1.061 giornate, senza fermarsi al limite API di 1.000; chiusura disabilitata anche con zero anomalie se registri/configurazione non completi. Ottobre rimane aperto con un’anomalia; cambio mese ripristina correttamente il controllo separato.
- Test automatici: 245 test superati in 35 file, suite HR completa in `/tmp/hr-quality-all-final.log`; test mirati chiusura in `/tmp/hr-month-close-predeploy.log`. Nessun test crea dati HR sul database condiviso. Test aggiunti anche per il riavvio/cancellazione del timeout di caricamento e nessun reset del modulo Uffici da effetto durante la modifica.
- Screenshot: `output/personale-quality-20261026/controllo-mensile.png`.
- Build e controllo tipi vanno valutati sul checkout condiviso: i nuovi errori di altri terminali non vanno mascherati aggiornando la baseline.
- Build di produzione (`npm run build:fast`) riuscita; il controllo lint HR non richiede disabilitazioni per gli aggiornamenti di stato sincroni negli effetti. Restano warning di tipizzazione/librerie preesistenti da non confondere con errori funzionali verificati.
- Lint finale sul perimetro HR: zero errori, 49 warning. Controllo tipi completo concluso: 657 errori complessivi contro una soglia di 703, ma il ratchet rimane rosso per sei nuovi errori in `supplyDocumentBoards.test.tsx` e `safetyWorkflowPersistence.test.tsx`, esterni a questo intervento HR. Nessun nuovo errore HR rilevato e nessuna baseline aggiornata. Log: `/tmp/hr-final-closure-types.log` e `/tmp/hr-final-closure-types-raw.log`.
- Nomi delle tre migrazioni allineati alle versioni effettivamente registrate sul server; contenuto SQL invariato, verificato tramite SHA-256. Nuova esecuzione dei test database dopo l’allineamento: 17 test superati in quattro file, log `/tmp/hr-migrations-aligned-tests.log`. Nessuna migrazione riapplicata.

## Passi non dichiarati completati

1. Collegamento canonico sedi aziendali ↔ sedi HR e percorso guidato per anagrafiche account/dipendente/profilo scollegate. Mai unione per nome o assegnazione automatica del responsabile.
2. Collaudo reale autorizzato di GPS, turni notturni, payroll e ruoli diversi. I mock non certificano l’intero processo in produzione. Per la prima chiusura operativa HR va completata la configurazione e verificato il registro dall’amministratore, non chiuso automaticamente durante il collaudo.
3. Pubblicazione frontend solo quando richiesta. Nessun push su main durante questo intervento.

Fonte del suggerimento calendario 4 ottobre: [Legge 8 ottobre 2025, n.151](https://www.gazzettaufficiale.it/eli/id/2025/10/10/25G00153/SG), in vigore dal 1 gennaio 2026.
