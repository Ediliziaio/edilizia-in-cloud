# Verifiche della revisione — stato di avanzamento

La revisione è in corso. Questo rapporto non costituisce un via libera alla pubblicazione.

## Test automatici

Ultima selezione cumulativa: **54 file, 587 test passati**, nessun fallimento. Esecuzione con un solo worker, timeout di test e hook di 20 secondi; durata 253,44 secondi.

- Elenco dei file: `/tmp/eic-azienda-test-files-sicurezza.json`.
- Rapporto macchina: `/tmp/eic-azienda-test-cumulativo-sicurezza.json`.
- Log: `/tmp/eic-azienda-test-cumulativo-sicurezza.log`.

Comprende le correzioni di attività, assistenza, CRM, email, importazione, costi, scadenzario, documenti fiscali, calendario, controllo di gestione, commessa, sicurezza e POS. Comprende anche test esistenti della gestione sessione. Non equivale all'intera suite del repository.

La prima esecuzione concorrente della precedente selezione da 40 file aveva 17 fallimenti in 12 file, in prevalenza timeout. Il test Assistenza controllava il pannello prima del completamento del caricamento lazy: ora attende il contenuto, mantenendo le asserzioni su tastiera, pannello e URL. Ripetizione dei 12 file con un worker: 112 test passati; poi intera selezione da 40 file: 433 test passati. L'ultima selezione da 54 file sopra incorpora queste verifiche. Nessun timeout di progetto modificato.

I test di creazione, errore, retry, invio duplicato e caricamento usano API simulate e file in memoria. Non sono state effettuate queste scritture sui dati aziendali.

## Controlli statici e build

| Controllo | Risultato e limite |
|---|---|
| Sintassi TypeScript | Ultimo controllo: 79 file, zero errori. Precede le ultime patch sicurezza/POS; da aggiornare dopo il blocco corrente. Non verifica i tipi. |
| `git diff --check` | Passato nell'ultima esecuzione. |
| Link statici | 300 destinazioni letterali riconosciute dalla mappa; 588 espressioni dinamiche escluse; nessun candidato non dichiarato. Non dimostra correttezza di ruoli, query o collegamenti dinamici. |
| Typecheck globale | Non concluso. Le esecuzioni superate sono state interrotte; ultima sessione propria 56693 fermata dopo le successive modifiche. Nessun typecheck proprio attivo. |
| Build completa | Non conclusa: esecuzione con 4 GB in esaurimento memoria; successiva con 8 GB rimasta senza esito per oltre cinque ore e fermata. Generatore PDF preventivi compilato in precedenza; non modificato. Build e prerender da concludere prima di pubblicare. |
| ESLint | Non globalmente verde. Gli errori React Compiler nei file preesistenti sono stati confrontati con un checkout pulito alla stessa base. Errore iniziale del meteo Attività corretto. Vedere dettagli sotto. |
| Audit dipendenze Bun | 4 advisory moderate preesistenti, nessuna alta o critica. Nessun pacchetto o lockfile modificato. `npm audit` non eseguibile senza package-lock; non creato un secondo lockfile. |

Lint aggiuntivo dei blocchi più recenti:

| File o blocco | Esito |
|---|---|
| CE, cassa, piano, cursori e relativi test | Nessun nuovo errore nei controlli mirati registrati. |
| GiornaleLavori | 1 errore e 6 warning, identici alla baseline. |
| TaskDialog | Zero errori, 9 warning identici alla baseline. |
| OfficeWorkspace e relativi test | Zero errori e warning. |
| AggiungiArticoloDialog | 6 errori e 1 warning identici alla baseline. |
| CreaFatturaDialog | 5 errori e 6 warning identici alla baseline. |
| AssignSerialsDialog, SicurezzaCommessa | Zero errori e warning. |
| DocumentiSicurezza, nuovo test upload, SicurezzaCantiere | Zero errori e warning. |
| PosSezioni | Zero errori e warning dopo rimozione dell'import locale inutilizzato tecnicaPosVuota. Il simbolo era presente solo nell'import; funzione e modulo conservati. |

## Collaudo dell'interfaccia

La checklist per percorso contiene i flussi aperti e i limiti: **PARZIALE non significa collaudo completo**. Un titolo o uno skeleton non sono stati considerati dati caricati.

Non effettuati invii email/SMS/WhatsApp, approvazioni, firme, pagamenti, cancellazioni, cambi di permessi, acquisti o sincronizzazioni esterne. Nessun file reale caricato per provare un pulsante. Le modifiche temporanee a bozze non salvate sono state annullate.

Casi recenti confermati nell'interfaccia:

- CE mensile e consuntivo: apertura del mese corretto da tastiera e ritorno del focus. Cassa: nomi delle celle e focus, desktop e mobile.
- Piano industriale: coerenza fra menu scenario, pulsanti e contenuto; ipotesi nominate. Cursore del taglio nelle planimetrie: nome corretto e freccia da 50 a 51, senza persistenza.
- Commessa: barra di navigazione senza overflow alle larghezze effettive di 375, 768, 1280 e 1920 CSS px. Sottoviste e azioni restano parzialmente verificate, come indicato nella checklist.
- Fattura da commessa: nomi di clausole, metodo e data; selezione di profilo/rata/scadenza. A 375 CSS px nessun overflow e footer raggiungibile, senza creare fatture.
- Upload sicurezza: tutti e tre i contesti aperti e annullati — archivio generale, preset DURC da commessa, preset PSC dall'editor POS. Nel POS è stata annullata la sola bozza temporanea: flag PSC ripristinato e barra delle modifiche scomparsa.
- Moduli sicurezza: label di DUVRI, verbale, subappaltatore e adempimento confermate. DUVRI e adempimento a 375 CSS px con footer raggiungibile; verbale e subappaltatore controllati a 300 CSS px, ancora da riconfermare a 375. Upload a 375 senza overflow.
- POS: 11 sezioni espanse, quattro selettori e input file nominati. Nessuna approvazione, firma, AI o salvataggio.
- Contatto e appuntamento CRM: ultima modifica Annulla confermata a 375 CSS px, con azione finale raggiungibile e nessun overflow.

