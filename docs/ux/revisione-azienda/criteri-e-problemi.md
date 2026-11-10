# Criteri e registro della revisione

## Architettura rilevata

React 18, React Router, query TanStack, Supabase. L'area Azienda è montata sotto `/azienda/*`; `companyRoutes.tsx` contiene pagine lazy, guard di ruolo/permesso e feature, alias storici e layout annidato Impostazioni. Componenti primitivi condivisi in `src/components/ui`, layout in `src/components/layouts`. La pagina Attività dipende dal ruolo: `AttivitaStaff` per i ruoli operativi, `UnifiedTasks` negli altri casi. Dashboard personale e Regia non sono duplicati eliminabili: hanno visibilità e compiti diversi.

## Modello comune

- Mantenere gerarchia e densità del prodotto: titolo pagina 20–24px, sottosezioni 14–18px, testo operativo 14px e metadati 12px; non applicare riduzioni globali indiscriminate.
- Moduli: etichetta programmatica per ogni controllo, azione primaria a destra, annullamento esplicito, disabilitazione e feedback durante il salvataggio; i contenuti devono restare raggiungibili su telefono.
- Liste: ricerca con nome accessibile, filtri con stato selezionato, conteggi riferiti alla stessa selezione, paginazione che riparte quando cambiano i filtri.
- Email: `EmailComposeDialog` è già riutilizzato dai documenti operativi; preservare account mittente, CC/CCN, allegati, bozze e callback di invio. Valutare i compositori specializzati prima di consolidarli.
- Errori: descrizione utile e azione di recupero. Non sostituire un errore di lettura con uno stato vuoto.
- Pulizia: eliminare solo riferimenti certamente locali e inutilizzati; mantenere i candidati incerti. Nessuna rimozione massiva basata sul solo nome del file.

## Problemi identificati (prima delle modifiche)

| ID | Priorità | Evidenza | Correzione prevista |
|---|---|---|---|
| ATT-01 | P2 | Clic su “Prossimi 7 giorni” lascia selezionato “Aperte”; “Scadute” ha lo stesso handler di solo scroll. Codice e UI concordano. | Collegare i riquadri allo stesso filtro della lista, azzerando la data calendario. |
| ATT-02 | P5/a11y | Select Assegna a, Priorità, Categoria e Stato hanno Label non associata. Il campo di inserimento rapido non ha nome accessibile. | Associare label/id e nominare inserimento e cancellazione del testo. |
| ATT-03 | P4 | ESLint segnala `weekEnd` e `isAdmin` locali non usati. | Rimuovere le due variabili dopo controllo dei riferimenti nello scope. |
| ATT-04 | P5 | In modalità raggruppata i pulsanti di gruppo non espongono lo stato aperto/chiuso. | Esporre `aria-expanded` e collegamento al gruppo. |

## Baseline

- Revisione ff9d53158; worktree dedicato, branch `codex/revisione-area-azienda`.
- Typecheck avviato con `tsconfig.app.json` (il `tsc --noEmit` senza progetto non sarebbe sufficiente).
- Occorrenze di console.log/TODO/FIXME/HACK/any: 2864; è un conteggio di pattern, non di bug.
- npm audit non eseguibile senza package-lock: il repository usa bun.lock. Non generare un lockfile nuovo per aggirare il problema; usare l'audit Bun.
- Lint iniziale di AttivitaStaff: 1 errore React Compiler nel meteo, 30 warning. Non dichiarare lint globale verde.
- Nessun riferimento VITE_SERVICE_ROLE/VITE_SECRET trovato nei sorgenti TS/TSX. Questo controllo non costituisce audit completo di RLS/storage.

## Limiti del collaudo

Non eseguiti invii email/SMS/WhatsApp, approvazioni, firme, pagamenti, cancellazioni o cambi di permessi. I test automatici possono simulare salvataggi ed errori senza toccare dati reali. Non considerare verificata una funzione solo perché compare nella pagina.

