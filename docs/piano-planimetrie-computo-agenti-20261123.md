# Piano: planimetria, 3D, computo del preventivo e agenti — 23/11/2026

Obiettivo, in una frase: **l'utente seleziona un elemento della pianta, lo modifica
(a mano o chiedendolo a Silvio), vede il 2D e il 3D aggiornarsi e sa subito quali
lavorazioni, quantità e prezzi sono cambiati nel computo del preventivo.**

Il piano parte dal sistema che c'è, non da zero. Nasce dal «master prompt» del
titolare e dal collaudo del 23/11 su Demo Azienda 2.

## 1. Cosa esiste già (verificato nel codice)

| Pezzo | Dove | Cosa fa |
|---|---|---|
| Modello unico | `shared/planimetrie/modello.ts` | Muri, aperture, locali, elementi con id stabili, stato esistente / da demolire / nuovo, origine di ogni misura. Lo leggono editor 2D, 3D, PDF e computo |
| Quantità | `shared/planimetrie/quantita.ts` | Superfici, pareti nette con detrazioni, battiscopa, volumi, impianti, radiante: una chiave per ogni misura (`fatto:locale:l1.pavimento_mq`) |
| Pianta **dentro** il computo | `components/computo/ComputoDallaPianta.tsx`, `lib/computo/computoDallaPianta.ts` | Nel computo del preventivo si apre l'editor della pianta con la chat di Silvio accanto; le misure diventano righe di misura delle voci |
| Righe collegate | `computo_voci…planimetria_chiavi`, `lib/planimetrie/computo.ts` | Ogni riga «presa dalla pianta» ricorda da quali chiavi viene; se la pianta cambia: «La pianta è cambiata → Aggiorna le quantità» |
| Effetto sul prezzo | `lib/planimetrie/effettoPrezzo.ts`, `EffettoPrezzo.tsx` | Mentre si modifica la pianta, di quanto cambiano i computi collegati (quantità × prezzo della voce) |
| Lavori dalla variante | `lib/planimetrie/primaEDopo.ts`, `studioImmobiliare.ts`, `computoDaVariante.ts` | Dal confronto fatto/progetto: demolizioni, tramezzi nuovi, serramenti, impianti; bozza di computo dalla variante |
| Materiali | `shared/planimetrie/fabbisogno.ts` (23/11) | Lista della spesa per fase di cantiere, per lavori e stanze scelti |
| Modifiche a parole | `editor/comandiChat.ts` (regole), `planimetria-genera` (Silvio) | Sposta tramezzo, sposta porta, ridimensiona, dividi, arreda, impianti |
| Agenti | `planimetria-genera/genera.ts` (23/11) | Disegnatore → controllore (codice) → correttore, con coordinatore. Solo sulla generazione della pianta |

## 2. Cosa manca (i buchi veri)

1. **Tre strade per i prezzi che non si parlano.** «Prima e dopo» usa prezzi fissi nel
   codice (`PREZZI_OPERE`: tramezzo 58 €/m²…); lo studio della variante lascia le voci
   «da quotare»; il computo usa listino e prezzari. La stessa parete può avere tre
   importi diversi, o nessuno.
2. **Il costo si vede dopo, non prima.** `EffettoPrezzo` c'è solo nell'editor aperto da
   solo, e solo per le righe già collegate. Una proposta di Silvio («sposto la parete di
   40 cm») mostra le superfici, non le lavorazioni e gli euro.
3. **Le lavorazioni generate non entrano nel computo del preventivo.** Demolire e
   ricostruire una parete produce righe nello studio, ma nel computo aperto dal
   preventivo l'utente deve crearle a mano.
4. **Due chat diverse.** La chat del disegno (regole, gratis) e Silvio sulla scheda (AI)
   capiscono cose diverse e nessuna delle due conosce il computo aperto.
5. **Nessun progetto di collaudo con misure note** che percorra tutto il giro.
6. Minori: muri «bloccati» scelti dall'utente; DWG solo in locale; la scelta lavori/stanze
   dei materiali non si salva.