Il rapporto fra viewport nominale e CSS pixel è cambiato durante il collaudo. Le misure valide derivano da `innerWidth`, senza assumere lo zoom. La navigazione mobile della sicurezza nasconde Figure, DUVRI e Subappaltatori per una scelta esistente, conservata. I loro moduli sono stati aperti da desktop e poi ridimensionati: questo non li rende raggiungibili dai menu mobili.

## Sessione e accesso

Dopo due ritorni al login sono stati consultati i log Auth tramite connettore Supabase, in sola lettura e filtrati per referer localhost/127.0.0.1:8096 in una finestra di due ore. Gli aggregati riportano `session_not_found` (403) e `refresh_token_not_found` (400 durante il rinnovo). È confermata l'invalidità lato server; la causa iniziale dell'invalidazione non è dimostrata. I timeout di rete osservati nel browser restano un riscontro distinto.

I 58 test esistenti di recupero, revoca, scadenza e storage sono passati, inclusi nel cumulativo. Nessuna modifica all'autenticazione o alle protezioni. L'utente ha poi ripristinato l'accesso e il collaudo è ripreso. Non salvati token, email, IP o identificativi utente dei log.

Il worker Vitest 26421 è stato interrotto con autorizzazione esplicita. I cinque controlli TypeScript di altre sessioni (8765, 87144, 95323, 95536, 97398) sono stati lasciati attivi come richiesto.

## Prove visive sicure

Screenshot salvati senza tabelle di contatti o documenti personali:

- `/tmp/eic-revisione-importazione.png`
- `/tmp/eic-revisione-calendario-mobile.png`
- `/tmp/eic-revisione-commessa.png`
- `/tmp/eic-revisione-fattura-commessa.png`
- `/tmp/eic-revisione-fattura-mobile.png`
- `/tmp/eic-revisione-sicurezza-upload-mobile.png`

Non salvati snapshot delle tabelle con dati personali. Le osservazioni temporanee del browser non costituiscono documenti di audit persistenti.

## Lotto planimetrie e fiscalità successivo al cumulativo 587

Planimetrie: 2 file e 24 test passati (`/tmp/eic-azienda-pianta-salvataggio-test.log`), compresi i due nuovi casi del salvataggio protetto e recupero bozza. F24: 8 test passati dopo la correzione delle etichette (`/tmp/eic-azienda-f24-test.log`). Non sommare questi numeri al cumulativo senza una nuova esecuzione della selezione unificata.

Nel browser visitate le quattro viste contabili e le quattro sezioni fiscali. I moduli F24 e nuova garanzia sono stati aperti e annullati; associazioni label/id confermate, incluse le varianti attiva e passiva. Archivio anno 2026 caricato con 568 documenti, prima pagina; caricamento aperto e richiuso, senza file. Etichette tipo, anno, file e note associate. Nessun pagamento, conferma liquidazione, invio, svincolo o registrazione. Filtri completi, dettagli, altri periodi e responsive restano parziali.

F24Generator e RitenuteGaranzia: lint zero errori e warning. Sintassi di 88 file senza errori e diff check passati prima dell’ultima modifica ArchivioUploader; aggiornare alla chiusura del lotto. Build e TypeScript globali rimangono non conclusi.

## Firma e formazione

Cumulativo successivo: 61 file, 632 test passati (`/tmp/eic-azienda-test-cumulativo-firme.json`). Comprende fiscale, archivio, firma e planimetrie; precede il lotto Formazione. Il primo cumulativo fiscale aveva due errori di stile in fiscalSectionLayout, riprodotti sul checkout baseline. Rimosse aspettative obsolete su font/padding, conservati titoli, sfondo, saldi e azioni. Il test statico admin Portale richiedeva il tag label senza attributi: reso compatibile con htmlFor, mantenendo la verifica del contenitore condizionale admin.

Formazione: sei file, 62 test passati; successivi tre file su stati/aggregazione/paginazione: 7 test passati; ripetizione admin e hook: 11 test passati. Cumulativo 67 file concluso con 693 passati e un errore nel precedente regex admin; corretto e ripetuto come sopra, da rieseguire unificato includendo il nuovo hook. Non dichiarare ancora il nuovo cumulativo verde.

UI reale: riepiloghi a zero coerenti con le iscrizioni lette, schede corso e dettaglio aggiornati, modulo materiale annullato, catalogo Portale e panoramica/lezione GUIDADEMO aperti. Note/chiarimenti/attestato erano messaggi senza operazioni: ora esplicitamente non disponibili; stati disabilitati verificati, Registro presa visione attivo. Nessuna iscrizione, avanzamento, firma, pubblicazione o messaggio prodotto.

Lint Portale: 8 errori set-state-in-effect e 8 warning, stessi conteggi e regole della baseline. API, helper statistiche, hook e nuovi test: zero errori/warning. Typecheck propri 51104 e 25620 interrotti perché superati da successive modifiche: nessuno dei due costituisce verifica completa. Nessun processo TypeScript esterno toccato.

Immagini ispezionate: `/tmp/eic-revisione-template-firma.png`, versione mobile a 375 px, e `/tmp/eic-revisione-formazione-riepiloghi.png`. Ultima `/tmp/eic-revisione-formazione-azioni.png` ancora da ispezionare.

### Esito aggiornato Formazione e tastiera

Cumulativo 68 file, **697 test passati**, `/tmp/eic-azienda-test-cumulativo-formazione-stati.json`. Supera il precedente cumulativo 67 file con un regex statico obsoleto.

Dopo il cumulativo, verifica tastiera reale ha mostrato che Shift+Tab dal ritorno della lezione raggiungeva Silvio dietro la pagina a tutto schermo. Sostituito il portale manuale con DialogPrimitive della dipendenza esistente, conservando layout/contenuti. Ora focus iniziale sul ritorno, ciclo inverso sull’ultimo controllo della lezione, Esc chiude e ritorna alla scheda selezionata. Verificato desktop e 375 px, scrollWidth 375; ritorno con nome anche mobile. Nessuna mutazione o modulo completato. Ripetizione mirata test e lint in corso, non confondere il controllo sintattico con typecheck globale.

