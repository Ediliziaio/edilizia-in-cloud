# Piano dei pagamenti e voci da quantificare — piano (11/11/2026)

Le sei osservazioni vengono da un preventivo vero fatto col wizard dei Preventivi
CRM: 164 lavorazioni, 1.427.603,68 € di imponibile, 17 allegati. Non sono difetti
trovati leggendo il codice, sono quello che non ha funzionato mentre si lavorava.
Qui si dice cosa succede davvero oggi, file per file, e come lo si sistema. In
questo giro non si tocca niente: il piano prima si legge.

## Dov'è oggi il piano dei pagamenti

Il wizard è `src/components/computo/ComputoNativoEditor.tsx`, cinque passi (Dati,
Progetto, Computo, Economia, Documento) tenuti da `cambiaFase`. Il riquadro «Piano
dei pagamenti» sta nel passo **Economia**
(`src/components/computo/ComputoEconomia.tsx`), i conti in
`src/lib/computo/economiaComputo.ts`, la forma della rata in
`src/lib/computo/pagamentiSchema.ts`. Una rata è questa e solo questa:

```
{ id, descrizione, percentuale: string, quando: firma|inizio|sal|fine|collaudo,
  giorno: number|null, giorniPagamento: 0|15|30|60|90 }
```

Il cronoprogramma, che dà il senso al campo `giorno`, si crea nel passo
**Documento** (`ComputoCronoprogramma.tsx`), cioè **dopo** Economia. Le rate non
vivono in una tabella: stanno dentro la bozza (`bozzaComputoSchema.pianoPagamenti`,
`src/lib/computo/editorNativo.ts`), salvata in `localStorage` e, per chi ha il
cloud, in `computo_preventivo_drafts`. Finiscono nel database solo alla fine, e in
due forme diverse: nel PDF come testo (`testoPianoPagamenti`,
`src/lib/computo/pianoPagamentiPdf.ts`) e, quando si crea la commessa, come
`quotes.payment_phases` (`fasiDaRate` in `src/lib/computo/commessaDaComputo.ts`), da
cui nascono le `order_installments`.

Questo è il punto da tenere a mente per tutto il resto: **il resto del gestionale ha
già un modello di rata più ricco di questo**. `src/lib/orders/rateEventi.ts` definisce
dodici eventi del cantiere (`firma_contratto`, `merce_magazzino`, `inizio_lavori`,
`sal_numero`, `fine_lavori`, `stato_commessa`…), con la data attesa calcolata dal
database (`data_attesa_rata`, `v_rate_commessa_stato`);
`src/lib/preventivi/pianoPagamento.ts` li usa nei preventivatori edili con i piani di
partenza del mestiere, compreso `pianoSalDiPartenza`;
`src/lib/preventivi/paymentTerms.ts` li porta sul preventivo classico. Il computo ha
scritto da capo un modello più povero (cinque momenti, nessun evento, il SAL
identificato da un giorno di cantiere invece che da un numero) e lo appiattisce in
`fasiDaRate`, che butta via perfino il «quando»: ogni rata esce come `deposit`
tranne l'ultima, `balance`, senza `evento`. Una rata «al SAL 2» del computo, una
volta diventata commessa, non è più riconoscibile come SAL.

## 1. I preset dei SAL

**Cosa succede.** I quattro pulsanti sono `pianiPredefiniti(durata)` in
`economiaComputo.ts`, e `ComputoEconomia` li chiama con
`durata = durataTotale(bozza.cronoprogramma)`. In Economia il cronoprogramma non
c'è ancora — si crea un passo dopo — quindi `durata` è **0** e la funzione ripiega su
`const d = Math.max(3, durata || 20)`: venti giorni. «SAL mensili» calcola
`mesi = ceil(d / 20) = 1` e produce due righe, «Acconto 10%» e «1° SAL mensile 90%»,
che su questo preventivo vale 1.284.843,31 €. Non è un SAL mensile: è un saldo con
un altro nome. Lo stesso vale per «30 · 40 · 30» e «Acconto + 2 SAL + saldo», dove i
SAL finiscono tutti ai giorni 7 e 13 di un cantiere immaginario di venti giorni, che
qui dura più di un anno.

Il secondo stato visto (Acconto 0%, 1° SAL mensile 10%, totale 10%, «Le rate sommano
il 10%: devono fare 100%») è quello che resta **dopo** aver corretto a mano quel
piano sbagliato: il preset è una sostituzione cieca (`onClick={() => cambiaRate(piano.rate())}`),
e da lì in poi ogni modifica è a carico dell'utente. Si può cancellare una riga,
scrivere una percentuale qualsiasi, e niente riproporziona il resto né avvisa che il
piano è rimasto a metà, se non la riga rossa in fondo. Quella riga non è innocua:
`errorePiano` non blocca solo la cassa, blocca il documento. In
`ComputoNativoEditor` `pianoErrore` disabilita «Scarica PDF», «Scarica documento» e
l'invio in firma, e svuota le rate nel PDF
(`ratePagamento: … || pianoErrore ? [] : pianoPdf`). Un errore nato da un preset
fermava la consegna di un preventivo da un milione e mezzo.

**Cosa si fa.**

1. I preset non si calcolano più su una durata che in quel passo non esiste. Quando
   manca il cronoprogramma, «SAL mensili» e «Acconto + 2 SAL + saldo» chiedono il
   numero di SAL invece di indovinarlo: un campo accanto ai pulsanti
   («SAL mensili · quanti? ▸ 6»), con una stima proposta dall'importo e dalle fasi
   dei capitoli (`cronoDaCapitoli` in `src/lib/computo/cronoprogramma.ts` sa già
   dedurre le fasi dai capitoli senza chiedere niente all'AI: la si usa per proporre
   la durata, non per creare il cronoprogramma a sorpresa).
2. Un preset non cancella più in silenzio un piano scritto a mano: se ci sono rate
   con percentuali diverse da quelle di partenza, chiede conferma, come fa già il
   cronoprogramma calcolato (`if (crono.fasi.length && !conferma)`).
