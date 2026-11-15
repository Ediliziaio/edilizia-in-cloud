# Commessa generale dai documenti — piano del 15/11/2026

Richiesta del titolare: quando si crea una commessa generale, soprattutto un appalto per
la pubblica amministrazione, si caricano il contratto, il computo e gli altri allegati.
L'AI li **legge per intero**, con un'animazione che fa vedere a che punto è. Poi si apre
un **grande popup**, sul modello di «Crea con Silvio», dove la commessa generale si
costruisce da quello che è stato letto. Il sistema sa cosa cercare in base al tipo
scelto: un appalto pubblico non è un'operazione privata.

Valgono le regole di `docs/piano-ai-addebiti-e-automazioni-20261115.md`:
- l'AI si usa solo per quello che parser, regole e dati non sanno fare;
- ogni chiamata è addebitata all'azienda;
- **estrarre e confermare restano due passi distinti**.

Questo è solo il piano. Non si scrive codice finché il titolare non sceglie il lotto da
cui partire.

---

## 0. Cosa insegna un contratto vero

Il documento di prova è un appalto pubblico registrato di 76 pagine. È stato letto tutto,
a blocchi. I suoi dati non entrano in questo repository: qui ci sono solo le lezioni.

1. **Il PDF è fatto solo di immagini.** Anche le pagine nate al computer sono state
   stampate e riscansionate. Senza OCR non si legge niente.
2. **Il contratto vero sono 11 pagine.** Le altre 65 sono allegati:
   - relazione di progetto con il quadro economico;
   - cronoprogramma;
   - computo metrico estimativo;
   - elenco prezzi;
   - stima degli oneri della sicurezza;
   - polizza CAR/RCT con appendice;
   - autocertificazioni con **documenti d'identità**;
   - verbale di consegna;
   - allegato ambiente generico;
   - attestazione sulle migliorie.

   Circa 25 pagine sono bianche, frontespizi o materiale senza dati utili.
3. **Non è un contratto autonomo: è un contratto applicativo di un accordo quadro.** Ha
   due CIG, quello dell'accordo e quello derivato. Un'estrazione ingenua prende quello
   sbagliato.
4. **Molte regole economiche non sono nel file.** Ritenute, termini di pagamento,
   subappalto, fatturazione elettronica, foro e importo della cauzione sono rimandati al
   capitolato speciale e all'accordo quadro, che nel PDF non ci sono. Anche l'anticipazione
   è solo «prevista», senza percentuale. La funzione deve dire **«non trovato, sta nel
   capitolato»**, non inventare.
5. **Gli stessi dati compaiono più volte, con valori diversi:**
   - la penale ha un valore nel contratto e il doppio nel verbale;
   - l'importo si legge in tre versioni: totale del quadro economico, lavori lordi, importo
     contrattuale;
   - la tabella delle categorie somma male;
   - inizio e fine lavori hanno date diverse in contratto, verbale e polizza.

   Il sistema deve mostrare **tutti** i valori con la loro pagina e far scegliere,
   non tenere il primo che trova.
6. **Ribasso e base d'asta stanno solo negli allegati** (verbale e attestazione), non
   nell'articolato. Leggere «solo il contratto» non basta.
7. **I conti tornano quasi sempre, ed è il controllo migliore:**
   - base × (1 − ribasso) + oneri = importo contrattuale;
   - la somma delle voci del computo = base;
   - la somma della stima sicurezza = oneri;
   - consegna + durata = fine lavori.

   Dove non tornano, c'è un errore del documento o della lettura, e va detto.
8. **Ci sono dati sensibili mescolati agli utili:** IBAN dedicati, codici fiscali dei
   delegati, documenti d'identità. Vanno riconosciuti ed esclusi, oppure trattati a parte.
9. **Alcune parti sono scritte a mano** (gli estremi di registrazione) o hanno timbri
   sovrapposti. Vanno sempre fatte rivedere da una persona.
10. **I numeri di pagina stampati non sono quelli del PDF:** ogni elaborato ricomincia da 1.
    La citazione deve usare la pagina del PDF.

---

## 1. Cosa c'è già, e dove ci si appoggia

