# Sopralluogo serramenti completo — importazione Demo Azienda 2

## Risultato reale

Il 28 ottobre 2026 è stata creata esclusivamente una nuova bozza dimostrativa:

- Azienda: Demo Azienda 2 S.r.l. (`d2000000-0000-4000-a000-000000000002`).
- Codice: **SOP-2026-0006**.
- ID: `094083a9-ae8e-4f12-b545-30d9ea1b2473`.
- Stato: `draft`, colonna **Da pianificare**.
- Modello reale: Rilievo Infissi e Serramenti v6, con estensioni runtime condivise per porte interne.
- 6 ambienti, 16 schede: Soggiorno 3, Camera 5, Bagno 3, Veranda 2, Ingresso 1, Disimpegno 2.
- Nessun cliente, commessa, tecnico, assegnatario, foto, firma, preventivo o ordine aggiunto.
- Tutte le schede restano non completate e non approvate per ordine. Le misure sono sintetiche, non un rilievo eseguito sul posto.

[Bacheca filtrata](http://127.0.0.1:8081/azienda/sopralluoghi?sop_fase=da_pianificare&sop_ambito=all&sop_cerca=SOP-2026-0006)

[Dettaglio reale](http://127.0.0.1:8081/azienda/sopralluoghi/094083a9-ae8e-4f12-b545-30d9ea1b2473)

Il filtro precedente «Preventivo fatto» esclude questa bozza. Non modificarne lo stato per farla apparire in quella colonna.

## Integrità e limiti

L'importazione è una transazione INSERT-only con verifica preventiva di azienda e modello, lock dedicato, conteggi, chiavi univoche e confronto delle impronte dei sopralluoghi/ambienti/elementi preesistenti della demo. Non modifica schema, ruoli o autorizzazioni.

La chiave `DEMO-SERRAMENTI-COMPLETO-20261028` rende il riavvio idempotente. Una seconda esecuzione reale ha restituito lo stesso sopralluogo senza duplicazioni. La rilettura conclusiva conferma una sola importazione, 6 ambienti, 16 elementi e zero approvazioni per ordine.

Non riavviare la preparazione con `PREPARE_DEMO_WINDOW_IMPORT=1`: rigenera gli UUID figli. Conservare `work/sopralluoghi-campo-20261028/importazione/payload.json` e `import.sql` come artefatti dell'importazione effettuata; eventuali ulteriori importazioni richiedono una nuova richiesta e un nuovo piano.

Il browser collegato è rimasto nella sessione operaio Marco Verdi: gli URL amministrativi rimandano correttamente a `/campo`. Nessun accesso è stato aggirato e nessun sopralluogo assegnato per mostrarlo all'operaio. Salvataggio e rilettura reali sono verificati; resta da verificare visivamente la bacheca in una sessione amministratore. L'apertura del pannello Codex è risultata accodata, non prova di visualizzazione.

## Simulazione e PDF

La simulazione locale `work/sopralluogo-20261027/rilievo-completo.html` ora distingue il laboratorio in memoria dalla bozza reale, offre i due collegamenti diretti e un riepilogo richiudibile di completezza e passaggi verso verifica ufficio/preventivo/commessa. Non crea commesse né aggiorna la bozza reale quando si modificano i dati nella simulazione.

Controllati telefono 390×844 e tablet 820×1180; a 820 px `scrollWidth`, `clientWidth` e `innerWidth` coincidono. Ripristinata la dimensione browser iniziale.

Il PDF `output/pdf/Sopralluogo-serramenti-Demo2-SOP-2026-0006.pdf` è generato con il renderer applicativo dai dati riletti dal database, non dai soli dati della simulazione. Contiene 25 pagine A4 con indice delle 16 schede, disegni, misure e note. Tutte le pagine sono state renderizzate e controllate visivamente. Ridotta la spaziatura verticale delle tabelle compatte per eliminare una pagina con una sola riga finale, senza ridurre i caratteri.

Il nome e i contatti sono quelli della demo. Il logo aziendale reale è assente: usato il nome, senza inventare un marchio. Nessuna foto o firma fittizia. L'assenza di campi obbligatori mancanti non equivale ad approvazione tecnica: nel modello corrente le foto non sono obbligatorie e le misure restano non verificate per ordine.

## Verifiche

- 10 controlli PostgreSQL isolati PGlite: conteggi, conservazione preesistente, nessuna approvazione o collegamento fittizio, ripetizione senza duplicati e rollback su payload invalido. Nessuna scrittura remota da questi test.
- 30 test passati in `windowDemoImport`, `completeWindowSurvey`, `surveyReportPdf`, `surveyPdfTools`.
- Test PDF nativo dedicato passato: rilettura salvata, fase/filtro bacheca, tipi e opzioni del modello, disegni per tutti i 16 elementi, generazione PDF.
- ESLint sui file TypeScript/TSX interessati: nessun errore.

Nessuna pubblicazione dell'app, push, modifica di endpoint o invio ai clienti in questo intervento.
