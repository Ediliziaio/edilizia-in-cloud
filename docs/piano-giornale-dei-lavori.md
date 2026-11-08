# Piano: Rapportini e Giornale dei lavori

7 novembre 2026. Il principio:

- il **rapportino** dice quanto lavoro ha fatto una persona o una squadra (ore, attività, materiali, mezzi, foto) e serve a costi e consuntivi;
- il **giornale dei lavori** racconta la giornata del cantiere (lavorazioni, meteo, presenze, consegne, problemi, sospensioni, istruzioni, sopralluoghi).

Il rapportino alimenta il giornale, ma non lo sostituisce: il giornale lo conferma una persona.

**L'AI fa poco, e lo fa bene** (indicazione di Florin): non inventa il giornale. Serve a una cosa sola: chi detta dal telefono parla come capita, e l'AI ascolta l'audio e lo trasforma in un testo pulito (punteggiatura, termini di cantiere, niente parole di troppo), senza aggiungere fatti. Il testo finisce nel campo e la persona lo controlla prima di inviarlo.

## Cosa c'è oggi (verificato il 07/11)

**Rapportini (app campo)**
- Modulo unico in `src/pages/campo/CampoRapportino.tsx`.
- Chi compila lo decide la regola `chiCompila` (ognuno / il capo / ognuno solo le sue ore), letta da `flussoPersona()`.
- Capocantiere e caposquadra si assegnano per commessa.
- Approva chi può modificare le commesse; lo staff non approva i propri rapportini. All'approvazione si applicano ore e avanzamento.
- Uso reale: 4.245 rapportini, quasi tutti su Demo Azienda 2.

**Foto**
- Nel rapportino la fotocamera ne fa una per volta e la galleria si ferma a 5. Una foto sopra i 10 MB viene scartata *prima* di essere compressa, quindi le foto grandi dei telefoni nuovi si perdono. C'è anche un difetto per cui riscegliere la stessa foto non funziona.
- Nel giornale lo stesso bottone fa sia fotocamera sia galleria: sul telefono apre solo la fotocamera. Le foto non vengono compresse (si caricano gli originali, anche da 10 MB), un caricamento fallito non viene segnalato, e una foto salvata non si può togliere.

**Dettatura**
- «Compila parlando» esiste solo nel rapportino: Whisper trascrive, poi l'AI *estrae* i campi.
- Manca un passaggio che restituisca il testo dettato pulito, e manca la dettatura nel giornale.
- Prima di chiamare l'AI non si controlla il credito (`parse-rapportino-ai` non ha il controllo di pagamento, l'altra funzione sì).
- Il registratore si ferma a 2 minuti.

**Impostazioni** (`/azienda/impostazioni/rapportini-cantiere`)
- Si configurano le regole (chi compila, ore da capo o da timbrature, scostamento, giorni indietro) e i moduli (parti accese, campi propri, verbali).
- Nessuna pagina dice in chiaro **chi fa cosa**.
- Il giornale non ha impostazioni, nemmeno l'interruttore del giornale automatico.

**Giornale dei lavori**
- Un testo libero al giorno con il numero dei presenti scritto a mano. Si modifica e si cancella anche dopo la firma.
- Il database permette la scrittura a tutta l'azienda: il permesso «modifica giornale» viene controllato solo nella pagina.
- Il giornale automatico delle 18:00 c'è ma è spento ovunque; scriverebbe la versione definitiva invece di una bozza.
- Uso reale: 11 righe, tutte su Demo 2.

## Lotti

Lotti piccoli, ognuno pubblicato e provato dal vivo su Demo Azienda 2 prima del successivo.

**Lotto 1: foto e «chi fa cosa»** *(fatto)*
- **Rapportino**:
  - scatti di fila, con «Scatta un'altra» che non perde quelle già fatte;
  - galleria con scelta multipla fino a 15 foto;
  - compressione **prima** del controllo del peso, una foto alla volta (i telefoni economici non vanno in crash) e con l'avanzamento a schermo;
  - si può togliere una foto prima dell'invio.
- **Giornale**: due bottoni separati, fotocamera e galleria; stessa compressione; nomi di file sicuri; avviso se un caricamento fallisce; si può togliere una foto già salvata.
- **Impostazioni rapportini**: riquadro «Chi fa cosa» che segue le regole vere dell'azienda: cosa fa l'operaio, cosa fa caposquadra o capocantiere, chi approva e cosa succede all'approvazione, chi vede e chi scrive il giornale.