## Riscontri aggiuntivi e correzioni progressive

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| ATT-05 | P5 | A 375px cinque righe di approvazione precedono quasi tutto il lavoro personale. | Due righe iniziali su mobile, Mostra tutte/Mostra meno accessibile. Tutte le righe sul desktop. Totale invariato. |
| ATT-06 | P2 | Il selettore contatto/opportunità ignorava errori delle due query. | Errori propagati e messaggio con Riprova distinto da Nessun risultato; nessuna selezione automatica. |
| CLI-01 | P5 | Solo anagrafica mostrava in realtà `portal_disabled`, anche per clienti con commesse. | Etichetta Senza accesso al portale e descrizione precisa. |
| ASS-01 | P5/a11y | Schede assistenza custom senza gestione frecce o collegamento al pannello; filtri e link con sola icona non etichettati. | Tabs condivise, titolo accessibile, filtri e link nominati. Parametri URL conservati. |
| FIN-01 | P2 | Da incassare/Da pagare mostravano anche movimenti saldati. Tutte comprendeva annullate che la summary non contava. | Viste aperte includono da_pagare e parziale; annullate restano raggiungibili col filtro esplicito. Nessun movimento modificato. |
| FIN-02 | P2 | Lettura elenco fallita appariva vuota; errore summary lasciava skeleton. | Errori espliciti e Riprova distinti, export disabilitato se elenco non disponibile. |
| FIN-03 | P2 | Export non applicava tipo e scadute. | Stessi vincoli di stato, tipo e data della lista. Limite export corretto successivamente (FIN-05); ricerca fra le relazioni ancora da completare. |
| FIN-04 | P4/P5 | Chiavi duplicate identiche nel dizionario tipi documento; frecce anno mute; filtri senza stato accessibile; milioni con punto decimale. | Rimossi doppioni, etichette anni, aria-pressed, virgola italiana nel formatter condiviso. |
| COST-01 | P2 | La query dei costi aziendali si fermava a 1000, con totali parziali. | Lettura a pagine da 500, ordine data+id, stesso scope azienda/periodo; errore se fallisce una pagina. Riutilizzato helper esistente. Eliminato il relativo avviso ora superato. Altre fonti del riepilogo restano distinte e richiedono verifica dei propri limiti. |
| MAIL-01 | P2 | Invia documento: anagrafica arrivata in ritardo resettava oggetto, messaggio e stato invio. | Inizializzazione per apertura/documento; precompilazione tardiva solo del destinatario non modificato; invio protetto da ref e chiusura bloccata finché termina. |
| MAIL-02 | P3 | Editor email assegnava HTML ricevuto direttamente a innerHTML. | Sanitizzazione DOMPurify in ingresso e in emissione delle modifiche; formattazione sicura conservata. |
| MAIL-03 | P5 | Tentativo senza destinatari generava un errore di mutazione e due avvisi generici. | Validazione preventiva inline senza avviare la mutation; errori operativi restano gestiti dal flusso esistente. |

Consolidamento email: cliente, committente, richieste d'offerta e documenti operativi usano già EmailComposeDialog. L'invio dei documenti fiscali mantiene un contratto server distinto e viene conservato: unificarlo senza mantenere generazione e salvataggio sarebbe un cambiamento di comportamento.