3. Accanto all'errore «le rate sommano il X%» compare il pulsante che lo risolve,
   «Riporta le rate a 100%», che riproporziona le righe diverse dall'acconto — la
   stessa aritmetica già scritta per «Porta l'acconto al N%», in fondo a
   `ComputoEconomia`.
4. Un piano incompleto non blocca più il documento. Blocca la **firma** e la
   **creazione della commessa** (lì le rate diventano scadenze vere e devono
   quadrare), ma il PDF si scarica: il piano semplicemente non esce, con un avviso
   nel riquadro «Da completare prima del download» che dice che non uscirà. Questo
   tocca `pianoErrore` nei quattro punti in cui compare in `ComputoNativoEditor`.

Piccolo, indipendente, nessuna migrazione, nessun cambio di modello dati: è il primo
da fare.

## 2. Un SAL non è una percentuale fissa

**Cosa succede.** `rataSchema` conosce una sola grandezza, `percentuale`, e
`analizzaEconomia` ne ricava l'importo con `netto * p / 100`. `errorePiano` pretende
che la somma faccia 100 e che nessuna rata sia senza percentuale. Il PDF
(`testoPianoPagamenti`) stampa sempre `percentuale% = importo €`. Quindi oggi
l'unico modo di scrivere «si paga a SAL» è promettere al cliente, in un documento che
andrà in firma, che il secondo pagamento sarà esattamente di 571.041,47 €. Nei lavori
a misura quella cifra non si conosce al momento del preventivo: il SAL si paga su
quello che è stato fatto e misurato, e il gestionale lo sa già fare dall'altra parte
— `src/lib/computo/contabilitaLavori.ts` calcola libretto delle misure, registro,
SAL, ritenuta di garanzia e certificato di pagamento sul computo contrattuale della
commessa. Il preventivo dice una cosa che la commessa poi smentisce.

**Cosa si fa.** La rata acquista un **modo di misura**, e la percentuale smette di
essere obbligatoria:

```
base: "percentuale" | "avanzamento"
percentuale: string        // obbligatoria se base = "percentuale"
avanzamento: { soglia: number|null, fasi: string[] }   // vedi punto 3
tettoMassimo: string       // opzionale: "fino al 40% dell'importo"
```

Una rata `avanzamento` non ha un importo prefissato. Significa, in prosa: *si fattura
quello che risulta dal SAL approvato, fino a concorrenza dell'importo contrattuale*.
Acconto e saldo restano `percentuale`, perché lì la percentuale esiste davvero.

**Validazione.** La regola «le rate devono fare 100%» diventa due regole:

- la somma delle rate **a percentuale** non può superare 100 (oggi l'errore scatta
  anche sotto: con rate a SAL, stare sotto è normale e corretto);
- se non c'è almeno una rata `avanzamento`, la somma deve fare esattamente 100,
  come adesso;
- con almeno una rata `avanzamento`, il resto (100 meno le percentuali fisse) è
  quello che quelle rate si divideranno a misura, e il riquadro lo dice con una riga
  di testo invece che con un errore rosso: «Acconto 20% e saldo 10%; il 70% si paga
  a SAL, sull'avanzamento misurato».

**PDF.** `RataPdf` prende `base` e `nota`. Una rata a percentuale si stampa come
oggi. Una rata a avanzamento si stampa senza importo:
«2° SAL — al raggiungimento del 60% dei lavori, pagamento a 30 giorni data fattura:
**a misura sull'avanzamento** (quota indicativa 35% = 499.661,29 €)». La quota
indicativa esce solo se il cronoprogramma c'è e solo come indicazione, scritta come
tale; se il titolare non la vuole, un interruttore nel passo Documento la spegne
accanto agli altri di `sezioniPdf`. Il totale del piano non si presenta più come una
somma che deve fare 100%, ma come «30% certo + 70% a misura».

**Cassa.** `analizzaEconomia` oggi non disegna il flusso se il piano non è valido.
Con le rate a avanzamento il flusso si disegna lo stesso, usando come stima la quota
che toccherà a ogni SAL: è sempre stata una stima, e questo la rende più onesta, non
meno.

**Database.** `fasiDaRate` smette di appiattire tutto su `deposit`/`balance` e scrive
le `QuotePaymentPhase` complete di `evento` e `numero` (il formato è già previsto da
`parseQuotePaymentPhases` in `src/lib/preventivi/paymentTerms.ts` dal 04/11/2026, e
resta leggibile dai preventivi vecchi). Una rata `avanzamento` diventa
`evento: "sal_numero"` col suo numero: da lì la commessa la riconosce come SAL e
`data_attesa_rata` le dà la data vera. Fin qui nessuna migrazione: `payment_phases` è
JSON e il campo `evento` esiste già. Resta da decidere l'importo con cui nasce la
rata della commessa — la quota indicativa, oppure una rata marcata come da
determinare, che però `order_installments` oggi non sa rappresentare: è l'unica
migrazione di tutto il lotto B, e se ne parla nell'approfondimento in fondo. In
entrambi i casi il verbale SAL poi corregge (`sal_records.installment_id` lega già il
verbale alla rata, vedi `src/hooks/usePianoPagamenti.ts`).

## 3. Le modalità che mancano: a SAL % e a fasi

**Cosa succede.** `MOMENTI_RATA` ha cinque voci. «A SAL» chiede un **giorno di
cantiere**, cioè un numero che l'impresa non ha in testa e che nel contratto non
significa niente: nessuno scrive «si paga il giorno 47». Quello che si scrive è «al
raggiungimento del 30% dei lavori» oppure «a completamento delle opere strutturali».
Nessuna delle due si può dire oggi.

**Cosa si fa.** Il campo `quando` si allarga di due valori e il «giorno» diventa un
dettaglio tecnico derivato, non una cosa da scrivere a mano:

- **`sal_percentuale`** — «al raggiungimento del 30% dei lavori». Si scrive la
  soglia; il giorno di cantiere, se il cronoprogramma c'è, si deduce
  (`durata * soglia / 100`, con lo stesso arrotondamento di `giornoIncasso`) e serve
  solo alla cassa. Nel PDF e in commessa quello che conta è la soglia.