## 3. Principi (valgono per tutti i lotti)

- **I numeri li calcola il codice, l'AI interpreta e propone.** Misure, quantità, importi e
  controlli sono funzioni deterministiche con test; l'AI sceglie *quale* operazione fare.
- **Un coordinatore di codice, pochi specialisti.** Niente agenti che si parlano
  liberamente: il coordinatore decide chi chiamare e quando fermarsi. Nel caso buono una
  sola chiamata AI.
- **Ogni numero dice da dove viene**: rilevato / da documento / stimato; prezzo da listino
  aziendale / prezzario / indicativo / da quotare. Un totale con voci da quotare è
  «parziale».
- **Niente si applica senza anteprima**: elementi toccati, misure prima e dopo,
  lavorazioni, differenza economica, cosa manca.
- **Si riusa**: chiavi delle quantità, righe collegate, `effettoSulPrezzo`, editor nativo
  del computo. Nessun secondo modello dei dati.

## 4. Architettura degli agenti

```
richiesta (clic, trascinamento, frase)
        │
  COORDINATORE (codice) ── stato dell'elaborazione, cosa è cambiato, cosa ricalcolare
        │
        ├─ Interprete (AI, solo se la richiesta è a parole e le regole non bastano)
        │     frase → operazione su oggetti con id («sposta muro m7 di 40 cm verso l2»)
        │     se ambigua: evidenzia i candidati e fa UNA domanda
        ├─ Geometria (codice) ── applica l'operazione su una copia, controlla i vincoli
        ├─ Controllore (codice) ── accessi, finestre, sovrapposizioni, muri bloccati
        ├─ Lavorazioni (codice) ── differenza fatto/progetto → demolizioni, costruzioni,
        │     finiture, ripristini, con formula e quantità
        ├─ Prezzi (codice + ricerca) ── voce di listino o prezzario per ogni lavorazione;
        │     AI solo per abbinare una lavorazione nuova a una voce (una volta, poi si ricorda)
        └─ Controllo finale (codice) ── 2D, 3D, quantità e importi dicono la stessa cosa
        │
   ANTEPRIMA → l'utente accetta, modifica o scarta → salvataggio di pianta e computo insieme
```

Dove gira: nel browser tutto ciò che è codice (immediato, gratis); in `planimetria-genera`
solo l'interprete e il correttore. Costo AI atteso: 0 chiamate per le modifiche a mano e
per le frasi che le regole capiscono, 1 per le altre.

## 5. Lotti

Ogni lotto è pubblicabile da solo, con i suoi test e una prova a schermo su Demo 2.

### Lotto A — Progetto di collaudo con misure note
Un progetto fisso (fixture + planimetria in Demo 2): 5 locali, porte, finestre, una
parete obliqua, misure scritte a mano e verificate. Test che controllano superfici, pareti
nette, battiscopa e volumi contro i valori attesi (esempio del master prompt: parete 4 m ×
2,70 = 10,80 m², con porta 0,90 × 2,10 → 8,91 m² per faccia).
**Fatto quando:** i valori attesi sono nel test e la suite li confronta a ogni modifica.

### Lotto B — Una sola fonte dei prezzi
`prezzoLavorazione(azienda, lavorazione)` in un modulo unico: prima il listino
dell'azienda, poi il prezzario regionale scelto, poi il prezzo indicativo, altrimenti «da
quotare»; restituisce importo **e fonte**. «Prima e dopo», studio della variante ed
effetto sul prezzo passano tutti da lì. `PREZZI_OPERE` resta solo come ultimo ripiego,
marcato «indicativo».
**Fatto quando:** la stessa parete ha lo stesso prezzo e la stessa fonte nelle tre schermate.