Pulizia verificata: rimosse due variabili locali inutilizzate in AttivitaStaff; tolta memoizzazione superflua della lista meteo di tre elementi (risolve l'errore lint iniziale); rimossi cinque doppioni identici nelle etichette dei tipi documento. Nessun file o pacchetto eliminato sulla base di riferimenti incerti.

## Calendario, HR e CRM — riscontri aggiuntivi

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| CAL-01 | P2/P5 | Appuntamento: campi non associati; chiusura e modifiche possibili mentre si salva. | Label/id e fieldset disabilitato; guard sincrona per salvataggio/eliminazione e chiusura. Payload invariato. Test di salvataggio e sola lettura. |
| CAL-02 | P5/a11y | Calendario condiviso con navigazione e selezione lette in inglese. | Locale e label italiane di default; override del chiamante preservati. Test selezione/data e override. Contesti condivisi ancora da completare. |
| HR-01 | P5/a11y | Stelle di sola lettura esponevano cinque pulsanti disabilitati per candidato. | Un'immagine con valutazione accessibile; controlli editabili conservati con stato premuto. Verificato in UI. |
| HR-02 | P5 | Attività recenti mostravano nomi tecnici di tabelle HR. | Etichette Richieste, Presenze, Profili e Sedi; fallback Personale. |
| CRM-01 | P5/a11y | Nomi contatti cliccabili come span; ordinamento sugli header non operabile da tastiera; checkbox e icone senza nome. | Link veri, pulsanti di ordinamento e aria-sort, nomi dei controlli e focus visibile; paginazione Precedenti/Successive. |
| CRM-02 | P2 | Inserimento contatto: chiusura durante salvataggio, controlli duplicati ignoravano errori di rete, eccezione senza recupero locale. | Guard sincrona, blocco campi/chiusura, errori dei duplicati propagati, errore inline e bozza conservata. Label associate. 2 test mirati. |
| IMP-01 | P2/P5 | Upload importazione: trascinamento accettava qualunque estensione; file sopra 30 MB ignorato senza feedback; area non raggiungibile da tastiera. | Pulsante semantico, validazione coerente di estensione/dimensione con alert, modalità nominata e rimozione/chiusura nominate. Test senza upload reali. |

### Controlli e limiti emersi

- Test CRM (tabella e modulo): 13 passati. Importazione (nuova validazione e navigazione oggetti preesistente): 10 passati.
- Build con heap 4 GB terminata per memoria esaurita. Successiva esecuzione 6 GB superata; quella 8 GB non ha concluso dopo oltre cinque ore ed è stata fermata. Non dichiarare build riuscita.
- Typecheck globale non concluso nelle esecuzioni iniziali: ambiente con forte pressione di memoria e swap; esecuzioni superate terminate. Non è un esito positivo.
- `fiscalWorkspace.test.tsx`: l’asserzione sulle fonti era già obsoleta nel checkout pulito; è stata aggiornata mantenendo i controlli esistenti e aggiungendo casi sullo scarto e sull’errore di lettura. Esiti aggiornati in verifiche.md.
- Audit Bun: 4 advisory moderate, nessuna alta/critica, dipendenze preesistenti. Nessun aggiornamento dei pacchetti eseguito in questa revisione.
- Screenshot della sola procedura di importazione senza dati contatto: `/tmp/eic-revisione-importazione.png`. Non salvati snapshot o immagini delle tabelle con dati personali.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| CRM-03 | P2/P5 | Nuova opportunità: nomi/campi non associati; caricamento e errore contatti apparivano come “No Data”; creazione contatto precedeva il blocco della mutation opportunità. | Label/id, stati distinti con Riprova; guard e fieldset per l'intera operazione, compresi i salvataggi accessori. mutateAsync conserva lo stesso hook e payload. 5 test, incluso doppio tentativo. |
| CRM-04 | P5 | Azioni delle card Kanban e cambio vista senza nome accessibile. | Nomi contestuali, checkbox nominata e contatto come link; viste espongono stato premuto. 8 test di anteprime passati. |
| PREV-01 | P5/a11y | Preventivo classico: Nome cliente, Email, Telefono, Titolo, Validità, Descrizione e Note senza associazione; selettore contatto e switch finanziamento senza nome. | Associazioni e nomi, preservando campi e flusso. Verificati tre passi vuoti, selettore prodotti aperto/chiuso, salvataggi finali disabilitati senza cliente/voci. 121 test pertinenti passati (inclusi 115 casi handoff). |
| FIN-05 | P2 | Export scadenzario limitato dalla prima pagina REST nonostante limit(5000). | Lettura completa a pagine da 500 con ordine data/id, stessi filtri; test esporta 1003 righe. Ricerca su relazioni ancora da completare. |

ESLint sui file modificati: gli errori React Compiler rilevati nei file preesistenti sono stati confrontati con il checkout pulito alla stessa base: stessi ruleId e quantità per file. L'errore iniziale AttivitaStaff è stato risolto. Verifica finale dopo le ultime correzioni ancora da eseguire.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| CAL-03 | P2/P5 | Calendario CRM: il commento dichiarava guard sincrona ma controllava solo stato React; campi e chiusura restavano attivi. | Ref condivisa fra salvataggio e annullamento, blocco chiusura/campi in attesa, selettori nominati. 15 test pertinenti passati, compreso nuovo caso richiesta pendente; nessuna sync reale. |

Nota responsive: il browser ha zoom preesistente all'80%. Le prime impostazioni viewport nominali non coincidevano con i CSS pixel (375 nominali risultavano 469 CSS). Per il calendario CRM impostati 300 nominali e misurati 375 CSS effettivi; assenza di overflow e azione finale raggiungibile con End. Le altre misure vanno riconfermate leggendo innerWidth, senza modificare lo zoom dell'utente.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| FIN-06 | P2 | Registro IVA: l'errore della query che identifica gli scarti veniva ignorato; poteva esporre dati senza completare quel controllo. | Errore propagato allo stato di recupero già esistente. Regola di esclusione e filtri azienda invariati. Aggiunti casi scarto/esito rete; 40 test fiscali passati in 3 file. |

Risolto il fallimento preesistente fiscalWorkspace: l'asserzione sulle fonti non contemplava la query di controllo scarti documenti_fiscali, introdotta prima della revisione. Aggiornata la lista attesa con commento sulla finalità; non rimossa l'asserzione né indeboliti controlli su aliquota, URL o assenza di scritture. Il nuovo test sull'errore di quella sola query protegge la correzione identificata. Collaudo UI di questa correzione ancora da completare: il browser locale ha iniziato a non rispondere prima di poter riaprire il registro.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| CG-01 | P5 | Avviso rating riformattava i centesimi di una cifra già italiana, per esempio 1.233.948,32,00 €. | Conversione limitata a interi/decimali grezzi completi, preservando cifre già formattate. Raggruppamento migliaia esplicito. Casi legacy, già italiani, negativi e migliaia senza centesimi testati; resa corretta verificata in UI. Calcoli/punteggi invariati. |

Controllo di gestione su telefono: il codice limita intenzionalmente la navigazione a Riepilogo, Cassa e Commesse; gli altri 11 approfondimenti richiedono desktop. Non ampliata questa scelta di prodotto in una correzione cosmetica. Piano industriale, CE e Cash Flow sono stati poi verificati con contenuti reali nei contesti descritti sotto; le prime visite con soli titoli/skeleton non sono state considerate collaudo.

Una ripetizione cumulativa dopo il cambio di data ha rilevato un test calendario dipendente dal giorno reale. Il test ora passa `today` esplicito al componente: nessuna modifica al comportamento del calendario. Il caso di errore e successivo retry dell'opportunità ora verifica anche che il contatto già creato sia riusato: 6 test del modulo passati.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| CG-02 | P5/a11y | I valori mensili CE erano td con onClick: impossibile aprirli da tastiera. Chiudendo il dettaglio si perdeva il focus. | Pulsanti con voce/mese/anno, stesso spazio e handler; descrizione mese nel Sheet e ritorno al controllo origine. Invio e chiusura verificati in UI; test focus passato. Confermati Mensile gennaio e Consuntivo novembre, entrambi con ritorno al controllo di origine. |

| CG-03 | P5/a11y | Rendiconto di cassa: i pulsanti ripetevano il solo importo e perdevano il contesto alla chiusura. | Nomi voce/mese/anno/importo in entrambe le viste e hook comune useDialogFocusReturn condiviso con CE. Dettagli e focus verificati da tastiera su desktop e mobile; 10 test pertinenti (9 rendiconto + 1 focus) passati. Nessun calcolo modificato. |

| CG-04 | P2 | Piano: il menu superiore permetteva di scegliere “aggressivo” ma il contenuto restava Base. Con scenario custom, i pulsanti standard non riprendevano il controllo. Il what-if poteva sopravvivere al cambio di contesto. | Riga assunzioni condivisa fra menu e pulsanti, filtro esterno azzerato scegliendo un pulsante; simulazione/editor azzerati al cambio scenario/anno. Verificato in UI menu/titolo/stato radio; 5 test su selettori, custom, reset, debounce e risposta tardiva passati. Nessuna formula o assunzione persistente modificata. |
| CG-05 | P5/a11y | I 3 cursori delle ipotesi erano letti solo come numeri. Il componente Slider applicava gli attributi ARIA al contenitore invece che al controllo. | Etichette e unità dei 3 cursori; ARIA inoltrata al Thumb effettivo. 2 test su nome/descrizione/unità, tastiera e disabled; nomi/unità verificati in UI. |

Slider condiviso: inventario AST di 11 istanze sorgente in 9 file (escluse fixture), /tmp/eic-azienda-slider-consumers.json. Al di fuori delle 3 ipotesi l'unica istanza con ARIA esplicita è ProspettiDialog (posizione del taglio nelle planimetrie): quel contesto UI resta da visitare. Gli altri file non passavano attributi ARIA; nel Giornale lavori è stato poi aggiunto un nome e un valore percentuale, verificati nel modulo reale. Valori e callback restano invariati. Nessuna dichiarazione di collaudo completo di quei contesti.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| TASK-01 | P2/P5 | Modulo attività avanzato: selettori non associati, campi/chiusura attivi durante invio e cancellazione immediata senza conferma. Le checkbox della checklist iniziale erano controlli senza effetto. | Guard sincrona condivisa da salvataggio/eliminazione, campi bloccati in attesa, conferma definitiva con ritorno focus. Label per selettori, date e ripetizione; testo checklist nominato, segni decorativi non interattivi. Pulsante principale disabilitato senza titolo. 4 test UI mirati + 3 refresh riepilogo passati; 13 test collegamenti passati con timeout CLI adeguato al computer. |
| TASK-02 | P2/P5 | Creazione attività d’ufficio aveva protezione solo tramite stato del pulsante; campi editabili durante richiesta. | Guard al submit, chiusura protetta, fieldset disabilitato e reset guard su esito. 2 test doppio submit/errore-retry, stesso payload scope ufficio e commessa. Annulla allineato al modello outline. Modulo reale controllato desktop e 375 CSS px. |
| MOD-01 | P5 | In diversi moduli il footer su telefono nascondeva Annulla, richiedendo di risalire alla X. | Annulla visibile nel footer attività, contatto e appuntamento CRM. Verificato per attività a 375 CSS px; contatto/appuntamento da riconfermare con questa ultima patch. |
| COM-01 | P5 | Barra principale commessa a larghezza intermedia: etichette su due righe e altezza 66px. | Diciture brevi già esistenti fino a 2xl, nomi accessibili completi; icone sopra il testo su tablet. Misurati 54px a 375/1280/1920 e 66px a 768 (colonna leggibile). Nessun overflow barra/documento alle 4 larghezze. 28 test navigazione passati. |

Moduli attività: la creazione rapida personale, il modulo avanzato (modelli/checklist/stime) e quello d'ufficio (fasi/dipendenze) mantengono le rispettive funzioni. Uniformati etichette, feedback e protezione richiesta; non fusi in un mega-modulo con logiche differenti.

Densità commessa — decisione distinta non applicata: il riepilogo finanziario e operativo occupa gran parte della prima schermata desktop prima delle lavorazioni. Una modalità compatta nelle schede operative cambierebbe la gerarchia informativa generale; non nascosti quei dati in questa patch. La barra di navigazione è stata ridotta senza perdere informazioni o funzioni.

Mappa ampliata: 30 sottoviste commessa riconosciute dal contratto di navigazione (query URL), oltre alle Route e alle 14 schede Controllo di gestione. Il nuovo totale 427 è un inventario di voci, non 427 pagine distinte. Verifica statica Link/NavLink/Navigate: 300 destinazioni letterali assolute riconosciute dalla mappa, 588 espressioni dinamiche escluse dal controllo; nessun candidato non dichiarato in questa selezione. Non equivale alla prova di tutte le destinazioni/permessi/query in UI.

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| GIO-01 | P5/a11y | Giornale lavori: etichette visibili senza associazione ai controlli e avanzamento privo di nome/unità. | useId per campi data, commessa, temperatura, lavorazioni, materiali, persone e note; nome firmatario e cursore percentuale; meteo con stato premuto. Verifica reale nel modulo riaperto; 14 test pertinenti in 2 file passati. Lint confrontato con baseline: stesso errore preesistente e 6 warning. Nessun salvataggio/firma effettuato. |
| SIC-01 | P5/a11y | Archivio sicurezza: ricerca e tipo senza nome accessibile, filtro scadenze senza stato esposto. | Nomi espliciti e aria-pressed; confermati nel pannello commessa. Contesto pagina generale ancora da verificare. |

Aggiornamento moduli attività/ufficio: ripetuti i 6 test in 2 file dopo il blocco del salvataggio senza titolo, tutti passati. Lint ufficio/test: 0 errori e warning; TaskDialog: 0 errori e 9 warning, identici alla baseline.


## Materiali e fattura da commessa — ulteriori correzioni

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| COM-02 | P5/a11y | Aggiungi articolo esponeva un combobox senza nome. | Nome esplicito ricerca/scrittura; ricerca demo e selezione magazzino aperte, nessun prelievo. 12 test passati; lint con gli stessi 6 errori e 1 warning della baseline. |
| SIC-02 | P5/a11y | Nel promemoria vari pulsanti erano letti solo Carica/Aggiorna. | Nome contestuale con titolo del documento, stesso handler. Lint 0/0. Riconferma UI in attesa del nuovo accesso. |
| COM-03 | P5/a11y | Assegna seriali: input senza nome. | Seriale da assegnare; confermato nel modulo reale, nessuna assegnazione/scansione. 8 test pertinenti passati; lint 0/0. |
| FIN-07 | P5/a11y | Crea fattura dalla commessa: testo clausole, nuova clausola, metodo e data libera senza associazioni; tipo/rata/scadenza non esponevano selezione. | Label/nome specifici, aria-pressed e aria-expanded. Verificati in UI nome clausola, campo personalizzato, metodo, scelta Privato e data libera. A 375 CSS nessun overflow e footer Annulla/Crea raggiungibile. 29 test passati; lint identico alla baseline (5 errori, 6 warning). Calcoli, clausole e invio invariati. |

Sessione: secondo ritorno al login dopo il nuovo accesso, durante il passaggio dall'area commessa alla sicurezza generale. Log browser: rete assente, Failed to fetch, timeout 8/12/25 secondi; nessun evento auth esplicativo nel buffer consultato. Non dimostrata la causa del logout. Test esistenti auth recovery/timeout/revoca/cookie: 58 passati in 4 file; nessuna modifica a gestione sessione o protezioni. Documentazione ufficiale User sessions consultata via connettore Supabase; indice changelog non recuperabile (tipo markdown non supportato dal browser web, DNS fallito dal terminale). Non implementata alcuna modifica Supabase su queste sole evidenze.


Aggiornamento indagine sessione: il connettore Supabase, filtrato per referer localhost8096 nelle ultime due ore, conferma errori session_not_found403 e refresh_token_not_found400. Questo spiega il ritorno al login come accesso non più valido; non dimostra la causa iniziale (revoca, rotazione o altro). Nessuna modifica auth, nessuna rimozione dei controlli. Le precedenti osservazioni di rete rimangono distinte da questo riscontro.


## Sicurezza aziendale — moduli legacy

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| SIC-03 | P2/P5 | Caricamento documenti: campi non associati alle label e modificabili durante upload; mancava una guard sincrona contro il doppio invio. | useId, nomi area/file/rimozione, fieldset e dropzone disabilitati, guard invio/chiusura rilasciata su esito. Payload e limite 50MB invariati. 2 test con file in memoria e API simulate: invio unico/close bloccata, bozza conservata e retry dopo errore. UI desktop e375CSS (dialog/documento senza overflow, footer raggiungibile), nessun file reale caricato. Lint sorgente/test0/0. |
| SIC-04 | P5/a11y | DUVRI, Verbale, Subappaltatore e Adempimento: etichette visibili senza associazione; Annulla nascosto sul telefono. | Associazioni id/label e annullamento esplicito. Label dei quattro moduli confermate in UI. Footer Adempimento e DUVRI375CSS; Verbale/Subappaltatore300CSS senza overflow e Annulla raggiungibile;375 da riconfermare su questi ultimi. Pagina lint0/0. Nessuna generazione/salvataggio. |

DocumentiSicurezza: il filtro tipo e lo stato scadenze sono confermati anche nella pagina generale. La ricerca/commessa del workflow generale sono controlli del contenitore; il nome ricerca aggiunto al componente è usato nell’archivio della commessa. La finestra upload condivisa è usata anche da RiferimentoPscPos: contesto UI da visitare prima di dichiarare tutti gli usi verificati.

Sicurezza mobile: Figure/DUVRI/Subappaltatori sono nascoste dalla navigazione per una scelta già presente. Conservata; le prove dei moduli a300/375 sono state effettuate aprendoli da desktop e riducendo poi la finestra. Non equivale a renderli raggiungibili dai menu mobili. Resta separata da un eventuale cambiamento del prodotto.


| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| POS-01 | P5/a11y | Quattro select dell’editor POS (RSPP, tipo RLS, svolgimento, tipo allegato) e file input non avevano nome associato. | Label/id e nome file. Verifica UI dopo apertura di tutte11 sezioni: quattro associazioni corrette. 32 test editor/riferimentoPSC passati in2file. Rimosso import locale tecnicaPosVuota inutilizzato, verificato dal singolo riferimento import e lint baseline; funzione e modulo conservati. |

CaricaDocumentoSicurezzaDialog: confermati tre usi reali (archivio generale, preset DURC dalla checklist commessa, preset PSC dal riferimento POS). Per raggiungere il terzo è stato attivato solo nello stato della bozza il flagPSC; poi Annulla nell’editor ha ripristinato pscfalse e rimosso la barra modifiche non salvate. Nessun salvataggio/upload. Le azioni contestuali SIC02 sono ora confermate in UI.

Test sicurezza aggiuntivi: workflow/persistenza/upload15test3file passati. Lint paginaSicurezza e moduloUpload/test0/0. Il typecheck globale56693 è stato fermato perché superato dalle patch successive dell’upload: non è concluso e non è attivo. I5controlli esterni restano intatti.


## Planimetrie — riscontri sul disegno e salvataggio

| ID | Priorità | Riscontro | Intervento |
|---|---|---|---|
| PIA-01 | P5/a11y | Popup stanza a misure e dettaglio: tipo stanza non associato alla label; popup senza titolo accessibile ed errore misure non annunciato. | Label/id in entrambi, titolo/descrizione del popup, alert e associazione errore ai due campi. In UI: invio vuoto annuncia errore, stanza locale3×4m mostra12mq e dettaglio nominato; undo rimuove la stanza, nessun salvataggio. |
| PIA-02 | P2 | Salvataggio pagina editor senza guard sincrona, disegno e nome ancora modificabili durante la richiesta. | Ref condivisa per l’invio, guard sola lettura, nome disabilitato e modalità sola vista durante salvataggio. Payload/versione attesa restano quelli esistenti. 2regressioni aggiunte: richiesta pendente e doppio click, errore e retry con stesso documento. 24test in2file passati. Lint wrapper/test0/0. Nessuna API reale di creazione o versione invocata in UI. |

EditorPlanimetria/PannelloDettagli: lint confrontato con la base, stessi errori preesistenti (23e1warning nell’editor;2errori nel pannello), nessuna regressione per regola/quantità. La correzione non è una riscrittura del motore geometrico.

Undo e avviso modifiche: tornando visivamente a zero stanze la bozza continuava a indicare modifiche. Il wrapper usa un contatore dei cambi; l’uguaglianza del documento completo dopo undo non è ancora verificata, quindi non classificato come bug accertato né modificato il criterio di salvataggio.

## Accessibilità dei moduli fiscali

| ID | Problema osservato | Correzione e verifica | Limiti |
| --- | --- | --- | --- |
| FIS-A01 | Nel nuovo F24 cinque etichette visibili non identificavano i campi | Associazioni univoche con useId, confermate nell’albero accessibile; 8 test esistenti passati | Nessuna registrazione reale, responsive ancora da verificare |
| FIS-A02 | Nuova garanzia: select e input senza nome associato | Sette associazioni label/id, inclusi contratto e controparte dinamica; UI verificata nelle due direzioni | Nessuna registrazione o svincolo |
| FIS-A03 | Caricamento archivio: quattro etichette non associate | Tipo, anno, file e note associati; formati ammessi descrivono il file; UI confermata | Nessun file caricato, richieste pendenti non collaudate |

## Formazione e portale

| ID | Problema osservato | Correzione e prova | Limiti |
| --- | --- | --- | --- |
| FOR-01 | KPI e schede riportavano 56 iscrizioni e 41% dai metadati; riepilogo effettivo mostrava zero | Fonte comune dalle iscrizioni, proiezione senza scrivere i metadati, lettura di tutte le pagine ordinate per corso/utente. KPI, schede, dettaglio e percorsi obbligatori coerenti in UI. | Lettura reale vuota; conteggi non vuoti e pagine successive verificati con fixture. |
| FOR-02 | Caricamento/errori potevano apparire come totali zero | Nessuna metrica prima del successo; errore e Riprova nel riepilogo e nella pagina. Tre test del hook su attesa, errore/retry e fallimento dopo successo. | Errori non forzati sul backend aziendale. |
| FOR-03 | Note e chiarimenti confermavano salvataggio/invio tramite soli toast; attestato non generava documenti | Azioni incomplete disabilitate e spiegate, rimosse conferme false. Registro presa visione ancora attivo. Verificati gli stati dei quattro pulsanti nel browser. | Le tre funzioni richiedono una vera implementazione futura; nessuna funzione persistente è stata rimossa. |
| FOR-04 | Select Tipo/Modulo nel materiale senza etichetta associata | Associate, confermate in UI. Area/Accesso/Pubblico e filtri corso nominati. | Varianti delle impostazioni/accessi ancora da riconfermare in UI, senza cambiare regole. |

Firma: dieci campi del firmatario associati alle etichette; selezione template trasformata in pulsante da tastiera con focus e rimozione nominata. Desktop e 375 px senza overflow, test file in memoria. Nessun documento reale caricato o identificazione registrata.

| FOR-05 | Focus usciva dalla lezione a tutto schermo verso la navigazione nascosta; ritorno privo di nome su mobile | DialogPrimitive esistente, focus iniziale e confinato, Esc e ritorno alla scheda corso; nome ritorno esplicito. Verificati desktop e mobile 375 px. | Altri corsi e percorsi con contenuti ancora parziali. |

## Render AI

| ID | Problema osservato | Correzione e verifica | Limiti |
| --- | --- | --- | --- |
| REN-01 | Ricerca/filtri galleria e sessioni non conservavano il contesto accessibile | Nomi espliciti per ricerca, autore, contatto, opportunità, stato e CRM. Ritorno icona nominato. Infissi: ricerca/reset desktop, filtro CRM vuoto/reset mobile verificati. | Componenti condivisi da molti moduli; non tutti visitati. |
| REN-02 | Sessioni nell’hub erano card div cliccabili, escluse dalla tastiera | Link veri con nome modulo/data/stato e focus visibile; Invio apre il dettaglio esistente. Due test hub passati con asserzioni sui link. | Nessuna modifica a percorsi o dati. |
| REN-03 | CRM: campi e azioni di rimozione privi di nomi contestuali | Label/id per i selettori, nomi chiari per rimozione e link contatto; confermati dettaglio Infissi e primo passo Bagno. | Nessun collegamento reale modificato. |
| REN-04 | Rimozione contatto lanciava due scritture con il vecchio contatto nella seconda: rischio ripristino per concorrenza | Callback atomico facoltativo per la scheda persistente; una richiesta, guardia immediata, controlli bloccati, applicazione stato solo dopo successo, errore visibile con stato precedente conservato. Vecchi callback locali mantenuti per i configuratori. | Riprodotto prima del fix con 4 chiamate su doppio clic, prove solo con mock; nessuna mutazione aziendale. |

Residui Render: selettori CRM limitati a 500 contatti/200 opportunità e senza errori espliciti per le rispettive query. Da approfondire con ricerca/paginazione prima di dichiarare completo il collegamento. Condivisione, WhatsApp, generazione, PDF e file reali esclusi dal collaudo su dati aziendali.

| REN-05 | Facciata: caricamento foto soltanto con Card cliccabile, input nascosto e nessun comando da tastiera | Pulsante nativo nominato con focus visibile, stesso aspetto e stessa funzione; Tab da Indietro ora raggiunge il caricamento. | Nessun file caricato, vincoli e passi successivi da collaudare con fixture. |

Osservazioni successive: Stanza e Pavimento visitati fino a galleria/dettaglio; Stanza anche stato fallito con messaggio reale e ritorno nominato. Hub interni e Facciata espongono jargon/enum inglesi, dettaglio pavimento mostra nomi grezzi e note con capitalizzazione da rivedere. Sono rilievi di copy e leggibilità ancora aperti, non traduzioni già applicate.

### Caricamento e lettura Persiane

Come Facciata, il caricamento desktop Persiane non era raggiungibile da tastiera: ora è un pulsante nativo con nome e focus, verificato con Tab prima e dopo sincronizzazione. Nel dettaglio riutilizzate le etichette italiane esistenti del configuratore per orientamento, posizione, tipo apertura e oscurante; verificati un completato e un fallito con dati incerti. Le descrizioni AI libere restano in lingua originale, senza modificare dati o prompt.

### Testi dei moduli render

Sostituiti titoli e descrizioni rivolti all’utente che mostravano dettagli implementativi (Scene router, Manifest globale, dependency graph, No stack error, envelope e simili) con descrizioni italiane di ambienti, zone e interventi. Modificato solo renderModuleHubConfigs e il titolo della guida Come funziona; identificativi, percorsi, opzioni, prompt e generatori invariati. Mantenute anche le opzioni piscina infinity e gli altri sistemi descritti. Nei dettagli Tetto/Pergole/Piscine uniformati nome Scarica render e messaggio di errore. Handler e richieste di download invariati. Conferma UI hub Piscine e dettaglio Piscina, restanti contesti in corso.

Test pertinenti2file/3casi passati; lint5file zero errori e warning. Incrementale TypeScript in corso. Questo piccolo lotto di testi è successivo alla build già completata e va distinto nelle evidenze.


### 10/11 — centro render, stati e ripristino

Ricerca moduli senza risultati ora esplicita con ripristino completo e focus al campo. Confermati 14 moduli più link separato Planimetrie della main aggiornata. Contatori root/panoramiche/gallerie distinguono dati non disponibili da zero; nessuna formula o interrogazione modificata. 10 test mirati passati, lint mirato exit0. Build precedente non copre questa patch successiva. Galleria Ristrutturazioni caricata con 2 record, dettaglio completato letto; autore risolto correttamente dopo caricamento (inizialmente Non disponibile); testi tecnici da approfondire. Nessuna comunicazione, generazione o scrittura reale.


### 10/11 — residui assistente e banca

- Memoria AI: elenco senza paginazione,637buttonnelDOMconlo stato reale osservato; codice renderizza filteredMemories.map e querylimite1000. Valutare paginazione UI che mantenga ricerca/statistiche su tutti i record letti; verificare completezza server oltre1000, senza confondere limitazione con perdita dati accertata.
- Banca: Verifica collegamento/Disconnetti conto ripetuti senza nome del collegamento nei comandi; migliorare contesto accessibile e conferma, senza toccare conti/consensi.
- Contratti: conteggiModelli/Clausole inizialmente0, poi16/7; distinguere caricamento ed errore da zero, come già fatto nei render.
- Materiali listino: perdita focus alla chiusura riprodotta e corretta con hookesistente; guardiaref impedisce doppi submit e chiusureX/Esc/footer durante salvataggio. Sei test passati, lint0/0. Nessuna scrittura reale.


### 10/11 — sopralluoghi, conferma firma e risultati

Cumulativo impostazioni **104 file/1.081 test passati**, /tmp/eic-azienda-test-impostazioni-completo.log/.json,237,50s. Nessun file in comune con il gruppo sopralluoghi seguente.

Sopralluoghi: primi37file369passati/3falliti (energySurvey: AuthProvider mancante nel fixture dopo dipendenza ImportaVociDialog, non regressione di produzione). Aggiunto contestoAuthsimulato; suite finale **38 file/375 test tutti passati**, /tmp/eic-azienda-sopralluoghi-suite-finale.log/.json,46,48s. Totale distinto dei due gruppi142file/1.456test (due comandi separati, non un unico comando globale).

SignaturePad vecchio usava update diretto senza controllarne error: poteva mostrare Firma registrata dopo rifiutoDB. Nuovo test3casi falliti prima, /tmp/eic-azienda-firma-regressione-prima.log; dopo correzione API condivisa updateSurvey (selectsingle+error), guardiaref, nome/canvas bloccati durante richiesta, annullamento nominato: 3/3passati, retry e callbacksolo dopo conferma. PaginaFirmaCliente impedisce riapertura per client_signature_at/statussigned. Nessuna firma o upload reali. Possibili file già caricati prima di rifiuto update restano da valutare: nessuna cancellazione automatica introdotta.

Correzione della letturaUI: il recordDEMOaperto non era firmato. Firma registrata era solo il titolo della sezione; corpo verificato=Nessuna firma registrata. Ora il titolo è Firma cliente in assenza di timestamp. La guardia su recordfirmati è verificata confixture, non con un record reale firmato. Canvas aperto e annullato senza tratto, segreto o invio.

NuovoSopralluogo: tre passi e tre modalità di collegamento, calendario italiano, mobile375 senzaoverflow. Headerback andava alpassoprecedentema si chiamavaTornaaisopralluoghi: nome reso dinamico, 10testcreazione passati, nessunalogicacambiata. Screenshot sicura /tmp/eic-sopralluogo-nuovo-mobile.jpg. Firma e navigazione source lint0/0; TypeScript firma /tmp/eic-azienda-typecheck-sopralluoghi-firma.log conclusoexit0, predates solo titolo condizionale SurveyWorkspace che ha lint0/0. Build più recente predates questo gruppo sopralluoghi; non attribuirle le patch successive.


SalesOSConfig: i13campi sonoora nominati. Residuo da verificare conmock: useEffect(data)rimpiazza la bozza quandocambiaquerydata; non esiste guardiauscita. Queryha staleTime30min ma un aggiornamento di altri utenti duranteediting può sovrascrivereinput. Nessuna correzionediquestafunzione ancoraeffettuata, soloetichette ecopy.