- **`fase`** — «a completamento di: Strutture in elevazione». Si scelgono una o più
  fasi del cronoprogramma (o, se il cronoprogramma non c'è ancora, uno o più
  **capitoli** del computo: `cronoDaCapitoli` mostra che fase e capitolo sono la
  stessa cosa, legati per nome in `analizzaEconomia`). Il giorno di incasso è la fine
  dell'ultima fase scelta.

Questo è anche il modo di dare un senso alla frase che già compare nel riquadro, «I
SAL si collocano nel tempo col cronoprogramma · crealo»: oggi quel collegamento è un
numero scritto a mano, domani è una scelta. E risolve mezzo punto 1: con le fasi o le
soglie, i preset non hanno più bisogno di indovinare una durata.

Due cose da decidere col titolare, non da indovinare qui:

- se una rata a fase debba bloccarsi quando la fase viene rinominata o cancellata nel
  cronoprogramma (proposta: la rata tiene il **nome** della fase, non solo l'id, così
  resta leggibile anche se la fase sparisce, e il riquadro lo segnala);
- se il SAL matura all'emissione del verbale o alla sua approvazione dal cliente.
  La risposta esiste già ed è per azienda (`rateEventi.ts`, `sal_numero`: «appena lo
  emetti, o quando il cliente lo approva, lo sceglie l'azienda nelle Impostazioni»):
  il preventivo deve solo smettere di contraddirla.

## 4. «Pagata entro»

**Cosa succede.** Il select è scritto a mano dentro `ComputoEconomia`:
`[0, 15, 30, 60, 90].map(…)`, etichettati «A vista» e «N giorni». Il dato è un intero
(`giorniPagamento`), che `giornoIncasso` converte in giorni di cantiere
(`giorni * 5 / 7`) e il PDF stampa come «30 gg». Mancano i 45 giorni, manca
completamente il fine mese — che in edilizia è la metà dei termini reali — e manca la
distinzione fra data fattura e data documento.

**Cosa si fa.** Non si inventa un altro elenco: ce n'è già uno, in
`src/lib/terminiPagamento.ts`, usato dagli ordini a fornitore
(`TERMINI_PRESET`: «Alla consegna», «30 gg», «30 gg fine mese», «60 gg»,
«60 gg fine mese», «90 gg»), con `estraiGiorni`, `chiedeFineMese` e `calcolaScadenza`
che sanno già leggere «30 gg f.m.» e calcolare la data. I fornitori tengono lo stesso
dato in due colonne, `termini_giorni` e `termini_fine_mese`, e
`terminiPagamentoTesto` lo scrive come «60 gg fine mese» / «Vista fattura»: è
esattamente quello che serve qui. Quindi:

- `giorniPagamento: number` diventa `termine: { giorni: number, fineMese: boolean }`,
  con i preset di `TERMINI_PRESET` più 15 e 45 giorni, e la possibilità di scrivere
  un numero qualsiasi;
- `giornoIncasso` usa `calcolaScadenza` quando la data d'inizio lavori è nota, e
  continua con l'approssimazione 5/7 quando non lo è;
- il PDF stampa la frase intera («pagamento a 45 giorni data fattura fine mese»),
  non «45 gg»;
- in commessa il termine va su `order_installments` accanto all'evento, così la
  scadenza della rata nasce giusta invece di essere inventata.

I codici SDI (`TP01`/`TP02`, `METODI_PAGAMENTO_SDI` in `src/types/fatturazione.ts`)
restano dove sono: riguardano la fattura, non il preventivo. L'unico legame utile è
che un piano a più rate farà `TP01` e un pagamento unico `TP02`, cosa che la
fatturazione già decide da sola.

Lettura dei dati vecchi: `rataSchema` tiene `giorniPagamento` come campo deprecato e
lo converte (`{ giorni: n, fineMese: false }`). Le bozze in `localStorage` sono il
caso normale, non l'eccezione: lo schema zod le deve leggere senza buttarle.

## 5. Voci da quantificare dopo

**Cosa succede.** `calcolaVoce` (`editorNativo.ts`) mette un errore per ogni voce
senza descrizione, unità, quantità o prezzo. `invalide` conta quelle righe, e da lì
discende tutto: il riquadro «Da completare prima del download» in
`ComputoNativoEditor`, il blocco di «Scarica PDF», «Scarica documento», «Anteprima»
definitiva e invio in firma. Su questo preventivo erano nove lavorazioni — le 9, 10,
56, 143-148 — e il documento era fermo. Esiste già una via di mezzo, `opzionale`
(«si propone al cliente ma resta fuori dal totale»), ma dice un'altra cosa: una voce
opzionale è una voce che forse non si fa; una voce da quantificare **si fa**, solo
non si sa ancora quanta.

**Cosa si fa.** Un flag nuovo sulla voce, accanto a `opzionale`, `sicurezza`,
`detrazione`, `corpo`:

```
daQuantificare: boolean
```

- `calcolaVoce` su una voce `daQuantificare` non produce errori per quantità e
  prezzo mancanti (la descrizione resta obbligatoria: senza, nel PDF non c'è niente
  da leggere), e restituisce `importo: null` senza che questo blocchi nulla.
- Il totale non cambia: la voce non entra, come l'opzionale. Il riepilogo per
  capitolo di `ComputoEconomia` la conta a parte, con la pastiglia che già esiste
  («N da completare» diventa «N da quantificare» quando sono di quelle).
- Nel PDF la riga c'è, con la descrizione e l'unità se c'è, e al posto
  dell'importo la dicitura **«da quantificare»**; sotto il totale, una riga:
  «Il preventivo contiene 9 lavorazioni da quantificare, che saranno computate e
  fatturate a misura secondo i prezzi unitari qui indicati». Il formato «Computo
  senza prezzi» (`formatoPdf: "senza-prezzi"`) fa già una cosa simile e mostra che
  l'impaginazione regge una colonna importo vuota.
- Il riquadro «Da completare prima del download» elenca le voci da quantificare in
  una sezione a parte, informativa, che non blocca; il blocco resta solo per le voci
  incomplete per sbaglio.
- Si chiudono dopo: togliere la spunta e scrivere quantità e prezzo. Su una commessa
  già nata, la voce esiste come riga a quantità zero (`righeDaComputo` la passa con
  `quantity: 0`), e la quantità vera arriva dalla contabilità dei lavori, che è il
  posto dove quel numero si scopre davvero.

**Legame con i SAL.** Qui i punti 2 e 5 si tengono per mano: una voce da
quantificare entra nell'avanzamento solo quando è quantificata, e questo è un altro
motivo per cui una rata a SAL non può essere una percentuale fissa dell'imponibile.
Se il 15% del preventivo è «da quantificare», il 100% delle rate fisse è una bugia.
Con le rate `avanzamento` il problema sparisce da solo: si paga quello che si misura.

**Migrazione.** Nessuna sullo schema: `daQuantificare` vive nella bozza (zod, default
`false`, le bozze vecchie si leggono) e, in commessa, in
`quote_items.custom_field_values.computo`, dove già viaggia il capitolo. Da valutare
in un secondo momento una colonna vera su `quote_items` se la voce deve essere
filtrabile dal database.

## 6. «Avanti» deve portare in cima

`cambiaFase` cambia il passo e basta. Con 164 lavorazioni il pulsante «Avanti» sta a
qualche migliaio di pixel dall'inizio della pagina: il passo nuovo si apre lassù e
l'utente resta quaggiù, davanti al fondo di una pagina che non è più quella. Il
rimedio è dentro `cambiaFase`: uno `scrollIntoView({ behavior: "smooth", block: "start" })`
sulla barra delle fasi (non sul contenuto: `BarraFasi` è sticky e coprirebbe le prime
righe), rispettando `prefers-reduced-motion`. Altrove in questo repository lo
stesso problema è già risolto così (`BarraFasi.tsx` riga 59, `ComputoAlbero.tsx`
riga 165). Insieme allo scorrimento, il fuoco va sul titolo del
passo nuovo, perché chi naviga da tastiera non resti indietro.

Vale per i cinque passi e anche per i click sulla barra delle fasi. `BarraFasi` è
condivisa con gli altri preventivatori: la correzione può stare in
`ComputoNativoEditor` (sicura, due righe) oppure dentro `BarraFasi` con un
`onSelect` che scorre da sé (meglio, ma tocca serramenti, fotovoltaico e gli altri
moduli: va provato su tutti). Proposta: farla prima in `ComputoNativoEditor`, poi
valutare se spostarla.

## Ordine di esecuzione

**Lotto A — piccolo, subito, niente modello dati.** Punto 6 (lo scorrimento) e la
parte difensiva del punto 1: la conferma prima di sostituire un piano scritto,
«Riporta le rate a 100%», e un piano incompleto che non blocca più il PDF. Mezza
giornata, nessuna migrazione, si prova con i test che esistono già
(`src/test/logic/computoEconomia.test.ts`).

**Lotto B — il modello della rata.** Punti 2, 3 e 4 insieme, perché toccano tutti
`rataSchema`: `base`, `avanzamento`, i due `quando` nuovi, il termine con il fine
mese. Dentro ci sta anche la riscrittura di `fasiDaRate` perché scriva gli eventi
veri, e la riconciliazione con `src/lib/preventivi/pianoPagamento.ts` — da decidere
se il computo adotta quel modello invece del suo (è la strada pulita: un modello di
rata per tutto il gestionale) o se ci si limita a tradurre al confine. La differenza
fra le due vale giorni di lavoro, ed è la prima domanda a cui rispondere prima di
cominciare. Nessuna migrazione sullo schema; tutto il nuovo passa da JSON già
esistenti.

**Lotto C — i preset rifatti.** Il resto del punto 1 dipende da B: «SAL mensili» ha
senso solo quando un SAL può essere a misura, e «quanti SAL» si chiede solo quando la
rata sa dire «al SAL 3».

**Lotto D — voci da quantificare.** Punto 5. Indipendente da B sul codice, ma va
dopo nel racconto al cliente: il PDF deve già saper dire «a misura sull'avanzamento»
quando dice «da quantificare», altrimenti il documento promette una cosa e il piano
dei pagamenti un'altra.

Il resto — colonna vera su `quote_items`, scelta fra emissione e approvazione del
SAL, quota indicativa nel PDF — sono decisioni del titolare, non lavoro da pianificare
adesso.

---

# Lotto B in dettaglio: un modello solo, o traduzione al confine

La domanda lasciata aperta sopra («il computo adotta il modello condiviso o ci si
limita a tradurre?») vale giorni di lavoro, quindi va sciolta prima di cominciare.
Questo è quello che si sa dopo aver guardato bene le due parti.

## Il fatto che decide quasi tutto

Il modello condiviso non è una proposta: è già in produzione in **otto
preventivatori**. `PianoPagamentoCard`
(`src/components/moduli/PianoPagamentoCard.tsx`, 225 righe) sta nello step Economia
di bagni, climatizzazione, elettrico, pavimenti, piscine, ristrutturazione,
termoidraulico e tetti — sedici punti d'uso in tutto. Ogni volta fa la stessa cosa:
mostra le rate di *questo* preventivo, partendo dai **modelli di pagamento
dell'azienda** (`useModelliPagamento`, Impostazioni → Modelli di pagamento), che sono
gli stessi con cui nascono le rate delle commesse, e salva il piano **copiato** sul
preventivo, non come rimando al modello.

Il preventivo col computo è l'unico che non lo usa. Non perché il condiviso non
bastasse: perché è nato un mese dopo, da un'altra parte del codice, e si è scritto il
suo. Il risultato è che chi vende un bagno sceglie «Acconto e SAL» dai modelli della
sua azienda, e chi vende un edificio da un milione e mezzo si trova quattro pulsanti
che non sanno niente della sua azienda.

Questo pesa più di qualunque considerazione tecnica: **la duplicazione non è un
rischio futuro, è già costata il bug del punto 1 e l'appiattimento del punto 2.**

## Cosa sa fare ognuno dei due

Il condiviso (`src/lib/preventivi/pianoPagamento.ts` e
`src/lib/orders/rateEventi.ts`) ha quello che al computo manca: l'**evento** del
cantiere come dato (dodici valori, `sal_numero` compreso, con il numero del SAL), i
modelli d'azienda (`pianoDaModello`), i piani di partenza del mestiere ordinati per
modulo (`partenzeDelModulo`), il passaggio pulito fra modo «rate» e modo «sal»
(`cambiaModo`, che non butta via acconto e saldo), il PDF già fatto
(`adattatoreEdile.ts`, `quandoSiPaga`) e — la cosa che conta di più — il travaso in
commessa che conserva tutto: `parseQuotePaymentPhases` → `prefillDaPreventivo`
(`src/lib/preventivi/prefillPreventivo.ts`, riga 94) scrive `trigger_evento` e
`trigger_numero` sulle rate, e da lì `data_attesa_rata` calcola la scadenza vera.

Il computo ha due cose che il condiviso non ha, e sono vere, non capricci:

- **il giorno di cantiere e la cassa.** `giornoIncasso` + `analizzaEconomia`
  disegnano il saldo di cassa giorno per giorno, l'esposizione massima e l'acconto
  consigliato. Nessun altro preventivatore lo fa. Questo dipende dal campo `giorno`
  e dal cronoprogramma;
- **il termine di pagamento** (`giorniPagamento`), che il condiviso non ha affatto:
  là il «quando» è l'evento, e «a 60 giorni data fattura» non si può dire. Il punto 4
  non è quindi solo un difetto del computo: è un buco del modello condiviso, che
  riguarda anche gli altri otto moduli.

Differenze minori ma da ricordare: il condiviso ammette **12 rate**, il computo 24;
il condiviso tiene le percentuali come `number`, il computo come stringhe con la
virgola italiana; il condiviso calcola gli importi sul **totale IVA inclusa**, il
computo sull'**imponibile scontato** e mostra l'IVA in una colonna a parte. Questa
ultima non è un dettaglio: cambia che cosa significa «30%» in un documento firmato, e
va decisa esplicitamente (vedi le domande in fondo).

## Il confine verso la commessa è più stretto di quanto sembri

Qui c'è una cosa che il piano di prima diceva troppo in fretta. `quotes.payment_phases`
è JSON e si allarga quanto si vuole, vero. Ma la **rata della commessa** no:
`order_installments` ha `label`, `type`, `amount`, `expected_date`,
`trigger_evento`, `trigger_numero`, `trigger_status_id`, `giorni_preavviso` — e
basta. Non ha la percentuale (in `Installment`, `src/lib/orderUtils.ts`, `percent`
è dichiarata «solo nel modulo di nuova commessa, mai salvata»), non ha il termine di
pagamento, e soprattutto **non ha un modo di dire «importo da determinare»**. La RPC
che le scrive, `order_rate_sostituisci`
(`supabase/migrations/20280907100300_commessa_salva_annulla_scrittura_rate_duplicata.sql`),
inserisce un elenco di colonne fisso.

Quindi la rata «a misura» del punto 2, arrivata in commessa, ha due destini:

1. **nasce con la quota indicativa come importo**, esattamente come oggi nasce una
   rata qualsiasi, e il verbale SAL la corregge (`sal_records.installment_id` lega
   già verbale e rata). Zero migrazioni, ma nello scadenzario la rata sembra un
   importo certo mentre non lo è, e il previsionale di cassa ci crede;
2. **si marca come da misurare**, con una colonna nuova (`importo_stimato boolean`
   o `percent numeric`), e allora si toccano la tabella, la RPC, `rate_da_modello`,
   `data_attesa_rata` e la vista `v_rate_commessa_stato` — più le schermate che le
   leggono. È la cosa giusta, ed è anche l'unica migrazione vera di tutto il lotto B.

Vale la pena notare che la 2 non serve solo al computo: qualunque preventivo a SAL
degli altri otto moduli ha lo stesso problema, oggi nascosto dal fatto che nessuno
poteva dire «a misura».

## Le due strade, con il prezzo scritto

**Strada 1 — traduzione al confine.** `rataSchema` resta quello del computo e si
allarga (base percentuale/avanzamento, soglia, fase, termine); si riscrive solo
`fasiDaRate` perché parli la lingua degli eventi. Il riquadro del computo resta com'è,
più ricco. Costo contenuto, rischio basso, nessun altro modulo toccato. Il prezzo lo
si paga dopo: due modelli di rata e due editor per sempre, ogni cosa nuova (i modelli
di pagamento dell'azienda, i promemoria di incasso, un termine di pagamento) da fare
due volte, e un SAL che nel computo è un giorno di cantiere mentre nel resto del
gestionale è un numero. È la strada che ha prodotto la situazione di oggi.

**Strada 2 — modello unico.** Il computo smette di avere un suo tipo di rata e usa
`PianoPagamento`; il condiviso cresce dei tre campi che gli mancano — termine
(`{giorni, fineMese}`), base a misura, ancoraggio alla fase o alla soglia — e quei tre
campi arrivano gratis anche agli altri otto moduli. Costo alto: si tocca un tipo usato
in sedici punti, si rifà il travaso, si ricontrolla il PDF edile. In cambio i punti 2,
3 e 4 si risolvono una volta sola, e il preventivo col computo eredita i modelli di
pagamento dell'azienda, cosa che oggi non ha e che nessuno ha chiesto solo perché non
sa che esiste.

**Quello che propongo: unificare il dato, non la schermata.** Cioè il computo salva
`PianoPagamento` (esteso coi tre campi nuovi) al posto del suo `rataSchema`, ma
continua a disegnare il **suo** riquadro, che ha due colonne che la card condivisa non
ha (l'importo con l'IVA e il legame col cronoprogramma per la cassa). Un tipo, due
viste. Si prende il grosso del valore della strada 2 — un solo modello, un solo
travaso in commessa, un solo posto dove aggiungere il termine di pagamento — senza il
pezzo più costoso e meno urgente, che è fondere due interfacce nate per due mestieri
diversi. Se un giorno la card condivisa imparerà la cassa, il computo potrà adottarla
senza toccare i dati.

## Cosa va deciso prima di scrivere una riga

1. **Le percentuali su cosa si calcolano?** Il condiviso dice totale IVA inclusa, il
   computo imponibile scontato. Due risposte legittime; quello che non si può fare è
   lasciarle entrambe. (La mia: imponibile, perché è quello che il PDF del computo
   mostra come «Totale imponibile» e perché l'IVA non è dell'impresa — ma allora va
   cambiato `rateConImporti` per tutti, ed è una riga del documento che cambia in otto
   moduli.)
2. **La rata a misura, in commessa, nasce con una stima o si marca come da
   determinare?** È la scelta fra zero migrazioni e la migrazione descritta sopra.
3. **Il preventivo col computo deve vedere i modelli di pagamento dell'azienda?**
   Se sì, il riquadro guadagna un selettore e `useModelliPagamento`; se no, i piani di
   partenza restano scritti nel codice come adesso.

## Ordine dentro B

- **B1 — il tipo e la conversione.** `PianoPagamento` esteso, lettura delle bozze
  vecchie (zod: `rataSchema` deprecato che si converte, comprese le bozze in
  `localStorage`, che sono il caso normale), nessuna interfaccia toccata. Si prova
  solo con i test.
- **B2 — il riquadro del computo** sul tipo nuovo: base a misura, i due `quando`
  nuovi, il termine col fine mese, la validazione in due regole.
- **B3 — il confine.** `fasiDaRate` scrive gli eventi veri; qui dentro sta, se si
  sceglie, la migrazione del punto 2 della sezione precedente.
- **B4 — il PDF.** `RataPdf` con la base e la nota, la riga «a misura
  sull'avanzamento», l'interruttore della quota indicativa.
- **B5 — facoltativo, dopo.** Il termine di pagamento e la base a misura portati
  anche in `PianoPagamentoCard`, cioè negli altri otto moduli. Non è lavoro del
  computo, ma è il motivo per cui conviene unificare il dato adesso.

Collaudo: i test che esistono (`src/test/logic/computoEconomia.test.ts`,
`src/test/logic/preventivoQuandoSiIncassa.test.ts`,
`src/test/logic/righeCommessaDaPreventivo.test.ts`) coprono già le percentuali, il
travaso e il PDF; vanno aggiunti i casi della rata a misura e della lettura di una
bozza vecchia. E una prova a schermo sul preventivo grosso, perché 164 lavorazioni e
24 rate sono un altro mestiere rispetto a un bagno con tre rate.

---

# Decisioni prese (11/11/2026) e la ritenuta di garanzia

Le tre domande in sospeso hanno risposta, e con le risposte è arrivato un requisito
nuovo che non era in nessuno dei sei punti.

## 1. Le percentuali sono sempre sul totale IVA inclusa

Deciso: il computo si allinea agli altri otto moduli, non il contrario. Quindi
`analizzaEconomia` smette di calcolare le rate su `netto` (imponibile scontato) e
le calcola sul totale che paga il cliente, `calcolaIvaComputo(netto, bozza).totale`.
Cambia anche la colonna: oggi la tabella mostra «Importo» sull'imponibile e «Con
IVA» di fianco; domani la colonna principale è il totale, e semmai è l'imponibile a
stare di fianco.

Un caso da gestire, visto sul preventivo vero: **l'IVA può essere «da definire»**
(`ivaModalita: "da-definire"`, e in testata si legge «IVA: Da definire, Totale: Da
definire»). Senza totale non c'è base su cui applicare una percentuale. In quel caso
le rate mostrano le percentuali e, al posto degli importi, «dipende dall'IVA»;
nel PDF escono le percentuali e la frase che dice su cosa si calcolano. Non è un
errore che blocca: è un preventivo che non ha ancora deciso l'IVA, e capita.

Conseguenza fuori dal computo: `rateConImporti` e `recalcPhaseAmounts` già lavorano
sul totale IVA inclusa, quindi non si tocca niente negli altri moduli. È il computo
che aveva la convenzione diversa.

## 2. La rata a misura si definisce sullo stato di avanzamento lavori

Confermato quello che il punto 2 proponeva, e detto meglio: **una rata a SAL non è
una rata.** È l'impegno a fatturare quello che risulta dal SAL. Non ha un importo nel
preventivo, non ha una percentuale, e nel piano occupa la quota che resta dopo
acconto e saldo. L'importo nasce dal verbale, che in commessa esiste già
(`sal_records`, legato alla rata da `installment_id`) e matura secondo la regola che
l'azienda ha scelto in Impostazioni — emesso o approvato dal cliente
(`src/lib/orders/salMaturazione.ts`).

## 3. Sì, il computo deve vedere i modelli di pagamento attivi

Il riquadro del passo Economia guadagna, prima dei quattro pulsanti, i **modelli di
pagamento dell'azienda**: `useModelliPagamento` + `modelliPagamentoDaOffrire`, gli
stessi che vedono gli altri otto preventivatori e con cui nascono le rate delle
commesse. I piani scritti nel codice (`pianiPredefiniti`) restano solo come fondo per
l'azienda che non ha ancora fatto suoi i modelli — è esattamente quello che
`modelliPagamentoDaOffrire(inizializzati, …)` già fa. Questo, da solo, sistema buona
parte del punto 1: un'azienda che ha il suo «Acconto e tre SAL» non preme più un
pulsante che indovina una durata.

Insieme alla decisione 1 e alla 2, questo chiude la domanda del lotto B: **il computo
adotta il modello condiviso** (`PianoPagamento` + eventi + modelli d'azienda) e tiene
solo il suo riquadro, che ha la cassa e il cronoprogramma. Un tipo, due viste, come
proposto.

## 4. La ritenuta di garanzia

Il requisito nuovo. Nei lavori a SAL il committente trattiene una quota di ogni
pagamento — di solito il 5%, nei lavori pubblici lo 0,50% per legge — e la svincola
al collaudo o dopo un tempo concordato. Oggi, nel preventivo col computo, l'unico
posto dove la si può scrivere è il campo libero «Altre condizioni di pagamento»,
dove infatti il segnaposto dice «ritenuta a garanzia del 5% sul saldo». È testo: non
entra negli importi delle rate, non entra nella cassa, non arriva in commessa.

Il gestionale la conosce già, ma solo in due posti e nessuno dei due è questo:

- **lavori pubblici**, dove è completa: `calcolaSal`
  (`src/lib/computo/contabilitaLavori.ts`) deduce la ritenuta progressiva dal SAL,
  `stampeContabilita.ts` la stampa nel certificato di pagamento («A dedurre ritenuta
  di garanzia dello 0,50%»), e la percentuale sta su `lp_contabilita.ritenuta_percentuale`
  insieme ad anticipazione, split payment e modo della sicurezza;
- **il calcolatore pubblico** `/strumenti` (`src/lib/calcoli/ritenuta.ts`), che
  risponde alla domanda giusta — quanto mi costa questo credito fermo per mesi — e
  che nessuno collega al preventivo che sta scrivendo.

Nei lavori privati, che sono il caso normale, non c'è niente: né sul preventivo, né
sul verbale SAL (`sal_records` ha numero, importo e stato, e basta), né sulla rata.

**Come la metterei.** La ritenuta non è una rata e non va messa fra le rate: è una
proprietà del piano, e il piano continua a fare 100%.

```
ritenutaGaranzia: {
  percentuale: string,              // 5, 0,50…
  su: "sal" | "tutte",              // solo i SAL, o ogni pagamento
  svincolo: "collaudo" | "mesi",
  mesi: number,                     // quanti dopo la fine lavori
}
```

Si calcola **sull'imponibile** anche quando le rate sono sul totale IVA inclusa: si
trattiene sui lavori, non sull'IVA, che l'impresa versa comunque. Nel riquadro
compare una colonna in più, «Netto incassato», e sotto la tabella due righe: quanto
resta trattenuto in tutto e quando torna. Nel piano si aggiunge da sé una riga finale
non modificabile, «Svincolo della ritenuta a garanzia», con il suo momento: è la riga
che fa capire al cliente — e all'impresa — che quei soldi esistono e hanno una data.

**Nel PDF**: ogni rata esce con l'importo pieno e la dicitura «al netto della
ritenuta a garanzia del 5%», e in fondo la frase che dice a quanto ammonta e quando
si svincola. È una condizione contrattuale, va scritta per esteso, non lasciata a un
calcolo che il cliente deve rifare.

**Nella cassa**: qui sta il valore vero per il titolare. `analizzaEconomia` sposta
l'importo trattenuto dal giorno della rata al giorno dello svincolo, e
l'esposizione massima cresce di conseguenza. Con una ritenuta del 5% su un lavoro
da un milione e mezzo sono più di 71.000 € che l'impresa non ha per mesi: oggi il grafico
non lo dice. Il costo dell'immobilizzo lo sa già calcolare `calcolaRitenuta`, e si
può mostrare come un rischio accanto agli altri, con le stesse parole del
calcolatore.

**In commessa e in fattura**: è la parte da decidere con il commercialista, non qui,
e sono due prassi diverse. O si fattura l'importo pieno e si incassa il netto —
allora la rata resta aperta per la quota trattenuta, e la Tesoreria lo sa già
rappresentare dal 08/11 (incasso parziale, stato parziale) — oppure si fattura al
netto e lo svincolo è una fattura a sé. La prima è quella che corrisponde a come
funziona oggi il certificato di pagamento dei lavori pubblici, ed è quella da cui
partirei. In entrambi i casi serve che la percentuale arrivi fino alla commessa:
`lp_contabilita` ce l'ha solo per i lavori pubblici, quindi o si estende quella
tabella ai lavori privati o si aggiunge il campo sulla commessa. È la **seconda
migrazione** del lotto B, e l'unica insieme a quella della rata a misura.

## Cosa cambia nei lotti

Il lotto A resta com'è e resta il primo: è indipendente da tutto questo.

Il lotto B diventa più grande di quanto fosse ieri, e cambia anche di natura: non è
più «estendere il modello del computo», è «il computo passa al modello condiviso».
L'ordine dentro B:

- **B1** — il computo salva `PianoPagamento` esteso (termine con fine mese, base a
  misura, ancoraggio a soglia o fase, ritenuta di garanzia a livello di piano), con
  la conversione delle bozze vecchie. Percentuali sul totale IVA inclusa, col caso
  dell'IVA da definire.
- **B2** — il riquadro: modelli di pagamento dell'azienda in testa, la colonna del
  netto incassato, le due regole di validazione al posto dell'unica di oggi.
- **B3** — il confine verso la commessa: eventi veri al posto di `deposit`/`balance`,
  la rata a misura, la ritenuta. Qui stanno le due migrazioni.
- **B4** — il PDF: rata a misura, ritenuta, frase sulle percentuali quando l'IVA non
  è decisa.
- **B5** — la cassa: trattenuta spostata allo svincolo, costo dell'immobilizzo fra i
  rischi.

Il lotto C (preset rifatti) in buona parte si scioglie dentro B2: con i modelli
dell'azienda, i quattro pulsanti scritti nel codice servono a molto meno. Il lotto D
(voci da quantificare) resta dov'era, dopo B4.

---

# Fatto (11/11/2026)

Il lotto A e la maggior parte del lotto B sono scritti, con i test. Cosa è cambiato
davvero, in ordine di quanto si vede:

**Il passo nuovo si apre in cima.** `cambiaFase` in `ComputoNativoEditor.tsx` porta la
pagina alla barra delle fasi, con lo scorrimento dolce (e senza, per chi ha
`prefers-reduced-motion`).

**Un piano incompleto non ferma più il documento.** `pianoErrore` non disabilita più
«Scarica PDF» e «Scarica documento»: ferma la firma e la creazione della commessa, dove
le rate diventano scadenze vere. Il riquadro dei controlli lo dice: il PDF esce senza il
piano. Accanto all'errore c'è «Riporta le rate a 100%», che riproporziona le righe, e un
piano di partenza non cancella più le rate scritte a mano senza chiedere.

**Le rate parlano la lingua del gestionale.** `pagamentiSchema.ts` non ha più i cinque
`quando` suoi: ha gli eventi del cantiere (`firma_contratto`, `inizio_lavori`,
`merce_magazzino`, `sal_numero`, `fine_lavori`, `collaudo`) più i due che mancavano a
tutti, **al raggiungimento del X% dei lavori** e **a completamento di una fase**. Le
bozze vecchie si convertono da sole. `fasiDaRate` porta l'evento e il numero del SAL fino
alla commessa: prima diventavano tutte «acconto» tranne l'ultima.

**Una rata può essere a misura.** `base: "avanzamento"`: niente percentuale, l'importo lo
dirà il SAL. La validazione è in due regole — le percentuali fisse non possono superare
100, e quello che resta è la quota che i SAL si divideranno. I preset «Acconto + 2 SAL +
saldo» e «SAL mensili» ora nascono così, e «SAL mensili» non inventa più un cantiere di
venti giorni: i SAL sono numerati, non appesi a un giorno che nessuno scrive nei
contratti.

**Le percentuali sono sul totale IVA inclusa**, come negli altri otto moduli. Con l'IVA
«da definire» restano le percentuali e gli importi dicono «dipende dall'IVA», senza
bloccare niente. La cassa resta al netto: l'IVA non è dell'impresa.

**Il termine di pagamento è quello vero**: giorni più «fine mese», con 45 giorni nella
tendina, e nel PDF si legge per esteso («pagamento a 45 giorni data fattura fine mese»).

**La ritenuta a garanzia esiste.** Percentuale, su quali pagamenti, svincolo al collaudo
o dopo N mesi. Si calcola sull'imponibile, compare come colonna «Netto incassato», esce
nel PDF con la cifra e la data di svincolo, ed entra nella cassa: la trattenuta si sposta
al giorno dello svincolo, e fra i rischi compare quanto resta fermo.

**I modelli di pagamento dell'azienda** sono in testa al riquadro
(`ComputoModelliPagamento.tsx`), gli stessi degli altri preventivatori e delle commesse.

**Le voci da quantificare dopo** (lotto D): la spunta «Da quantificare più avanti» sulla
lavorazione. Niente errori per quantità, unità e prezzo mancanti, importo fuori dal
totale, riga nel PDF con «Da quantificare» al posto dell'importo, e il documento non si
blocca.

## Quello che resta (aggiornato la sera dell'11/11/2026)

Fatto anche: la migrazione delle rate a misura è applicata e riallineata
(`20290313110000`), il flag arriva fino allo scadenzario; i SAL numerati si spalmano
sul cantiere invece di cadere tutti a metà lavori; la rata a misura nasce in commessa
con la sua previsione; e il termine di pagamento e la rata a misura sono anche negli
altri otto preventivatori (`PianoPagamentoCard`, `lib/preventivi/pianoPagamento.ts`,
PDF edile).

**Il 12/11 è stato chiuso anche l'ultimo pezzo.** Tre migrazioni:
`20290313140000` (i momenti `sal_percentuale`, `fase_completata` e `collaudo`, le colonne
`trigger_soglia`, `trigger_fase`, `termine_giorni`, `termine_fine_mese`,
`orders.ritenuta_garanzia`, e `data_attesa_rata` che sa cosa farne),
`20290313160000` (`order_rate_sostituisci` le salva) e `20290313170000`
(`create_order_atomic` le scrive sulla commessa nuova). Quest'ultima non riscrive a mano
17 KB di funzione: prende la definizione dal catalogo e sostituisce il solo INSERT delle
rate, fermandosi se non lo riconosce.

Quindi la condizione scritta nel contratto arriva intera fino allo scadenzario: «al 30%
dei lavori» porta la sua soglia e matura al SAL che la raggiunge, «a completamento delle
strutture» porta il nome della fase e matura quando la fase si chiude, il collaudo resta
il collaudo.

La regola di «al X% dei lavori» è stata corretta il 12/11 (`20290313190000`): sommava gli
importi dei SAL, ma `sal_records.importo_totale` è già il cumulativo («lavori a tutto il
…»), e la soglia si sarebbe raggiunta troppo presto. Nessuna rata in produzione la usava,
quindi l'errore non ha fatto danni; provata sui dati veri, su un contratto da 1.148.252 €
con diciotto SAL dà il 31/05 al 10%, il 31/08 al 30% e nessuna data al 99%, che quei
lavori non hanno mai raggiunto.

Resta aperta **la ritenuta a garanzia dopo il preventivo**: la colonna sulla commessa
c'è, ma come si comporta in fattura (importo pieno con incasso parziale, o fattura al
netto con fattura di svincolo) è una decisione di prassi, scritta più sopra, che nessuno
può prendere al posto del titolare.

**Storico: la migrazione delle rate a misura non era applicata.** Sta pronta in
`docs/rate-a-misura-commessa-20261111.sql`: aggiunge `order_installments.importo_da_misurare`
e insegna a `order_rate_sostituisci` a leggerlo, perché oggi una rata a misura, arrivata
in commessa, sembra un importo certo. Fuori da `supabase/migrations/` apposta: va
applicata col tool MCP e riallineata nel registro, come dice `CLAUDE.md`. Finché non lo è,
la commessa riceve la stima e il flag viaggia solo nel JSON del preventivo.

**La ritenuta si ferma al preventivo.** In commessa e in fattura serve la decisione sulla
prassi (fattura piena con incasso parziale, o fattura al netto con fattura di svincolo):
è scritta più sopra, e non si può indovinare.

**La card condivisa** (`PianoPagamentoCard`, gli altri otto moduli) non ha ancora il
termine di pagamento né la rata a misura: li ha solo il computo. È il lotto B5 del piano,
e ora che il dato esiste è un travaso, non un progetto.