Ripetizione dopo gestione focus: 4 file, 35 test passati; sintassi finale 101 file zero errori; diff check passato. Lint Portale ancora 8 errori/8 warning identici alla baseline, API/helper/hook zero. Nessuna verifica globale build/TypeScript conclusa.

## Render AI: filtri, tastiera e collegamento CRM

Infissi hub, configuratore passo iniziale, galleria e dettaglio esistente visitati; Bagno hub e configuratore iniziale. Nessuna analisi senza foto (pulsanti disabilitati), nessun upload/generazione. Link nativi alle sessioni verificati con Invio. Galleria desktop: ricerca senza risultati e reset; mobile375: Collegati→0, Mostra0 e reset, larghezza senza overflow. Slider confronto da tastiera50→55→50. Selettori CRM nominati in dettaglio e configuratore Bagno; nessuna selezione reale.

Bug concorrente della rimozione CRM riprodotto con API mock: doppio clic portava a4 scritture. Dopo callback atomico/guardia/stato applicato al successo: una richiesta, errore mantiene la vista precedente, nuovo tentativo e setter locali compatibili. Tre nuovi casi e due file pertinenti esistenti: **3 file,7 test passati**, `/tmp/eic-azienda-render-crm-dopo-test.log`. Cumulativo71 file in esecuzione, non ancora concluso.

Sintassi108 file zero errori, `/tmp/eic-azienda-sintassi-render.json`; diff check passato. Lint Linker/Gallery/Detail/nuovo test zero; Summary1errore set-state-in-effect e Hub1warning any già presenti in baseline. Typecheck aggiornato sessione43392, `/tmp/eic-azienda-typecheck-render.log`, ancora senza esito. Nessuna build conclusa.

Esito cumulativo Render: **71 file e 704 test passati**, `/tmp/eic-azienda-test-cumulativo-render.json`, 117,73 secondi. Typecheck globale ancora senza esito.

## Controllo TypeScript concluso e correzioni

Il check globale `/tmp/eic-azienda-typecheck-render.log` è terminato con **48 errori in17file della revisione**: 1compatibilità del locale parziale nel calendario,16inferenze null/array dei mock,16return type dei mock,15opzioni exact non previste da Testing Library. Correzioni applicate, senza allentare tsconfig o usare any. Il calendario ora completa il locale parziale con quello italiano; tre test dedicati passati. Test di lingua parziale reso deterministico con mode single e today fisso.

Nuovo check con cache separata in corso, sessione39119, `/tmp/eic-azienda-typecheck-corretto.log`; esito non ancora disponibile. Il cumulativo71file è ripartito dopo le correzioni (sessione73034, `/tmp/eic-azienda-test-cumulativo-tipi.json`). Non dichiarare TypeScript verde finché non concluso. I cinque processi esterni negati dall’utente sono rimasti attivi.

Esito dopo i tipi:71file,705test passati (`/tmp/eic-azienda-test-cumulativo-tipi.json`). Secondo check TypeScript terminato con un solo errore residuo nel mock costi; return type esplicito applicato. Incrementale sessione29840ancora in corso. Dopo la correzione, test costi/calendario5passati; calendario con opzioni parziali e domenica iniziale3passati. Build non ancora eseguita su questa versione.

### Primo TypeScript pulito

Il check incrementale sessione29840 è concluso con **exit0 e nessun errore**, dopo la correzione del tipo del mock costi. Si sta verificando anche l’ultimo affinamento del locale parziale e il pulsante Facciata (sessione15453, `/tmp/eic-azienda-typecheck-finale-lotto.log`). Non dichiarare la build conclusa: non ancora avviata su questo lotto.

Facciata: caricamento raggiungibile con Tab, nome accessibile esplicito. Lint1errore set-state-in-effect identico alla baseline. Screenshot `/tmp/eic-revisione-render-facciata-upload.png` da ispezionare. Altri8ritorni nelle famiglie dei dettagli render nominati; conferma UI Stanza, Pavimento e Facciata, resto da visitare.

## Nuova base locale richiesta dall’utente

Integrati49commit fino a033e0b7dd, coincidente con origin/main al controllo finale. Backup127file e patch in `/private/tmp/eic-sync-748210577f58`; stash mantenuto. Nessun conflitto; tutti i file della revisione conservati,3auto-merge esaminati e nuove funzioni mantenute. Nessun checkout esterno modificato, nessun push o applicazione di migrazioni.

Localhost8096riavviato (sessione98720), reload e sessione verificati, caricamento Persiane da tastiera ancora presente. Nuova sintassi119file senza errori e diff check passati. Ripetizione72file e TypeScript globale in corso sulla nuova base: risultati ancora da leggere. I705test e i check TypeScript puliti precedenti appartengono alla base precedente e non provano questa integrazione.

Esito test sulla base aggiornata: **72 file, 706 test passati**, `/tmp/eic-azienda-test-main-aggiornato.json` (138,89 secondi). Screenshot locale aggiornato Persiane ispezionato. Il typecheck globale resta in corso.

Nuova base: TypeScript sessione27186conclusa exit0 senza diagnostici, log `/tmp/eic-azienda-typecheck-main-aggiornato.log`. Ultimo incrementale95966sulle sole etichette dettaglio Persiane ancora in corso. Test72file/706passati restano l’ultimo cumulativo completo. Nessuna build eseguita su questa base.

Dopo il nuovo accesso: Demo Azienda2 confermata; dettagli Persiane completato/fallito e nuove etichette italiane verificati, poi Tetto fino a dettaglio completato. Nessun upload, generazione, modifica CRM o condivisione. Pergole in corso.

## Esito completo del lotto aggiornato