### Lotto C — Lavorazioni da una modifica, con formula
`lavorazioniDaModifica(prima, dopo)`: per ogni oggetto cambiato le lavorazioni necessarie
— parete esistente spostata = demolizione + trasporto a discarica + nuova parete +
intonaco e pittura sulle facce + ripristino di pavimento e battiscopa nella traccia;
parete di progetto spostata = nessuna demolizione. Ogni riga porta oggetti, formula,
quantità, unità, regola di detrazione, stato di verifica. Estende `primaEDopo.ts`.
**Fatto quando:** il caso «sposta parete» sul progetto del lotto A dà le righe attese.

### Lotto D — Anteprima con il costo, prima di applicare
Un solo componente di anteprima usato da trascinamento, chat del disegno e Silvio:
elementi toccati, misure e superfici prima/dopo, vincoli, lavorazioni (lotto C), importi e
differenza (lotto B), dati mancanti. Accetta / modifica / scarta.
**Fatto quando:** spostando una parete in Demo 2 si vede la differenza in euro prima del
«conferma», e dopo il conferma 2D, 3D e computo coincidono.

### Lotto E — Dentro il computo del preventivo
Nella pianta aperta dal computo (`ComputoDallaPianta`): le lavorazioni accettate diventano
voci e righe di misura del computo aperto, collegate agli oggetti (`planimetria_chiavi`);
una modifica successiva aggiorna quelle righe, non ne crea altre. Voci scritte a mano
simili a una generata: si propone di collegarle, non si sommano. Quantità o prezzo
corretti a mano: si mostra il conflitto prima di rigenerare. Pianta e computo si salvano
insieme (o nessuno dei due).
**Fatto quando:** dal preventivo → computo → pianta, spostare una parete aggiorna il totale
del preventivo senza righe doppie, e ripetere la stessa richiesta non duplica niente.

### Lotto F — Una sola chat, che conosce pianta e computo
La chat del disegno e Silvio diventano la stessa conversazione: prima le regole (gratis),
poi l'interprete AI. Il contesto comprende l'oggetto selezionato, i vincoli e il computo
aperto. Richieste ambigue («questa parete»): candidati evidenziati sulla tavola e una sola
domanda. «Crea due alternative e confrontane il costo» apre due varianti dalla stessa
versione e mostra il confronto.
**Fatto quando:** le cinque frasi d'esempio del master prompt funzionano su Demo 2.

### Lotto G — Vincoli scelti dall'utente
Muri ed elementi «bloccati» (strutturali, cavedi, attacchi): una modifica che li tocca
viene fermata con la spiegazione. La funzione portante viene da un dato o da una conferma,
mai solo dal disegno.

### Lotto H — Alternative e revisioni con i costi
Ogni variante conserva geometria, computo, prezzi e data dei prezzi; il confronto mostra
superfici, lavorazioni, quantità, costo e differenza, dati da confermare.

### Lotto I — Dispositivi e prestazioni
Telefono: consultazione, misure, richieste a Silvio, approvazione delle proposte.
Durante il trascinamento solo anteprima; quantità e prezzi si ricalcolano al rilascio.

### Dopo
DWG online (serve Cloudflare), render HD a crediti, scelta lavori/stanze dei materiali
salvata nel progetto, pavimento comune escluso da bagni ed esterni (decisione del titolare).

## 6. Ordine e dipendenze

A → B e C in parallelo → D → E → F. G, H e I dopo E, indipendenti fra loro.
Il primo percorso completo e usabile è **A + B + C + D**: «sposto una parete e vedo
lavorazioni e costo prima di confermare». E lo porta nel preventivo.

## 7. Come si verifica

- Test con valori attesi sul progetto del lotto A (geometria, lavorazioni, importi).
- Le 12 prove del master prompt (importa, misura, sposta parete, apertura, 3D, lavorazioni,
  computo, due alternative, annulla, salva e riapri, modifica manuale, interruzione) come
  elenco di collaudo a schermo su Demo 2, ripetuto a ogni lotto.
- Per l'AI: 10–15 richieste di prova, con il conto di quante vanno a buon fine al primo
  giro, tempo e costo medio (come fatto il 23/11 per la generazione: 3 piante su 4 con
  difetti prima del controllore).

