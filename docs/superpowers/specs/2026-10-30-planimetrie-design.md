# Planimetrie — piano di sviluppo

Data: 30/10/2026 · Stato: bozza da approvare dal founder

## Perché

Oggi in Edilizia in Cloud una ristrutturazione parte da misure scritte a mano, da una
piantina catastale in PDF o da un disegno del geometra che nessuno può modificare.
Le misure si ricopiano a mano nel computo metrico, il render AI lavora su una foto
senza sapere quanto è grande la stanza, e quando il cliente sposta una parete si
rifà tutto.

Vogliamo uno strumento di **planimetrie** dentro EiC che:

1. **genera** la pianta da quello che l'impresa ha già (foto di uno schizzo, catastale,
   PDF del tecnico, descrizione a parole, rilievo del sopralluogo);
2. si **modifica** facilmente nel browser, senza essere un tecnico CAD;
3. **calcola da sola le quantità** (mq di pavimento, mq di pareti al netto delle
   aperture, ml di battiscopa, volumi, numero di porte e finestre);
4. **alimenta il computo metrico**: le righe di misura prendono le quantità dalla pianta
   e si aggiornano quando la pianta cambia;
5. **alimenta il Render AI**: il render della stanza parte dalla pianta vera (misure,
   porte, finestre), e dalla pianta si può disegnare lo stato di progetto;
6. **esce** come PDF in scala con il cartiglio dell'azienda e come DXF per il tecnico.

