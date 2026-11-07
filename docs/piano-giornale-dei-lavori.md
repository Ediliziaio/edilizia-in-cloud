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

**Lotto 1: foto e «chi fa cosa»** *(in corso)*
- **Rapportino**:
  - scatti di fila, con «Scatta un'altra» che non perde quelle già fatte;
  - galleria con scelta multipla fino a 15 foto;
  - compressione **prima** del controllo del peso, una foto alla volta (i telefoni economici non vanno in crash) e con l'avanzamento a schermo;
  - si può togliere una foto prima dell'invio.
- **Giornale**: due bottoni separati, fotocamera e galleria; stessa compressione; nomi di file sicuri; avviso se un caricamento fallisce; si può togliere una foto già salvata.
- **Impostazioni rapportini**: riquadro «Chi fa cosa» che segue le regole vere dell'azienda: cosa fa l'operaio, cosa fa caposquadra o capocantiere, chi approva e cosa succede all'approvazione, chi vede e chi scrive il giornale.

**Lotto 2: detta e ripulisci**
- Bottone «Detta» nel rapportino e nel giornale: registra, trascrive e ripulisce il testo senza aggiungere fatti, poi lo mette nel campo da rivedere.
- Una sola funzione per tutti e due, con controllo del credito *prima* della chiamata e `segnalaErroreAI` (CLAUDE.md).
- Durata massima allineata (proposta: 3 minuti); avviso chiaro se manca il microfono o la connessione.
- Collegare la bozza vocale (`rapportini_vocali`) al rapportino inviato.

**Lotto 3: il giornale diventa un documento**
- Stati `bozza → firmata`. Dopo la firma niente modifica né cancellazione, solo **annotazioni** con data e autore.
- Una pagina per cantiere e per giorno.
- Presenze per nome, prese dai rapportini.
- Sul database, la scrittura è permessa solo a chi ha il permesso di modifica del giornale.
- Le 11 righe di Demo 2 si portano nel nuovo formato.

**Lotto 4: la bozza dalla giornata**
- Bottone «Prepara dalla giornata», più l'interruttore per azienda e per commessa nelle impostazioni.
- Senza AI: presenze, ore e lavorazioni dai rapportini; consegne dalle bolle del giorno; problemi dalle segnalazioni; meteo.
- L'AI solo per unire le descrizioni in un testo leggibile, ed è facoltativa.
- Il giro delle 18:00 scrive solo bozze e non tocca mai una pagina firmata.

**Lotto 5: eventi, stampa, direzione lavori**
- Eventi con un tipo: consegna (con DDT), problema o difformità (aperto / chiuso), sospensione / ripresa, istruzione, sopralluogo, sicurezza.
- PDF con pagine numerate e annotazioni in coda.
- Invio al direttore lavori; vista per il cliente solo delle pagine firmate.
- Problemi aperti mostrati nella commessa e da Silvio.

## Da decidere (Florin)
1. **Chi firma** il giornale. Proposta: un permesso assegnabile, con il titolare sempre abilitato.
2. **Bozza dalla giornata accesa di default** sulle commesse nuove, o solo su richiesta.
3. **Opere pubbliche** (D.M. 49/2018: vidimazione, firma della direzione lavori): dentro il lotto 5, o per ora solo il giornale d'impresa.