- **Test:72file,706passati**, `/tmp/eic-azienda-test-main-aggiornato.json`.
- **TypeScript: exit0**, incluso ultimo incrementale delle etichette Persiane, `/tmp/eic-azienda-typecheck-main-finale.log`.
- **Produzione: Vite completato in1m8s**, PWA generata. Prerender ripreso dopo il solo blocco ambientale EPERM sulla porta locale4173: **243/243OK,0falliti**, exit0. Log `/tmp/eic-azienda-build-main-aggiornato.log` e `/tmp/eic-azienda-prerender-main-aggiornato.log`. Non affermare che il primo comando npm sia terminato0: il suo ultimo step è stato completato separatamente.
- Due bundle PDF server rigenerati dal prebuild conservati in copia `/private/tmp/eic-build-generated-11e05a9894a5`, poi riportati alla versione main ricevuta: nessuna modifica funzionale richiesta ai PDF, nessun import di quei bundle nel frontend.

Questi esiti verificano il lotto di codice, non completano la revisione manuale dell’intera area. Nessuna pubblicazione, firma, pagamento, caricamento o comunicazione aziendale eseguita.


### 10/11 — centro render, stati e ripristino

Ricerca moduli senza risultati ora esplicita con ripristino completo e focus al campo. Confermati 14 moduli più link separato Planimetrie della main aggiornata. Contatori root/panoramiche/gallerie distinguono dati non disponibili da zero; nessuna formula o interrogazione modificata. 10 test mirati passati, lint mirato exit0. Build precedente non copre questa patch successiva. Galleria Ristrutturazioni caricata con 2 record, dettaglio completato letto; autore risolto correttamente dopo caricamento (inizialmente Non disponibile); testi tecnici da approfondire. Nessuna comunicazione, generazione o scrittura reale.


### 10/11 — render generici, dettaglio e verifiche aggiornate

Cumulativo 73 file/714 test: 711 passati, 3 timeout a 5s in posEditor (log /tmp/eic-azienda-test-render-filtri.log, exit1). Riesecuzione isolata POS con timeout invariato: 27/27 passati in19,21s, /tmp/eic-azienda-pos-isolato-render-filtri.log. Non chiamare verde il singolo comando cumulativo. TypeScript patch filtri/contatori concluso exit0, /tmp/eic-azienda-typecheck-render-filtri.log. Nuovo incrementale dopo patch dettaglio attivo sessione33447, /tmp/eic-azienda-typecheck-render-generici.log.

Altri test dopo le descrizioni italiane e rimozione maiuscole forzate sui tag liberi: 3 file/108 passati (technicalBridge98, filtri8, sessioni2), /tmp/eic-azienda-render-generici-test.log. Dettaglio generico: lettura fallita distinta da sessione assente, retry e ritorno alla galleria; maybeSingle per distinguere assenza da errore server. Due test UI passati, lint dettaglio/test exit0, /tmp/eic-azienda-render-dettaglio-errore-test.log. Nessun cambiamento al generatore o prompt.

Controlli backend rinominato Dettagli di elaborazione e reso richiudibile con details/summary nativi, contenuti preservati. Browser Pavimenti esterni: Invio apre, Spazio richiude. Scarica render confermato, autore arriva correttamente dopo caricamento. Panoramica/nuova/galleria/dettaglio Pavimenti esterni, Giardini, Porte blindate visitati; render completati rispettivamente2/2/1. Nuovo Porte interne e panoramica desktop/mobile375 visitati; galleria mobile appena aperta, da leggere dopo caricamento. Nessun upload o mutazione.


Porte interne mobile375: prima fase, ritorno alla panoramica dal pulsante globale Torna indietro, galleria1, dettaglio completato caricati, nessun overflow orizzontale. Manda al cliente prepara l’immagine e invoca il foglio nativo di condivisione: nel browser incorporato il pulsante è rimasto occupato, nessun foglio né destinatario osservato, nessun invio effettuato. Rientro in galleria riuscito. Non considerare verificato il flusso di condivisione: richiede telefono reale o mock isolati. Build aggiornata in corso sessione37551 (/tmp/eic-azienda-build-render-finale.log), backup dei due bundle generati in /private/tmp/eic-build-final-current.json; al termine conservare generati e ripristinare soltanto i due file ai byte precedenti, senza annullare modifiche altrui.


### 10/11 — verifica cumulativa e documenti aziendali

100 file, 1.052 test tutti passati con maxWorkers1, timeout invariato: /tmp/eic-azienda-test-render-impostazioni-finale.log/.json; elenco /tmp/eic-azienda-test-files-render-impostazioni-finale.json, 163,89s. Include 26 file di impostazioni della main aggiornata. I precedenti tre timeout POS non si ripetono. TypeScript generici concluso exit0, /tmp/eic-azienda-typecheck-render-generici.log. Build intera npm run build exit0, /tmp/eic-azienda-build-render-finale.log, 243/243 prerender; bundle server rigenerati conservati e ripristinati ai byte pre-build (manifest /private/tmp/eic-build-final-current.json). Nessun deployment.

Patch SUCCESSIVA a build/TypeScript: SettingsDocumentiAzienda. Tre select del modulo associate a Label; nomi Modifica/Elimina con titolo documento. Creazione e rinnovo: guardia sincrona ref, fieldset disabilitato durante richiesta, chiusura da X/Esc impedita durante richiesta. Nessuna modifica ai dati inviati o alle regole di rinnovo/preavviso. Nuovo test documentiAziendaSalvataggioProtetto: 4/4 passati, /tmp/eic-azienda-documenti-impostazioni-test.log; lint pagina/test exit0, /tmp/eic-azienda-documenti-impostazioni-finale-lint.log. Necessario nuovo TypeScript per questa patch; non attribuirle la build precedente.

Browser: Il mio profilo4 schede; tastiera Calendari→Email con URL. Notifiche13 switch, sola lettura. Profilo aziendale sezioni caricate e Salva dati inizialmente disabilitato, nessuna scrittura. Documenti6, nuovo aperto/annullato desktop/mobile375; tre select nominate, nessun overflow; screenshot sicura /tmp/eic-documento-azienda-modulo-mobile.jpg. Prima vista mobile scorrevole, footer in basso da verificare dopo scroll. Nessun invio o upload.