| Pezzo | File | Cosa fa oggi | Cosa ne facciamo |
|---|---|---|---|
| Popup «Nuova commessa generale» | `src/components/orders/generali/NuovaGeneraleDialog.tsx`, `src/hooks/useAvviaGenerale.ts` | modello, nome, committente, pubblico/privato, indirizzo, consegna, valore, piano economico; spunta «Ho il contratto» che dopo la creazione apre `?scheda=contratto&importa-contratto=1` | diventa la **porta**: accanto a «Crea vuota» compare «**Crea dai documenti**» |
| Tipi di generale | `src/lib/orders/commesseGenerali.ts` (`MODELLI_GENERALE`: appalto, sviluppo, compravendita), `company_commesse_generali_settings` | modelli accesi per azienda | i tipi del §2 sono questi tre, più una **forma** dentro l'appalto |
| Dati per tipologia | `src/lib/orders/generali/datiOperazione.ts`, RPC `commessa_generale_dati_salva` | sezioni «Committente e figure», Area, Titolo, Immobile… | è il **catalogo** di destinazione dei campi letti |
| Lettura del contratto alla creazione | `src/components/orders/ContractImportDialog.tsx`, `supabase/functions/generic-doc-ai-extract` (`contratto_commessa`), `src/lib/orders/contractExtract.ts`, `contrattiDestinazioni.ts` (`generaleDaContratto`) | un file, max 18 MB, mandato **intero** in una chiamata (`pdf_vision_extract`); l'originale va in `documenti-smart` e `collegaOriginaleAi` lo copia nella commessa; «saldo senza cifra = resto» in `contractToInstallments` | si **riusano** lo schema, la riconciliazione e la copia dell'originale; la chiamata unica non regge 76 pagine scansionate e si sostituisce con la lettura a pagine del §3 |
| Contratto e SAL della generale | `src/components/orders/generali/contratto/*`, `generale_contratti`, `generale_contratto_garanzie`, `generale_elenco_prezzi`, `generale_computo`, `generale_sal*`, `src/lib/orders/generali/contratto.ts` | base, ribasso, oneri, date, penali, anticipazione, ritenuta, CIG, CUP, split; garanzie; elenco prezzi; SAL | sono le **tabelle di arrivo**; mancano alcune colonne (§4) |
| Dati appalto e fatturazione PA | `src/components/orders/riferimentiPa/*`, `order_riferimenti_pa` (già con `fonte = 'contratto_generale'`), `anagrafica_uffici_pa`, `anagrafiche_native.split_payment / codice_ipa` | righe di contratto/ordine/convenzione con CIG e CUP, ufficio, codice univoco | ci si **appoggia** al lavoro della sessione Fattura PA: noi scriviamo le righe, loro le portano in fattura e nell'XML (lotti 4-5 del loro piano) |
| Computo | `supabase/functions/_shared/computoXpwe.ts`, `computoPrimusPdf.ts`, `computoExcel.ts`, `src/lib/computo/leggiFileComputo.ts`, `computo-ai-extract` | XPWE, PDF di PriMus ed Excel letti **senza AI**; gli altri PDF via AI con stato in `computo_uploads` | **prima** questi lettori; AI solo per un computo scansionato |
| Fasi dal computo, cronoprogramma | `ImportaFasiDaComputo.tsx` (RPC `commessa_importa_fasi`), `computo-cronoprogramma`, `src/lib/computo/cronoprogramma.ts` | capitolo → fase, riga → sottofase | si richiamano alla conferma |
| PDF lunghi o scansionati | `supabase/functions/_shared/pdfExtraction.ts` (`readPdfPages`, `extractPdfWithCoverage`, `pdfCoverage`) | testo nativo per pagina; OCR solo per le pagine-immagine, ma con un tetto (8–12 pagine) e una scadenza | è il **motore** della lettura; il tetto si supera lavorando a giri (§3) |
| «Crea con Silvio» | `src/components/silvio-commessa/*` (`CreaConSilvioDialog`, `ColonnaFonti`, `ColonnaCommessa`, `VisoreFonte`), `commessa_bozze`, `commessa_bozze_scritture`, RPC `commessa_crea_con_silvio` | tre colonne Fonti · Chat · Commessa, bozza salvata, citazioni con pagina, creazione in una transazione con «Annulla tutto» | è il **modello del grande popup** (§4): si riusano `VisoreFonte` e lo schema della bozza |
| Animazioni | `src/components/computo/AIProcessingStage.tsx` (framer-motion, fasi, timer, barra), `src/lib/computo/leggiVoci.ts` (`Avanzamento`, «3/10 pagine») | avanzamento per fasi del computo | base dell'animazione per pagina |
| Macro-commessa | `CommessaGeneraleDettaglio.tsx`, `schede.tsx`, `piano/PianoEconomico.tsx`, unità, «Chiudi l'operazione» | pagina, piano, unità, chiusura | non si tocca: la creazione da documenti arriva alla stessa pagina |
| Addebito AI | `_shared/aiRouter.ts` (`aiRouterComplete`), `esitoLavoroAi.ts` (`registraEsitoLavoroAi`), `aiRequestGuard.ts` (`runGuardedAiRequest`), `docs/ai-addebiti-censimento.md` | addebito, cache, idempotenza, esiti senza AI | ogni chiamata nuova passa da qui ed entra nel censimento |

**Da non toccare:** il lavoro della sessione sulle operazioni immobiliari (sviluppo e
compravendita: piano, unità, simulatore, `ImportaBusinessPlanDialog`). Per quei tipi la
creazione da documenti **chiama** le loro RPC e i loro import, senza modificarli (§2.3, §2.4).

---

## 2. I tipi di commessa generale: cosa si carica, cosa si cerca