## 8. Decisioni del titolare (23/11/2026)

1. **Prezzi:** prima il listino dell'azienda. Se la voce non c'è, un prezzo attendibile
   preso da fonti online (prezzari regionali pubblici e fonti di mercato), con la fonte e
   la data scritte accanto. Ogni prezzo si può modificare a mano, e il prezzo corretto vale
   da lì in poi per quell'azienda.
2. **Lavorazioni generate:** entrano nel computo **già quotate**; l'utente le corregge dopo.
   Restano «da quotare» solo se non si trova nessun prezzo.
3. **Pavimento comune:** non si decide una volta per tutte. Quando si sceglie il pavimento
   il sistema chiede «anche in bagni, lavanderia ed esterni?» e fa come risponde l'utente.
4. **Costi e confronto fra alternative:** li vede solo chi ha il permesso sugli importi.

## 8 bis. Stato dopo il primo giro (23/11/2026, sera)

Leggendo il codice per i lotti A–D è venuto fuori che una parte c'era già, e il piano va
corretto di conseguenza:

- **C'era già:** l'anteprima delle modifiche chieste nella chat del disegno, con la scheda
  «Computo» che mostra quantità prima/dopo e differenza in euro (`InterventiChatDisegno`);
  i prezzi per voce salvati nella variante (`prezziLavorazioni`); il computo generato dalla
  variante, che alla revisione successiva conserva prezzi e correzioni fatte a mano
  (`computoDaVariante`, `computoStudioRevisionato`). Quindi i lotti D ed E sono in buona
  parte fatti: mancavano i prezzi automatici e le lavorazioni indotte.
- **Fatto ora:**
  - Lotto A — `src/test/fixtures/piantaCollaudo.ts` e `planimetrieCollaudo.test.ts`: cinque
    locali con misure calcolate a mano, la parete 4,00 × 2,70 con porta (10,80 / 8,91 m²).
  - Lotto C — ogni parete si porta dietro le sue lavorazioni: demolita → macerie (con i m³)
    e ripristino del pavimento nella traccia; nuova → intonaco e tinteggiatura sulle due
    facce, battiscopa sui due lati meno le porte. Ognuna con la formula.
  - Lotto B — `prezziProposti.ts`: una voce senza prezzo nasce quotata dal listino
    dell'azienda (parole giuste, unità giusta, niente parole sbagliate) e altrimenti con un
    prezzo indicativo dichiarato «da confermare». Vale nello studio della variante, nella
    chat del disegno e nel computo generato. Il prezzo scritto a mano vince sempre.
- **Non fatto, e perché:** il prezzo automatico dal prezzario regionale. Provato su
  Lombardia 2026: la ricerca per parole restituisce forniture senza posa e voci d'altro
  genere, e per quattro lavorazioni su dieci niente. Un numero così, con scritto
  «Prezzario Lombardia», sembrerebbe attendibile e non lo è. Dal prezzario si sceglie a
  mano («Cambia prezzo» → «Scegli dal listino»). Serve un abbinamento verificato regione
  per regione (una tabella lavorazione → codice di tariffa), che è un lavoro a parte.
- **Resta:** anteprima con costo anche per il trascinamento a mano e per le proposte di
  Silvio (oggi solo chat del disegno); prezzo corretto che vale per tutta l'azienda (oggi
  vale per la variante: per l'azienda basta metterlo nel listino); righe del radiante e
  degli impianti «a corpo» ancora da quotare; lotti F, G, H, I, L.

## 8 ter. Stato a fine giornata (23/11/2026, notte)

Pubblicati dopo il primo giro:
- **Lotto L** — `previsioneLavori.ts` e il pannello «Previsione dei lavori» nello studio della
  variante: costo per fase con manodopera e materiali, costi extra accendibili, durata con
  le attese (14 giorni di intonaco prima della pittura, 21 di massetto sopra il radiante),
  spesa come intervallo che si allarga dove i prezzi sono indicativi.