Residuo concreto individuato nel codice del documento: preavviso ammesso da0 ma Number(preavviso)||30 trasforma0in30. Non corretto: verificare prima il significato previsto negli avvisi e coprirlo con test del payload. Lettura elenco documenti non espone isError: verificare errore distinto da elenco vuoto prima di segnare completo.


### 10/11 — documenti completamento guardie e pipeline

Documenti azienda: anche lettura fallita distinta da elenco vuoto, retry e contenuto precedente segnalato come ultimo caricamento. Carica più file ora vero Button, prima label non raggiungibile correttamente da tastiera. Preavviso0preservato, intero0..365validato: regola verificata nelle migrazioni documenti_azienda (constraint0..365 e stato current_date+preavviso), nessuna migrazione modificata. Totale12test mirati passati dopo patchfinale; lint pagina/test0/0. TypeScript documenti exit0, /tmp/eic-azienda-typecheck-documenti-impostazioni.log. Build precedente non include queste patch.

PipelineStagesConfig: nuova fase locale e rimozione lasciavano bozza non nulla anche ripristinando contenuto. modifica ora azzera la bozza quando campi e ordine corrispondono ai salvati (le posizioni numeriche possono non essere consecutive). Aggiunto Annulla modifiche senza server, ritorna focus ad Aggiungi una fase. Due test mirati passati, lint0/0; UI reale conferma aggiunta/rimozione→nessun avviso e annullamento→focus corretto. Nessuna scrittura reale. Regressioni adminPipelineSettings+doc/pipeline in corso sessione95855; TypeScript successivo alla pipeline attivo90256, /tmp/eic-azienda-typecheck-pipeline-impostazioni.log.

Altre viste iniziali, tutte parziali: Squadre2schede e nuovo annullato, Commesse generali3modelli sola lettura, Acquisti/materiali, Cartelle documenti, QR4schede e nuovo annullato, Motivi perdita, Listino11aree presenti e nuovo prodotto4modalità prezzo solo in locale. Nessun permesso modificato, OAuth, camera, QR, scansione, file o prodotto creato. Prodotto step1poi4step bloccati senzaID: da testare confixture. Ultima UI: URL /azienda/impostazioni/listino dopo ritorno; snapshot ancora editor durante transizione, confermare caricamento prima di giudicare bug. Viewport1280×900.


### 10/11 — sopralluoghi, conferma firma e risultati

Cumulativo impostazioni **104 file/1.081 test passati**, /tmp/eic-azienda-test-impostazioni-completo.log/.json,237,50s. Nessun file in comune con il gruppo sopralluoghi seguente.

Sopralluoghi: primi37file369passati/3falliti (energySurvey: AuthProvider mancante nel fixture dopo dipendenza ImportaVociDialog, non regressione di produzione). Aggiunto contestoAuthsimulato; suite finale **38 file/375 test tutti passati**, /tmp/eic-azienda-sopralluoghi-suite-finale.log/.json,46,48s. Totale distinto dei due gruppi142file/1.456test (due comandi separati, non un unico comando globale).

SignaturePad vecchio usava update diretto senza controllarne error: poteva mostrare Firma registrata dopo rifiutoDB. Nuovo test3casi falliti prima, /tmp/eic-azienda-firma-regressione-prima.log; dopo correzione API condivisa updateSurvey (selectsingle+error), guardiaref, nome/canvas bloccati durante richiesta, annullamento nominato: 3/3passati, retry e callbacksolo dopo conferma. PaginaFirmaCliente impedisce riapertura per client_signature_at/statussigned. Nessuna firma o upload reali. Possibili file già caricati prima di rifiuto update restano da valutare: nessuna cancellazione automatica introdotta.

Correzione della letturaUI: il recordDEMOaperto non era firmato. Firma registrata era solo il titolo della sezione; corpo verificato=Nessuna firma registrata. Ora il titolo è Firma cliente in assenza di timestamp. La guardia su recordfirmati è verificata confixture, non con un record reale firmato. Canvas aperto e annullato senza tratto, segreto o invio.

NuovoSopralluogo: tre passi e tre modalità di collegamento, calendario italiano, mobile375 senzaoverflow. Headerback andava alpassoprecedentema si chiamavaTornaaisopralluoghi: nome reso dinamico, 10testcreazione passati, nessunalogicacambiata. Screenshot sicura /tmp/eic-sopralluogo-nuovo-mobile.jpg. Firma e navigazione source lint0/0; TypeScript firma /tmp/eic-azienda-typecheck-sopralluoghi-firma.log conclusoexit0, predates solo titolo condizionale SurveyWorkspace che ha lint0/0. Build più recente predates questo gruppo sopralluoghi; non attribuirle le patch successive.


### 10/11 — Sales OS e reportistica

SalesOS5schedevisitate. Config:12inputnumerici senza nome accessibile e textarea senzaassociazione; Label/iduseId associati e confermati nelDOMtutti13. Soloetichette/copia, nessun pesooformula modificati. Stage→Fase, Threshold→Soglia, TierICP→LivelloICP; spiegazionepunteggioitaliana. Testlogicaconfig/periodi/contratto20passati, /tmp/eic-azienda-sales-etichette-test.log. Lint5errori/2warning identici agli stessi fileHEAD033, confronto /tmp/eic-azienda-sales-lint-confronto.json: nessuna nuova regola/conteggio; non dichiarare lintverde. TypeScript/build precedenti predates queste soleetichette.

Reportistica5areeaperte, GoogleAds non collegato (avviso di configurazione, non errore dati). NessunOAuth/export o sincronizzazioneavviati. Sottoschede ancora parziali. UI successiva: clic Pubblicità ma snapshotancoraReportistica durante caricamento: leggerecontenutonuovo prima di registrarevisita.

### Pubblicità — wizard Meta e accessibilità (10 novembre)

Letti il tour iniziale di cinque passi, le quattro schede e i cinque passi del wizard avanzato Meta. Solo valori del modulo locale: nessun salvataggio bozza, collegamento, richiesta AI, upload, modifica Spend Guard o pubblicazione. Uscita mediante “Torna alle campagne”, lista ancora vuota.