**Lotto 2: detta e ripulisci** *(fatto)*
- Bottone «Detta» nel rapportino e nel giornale: registra, trascrive e ripulisce il testo senza aggiungere fatti, poi lo mette nel campo da rivedere.
- Una sola funzione per tutti e due, con controllo del credito *prima* della chiamata e `segnalaErroreAI` (CLAUDE.md).
- Durata massima allineata (proposta: 3 minuti); avviso chiaro se manca il microfono o la connessione.
- Collegare la bozza vocale (`rapportini_vocali`) al rapportino inviato.

**Lotto 3: il giornale diventa un documento** *(fatto)*
- Stati `bozza → firmata`. Dopo la firma niente modifica né cancellazione, solo **annotazioni** con data e autore.
- Una pagina per cantiere e per giorno.
- Presenze per nome, prese dai rapportini.
- Sul database, la scrittura è permessa solo a chi ha il permesso di modifica del giornale.
- Le 11 righe di Demo 2 si portano nel nuovo formato.

**Lotto 4: la bozza dalla giornata** *(realizzato)*
- Una sola regola, senza AI, in `supabase/functions/_shared/bozzaGiornale.ts`: lavorazioni dai rapportini inviati o approvati (una riga per testo, senza doppioni), materiali sommati per voce e unità, consegne dalle bolle arrivate e segnalazioni dal campo nelle note, meteo, numero di presenti, percentuale più alta dichiarata e i riferimenti alle fonti. Se non c'è niente da scrivere, non nasce nessuna pagina.
- **«Prepara dalla giornata»** nella pagina del giornale: riempie il modulo, si salva solo a mano. Sopra un testo già scritto chiede se aggiungere in fondo (scelta proposta) o sostituire. Dice da quanti rapportini, bolle, segnalazioni e foto arriva, e cosa non ha potuto leggere con i permessi di chi preme.
- **Giro serale** (`auto-genera-giornale-cantiere`): niente più AI, stessa regola del bottone. Scrive solo bozze nuove, non visibili al cliente, e non tocca mai una pagina che c'è già.
- **Interruttore per azienda** in Impostazioni → Rapportini (`companies.giornale_auto_enabled`, spento di base), riportato in «Chi fa cosa» e in «Cosa parte da solo».
- **Interruttore per commessa**: la colonna `orders.giornale_auto_enabled` c'è ed è rispettata (acceso di base), ma nella scheda commessa non c'è ancora un punto dove cambiarlo.

**Lotto 5: eventi, stampa, direzione lavori** *(realizzato, migrazione `20281231120000_giornale_eventi` da applicare)*
- **Eventi con un tipo** (`giornale_eventi`): consegna, problema, sospensione, ripresa, istruzione, sopralluogo, sicurezza, nota, con ora e collegamento facoltativo a bolla, ticket o fase. In bozza si aggiungono e si tolgono. Su una pagina firmata niente cambia, tranne chiudere o riaprire un problema (con una nota). Lo impone il trigger `trg_giornale_eventi_guardia`.
- **Impronta**: entrano id, tipo, ora e testo degli eventi. Non lo stato del problema né i collegamenti. Una pagina senza eventi ha la stessa impronta di prima.
- **«Prepara dalla giornata»** e giro serale: consegne e segnalazioni ora sono eventi, non note, senza doppioni (indici unici per pagina e bolla o ticket). Il giro serale li scrive solo sulla pagina creata da lui.
- **Commessa**: riquadro «Problemi aperti dal giornale», con i giorni e il link alla pagina. Silvio li legge nel `quadro_commessa`.
- **Documento** (`_shared/documentoGiornale.ts`, `generate-giornale-pdf`): «Pagina N di M» dalla stampa del browser, Bozza o Firmata con data, autore e impronta, eventi per tipo, presenti per nome, annotazioni in coda. Chiuso al cliente del portale, che prima lo poteva scaricare.
- **Direzione lavori**: «Invia alla direzione lavori» su una pagina firmata, solo col clic e la conferma dell'indirizzo (`orders.dl_notification_email`, oppure scritto al momento). L'email porta un link `/giornale-dl/:token` che vale 30 giorni e non chiede accesso (`giornale_invii_dl`, nel database solo l'impronta del token).
- **Cliente nel portale**: solo le pagine firmate e visibili; le foto arrivano firmate dall'edge `giornale-foto-cliente`, che controlla che la commessa sia sua. Niente annotazioni né eventi.
- **Non fatto**: l'archiviazione del documento in `archived_storage_path`. Oggi il documento è HTML, e HTML su Storage si apre come testo: serve un PDF vero costruito sul server.

## Da decidere (Florin)
1. **Chi firma** il giornale. Proposta: un permesso assegnabile, con il titolare sempre abilitato.
2. **Bozza dalla giornata accesa di default** sulle commesse nuove, o solo su richiesta.
3. ~~**Opere pubbliche**~~: deciso, per ora solo il giornale d'impresa, senza regole speciali D.M. 49/2018.
