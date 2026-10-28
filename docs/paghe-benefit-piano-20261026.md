# Paghe, benefit e accantonamenti — piano operativo

## Confini

Nessuna emissione, pubblicazione, notifica, erogazione o pagamento reale durante il collaudo. Non si ricostruiscono stipendi o saldi storici in autonomia. Il motore indicativo non sostituisce il consulente. Migrazioni tecniche sul database condiviso solo dopo test isolati; frontend locale, nessun push richiesto in questo intervento.

## Ordine e criteri di accettazione

1. **Sicurezza delle stime.** Regole IRPEF con anno esplicito e fonte; nessuna riduzione automatica del lordo per registrazioni mancanti; anomalie bloccanti; differenza visibile fra stima, inserimento manuale e PDF del consulente. Nessuna ricostruzione di contributi sconosciuti alla stampa. Prove su anni, soglie, zero ore, dati incompleti e permessi.
2. **Buoni pasto e rimborsi.** Vista mensile per azienda, regole aziendali e diritto individuale; maturazioni confrontabili con giornate; riconciliazione esplicita e atomica dei soli buoni non erogati. Rimborsi con km, tariffa, giustificativo/riferimento e importo calcolato. Nessuna erogazione automatica. Storni e anomalie conservati senza riscrivere pagamenti già eseguiti; periodo chiuso protetto.
3. **Registri TFR, welfare e altre voci.** Registrare dati forniti/validati dal consulente, non inventare spettanze: quote, rivalutazioni, anticipi, liquidazioni, fondi; budget welfare, assegnazioni/utilizzi/storni, riferimenti e scadenze. Importi, segno e fonte espliciti; storico append-only e isolamento aziendale. Separazione fra budget, costo aziendale e somme spettanti al lavoratore.
4. **Riconciliazione.** Collegare movimenti al documento paghe della stessa persona/azienda/periodo, con conferma esplicita. Evidenziare differenze e voci non riconciliate; non sommare benefit fuori cedolino al netto da pagare. PDF originali immutati. Consentire un'esportazione al consulente con soli dati autorizzati.
5. **Collaudo e attivazione.** Test logici/UI/database, azienda errata, sola lettura, duplicati, concorrenza, errore a metà transazione e mese chiuso. Browser Demo Azienda 2 in sola lettura; nessun record reale per test. Build, lint, controllo tipi senza cambiare baseline. Registrare funzionalità finite e limiti residui.

## Da non presentare come già disponibile

Un motore paghe normativo universale richiede tabelle contrattuali e territoriali con decorrenza, imponibili separati, fondi corretti per CCNL, massimali/minimali, agevolazioni, conguagli, tassazione separata, destinazione TFR e adempimenti. La sola archiviazione di CU/F24/MUT non equivale a elaborazione o trasmissione. Queste integrazioni richiedono tracciati e validazione del consulente: nessun automatismo LLM per determinare obblighi fiscali o retribuzioni.

## Fonti verificate