Riprodotto nel browser: il solo `https://` produceva “URL valida”, “Privacy ok” e abilitava Continua a causa del fallback legacy. Estratto senza modificarne i criteri il validatore già presente nel wizard; ora condiviso da messaggio, riepilogo e fallback. Il formato incompleto blocca Continua; un dominio completo permette di avanzare. Il controllo verifica il formato, non esistenza o conformità della policy. Sei test dedicati passati (`/tmp/eic-azienda-meta-privacy-test.log`), compreso recupero senza perdita del disclaimer. Lint del componente: zero errori e tre warning, identici alla versione HEAD.

Associati i nomi alle sezioni Introduzione/Privacy/Grazie e 78 controlli Input/Textarea/SelectTrigger già contenuti in Field nel modulo Pubblicità; nomi minimo/massimo distinti. Verificati i cinque nomi Spend Guard nel DOM senza modificarne i valori. Selettori modalità/piattaforma/canale con stato premuto; etichetta offerta e suggerimenti associati.

Restano da verificare Google, campagne esistenti, mobile, ruoli e stati errore. Il semaforo 14/14 del wizard usa anche contenuti precompilati e non equivale ad asset generati o connessioni operative: la scheda creatività mostra 0/100 e connessione Meta assente. Non dichiarare pubblicabilità reale.

### Social — lettura completa delle sei viste iniziali

Compositore, Calendario, Griglia, Messaggi, Statistiche e Galleria aperti su desktop. La sola apertura Messaggi non cambia lo stato dei messaggi: markRead è sul click del singolo elemento, non eseguito. Nessuna risposta o comunicazione. Account non collegati; Statistiche mostra assenza collegamenti. Demo media e messaggi limitati alla Demo Azienda già da main. Aggiunto aria-pressed ai pulsanti delle sei viste. Mobile375: compositore/calendario documentWidth375; tre viste telefono intenzionali secondo sorgente, nessuna modifica alla struttura. Non digitato testo nel composer (ha autosave locale).

Suite Social/Ads: 17 file, 173 test passati, `/tmp/eic-azienda-social-ads-test.log`. Non sommare ingenuamente ai gruppi precedenti: contiene test già eseguiti altrove. Lint AdsManagerBeta dopo label/validatore: 2 errori e 8 warning, identici per regole/conteggi a HEAD033, `/tmp/eic-azienda-ads-lint-confronto.json`. Non è lint globale verde.

### Reputazione — due regressioni riprodotte e corrette

1. Il mount eseguiva upsert del link pubblico con active=true, slug calcolato e settings predefiniti, anche se esisteva una riga disabilitata o personalizzata. Test rosso prima: `/tmp/eic-azienda-reputazione-link-prima.log`. Ora conflitti ignorati (vincolo company_id verificato nella migrazione esistente), riga conservata; nuova query tipizzata legge slug/stato effettivi. Link disattivato segnalato, copia bloccata anche se lettura fallita/in corso. Predisposizione iniziale di un link mancante rimane funzione esistente.
2. Un’azienda reale senza dati riceveva testimonianze/campagne/eventi seed. Test rosso prima: `/tmp/eic-azienda-reputazione-esempi-prima.log`. Ora seed solo Demo tramite funzione condivisa isDemoCompanyId; ripuliti dal fallback locale solo gli ID degli esempi noti, preservando contenuti aziendali. Dopo lettura DB riuscita vuota, nessun ripiego su cache nelle aziende reali.

Cinque test passati: preservazione riga disattiva e slug UI/copia bloccata; predisposizione nuovo link; azienda reale vuota; Demo mantiene esempi; fallback offline conserva contenuti reali e rimuove esempi. `/tmp/eic-azienda-reputazione-link-dopo.log`. Lint test0/0; pagina11errori0warning identici ai conteggi/regole HEAD, nessuna disabilitazione regole.

UI Demo: cinque schede iniziali aperte senza azionare invii, AI, copia, simulazioni o switch. Tre filtri pressed e sette select nominati verificati. Desktop1280 e Dashboard375 senza overflow; su telefono solo tre schede per scelta preesistente.

**Limite da dichiarare:** prima di rilevare l’effetto nel sorgente la pagina era già stata aperta; il codice preesistente aveva quindi tentato l’upsert automatico. Esito remoto non verificato. Non affermare che l’apertura sia stata priva di scritture né ripristinare valori senza stato precedente attendibile. Il fix locale evita sovrascritture future dopo pubblicazione, non è già online. Nessun aggiornamento diretto DB effettuato dall’agente.

### Mezzi e inventario — stato parziale

Redirect Mezzi→Manodopera verificato. Ricerca senza risultati mostra messaggio distinto, poi ripristinata; raggruppamenti Per tipo/Dove sono. Nuovo mezzo aperto/annullato, nessun libretto letto o caricato. Selettore condiviso OrderSelectCombobox ora accetta ariaLabel (default Commessa), chiamata MezzoFormDialog Cantiere (commessa). Lint modulo0/0, selettore2errori0warning identici a HEAD.

Mezzo esplicitamente DEMO: otto schede iniziali desktop aperte (Scadenze, Tagliandi, Fatture, Foto, Viaggi e tratte, Cantieri e km, Storico, Segnalazioni), nessuna azione operativa. Mobile375 documentWidth375; due viste solo desktop come scelta già presente. Non equivale al collaudo di tutte le varianti attrezzatura/quantità. Suite esistente13file116test passata `/tmp/eic-azienda-mezzi-test.log`.

Inventario elenco: fixture errore restituiva falso “Nessun inventario fatto finora” (rosso `/tmp/eic-azienda-inventari-prima.log`), ora alert distinto, retry e identificazione elenco eventualmente precedente. Nuovo giro aperto/annullato: focus prima BODY, poi fix hook condiviso ritorna al bottone Nuovo giro, verificato UI. Tre test passati `/tmp/eic-azienda-inventari-dopo.log`, lint0/0. Nessuna conta, chiusura, segnalazione o richiesta fotocamera. Dettaglio giro ancora non verificato.