Il tipo si sceglie **prima** di caricare: decide l'elenco dei documenti attesi, lo schema
di estrazione e le regole di controllo. Il catalogo è un solo file,
`src/lib/orders/generali/documenti/catalogo.ts`, condiviso con l'edge function come
`datiOperazione.ts`.

Per ogni tipo, il catalogo dice:
- quali documenti ci si aspetta;
- quali **campi** si cercano, con il campo di destinazione;
- quali **controlli** si fanno;
- cosa manca se un documento non c'è («penali: rinvio al capitolato → carica il capitolato»).

### 2.1 Appalto pubblico (caso guida)

Si sceglie fra tre **forme**:
- **contratto singolo**;
- **accordo quadro**: la generale è l'accordo, ogni contratto applicativo è una figlia;
- **contratto applicativo** di un accordo già presente: si aggiunge come figlia alla
  generale dell'accordo.

**Documenti attesi** (tutti facoltativi tranne il contratto):

| Documento | Come si legge |
|---|---|
| Contratto o contratto applicativo | a pagine, testo nativo o OCR |
| Accordo quadro | a pagine |
| Capitolato speciale (parte generale e tecnica) | a pagine; si cercano **solo** le clausole economiche (pagamenti, SAL, ritenute, penali, anticipazione, subappalto, revisione prezzi) |
| Computo metrico estimativo | XPWE / Excel / PDF PriMus **senza AI**; scansione → AI |
| Elenco prezzi | come il computo |
| Stima degli oneri della sicurezza | come il computo, controlla gli oneri |
| Cronoprogramma | Excel o PDF; spesso una tabella ruotata a colori → AI con l'immagine |
| Quadro economico / relazione | a pagine |
| Verbale di consegna | a pagine; dà consegna, fine prevista, ribasso, base |
| Offerta economica / verbale di aggiudicazione | a pagine; dà il ribasso |
| Polizze (CAR/RCT, cauzione definitiva, anticipazione) | a pagine |
| PSC, POS, DUVRI | **solo archiviati**, non letti |