- **Costo prima di salvare** — nella barra dell'anteprima di Silvio e nella barra
  dell'editor (vista «Progetto»), ricalcolato poco dopo ogni modifica (`CostoProposta`).
- **Lotto G** — pareti bloccate (`shared/planimetrie/vincoli.ts`): spunta nei dettagli della
  parete; il controllo sta nel punto unico in cui l'editor applica una modifica e nella
  costruzione dell'anteprima di Silvio.
- **Pavimento comune** — per bagni, lavanderie ed esterni si chiede.
- **Radiante** — pannelli, tubo e collettore quotati e nei tempi.

Non fatto, con il motivo:
- **Previsione che impara dai consuntivi.** Guardati i dati il 23/11: le commesse chiuse con
  date sono 214, di cui 176 della demo; quelle vere sono 38 in 5 aziende. E non esiste un
  «costo previsto» salvato da confrontare col consuntivo: c'è solo venduto contro costo.
  Una correzione calcolata così sarebbe un numero inventato. Serve prima salvare la
  previsione insieme alla commessa, poi confrontarla alla chiusura.
- **Prezzario regionale in automatico** — vedi sopra.
- **Lotto F (una sola chat)** e **Lotto I (telefono)** — non iniziati.

Regola presa dopo un errore: prima del push il controllo dei tipi dei file toccati deve
uscire con codice zero, e il push parte solo in quel caso (l'8a25df5e2 è partito con un
errore di tipo in un test; corretto un minuto dopo con 016978e59, prima che un giro di CI
lo vedesse).

## 9. Lotto L — Analisi dei costi e previsione (richiesta del 23/11)

Dalla pianta non solo quantità e prezzi: un'**analisi dei costi** e una **previsione** di
tempi e spesa del lavoro.

- **Costo per voce scomposto**: manodopera (ore × tariffa della squadra), materiali (dal
  fabbisogno, lotto materiali), noli e mezzi, smaltimento. Dove l'azienda ha tariffe e
  listini si usano i suoi; altrimenti rese e prezzi tipici, dichiarati come tali.
- **Costi extra**, che la pianta da sola non dice ma che si sanno prevedere: trasporto a
  discarica e oneri, ponteggi e opere provvisionali, protezioni e pulizie, oneri della
  sicurezza, pratiche (CILA/SCIA, direzione lavori), imprevisti in percentuale, spese
  generali e utile. Ogni extra è una riga con la sua regola (percentuale, a corpo, a
  quantità) che l'utente accende, spegne o corregge.
- **Tempi**: giorni per fase dalle quantità e dalle rese di posa (m² al giorno per
  squadra), nell'ordine del cantiere (demolizioni → murature → impianti → massetti →
  pavimenti → tinteggiatura → finiture), con i tempi morti obbligati (asciugatura di
  massetti e intonaci). Ne esce una durata prevista e una bozza di cronoprogramma.
- **Previsione che impara**: dove l'azienda ha commesse chiuse, la previsione si confronta
  con i suoi consuntivi (ore dei rapportini, costi veri per fase) e corregge rese e
  margini: «i tuoi bagni costano in media il 12% in più del preventivo».
- **Risultato a schermo**: costo previsto, prezzo di vendita, margine, durata, e
  l'intervallo (ottimista / probabile / prudente) invece di un numero solo.

Dipende dai lotti B e C. I costi restano dietro i permessi (`puo_vedere_costi`).
**Fatto quando:** sul progetto di collaudo una variante mostra costo scomposto, extra,
durata per fase e margine, e cambiando una parete cambiano tutti insieme.

## 8 quater. Stato al 24/11/2026

- **Controllore delle piante AI, misurato dal vivo** sulle stesse 4 descrizioni: prima 3 piante
  su 4 con difetti (8 in tutto), dopo 2 su 4 (4 in tutto), in 9–30 secondi. Il trilocale ne
  teneva 3 perché la prima chiamata era andata persa per un errore di geometria e la pianta
  rifatta non passava dal correttore: ora in quel caso c'è una terza chiamata (`genera.ts`).