TypeScript precedente `/tmp/eic-azienda-typecheck-meta-privacy.log` exit0; successivo session3347/logtypecheck-reputazione in corso, avviato prima delle sole modifiche Mezzi/Inventario. Build finale da aggiornare dopo completamento del gruppo.

Ulteriore verifica Attrezzature: elenco caricato, nuovo modulo sia Un pezzo sia A quantità letto; campi nominati e Crea disabilitato senza nome/quantità. Nessuna creazione. Alla chiusura il focus tornava a BODY: hook condiviso inizialmente insufficiente perché Input autoFocus precedeva la cattura dell’origine. Rimosso solo autofocus esplicito (relativo useIsMobile diventato inutilizzato rimosso); focus iniziale gestito da Radix sul primo controllo e chiusura Annulla/Escape torna al pulsante Nuova attrezzatura. Entrambi verificati nel browser. Nessun input aperto automaticamente su telefono. Persistenza/duplicazione durante salvataggio resta da verificare con fixture (MezzoForm invia non ha guardia ref e close pending).

MezzoFormDialog salvataggio: regressione riprodotta con fixture — doppio clic produceva due mutateAsync (`/tmp/eic-azienda-mezzo-salvataggio-prima.log`). Guardia ref condivisa tra contenitore/modulo e stato locale coprono creazione e successivo allegato libretto. Campo disabilitato, footer disabilitato, X/Esc filtrati dal contenitore mentre richiesta in corso; in errore si sblocca mantenendo dati, successo chiude una volta. Due test verdi `/tmp/eic-azienda-mezzo-salvataggio-dopo.log`, lint0/0. Nessun mezzo/file creato sul servizio reale. Lettura AI/caricamento libretto, chiusura durante quella fase distinta non ancora collaudati. In corso suite15fileMezzi aggiornata e TypeScript3347 ancora attivo.

Attrezzatura a quantità: aperta scheda Montaggi e dialog Monta su cantiere, variante Deposito/prestito, Rientro e conferma Elimina montaggio, sempre Annulla. Nessun montaggio/rientro/eliminazione eseguito. Focus prima BODY su Monta; aggiunto hook focus condiviso ai tre dialog. Browser conferma ritorno ai rispettivi pulsanti Monta, Rientro ed Elimina dopo Annulla. LintMezzoMontaggiSection0/0. Salvataggio/chiusura pending dei dialog montaggi resta da provare con fixture, non dichiararlo protetto. SuiteMezzi aggiornata15file121test passata prima di questi soli hook.

Mezzo Fatture: test lettore mostrava impropriamente Conferma/Togli (rosso prima). Parent ora passa stesso puoModificare delle altre sezioni. Quattro test ruolo lettore/editor/admin/solalettura verdi, lint0/0; solo guardia UI, backend/RLS non certificati. Fonte `/tmp/eic-azienda-mezzo-fatture-permessi-dopo.log`. Build aggiornata session66175 e TypeScript70275 ancora in corso: non presentarli come passati. NuovoTicket letto senzacreare: etichette/switchnonassociati, focusperso; sorgenteindica possibileduplicate su retriesalvataggioparziale, da riprodurre in fixture prima del fix. DettagliTicket aggiornano automaticamente last_read_at, non aperti in questa fase.

### Build checkpoint Marketing/Mezzi

`npm run build` concluso exit0, log `/tmp/eic-azienda-build-marketing-mezzi.log`: 11.194 moduli Vite, prerender243/243OK, zero falliti. Due bundle server conservati come .generated e ripristinati ai byte prebuild (manifest `/private/tmp/eic-build-marketing-mezzi-current.json`). Comprende fino alla guardia permessiMezzoDetail e focusMontaggi. **Non comprende** successive etichette/focusTicket/Impianto. Nessun deploy. TypeScript70275 ancora in corso, non confonderlo con buildpassata.

Assistenza/Manutenzioni: visitati elenco, filtroInRegola vuoto (messaggio corretto), Kanban radio già accessibile. Filtri rapidi mancano pressed e ricercasenzanome; annotati, non ancora modificati. Nuovo impianto3passi visitati conClienteDemo+Infissi selezionati solo localmente; attivate opzioniPiano/PrimoIntervento/Contratto per leggerecampi, Chiudi resetta tutte le bozze, nessuna creazione/schedulazione/contratto. SchedaImpianto letta in configurazioneconcontratto, non azionati fatturazione/comunicazione/esecuzione. DettagliTicket nonaperti perché mount aggiorna ticket_read_status.

Etichette: NuovoTicketForm18controlli più file e rimozioneallegato, NuovoImpiantoWizard20controlli, useId distinti; NuovoTicketDialog eWizardhookfocus; WizardDialogDescription; frecciaCreateCompanyTicket nominata. Lint4file0/0. VerificaUI e tests funzionali nuovi in corso. Nessun fix al retry parziale ancora implementato.

NuovoTicketForm: due regressioni riprodotte prima (doppioinvio/retrymessaggio dopo ticketID). Ora resume sullo stesso ID conosciuto, messaggio/file milestones, partialalert eCompleta ticket, campi congelati dopo primo ID, closepending guard. Quattrotestverdi/mockAPI e lint0/0 in `/tmp/eic-azienda-ticket-parziale-dopo.log`, inclusiallegati e conservazione passaggioODA simulato. Non risolve esito server ambiguo prima che arrivi ID/conferma: niente garanzia idempotenza server. Nessunfile/ticket/messaggioreale creato. VerificaUIlabel/focus Ticket e tutti20campiImpianto completata; mutazionisolo fixture.

Piano manutenzione senza contratto: schema remoto verificato via solaSELECTinformation_schema, nessuna relazione diretta conimpianto; queryschedausaesclusivament econtratto_id. Non considerare questafunzionalitàcorretta. Necessario interventorelazionedati perconservareopzione senzacontratto; decisione separata, niente cambiDbprod eseguiti.

## Dashboard e listino — ultimo lotto locale del 10/11