**Campi** (in parentesi la destinazione, vedi §5):
- **Parti:** stazione appaltante, ufficio, codice IPA (anagrafica committente, `dati.appalto.stazione_appaltante`); appaltatore e forma (singola, RTI con mandataria e mandanti e relative quote, consorzio, ausiliarie) (nuovo `dati.appalto.esecutore`); firmatari.
- **Codici:** CIG (dell'accordo e derivato, **distinti**), CUP o «non dovuto», codice univoco dell'ufficio, numero e data del contratto e del protocollo, estremi di registrazione (`generale_contratti.cig/cup/riferimento/data_firma`, `order_riferimenti_pa`).
- **Figure:** RUP, direttore lavori, CSE, eventuale «da nominare» (`dati.appalto`).
- **Oggetto e luogo:** oggetto, indirizzo o elenco dei tratti (strade, km), comuni (nome, indirizzo, `dati.appalto.luoghi`).
- **Importi:** base d'asta, ribasso %, oneri della sicurezza non ribassabili, costo della manodopera, importo contrattuale, quadro economico (lavori, somme a disposizione, totale), corpo/misura/misto, categorie SOA prevalente e scorporabili con importi.
- **Tempi:** durata in giorni (naturali e consecutivi), decorrenza, consegna (anche «in via d'urgenza»), fine prevista, ultimazione, collaudo o CRE e relativi termini.
- **Penali:** per mille al giorno o importo fisso, massimale %, penali particolari (documenti, ritardi intermedi), risoluzione oltre il massimale.
- **Pagamenti:** anticipazione % e garanzia, SAL (per importo con soglia minima, o per tempo con cadenza), ritenuta 0,5% e altre, termini del certificato di pagamento, rata di saldo e sua garanzia, split payment, fatturazione elettronica.
- **Garanzie:** cauzione definitiva, polizza CAR (somma assicurata per partita), massimale RCT, garanzia sull'anticipazione e sulla rata di saldo; compagnia, numero, date di copertura.
- **Subappalto:** limite, pagamento diretto, obblighi.
- **Revisione prezzi:** sì/no, soglia, clausola.
- **Tracciabilità:** conti dedicati e delegati → **vedi domanda 4**; per regola non si salvano IBAN né codici fiscali di terzi senza conferma esplicita.
- **Allegati citati:** elenco con «presente nei file caricati / solo citato».

**Controlli** (deterministici, nessuna AI):
- base × (1 − ribasso) + oneri = contrattuale, con tolleranza di 1 €;
- Σ computo = base; Σ sicurezza = oneri; Σ categorie SOA = lavori;
- consegna + durata = fine prevista (giorni naturali, il primo giorno contato come da
  documento: si mostrano le due letture se differiscono di un giorno);
- polizza CAR partita lavori = importo contrattuale; massimale RCT come da contratto;
- formato del CIG (10 caratteri) e del CUP (15 caratteri), codice univoco a 6 caratteri;
- penale massima ≤ 10%, ritenuta 0,5% (avviso se diversa);
- il CIG derivato è diverso dal CIG dell'accordo quadro;
- lo stesso campo letto con **valori diversi** in punti diversi → **conflitto**, mai una scelta automatica.

### 2.2 Appalto privato

**Documenti:** contratto d'appalto o scrittura, computo, capitolato, cronoprogramma,
eventuali polizze.

**Campi:** come il pubblico, **senza** CIG, CUP, RUP, ufficio e split payment.

In più:
- committente privato o azienda, risolto per P.IVA o CF;
- prezzo a corpo o a misura;
- acconto alla firma e rate legate agli eventi (riusa `contractToInstallments` e la
  regola «saldo senza cifra = resto»);
- ritenuta di garanzia contrattuale (spesso 5–10%);
- direttore lavori del committente;
- variazioni ammesse.

**Controlli:**
- Σ rate = importo;
- acconto ≤ importo;
- con le date, le rate a scadenza fissa restano dentro la durata.

### 2.3 Sviluppo immobiliare (si appoggia al lavoro delle operazioni immobiliari)

**Documenti:**
- atto d'acquisto dell'area o preliminare;
- titolo edilizio (PdC, SCIA);
- business plan in Excel, che si legge con l'import già esistente, **senza AI**;
- computo;
- capitolato di vendita;
- planimetrie e tabella delle unità.

**Campi:**
- area: catasto, superficie, cubatura (`dati.area`);
- titolo edilizio: tipo, numero, data, scadenza (`dati.titolo`);
- tecnici (`dati.tecnici`);
- prezzo d'acquisto e data (voce del piano);
- elenco delle unità: tipo, m², piano (bozza per `generale_unita_serie`).

**Controlli:**
- la scadenza del titolo viene dopo il rilascio;
- Σ m² delle unità ≈ superficie dichiarata.

### 2.4 Compra, ristruttura, vendi

**Documenti:** atto o compromesso, visura catastale, perizia, titolo dei lavori,
preventivi di ristrutturazione.

**Campi:** `dati.immobile` (indirizzo, catasto, m², prezzo, venditore, notaio, agenzia,
compromesso, rogito), `dati.ristrutturazione`, `dati.rivendita`.

**Controlli:**
- il rogito viene dopo il compromesso;
- il prezzo dell'atto è uguale al prezzo del compromesso, oppure si segnala.

### 2.5 Accordo quadro e manutenzione

È l'appalto pubblico in forma «accordo quadro».

- La generale porta **il tetto** dell'accordo, la durata, il ribasso unico, l'elenco
  prezzi e le penali dell'accordo.
- Ogni **contratto applicativo** (o «ordine di lavoro») caricato dopo diventa una
  **figlia**. Da lui si leggono:
  - il proprio CIG derivato;
  - l'importo;
  - le date;
  - i luoghi;
  - il computo, che diventa `generale_computo`: le voci dell'elenco prezzi passano alla
    figlia con le loro quantità.
- **Controllo:** Σ importi dei contratti applicativi ≤ tetto dell'accordo, con avviso
  sotto il 10% residuo.

Il documento d'esempio è esattamente questo caso: un contratto applicativo il cui
accordo quadro non è stato caricato.

---

## 3. Il percorso: carico, leggo tutto, controllo

### 3.1 Caricamento

- Nel popup «Nuova commessa generale», sotto il tipo, compare il riquadro
  **«Crea dai documenti»**. Prende **più file insieme** (PDF, immagini, XPWE, XLSX,
  P7M). La spunta di oggi «Ho il contratto: importalo con l'AI dopo la creazione» lascia
  il posto a questo riquadro.
- Ogni file si riconosce dal nome e dalla prima pagina (contratto, computo, polizza…).
  Il tipo riconosciuto si mostra e si può cambiare con un menu.
- **Limite per file: 100 MB, 400 pagine.** Il caricamento va direttamente nello storage
  (bucket `documenti-smart`, cartella `<azienda>/generali-letture/<lettura>/`), non nel
  corpo di una chiamata: oggi il limite di 18 MB esclude proprio il caso guida.
- Un file firmato `.p7m` si sbusta lato server prima di leggerlo (c'è già per le fatture).
- Prima di partire, il popup dice:
  - **quante pagine** ci sono;
  - quante hanno già il testo;
  - quante vanno lette con l'OCR;
  - **il costo stimato** in crediti AI, con il controllo del credito disponibile.

  Si parte solo con «Leggi».

### 3.2 Prima i dati strutturati

In quest'ordine, e l'AI interviene solo dove il passo prima non è bastato:

1. **File strutturati:** XPWE, XLSX e PDF di PriMus vanno ai lettori esistenti
   (`_shared/computoXpwe.ts`, `computoExcel.ts`, `computoPrimusPdf.ts`). L'esito si
   registra con `registraEsitoLavoroAi(..., 'senza_ai')`.
2. **Testo nativo del PDF:** `readPdfPages` legge il testo pagina per pagina.
3. **Pagine che sono immagini:** si manda all'OCR **una pagina per chiamata**.
   - La chiave di cache e di idempotenza è lo `sha256` dell'immagine della pagina: la
     stessa pagina, ricaricata o letta da un altro utente della stessa azienda, non si
     paga due volte.
   - Le pagine bianche si riconoscono senza AI (immagine quasi uniforme) e si saltano.
4. **Classificazione delle pagine, senza AI:** si fa per parole chiave sul testo.
   - Frontespizio, articolato, computo, elenco prezzi, sicurezza, polizza, verbale,
     cronoprogramma.
   - «Documento d'identità» e «autocertificazione» si **escludono**: la pagina si conserva
     nell'originale ma non va all'estrazione.
   - La classificazione decide quale schema applicare a ogni gruppo di pagine.
5. **Tabelle** (computo, elenco prezzi, sicurezza):
   - se il testo OCR ha le colonne, le legge un parser a colonne, che riusa
     `computoPrimusPdf.ts` dove la forma è PriMus;
   - solo se fallisce, l'AI legge la tabella pagina per pagina con lo schema delle voci.
   - La somma delle voci deve tornare con il totale della pagina («a riportare»). Se non
     torna, la pagina si rilegge **una volta** e poi si segnala.
6. **Estrazione dei campi** (§2): **AI**, un gruppo di pagine alla volta, con lo schema
   del tipo. Ogni campo ha questa forma:

   ```json
   {
     "valore": "…",
     "file": "…",
     "pagina": 4,
     "citazione": "…",
     "certezza": "letto | calcolato | dedotto"
   }
   ```

   Un campo trovato in più gruppi di pagine conserva **tutte** le occorrenze.
7. **Controlli:** le regole del §2 e i conflitti. Sono codice puro, condiviso con il
   browser.

**Lettura completa**, cioè «letto tutto»: la lettura è finita solo quando **ogni pagina**
ha uno stato fra questi:
- letta dal testo;
- letta con l'OCR;
- bianca;
- esclusa (dati personali);
- illeggibile.

Il popup mostra il conto: «76 pagine: 0 dal testo, 51 lette con l'OCR, 7 bianche,
10 escluse, 0 illeggibili». Non esiste un «letto» con pagine saltate per tetto o per
tempo.

### 3.3 Dove gira

- Una edge function nuova, **`generale-documenti-leggi`**.
- Due tabelle di lavoro:
  - `generale_letture`: una per caricamento, con azienda, utente, tipo, stato e costo
    accumulato;
  - `generale_lettura_pagine`: una riga per pagina, con file, numero, hash, stato, classe,
    fonte (testo / OCR / parser) e testo.
- **Giri:** la lettura procede a giri da 6 pagine circa. Il limite vero è la CPU del
  worker (2 s), non il tempo. Ogni giro prende in carico le pagine in modo atomico
  (`_shared/presaInCarico.ts`) e, se ne restano, ne lancia un altro (`EdgeRuntime.waitUntil`
  + richiamo).
- **Se il browser si chiude**, la lettura continua. Il popup si riapre da «Letture in
  corso» nella pagina delle commesse generali.
- **Se una pagina fallisce**, si riprova due volte. Poi resta «illeggibile» con il
  motivo, e l'utente può ricaricare solo quella pagina, per esempio una foto migliore.

### 3.4 Addebito (secondo `piano-ai-addebiti-e-automazioni-20261115.md`)

- Tutto passa da `aiRouterComplete`. L'azienda la decide **il server** dalla lettura
  (`generale_letture.company_id`), mai il corpo della chiamata.
- **Due compiti nuovi** nel router, distinti per misurarli: `generale_documenti_ocr`
  (una pagina) e `generale_documenti_estrai` (un gruppo di pagine). Il ricarico è quello
  in vigore: non si decide qui (§7 del piano AI).
- **Idempotenza per chiamata al provider:** pagina+hash per l'OCR, gruppo+schema+versione
  per l'estrazione. Un retry non ripaga; una rilettura voluta dall'utente sì, e il popup
  lo dice prima.
- Si controlla il credito **prima** di ogni giro. A credito finito la lettura si ferma
  in stato «in pausa — credito», con le pagine fatte salve, e riparte dopo la ricarica.
- Ogni file chiuso senza AI (XPWE, Excel, PriMus) scrive `registraEsitoLavoroAi`.
- Il costo vero accumulato si vede nel popup e resta sulla lettura.
- Si aggiorna `docs/ai-addebiti-censimento.md`, e il test `allarmeAIAgganci.test.ts`
  copre la nuova funzione.

### 3.5 Avanzamento e animazioni

Il popup di lettura è a pieno schermo sul computer e una scheda sul telefono.

- **Striscia delle pagine:** una miniatura per pagina, raggruppate per file. Ogni
  miniatura cambia stato:
  - in coda: grigia;
  - in lettura: bordo che pulsa e scansione orizzontale;
  - letta: spunta verde;
  - bianca o esclusa: sbiadita, con un'icona;
  - illeggibile: rossa.

  Si aggiorna in tempo reale (Realtime su `generale_lettura_pagine`, oppure un'interrogazione
  ogni 2 s se Realtime manca).
- **Fasi**, sul modello di `AIProcessingStage.tsx`: Caricamento → Testo → OCR →
  Riconoscimento pagine → Estrazione → Controlli. Ogni fase ha il proprio contatore
  («OCR 23/51 pagine») e un tempo stimato calcolato sulle pagine già fatte, non inventato.
- **Dati che arrivano:** a destra compaiono i campi man mano che si trovano («Importo
  contrattuale — pag. 2»). Le card entrano con una piccola animazione, così si vede che
  il lavoro produce.
- **Costo che sale**, accanto alla barra: «0,42 crediti finora · stima 0,60».
- Con `prefers-reduced-motion` restano i contatori e i cambi di colore, senza pulsazioni
  né scansioni.
- La lettura **non blocca**: «Chiudi, ti avviso quando ha finito» arriva con campanella e
  push.

---

## 4. Il grande popup «Costruisci la commessa generale»

Si apre a lettura finita, sul modello di `CreaConSilvioDialog`. Usa tutto lo schermo,
in tre colonne.

| Fonti (sinistra) | Proposta (centro) | Documento (destra) |
|---|---|---|
| file e striscia delle pagine; clic su una pagina → la apre a destra | le **sezioni** della commessa da costruire, una card per gruppo di dati | `VisoreFonte` aperto alla pagina citata, con la citazione evidenziata |

Sul telefono le colonne diventano schede: Proposta · Documento · Fonti.

### 4.1 Le sezioni della proposta (appalto pubblico)

Ogni sezione dice **cosa diventa** il dato:

1. **Commessa generale:** nome (proposto dall'oggetto), tipo e forma, indirizzo o luoghi,
   date. Diventa `orders` + `commesse_generali`.
2. **Committente e ufficio PA:** l'anagrafica trovata per P.IVA/CF o codice IPA, oppure
   «Nuovo committente» precompilato; ufficio e codice univoco; split. Diventa
   anagrafica + `order_riferimenti_pa`.
3. **Appaltatore:** noi da soli oppure RTI con mandataria e mandanti e relative quote.
   Diventa `dati.appalto.esecutore`.
4. **Figure:** RUP, DL, CSE. Diventa `dati.appalto`.
5. **Contratto:** base, ribasso, oneri, manodopera, contrattuale, corpo/misura, SOA,
   numero e data. Diventa `generale_contratti`.
6. **Tempi:** consegna, durata, fine prevista, collaudo. Diventa `generale_contratti` e le
   date della commessa.
7. **Penali:** giornaliera, massimale, penali particolari. Diventa `generale_contratti` e
   le note.
8. **Pagamenti:** anticipazione, SAL (soglia o cadenza), ritenute, termini, saldo. Diventa
   `generale_contratti` e il modo dei SAL.
9. **Garanzie e polizze:** cauzione, CAR, RCT, anticipazione, saldo. Diventa
   `generale_contratto_garanzie`.
10. **Elenco prezzi e computo:** voci con quantità di contratto. Diventano
    `generale_elenco_prezzi` e, per figlia, `generale_computo`.
11. **Fasi e cronoprogramma:** capitoli del computo come fasi, con date dal
    cronoprogramma. Diventano `order_work_phases` delle figlie, oppure della generale se
    non ha figlie.
12. **Lotti o contratti applicativi:** proposti dai luoghi o dalle figlie dell'accordo.
    Diventano figlie collegate.
13. **Documenti:** ogni file con il suo ruolo (contratto, capitolato, polizza…). Diventa
    `commesse_generali_documenti` + `order_attachments` (accesso «vendita»).
14. **Cosa manca:** campi non trovati, con il motivo («rinvio al capitolato speciale») e
    il pulsante «Carica il capitolato», che rilegge solo il file nuovo e riempie solo i
    campi vuoti.

Per gli altri tipi le sezioni seguono il catalogo (§2): area, titolo, immobile, unità,
piano.

### 4.2 Ogni dato, uno stato

Ogni riga mostra il valore proposto, la fonte («pag. 2 — "…"») e uno di questi stati:

| Stato | Aspetto | Cosa serve |
|---|---|---|
| **Letto, controlli ok** | verde | una spunta (o «conferma la sezione») |
| **Calcolato** | blu («base × ribasso + oneri») | una spunta; si vede il calcolo |
| **Conflitto** | ambra, i valori diversi uno sotto l'altro con le loro pagine | scegliere un valore o scriverne un altro |
| **Controllo fallito** | rosso, con la regola («la somma del computo non torna con la base») | correggere o confermare «va bene così» con una nota |
| **Non trovato** | grigio, con il motivo | scriverlo a mano, caricare il documento, o lasciarlo vuoto |
| **Scritto a mano / timbro** | ambra con icona | sempre da confermare guardando l'immagine |

Regole del popup:
- **Niente si scrive senza conferma.** «Crea la commessa generale» resta spento finché ci
  sono conflitti o controlli rossi non confermati.
- I campi non confermati **non si scrivono**: restano nella bozza.
- Si può confermare una sezione intera solo se non ha righe in ambra o in rosso.
- Correggere un valore rilancia **subito** i controlli collegati (codice puro nel browser).
  Esempio: corretto il ribasso, si ricalcola il contrattuale e il controllo diventa verde
  o rosso.
- **Silvio nel popup** (facoltativo, lotto 8): una riga di chat per domande sul documento
  («dove parla del subappalto?»). Risponde citando le pagine già lette, senza rileggere
  il PDF.
- La **bozza si salva** a ogni modifica (`generale_letture.bozza`, sul modello di
  `commessa_bozze`): si chiude e si riprende.

### 4.3 Alla conferma

- Una sola RPC transazionale, **`commessa_generale_crea_da_documenti(lettura_id, scelte jsonb)`**,
  che scrive tutto o niente.
- Nella stessa transazione registra in `commessa_bozze_scritture` (o in una tabella
  gemella) cosa ha creato: «**Annulla tutto**» resta disponibile come in «Crea con Silvio»
  finché la commessa non ha movimenti.
- Le fasi dal computo passano da `commessa_importa_fasi`; i SAL non si creano, si
  preparano le regole.
- Poi si apre la pagina della generale sulla scheda Contratto, con l'avviso «creata dai
  documenti: 3 campi da completare».

---

## 5. Cosa si crea e dove

| Dato | Tabella / RPC esistente | Manca |
|---|---|---|
| Generale | `orders` (`workflow_kind='generale'`), `commesse_generali` via `commessa_generale_crea` | — |
| Dati per tipo | `commesse_generali.dati` via `commessa_generale_dati_salva` | chiavi nuove: `appalto.forma`, `appalto.esecutore` (RTI/quote), `appalto.luoghi`, `appalto.categorie_soa[]`, `appalto.cig_accordo` (vanno aggiunte alla RPC e a `datiOperazione.ts`) |
| Committente | `anagrafiche_native` (P.IVA/CF, `codice_ipa`, `split_payment`), uffici `anagrafica_uffici_pa` | risoluzione per P.IVA/CF dai componenti comuni dell'area B, quando ci sono |
| Riferimenti PA | `order_riferimenti_pa` con `fonte='contratto_generale'` | nulla: si appoggia al lavoro Fattura PA |
| Contratto | `generale_contratti` | colonne: `costo_manodopera`, `durata_giorni`, `a_corpo_misura`, `sal_soglia_importo`, `sal_cadenza_giorni`, `termini_pagamento_giorni`, `revisione_prezzi` (testo), `importo_quadro_economico`, `tetto_accordo` |
| Penali particolari | — | `generale_contratti.penali_particolari jsonb` (descrizione, importo o ‰, fonte) |
| Garanzie | `generale_contratto_garanzie` (tipo, garante, numero, importo, date, allegato) | `massimale` e `partite jsonb` per la CAR |
| Elenco prezzi | `generale_elenco_prezzi` | `fonte_pagina`; distinzione sicurezza / lavori (oggi `soggetto_ribasso` basta) |
| Computo per figlia | `generale_computo` (figlia, voce, quantità) | — |
| Fasi | `order_work_phases` via `commessa_importa_fasi` | date dal cronoprogramma (parametro in più) |
| Figlie | `orders.commessa_generale_id`, `commessa_generale_collega` | — |
| Documenti | `order_attachments`, `commesse_generali_documenti` (tipo, voce, scadenza) | ruolo «da documenti», pagine utili |
| Lettura | — | **`generale_letture`**, **`generale_lettura_pagine`** (nuove), RLS per azienda, nel backup (`admin_catalogo_backup`) |
| Traccia | `commessa_bozze_scritture` | gemella per la generale oppure estensione con `generale_lettura_id` |

Tutte le colonne si aggiungono con `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, mai con un
secondo `CREATE TABLE`. Quelle lette dal browser si aggiungono anche alle viste che le
espongono.

---

## 6. Lotti in ordine

| # | Lotto | Dipende da | Migrazioni | Test | Fatto quando |
|---|---|---|---|---|---|
| **0** | **Catalogo e controlli**: `catalogo.ts` per i tre tipi + forme dell'appalto; controlli puri (somme, date, formati, conflitti) | — | nessuna | vitest sui controlli con un contratto **finto** su Demo 2 (cifre inventate che riproducono gli stessi errori: penale doppia, tabella che somma male, giorno in più) | i 12 controlli del §2.1 passano e falliscono quando devono |
| **1** | **Lettura completa a pagine**: `generale_letture`, `generale_lettura_pagine`, edge `generale-documenti-leggi` (testo, OCR per pagina, pagine bianche, classificazione, esclusione dati personali, giri, ripresa, credito); compiti router nuovi; censimento | 0 | 1 (tabelle + RLS + backup) | `dbFinto` + provider finto: 76 pagine finte, riprende dopo un giro interrotto, nessuna pagina pagata due volte, si ferma a credito zero | un PDF di 76 pagine-immagine (finto) arriva a «76/76» con il conto per stato; costo uguale a pagine OCR × costo unitario |
| **2** | **Popup di lettura con animazioni**: striscia pagine, fasi, dati che arrivano, costo, riduzione del movimento, «ti avviso quando ha finito» | 1 | nessuna | test UI con lettura finta; prova a video su Demo 2 | si vede ogni pagina cambiare stato; chiudendo e riaprendo riprende dov'era |
| **3** | **Estrazione per tipo con citazioni**: schema dell'appalto pubblico (poi privato), occorrenze multiple, file strutturati prima (XPWE/Excel/PriMus), tabelle a colonne | 1 | nessuna | provider finto con risposte registrate; esito `senza_ai` per XPWE | ogni campo ha file, pagina e citazione; i due CIG non si confondono |
| **4** | **Grande popup «Costruisci»**: tre colonne, sezioni, stati, conferme, bozza, «Carica il documento mancante» | 0, 3 | 1 (`bozza` su `generale_letture`) | test di stato (non si crea con un conflitto aperto) | niente si scrive senza conferma; i controlli si ricalcolano alla correzione |
| **5** | **Scrittura alla conferma**: RPC `commessa_generale_crea_da_documenti`, colonne nuove del §5, traccia e «Annulla tutto» | 4 | 2 (colonne; RPC con `REVOKE … FROM PUBLIC, anon`) | prova in transazione annullata su Demo 2; guardiano accessi sulla RPC | dal contratto finto nasce una generale completa; «Annulla tutto» la toglie senza residui |
| **6** | **Computo, elenco prezzi, cronoprogramma → fasi e figlie** | 5 | 1 (date in `commessa_importa_fasi`) | Σ voci = base | le fasi nascono con le date; il computo per figlia torna |
| **7** | **Accordo quadro**: forma dell'appalto, tetto, «Aggiungi contratto applicativo» sulla generale esistente (stessa lettura, crea una figlia) | 5 | nessuna o 1 | Σ applicativi ≤ tetto | il documento d'esempio si aggiunge come applicativo a un accordo |
| **8** | **Privato, sviluppo, compravendita** + Silvio nel popup | 5 | nessuna | per tipo | per ogni tipo nasce la generale con le sezioni giuste, chiamando le RPC delle operazioni immobiliari senza modificarle |
| **9** | **Prova vera**: il contratto d'esempio letto **in locale**, senza scrivere niente in produzione, per misurare pagine, tempo, costo e campi giusti contro la lettura fatta a mano | 1–5 | — | — | rapporto con «campi giusti / sbagliati / mancanti»; nessun dato del cliente nel repo |

I lotti 0 e 1 sono i più lunghi e non mostrano niente al titolare. Il 2 è il primo che
si vede. Si può partire dallo 0 e dal 2 insieme, con la lettura finta.

---

## 7. Domande per il titolare

1. **Accordo quadro:** la generale è l'accordo e ogni contratto applicativo è una figlia
   («lotto»)? Oppure ogni contratto applicativo è una generale a sé?
2. **Capitolato speciale:** quando le regole di pagamento stanno lì e non nel contratto,
   lo si chiede sempre o si lascia scegliere? Leggerlo costa: spesso 100–200 pagine.
3. **Costo:** la lettura di un appalto scansionato di 76 pagine costa qualche decina di
   centesimi in crediti. Va mostrato il preventivo e chiesto «Leggi», o si parte e basta
   sotto una soglia?
4. **Conti dedicati e delegati** (tracciabilità): li salviamo? Proposta: si riconosce il
   conto dell'azienda fra quelli già in Tesoreria e non si salva nient'altro; i codici
   fiscali dei delegati e i documenti d'identità non si estraggono mai.
5. **RTI:** se l'impresa è una mandante, la commessa vale per la sua quota o per tutto?
   E chi fattura?
6. **Due valori per la stessa penale** (contratto contro verbale): la regola è «vince il
   contratto», o si fa sempre scegliere?
7. **Cosa si crea subito:** fasi e figlie dal computo alla creazione, o solo il contratto
   e poi «Prepara le fasi» dalla pagina?
8. **Dove si avvia:** solo dal popup «Nuova commessa generale», o anche da una generale
   già esistente («Completa dai documenti»)? Proposta: tutte e due, il motore è lo stesso.

---

## 8. Cosa questo piano non fa

- Non cambia prezzi né ricarichi dell'AI.
- Non tocca la fatturazione PA né l'XML: scrive solo le righe dei riferimenti.
- Non tocca il piano, le unità e il simulatore delle operazioni immobiliari.
- Non legge PSC, POS e DUVRI: li archivia.
- Non salva dati personali di terzi trovati nei documenti.