Riferimento: [cadcraft](https://github.com/storytold/cadcraft), un CAD in stile AutoCAD
open source (Rust, licenza MIT/Apache-2.0, gira anche nel browser in WebAssembly, si
pilota via MCP). Lo usiamo come **motore e come esempio**, non lo ricopiamo riga per riga
(vedi «Scelte»).

## Obiettivi

- Una pianta di un appartamento (5–8 locali) si ottiene in **meno di 5 minuti** partendo
  da una foto o da un PDF, compresa la correzione a mano.
- Ogni quantità del computo che viene dalla pianta dice **da dove viene** («Pavimento
  Bagno + Cucina, 14,30 mq dalla pianta v3») e si aggiorna con un clic.
- Il render AI di una stanza rispetta misure e posizione di porte e finestre della pianta.
- Stato di fatto e stato di progetto sulla stessa pianta, con la convenzione italiana
  **giallo = demolizioni, rosso = nuove costruzioni**.
- PDF in scala (1:50, 1:100) su A4/A3 con cartiglio; DXF apribile in AutoCAD.

## Non obiettivi (per ora)

- Un AutoCAD completo nel browser (comandi, layer, snap avanzati, blocchi): resta
  eventualmente una «modalità CAD avanzata» in una fase successiva.
- BIM/IFC, calcoli strutturali, impianti in dettaglio, modellazione 3D libera.
- Deposito di pratiche edilizie (CILA/SCIA) dalla pianta.

## Cosa NON deve succedere (anti-obiettivi)

- **Termini da tecnico nelle schermate** (layer, snap, polilinea, entità): regola del
  founder, le schermate dicono cosa premere con parole semplici.
- **Misure inventate dall'AI presentate come vere.** Ogni misura ha un'origine:
  *rilevata* (inserita o confermata da una persona), *da documento* (letta da un PDF in
  scala), *stimata* (dedotta dall'AI). Le stimate si vedono diverse e il computo avvisa
  se usa quantità stimate.
- **Computo che cambia da solo senza dirlo.** Se la pianta cambia, il computo mostra
  «la pianta è cambiata: aggiorna le quantità» e si aggiorna solo con un clic.
- **Lento in cantiere.** Sul telefono si guarda la pianta e si correggono le misure;
  non si disegna (regola «sul telefono meno è meglio»).

## Scelte (decisioni di progetto — chiamata mia, da confermare)

### 1. Un modello «da edilizia», non linee CAD

Il cuore è un documento JSON con **oggetti che sanno cosa sono**, non linee:

```
Planimetria
 ├─ livelli[]            (piano terra, primo piano, …)
 │   ├─ muri[]           asse (p1,p2), spessore, altezza, tipo (portante/tramezzo),
 │   │                   stato (esistente / da demolire / nuovo)
 │   ├─ aperture[]       su un muro: porta/finestra/portafinestra, larghezza, altezza,
 │   │                   davanzale, verso di apertura, stato
 │   ├─ locali[]         nome, destinazione (bagno, cucina…), contorno (dai muri),
 │   │                   altezza, finiture (pavimento, rivestimento h)
 │   ├─ elementi[]       sanitari, arredi, caldaia, punti luce (simboli)
 │   └─ quote[], testi[]
 ├─ scala, unità (cm), nord, riferimenti (catastale, sopralluogo)
 └─ origine di ogni misura: rilevata | da_documento | stimata
```

Da questo modello si calcolano le quantità e si genera il disegno. Le linee CAD sono
un'**uscita** (DXF/PDF), non il dato.

### 2. cadcraft: motore sì, interfaccia no

- **Interfaccia nostra in React** (canvas 2D), pensata per l'impresa: «aggiungi stanza»,
  «sposta parete», «metti porta», misure che si scrivono sopra la parete.
- **Dai crate di cadcraft** (`geom`, `dxf`, `io`, compilati in WebAssembly) prendiamo
  ciò che è difficile e già fatto bene: geometria robusta (intersezioni, offset dei muri),
  lettura/scrittura **DXF e DWG**, esportazione PDF/SVG in scala. Licenza Apache-2.0:
  si può usare citando la fonte.
- **Fase 0 verifica** che i crate compilino in WASM con dimensioni accettabili
  (obiettivo < 3 MB compressi, caricati solo nella pagina delle planimetrie). Se non
  regge, ripiego: geometria in TypeScript e scrittura DXF con una libreria JS.
- **«Modalità CAD avanzata»** (fase 6, facoltativa): `cadcraft-web` intero dentro la
  pagina, per il tecnico che vuole lavorare di precisione sul DXF.

### 3. Generazione con l'AI

Ingressi, in ordine di importanza:
1. **PDF/immagine di una pianta** (catastale, del geometra): modello di visione →
   JSON del modello sopra; la scala si ricava da una quota letta o da una misura che
   l'utente conferma («questa parete è 4,20 m»).
2. **Foto di uno schizzo a mano** con misure scritte.
3. **Descrizione a parole** («trilocale 75 mq, bagno 2×2,5, cucina abitabile»): genera
   una pianta plausibile, tutta *stimata*.
4. **Sopralluogo EiC** (modulo Sopralluoghi, già esistente): i locali e le misure
   rilevate diventano la pianta.

Una sola edge function `planimetria-genera` (`serveConMetricheRapida`, lavoro in
background, crediti AI come i render, `segnalaErroreAI` sugli errori del provider).
Il risultato passa sempre da un **controllo geometrico** (muri chiusi, locali con area
positiva, aperture dentro i muri) prima di essere salvato: niente piante rotte.

### 4. Quantità

Libreria pura TypeScript `src/lib/planimetrie/quantita.ts`, condivisa con le edge
(`shared/planimetrie/`), coperta da test. Per locale: pavimento mq, perimetro ml,
pareti lorde/nette mq (meno le aperture oltre una soglia configurabile, come da
prassi del computo), soffitto mq, volume mc, battiscopa ml (meno le porte). Per pianta:
muri da demolire (mq/mc), muri nuovi (mq), numero e misure delle aperture per tipo,
totali per destinazione. Ogni quantità ha una **chiave stabile**
(`locale:<id>.pavimento_mq`) usata dal computo.

### 5. Collegamento al computo metrico

- `computo_voci_misure` ha già `formula`: una riga di misura può avere un
  **riferimento alla pianta** (`planimetria_id`, versione, chiave/i della quantità).
- Nell'editor del computo, su una voce: «Prendi dalla pianta» → scelgo i locali e la
  quantità → nascono le righe di misura (una per locale, con il nome del locale nella
  descrizione).
- Ogni pianta ha **versioni**: il computo ricorda la versione usata; se esiste una
  versione più nuova mostra il confronto (vecchia → nuova quantità) e aggiorna solo
  con conferma.
- Dalla pianta si può anche **proporre un computo**: dai locali e dagli stati
  (demolizioni/nuovo) l'AI propone le voci (riusa il match voci↔listino del Preventivo AI).

### 6. Collegamento al Render AI

- Nuova voce nella sezione **Render AI**: «Planimetrie» (crea/genera/modifica), accanto
  a bagno, stanza, facciata….
- Dal locale della pianta: **«Fai il render di questa stanza»** → `generate-room-render`
  riceve misure, aperture e una vista dall'alto come vincolo, oltre alla foto se c'è.
- **Pianta arredata / di progetto**: l'utente disegna lo stato di progetto (o chiede
  all'AI «proponi una disposizione») e ne esce una **pianta colorata da presentazione**
  (vista dall'alto realistica) da mettere nel preventivo.

### 7. Dove vive nell'app

- **Render AI → Planimetrie**: elenco e editor (ingresso principale).
- **Preventivi / Computo**: scheda «Pianta» nel computo e nel preventivo di ristrutturazione.
- **Commessa → Documenti**: la pianta della commessa, con le versioni.
- **Sopralluogo**: «Crea la pianta da questo sopralluogo».
- **Telefono**: vedere, misurare, correggere una misura, fotografare; niente disegno.

### 8. Dati

Tabelle (RLS per azienda, `REVOKE` da anon, permessi come i render):
- `planimetrie` — azienda, titolo, collegamenti (commessa, preventivo, computo,
  sopralluogo, contatto), stato, versione corrente.
- `planimetrie_versioni` — documento JSON, quantità calcolate (cache), autore, nota,
  origine (manuale / AI da PDF / AI da foto / da sopralluogo).
- `planimetrie_file` — sorgenti caricate ed esportazioni (PDF, DXF, PNG) nello storage.
- Riferimenti nel computo: colonne nuove su `computo_voci_misure`
  (`planimetria_id`, `planimetria_versione`, `planimetria_chiavi`).

Migrazioni secondo `CLAUDE.md` (idempotenti, `apply_migration`, riallineo della versione).

### 9. Uscite

- PDF in scala con cartiglio (logo, cliente, indirizzo, data, scala, versione), legenda
  giallo/rosso, tabella dei locali con superfici.
- DXF (layer per muri, aperture, quote, testi) e PNG.
- La pianta allegata al preventivo PDF (opzione nel preventivo, come i render).

## Fasi

Ogni fase è rilasciabile da sola e prova qualcosa al founder prima della successiva.

| Fase | Cosa | Fatto quando |
|---|---|---|
| **0. Prova tecnica** | crate cadcraft in WASM (geometria + DXF); prototipo locale `/dev/planimetria` come `/dev/disegno-serramenti` | sapere se il motore regge in pagina (peso, velocità); una pianta disegnata a mano esce in DXF e si apre in AutoCAD |
| **1. Modello + quantità** | schema JSON, controllo geometrico, libreria quantità con test, tabelle e versioni | una pianta di prova dà le stesse quantità di un computo fatto a mano (scarto 0) |
| **2. Editor** | editor React: stanze, pareti, porte/finestre, misure scritte sulla parete, annulla/ripeti, stato di fatto/progetto; vista telefono | un utente non tecnico disegna un bilocale in 10 minuti senza spiegazioni |
| **3. Generazione AI** | `planimetria-genera` da PDF/immagine, schizzo, testo, sopralluogo; conferma della scala; misure stimate segnalate | 10 piante catastali vere → 8 corrette dopo al massimo 5 correzioni ciascuna |
| **4. Computo** | «Prendi dalla pianta», versioni, avviso di pianta cambiata, proposta voci | in Demo 2 un computo ristrutturazione si fa partendo dalla pianta |
| **5a. 3D** | volume 3D dalla pianta nel browser (three.js), telecamera libera e «entra nella stanza», esportazione glTF/GLB e OBJ | un bilocale disegnato si gira in 3D e si apre in Blender |
| **5b. Render AI** | voce Planimetrie nella sezione Render AI, render della stanza da foto o da una vista del 3D, con misure e aperture della pianta | il render rispetta porte/finestre della pianta nei test di QA visivo |
| **6. Uscite** | PDF in scala con cartiglio, DXF/PNG, allegato al preventivo | il PDF stampato a 1:50 si misura col righello |
| **7. CAD avanzato** (facoltativa) | `cadcraft-web` dentro la pagina per il tecnico, import DWG | decidere dopo la fase 6 se serve davvero |

Ordine e parallelo:
- 0 → 1 sono la base: in serie.
- La prova del motore cadcraft (0) e il modello con le quantità (1) possono andare in
  parallelo: la 1 non dipende dal motore (geometria in TypeScript), la 0 dice solo se le
  esportazioni DXF/DWG useranno i crate di cadcraft.
- Dopo la 1 possono andare **in parallelo**: 2 (editor), 3 (generazione AI),
  5a (3D) e 6 (uscite), perché lavorano tutte sul modello della fase 1 in cartelle
  diverse (`src/components/planimetrie/editor`, `supabase/functions/planimetria-genera`,
  `src/lib/planimetrie/tred`, `src/lib/planimetrie/esporta`).
- 4 (computo) e 5b (render AI) vengono dopo la 2.

## Collaudo

- Test della libreria quantità su piante campione (rettangolo, L, con nicchie, con
  porte su pareti diverse) con i risultati fatti a mano.
- Raccolta di 10–20 piante vere (catastali e del geometra, anonimizzate) come banco di
  prova della generazione AI, con punteggio salvato a ogni modifica del prompt.
- Ogni fase provata nel browser su Demo Azienda 2 prima di dire «fatto».
- Prima di ogni push: `npm run build`, cricchetto dei tipi, test (vedi memoria EiC).

## Decisioni prese dopo la revisione (chiamata mia, da controllare)

- **Stato di fatto e progetto nello schema fin dalla fase 1.** La pianta ha uno
  *stato di fatto* e una o più *proposte* (A, B…), ognuna con i suoi muri, aperture e
  locali. In v1 l'interfaccia ne mostra una sola, ma lo schema le regge già. Le chiavi
  delle quantità comprendono lo stato (`fatto:locale:<id>.pavimento_mq`,
  `progetto:<proposta>:locale:<id>.pavimento_mq`): «pavimento da demolire» legge il
  fatto, «pavimento nuovo» legge il progetto.
- **Computo contrattuale: la pianta non lo cambia.** Se il computo è contrattuale
  (blocco già esistente su `computo_voci_misure`), una pianta più nuova propone una
  **perizia di variante**, non un aggiornamento. Prima della firma: aggiornamento con
  conferma.
- **Da preventivo a commessa: la stessa pianta.** La pianta passa alla commessa e le
  versioni continuano; il preventivo firmato ricorda la versione con cui è stato fatto.
- **Sopralluogo in v1: solo l'elenco delle stanze.** Dal sopralluogo escono le stanze
  con mq e altezza, disposte a riquadri e segnate *stimate* per la forma; il modulo
  Sopralluoghi non cambia.
- **DXF del geometra come sfondo da ricalcare (fase 3).** Si carica il DXF, si vede sotto
  la pianta in scala e si ricalca; il riconoscimento automatico dei muri dal DXF e il DWG
  restano alla fase 7. La fase 0 prova anche la lettura del DXF nel browser.
- **Pianta da presentazione: disegno nostro, in scala.** Colori e materiali (texture di
  pavimento, sanitari, arredi) su un disegno vettoriale fedele: fase 6. Una versione
  «immagine AI» si potrà aggiungere dopo, con la scritta «immagine indicativa, non in scala».

## Lasciato a chi costruisce

- Libreria di disegno del canvas (Konva, Pixi o canvas puro).
- Modello AI di visione per la lettura delle piante (da misurare in fase 3).
- Dettaglio dei simboli (sanitari, arredi) e delle soglie di deduzione delle aperture.

## Risposte del founder (30/10/2026)

«Procedi, crea il piano e implementalo; apriti anche varie fasi di lavoro. Basta che sia
semplice e intuitivo; da lì posso generare le esportazioni nei vari formati, generare
anche il 3D ed eventualmente anche i render con l'AI.»

Ne discendono:
- **Semplice e intuitivo prima di tutto**: ogni schermata deve poterla usare un titolare
  d'impresa senza spiegazioni.
- **3D dalla pianta (nuova fase 5a)**: dal modello si estrude un volume 3D (muri con
  altezza, buchi di porte e finestre, pavimenti, sanitari/arredi come blocchi semplici),
  navigabile nel browser (three.js). Esportazioni 3D: glTF/GLB e OBJ.
- **Render AI anche senza foto**: il render della stanza può partire da una vista del 3D
  (immagine di partenza scelta dall'utente girando la telecamera) oltre che da una foto.
- **Esportazioni nei vari formati**: PDF in scala, DXF, PNG/SVG, glTF/GLB, OBJ.

Chiamate mie sulle domande rimaste senza risposta (da controllare):
- **Computo**: si collega per primo il computo con le righe di misura
  (`computo_voci_misure`, computo di commessa); il preventivo Ristrutturazione dopo,
  aggiungendogli le righe di misura.
- **Accesso e costi**: le planimetrie (editor, quantità, 3D, esportazioni) sono per tutte
  le aziende; la **generazione AI della pianta e i render AI** scalano crediti come i
  render di oggi.
- **Ingressi**: primo il PDF/immagine (catastale o del geometra), poi lo schizzo, il
  testo, il sopralluogo; il DXF come sfondo da ricalcare.

## Domande aperte per il founder (superate dalle risposte sopra)

1. **Quale computo per primo.** In EiC ci sono tre computi: quello del preventivo
   Ristrutturazione (`rst_computo_voci`, solo quantità per ambiente, senza righe di
   misura), il computo del preventivo (`computo_preventivo_drafts`, misure in JSON) e il
   computo di commessa / lavori pubblici (`computo_voci_misure`). Il collegamento va
   costruito per uno di questi per primo; nel Ristrutturazione vanno prima aggiunte le
   righe di misura.
2. **Render della stanza: sempre da una foto, o anche senza?** Oggi `generate-room-render`
   modifica una foto. Con la foto obbligatoria la fase 5 è piccola (misure e aperture nel
   prompt); senza foto serve un volume 3D dalla pianta come immagine di partenza ed è la
   fase più grande del progetto.
3. **Chi la usa e cosa si paga.** Le planimetrie sono di tutte le aziende o solo di chi ha
   il modulo Render / Ristrutturazioni? Generazione AI ed esportazioni a crediti come i
   render, o comprese nel piano?
4. **Da cosa partono di solito le imprese:** catastale, disegno del geometra (PDF o DXF),
   schizzo a mano, o nulla (misurano sul posto)? Decide l'ordine degli ingressi della fase 3.