Correzioni dashboard: clonazione legge l’ultima versione tramite API già esistente e conserva layout/descrizione/icona, errori di lettura non creano copie vuote, guardia sincrona conferma e chiusura. Nuovo overlay Radix, nomi, focus e layout mobile, ricerca libreria aderente al nome; errori elenco e modelli con retry, risultati preesistenti/standard preservati. Builder header e strumenti adattati al telefono, label e pressed. Sola lettura globale prevale su creazione, edit, cancellazione/permessi personalizzati nel hub e save/autosave/scorciatoia nel builder; nessuna modifica di account/RLS.

Listino manutenzione: guardia globale solaLettura e caricamento permessi, mantenuta consultazione admin; modali di modifica/importazione/cancellazione non disponibili in sola lettura. Tre editor con ref sincrona, fieldset e Annulla disabilitati, X/Esc protetti durante save, focusReturn. Errore conserva campi e riabilita (test preesistenti errore/retry restano). Nessuna formula di prezzo, rapporto impianto/intervento o regola DB modificata.

Test: `/tmp/eic-azienda-dashboard-listino-suite-finale.log`, **11file82PASS**. Comprende manodoperaManutenzione38 (3readonly e3pending aggiunti, tutti rossi prima), dashboardClonazione7 (clone4, errori2, readonly1), builderReadonly3, Drilldown5 e test esistenti di margini/finanza/griglia/CompanyDashboard8/Ticket5/Impianto4/Manutenzione5. Non sommare con gruppi precedenti sovrapposti. Lint nuovi cinque file del listino0/0, nuovi due test dashboard0/0; Hub e Builder2errori ciascuno set-state-in-effect identici aHEAD. Diff check passato.

Build `/tmp/eic-azienda-build-dashboard-hub.log` exit0 e243/243, precede ultime patch Builder/readonly/alertHub/listino. Bundle ripristinati esattamente dal manifest `/private/tmp/eic-build-dashboard-hub-current.json`. Non certifica source corrente. TypeScript session69177 ancora attiva, log `/tmp/eic-azienda-typecheck-dashboard-completo.log`; precedente12GB33017exit2 solo null fixture giàcorretto, precedente8GB OOM134. Mai interrotti5TSC altrui. Verifica hash algoritmo SHA256 validata su src/lib/utils.ts: cache precedente ha9file del lotto ancora diversi/assenti, quindi non dichiarare TSC corrente senza nuova cache/esito.

CUA: titolo/descrizione/focus dettaglioVenduto, overlayHub/Esc, nameModalAnnulla, librarymobile input335px entro375, clone vuoto, buildermobile salva dentroviewport e strumenti sotto. Tre modali listino: tutti campi nominati, Annulla restituisce focus aNuovo prezzo/Nuovo intervento/Nuovo impianto. Aliaslistino desktop corretto, mobilelimitazione intenzionale. Nessun salvataggio reale/cambio ruoli. Screenshot safe `/tmp/eic-dashboard-creazione-mobile.jpg`, `/tmp/eic-dashboard-builder-mobile-finale.jpg` visionati. UI attuale tariffe?tab=impianti, nessun dialog/bozza; viewport temporaneo1280×900 richiesto (DOM su builder riportava1600, proporzione1.25, non modificato zoomutente).

## Checkpoint clienti consolidato

- Correzioni applicate a CreateCustomer (pending/created ref, readonly/loading, fieldset/back, nome Note), Builder (CtrlS ripetuto), PannelloLaterale (region/expanded/controls/focus), scheda cliente (errore vs inesistente, riepilogo loading/error senza falso zero, retry e cancellazione bloccata senza riepilogo affidabile), anagrafica e VoceElimina (readonly/loading prevalgono su admin, guardie callback).
- Riproduzioni prima: ClienteCreazione2rossi/1pass; BuilderCtrlS1rosso/3pass; Scheda+Profilo4rossi/11pass e successiva prova profilo/elimina4rossi/2pass. Dopo: cumulativo **15file113PASS** `/tmp/eic-azienda-clienti-blocco-finale-test.log`.
- TypeScript generale **exit0 senza diagnostici**, `/tmp/eic-azienda-typecheck-clienti-blocco-finale.log`, session98103. Cache verificata con SHA256 su tutte192fonti TS/TSX modificate/untracked: nessuna assente o diversa. Nessun processo proprio ancora attivo. TSC precedente69177 interrotto consapevolmente exit143 (fonte superata), solo proprioPID66509 verificato dal log, nessun altro processo fermato.
- Lint3componenticlienti e2test0/0, CompanyCustomerDetail0errori2warning preesistenti. CreateCustomer2errori set-state-in-effect uguali aHEAD. Builder/Hub baseline invariata. Diffcheckpassato. Non dichiarare lint globale verde.
- Ultima build completa `/tmp/eic-azienda-build-dashboard-listino.log`, session86265exit0,243/243zeroerrori. Due bundle già ripristinati dai backup. Precede ultimi ritocchi clienti/CtrlS: indicare questo limite; non chiamarla verifica delle fonti ultimissime.
- UI: otto sezioni demo cliente iniziali mobile/desktop, viewport375 senza overflow,8regiondesktop e expanded corretti; Chiudi torna al pulsante attivo. Dopo nuovo login confermata DemoAzienda2, lettura normale cliente senzaerrori e moduloNuovoCliente vuoto conNote nominate. Nessun cliente/account/file/email/modifica anagrafica/eliminazione reale. Logout contoastsessione/permessi visto, causa non dimostrata.
- CUA fase conclusa, viewport resettato e tabhandoff; completion_summary già emesso. Screenshot corretta `/tmp/eic-cliente-modulo-verificato.jpg` visionata. Non usare cropnote precedente né screenshotlogin come prova risultato.
- Checkpoint utente in `checkpoint-clienti.md`; copertura generale ancora parziale,221voci DA su428 (non428pagine). Restano comunicazioni/altreazioni clienti, InlineFieldtastiera, autosavedashboardconcorrenza e piano senza contratto, oltre alle altre aree. Nessun commit/push/deploy.