- **Lotto F — una sola chat.** La chat del disegno prova prima le regole (gratis); se non
  capiscono la frase, Silvio la riscrive nei comandi che le regole eseguono
  (`shared/planimetrie/interpreteComandi.ts`, assistenza `comando` di `planimetria-genera`).
  L'AI non disegna: geometria, vincoli, anteprima e costi restano quelli della chat. Si paga a
  consumo, non un credito render. Se manca un dato, fa una domanda sola.
  **Fusione con Silvio sulla scheda (24/11, pomeriggio).** Sulla scheda della planimetria la
  chat è una sola (`SilvioPlanimetria`, logica in `src/lib/planimetrie/chatUnicaPlanimetria.ts`):
  1. regole del disegno (gratis) sulla variante in preparazione; 2. se non capiscono e la frase
  non è una domanda, l'interprete (a consumo); 3. le domande e ciò che il disegno non fa
  (finiture, nomi, destinazioni, «si può?») a Silvio (un credito render). L'interprete ora può
  rispondere `"silvio": true` per passargli la frase. I comandi del disegno non toccano la pianta:
  producono una variante nuova con la stessa anteprima, costo (`CostoProposta`) e «Salva come
  variante»; più comandi, e le proposte di Silvio fatte sopra, si sommano in una variante sola
  (`unisciAlDisegno`). Restano: scelta degli ambienti e «Tutto il piano», cronologia, analisi,
  correzioni sulla tavola. Senza una stanza scelta la domanda va alla stanza nominata o a tutto
  il piano (prima la chat era spenta). Non portato sulla scheda: la scheda «Computo» di
  `InterventiChatDisegno` con le spunte per intervento e i prezzi a mano (resta nell'editor; sulla
  scheda c'è il costo complessivo), allegati DWG/schizzo, dettatura, render dalla chat. La chat
  del disegno nell'editor e nel computo del preventivo (`inSilvio`) non è cambiata.
- **Lotto I — telefono.** Scheda e studio della variante stanno in 375 px senza scorrere di
  lato; la previsione dei lavori ha una disposizione a righe per il telefono. L'editor sul
  telefono non è stato rivisto.

## 8 quinquies. Riparatore degli accessi (24/11/2026, mattina)

Indagine sul trilocale senza misure (33 generazioni dal vivo): il controllore aveva ragione,
il difetto è del modello, che lascia stanze senza porta o con la porta verso uno spazio che
non ha disegnato, e al secondo giro spesso non migliora (3 casi su 6).
`shared/planimetrie/riparaAccessi.ts` apre a codice la porta sulla parete in comune con una
stanza di passaggio e toglie la porta verso fuori di bagni e camere; il modello riceve solo
ciò che il codice non sa riparare. Non passa da bagni e ripostigli, non apre un bagno sulla
cucina.
Misura dal vivo dopo la pubblicazione: 10 piante riuscite, 9 senza difetti (4 grazie al
riparatore), 1 con una camera isolata. Prima: circa una su tre con 6-8 stanze isolate.
Due chiamate su dodici hanno risposto 402 del provider perché lanciate in parallelo: le prove
dal vivo vanno fatte una alla volta.

## 8 sexies. Previsto e reale (24/11/2026)

Primo passo della «previsione che impara» (sezione 9): la previsione si salva con la commessa
e a lavori finiti si confronta col consuntivo.

- **Salvataggio** — nel pannello «Previsione dei lavori» di una variante collegata a una
  commessa, «Salva con la commessa» (solo con il permesso sui costi). Una riga in
  `commessa_previsioni_lavori` (migrazione `20290529100000`): la previsione intera in jsonb,
  totale, giorni, extra accesi, pianta, versione, variante e `versione_regole`
  (`VERSIONE_REGOLE_PREVISIONE` in `previsioneLavori.ts`: va cambiata quando cambiano rese o
  extra). Le righe non si riscrivono: un nuovo salvataggio aggiunge, vale l'ultima.
  Lettura e scrittura solo con `puo_vedere_costi`; un trigger controlla che commessa e pianta
  siano dell'azienda della riga.
- **Confronto** — in commessa, Margini e costi, sezione «Previsto e reale»
  (`PrevistoRealeCommessa`, calcolo in `lib/planimetrie/previstoReale.ts`): spesa prevista
  contro consuntivo (`economia_commesse`), durata contro le date di inizio e fine lavori (o
  primo e ultimo rapportino), giorni di lavoro contro i giorni con un rapportino, e per fase
  il costo vero della scheda Lavorazioni (`economiaFasi`, consuntivo) sulle fasi della commessa
  che hanno lo stesso nome (parole chiave: «Allestimento e demolizioni» → Demolizioni). Dove
  il dato manca, la cella dice «manca».
- **Limite noto**: il previsto viene dai prezzi delle voci (con spese generali e utile), il
  reale è un costo: lo scarto non è solo errore di previsione. Le fasi dai nomi generici
  («Finiture», «Opere edili») non si abbinano e restano fuori dalle righe.
- **Prova su Demo Azienda 2** (DEMO-2025-047, trilocale Via Roma 12): salvata come utente con
  il permesso sui costi (passando dalla RLS), rifiutata a un utente senza. La variante «Proposta
  A» della pianta aggiunge solo impianti, che la previsione non stima per fasi: la previsione
  di prova è un rifacimento sulle superfici della pianta (19.236 €, 47 giorni), calcolata con
  `previsioneLavori`. Contro la commessa: 129.996 € di consuntivo, 56 giorni dalle date,
  40 giorni di rapportini; Demolizioni abbinata ad «Allestimento e demolizioni» (5 giorni
  previsti, 7 di rapportini); intonaci, pavimenti e tinteggiature senza una fase con quel nome.
  Il pannello in commessa non è stato visto a schermo: nel browser di anteprima non c'è login.

**Passo successivo, non fatto: correggere le rese per azienda.** Oggi le previsioni salvate
sono una (la demo) e nessuna commessa vera ne ha una. Una correzione ha senso quando un'azienda
ha almeno una decina di commesse chiuse con previsione salvata e fasi abbinate: allora per
fase il rapporto medio reale/previsto (costo e giorni) diventa un coefficiente dell'azienda
che `previsioneLavori` applica alle rese, mostrato come tale («le tue demolizioni durano in
media il 40% in più»). Prima di allora sarebbe un numero inventato.

## 8 septies. Prezzo che resta all'azienda, confronto con i costi, editor sul telefono (24/11/2026)

- **Lotto B, l'ultimo pezzo.** «Correggi prezzo» su ogni lavorazione dello studio della
  variante e nella chat del disegno: il prezzo scritto va nel **listino dell'azienda**
  (`rst_listino_voci`, le stesse voci delle pagine del listino), quindi vale anche per le
  altre piante e per i preventivi. La stessa lavorazione aggiorna la voce invece di creare
  un doppione; manodopera e materiali si dividono con la quota tipica della lavorazione e
  il ricarico resta a zero, così il prezzo salvato è esattamente quello scritto.
  Provato su Demo 2: una voce a «Prezzo indicativo» corretta a 22,50 €/m² è diventata
  «Listino aziendale» e previsione e totali si sono rifatti da soli.
- **Lotto H.** Il confronto fra due soluzioni mostra ora anche **costo previsto con i costi
  in più** e **durata in giorni**, con le stesse regole del pannello della previsione.
  Prima si fermava all'importo delle voci valorizzate.
- **Lotto I, editor sul telefono.** A 375 px l'editor dava 245 px al disegno e 365 alle
  barre. Tolto il superfluo (titolo su una riga, sottotitolo e scritta del pulsante 3D solo
  da tablet in su, parola «Ambito» solo per i lettori di schermo): testata da 138 a 58 px,
  barre degli strumenti da 227 a 189, disegno da 245 a 363 px. Resta da rivedere la barra
  degli strumenti di disegno, che sul telefono occupa ancora tre righe.