- [Ministero del Lavoro: bilancio 2026 e secondo scaglione IRPEF al 33%](https://www.lavoro.gov.it/notizie/pagine/legge-di-bilancio-2026-le-principali-misure-lavoratori-imprese-e-famiglie).
- [Prevedi: fondo di riferimento per CCNL Edili industria/artigianato](https://www.prevedi.it/chi-siamo/cose-prevedi/). Non applicare Cometa indistintamente all'edilizia.
- [INPS: trasmissione UniEmens](https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.50252.trasmissione-uniemens-per-datori-di-lavoro-di-aziende-private.html).

## Avanzamento

- **Sicurezza attiva sul server:** regole indicative IRPEF 2024–2025/2026 distinte, anno successivo non dato per aggiornato, zero trattenute automatiche per registri mancanti/anomali; stime non emettibili senza documento originale. Stampa sintetica sostituita dall’apertura del PDF originale. Importi non estratti dal nuovo PDF rimangono nulli e non riutilizzano quelli del precedente; nessun ricalcolo storico.
- **Interfaccia locale:** tre sezioni in Cedolini: archivio, Benefit e rimborsi, TFR e welfare. Regole aziendali esplicite, diritti individuali anche per omonimi tramite ID/matricola, ricevute con riferimento, richieste km con calcolo server, riconciliazione esplicita delle maturazioni, blocco doppi conteggi fisso/ricevuta, stato di erogazione soltanto dichiarativo di eventi esterni.
- **Registri operativi:** quote/saldo iniziale/rivalutazioni/anticipi/liquidazioni/rettifiche TFR, budget/utilizzi/rettifiche welfare, ratei 13ª/14ª, Cassa Edile, fondi, trasferte e premi come dati documentati. Append-only, chiave idempotente, segno controllato, storni senza cancellazioni, riferimento e fonte obbligatori, documento della stessa persona e periodo, esportazione CSV protetta da formule.
- **Protezione e storico:** nuovi registri isolati con RLS; RPC nuove SECURITY INVOKER, nessuna esecuzione anonima. Periodi HR chiusi protetti. Audit di movimenti benefit, configurazione e diritti; importi già erogati/rimborsati non riscritti. Nessun evento reale di test, nessun pagamento, invio o erogazione.
- **Migrazioni applicate dopo i test:** `20261026211245_hr_paghe_stime_sicure.sql` e `20261026211248_hr_paghe_registri_benefit.sql`. Versioni locali allineate al server con hash invariati; non riapplicarle né editarle per correzioni successive.

## Limiti espliciti e blocco successivo

Questa è una prima tranche operativa e di messa in sicurezza, non un motore paghe normativo completo. Le percentuali contributive del vecchio motore restano storiche/indicative, dichiarate non validate e non utilizzabili per emissione; non vengono sostituite con nuove percentuali universali inventate. Il TFR è un registro delle variazioni comunicate, non un calcolo legale automatico. Il saldo welfare è contabile per anno civile, non disponibilità presso un fornitore né attestazione di esenzione fiscale.

Da completare con dati e validazione del consulente: tabelle CCNL/livello/provincia/decorrenza, basi imponibili e fondi corretti, agevolazioni/conguagli, rivalutazione e tassazione TFR, collegamento del singolo utilizzo welfare a un budget con scadenza e gestore, caricamento dei giustificativi pasto oltre al riferimento amministrativo, esportazioni ministeriali e invii autorizzati. Il collegamento documento nei registri non è un confronto automatico degli importi. Una riconciliazione errata richiede storno/reinserimento tracciato, non modifica silenziosa dello storico.

Per i buoni «ore e ricevute», una ricevuta attiva impedisce una nuova maturazione fissa per lo stesso giorno; i doppi preesistenti sono segnalati e vanno verificati. I movimenti già erogati restano intatti, anche se le ore vengono rettificate. Il riepilogo deve essere confrontato con le erogazioni esterne prima di registrare lo stato.

## Collaudo conclusivo della prima tranche

- **Test isolati:** i quattro nuovi file contengono 21 test di logica, UI e database. L'ultima regressione HR/paghe selezionata passa con **244 test in 37 file** (`/tmp/payroll-hr-release-tests.log`); la suite mirata su paghe, anteprima e ore reali passa con **52 test in 7 file** (`/tmp/payroll-latest-tests.log`). Una precedente regressione più ampia aveva superato 265 test in 39 file. Nessuna prova automatica scrive nel database aziendale condiviso.
- **Build:** `npm run build:fast` riuscita (`/tmp/payroll-final-build.log`). Lint sul perimetro paghe: zero errori e cinque warning `any` preesistenti in `TabCedolini.tsx` (`/tmp/payroll-final-lint.log`). Nuovi file formattati con Prettier; nessuna dipendenza aggiunta.
- **Tipi, checkout condiviso:** controllo completo eseguito, non verde: 658 errori totali contro soglia 703, ma sette nuovi errori nei test esterni `supplyDocumentBoards.test.tsx`, `safetyWorkflowPersistence.test.tsx` e `fascicoloCantiere.test.ts`. Nessun errore rilevato nei nuovi file paghe o in `TabCedolini.tsx`; nessuna baseline modificata. Log `/tmp/payroll-final-types.log` e `/tmp/payroll-final-types-raw.log`. Non presentare il checkout complessivo come pronto alla pubblicazione finché il ratchet non è risolto.
- **Browser reale, Demo Azienda 2:** archivio e distinzione prospetto/originale, nuova bozza interna con campi sconosciuti non trasformati in zero, tre viste benefit, impostazioni inizialmente vuote, omonimi identificati, paginazione diritti, modulo km, registro TFR/welfare e relative categorie. Moduli aperti e annullati, nessun salvataggio o assegnazione reale. Nessun errore console nel controllo finale. Nessuna regola benefit nella demo: la riconciliazione resta disabilitata, senza valori inventati. Registri nuovi vuoti: saldo indicato «Non caricato», non zero.
- **Limite del collaudo visivo:** storico popolato, inserimento, storno, riconciliazione documentale e stati di erogazione sono provati in database/UI isolati, non con movimenti aziendali reali. Il primo uso operativo richiede dati e revisione dell'amministratore/consulente.
- **Prove visive:** `output/personale-quality-20261026/paghe-benefit.png` e `output/personale-quality-20261026/paghe-registro.png`.
- **Attivazione:** le due migrazioni tecniche sono applicate e verificate (RLS, RPC senza esecuzione anonima, tabelle nuove vuote). Il frontend resta locale; nessun commit, push, pubblicazione frontend, cedolino emesso, pagamento, erogazione o invio reale durante l'intervento.
