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
