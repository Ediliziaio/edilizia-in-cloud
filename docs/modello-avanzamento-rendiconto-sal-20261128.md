# Avanzamento, rendiconto e SAL: un modello solo per tre modi di lavorare

28/11/2026. Proposta, non ancora realizzata. Nasce da tre analisi su codice e database di produzione
(fasi e avanzamento, griglia «Lavorazioni da certificare», tipologie di commessa) e da **una
revisione indipendente** che ha verificato ogni numero e ha bocciato tre pezzi della prima stesura.
I punti corretti sono segnati con «*(corretto in revisione)*».

---

## 1. I tre modi di lavorare, come li descrive il titolare

| | Che cosa c'è | Come si registra | Che cosa esce |
|---|---|---|---|
| **A. Privato a computo** | computo metrico con fasi e voci | avanzamento delle lavorazioni | SAL (verbale) e certificato di SAL |
| **B. Economia per un appaltatore** | nessun computo, un listino del committente | giornate, mezzi, materiali | rendiconto giornaliero → rendiconto del periodo |
| **C. Appalto con computo da seguire** | computo di attività con quantità | ogni giorno o settimana: quanto ho fatto di ogni voce | rendiconto del periodo **con** lo stato di avanzamento |

## 2. Com'è fatta l'app oggi (numeri verificati)

**Non esiste un campo «tipologia».** Si deduce: `orders.order_type` (`cliente` /
`appaltatore_lavoro`) e `orders.valorizzazione` (`a_corpo` / `a_misura`, che dice **come si paga**,
non se c'è un computo). «A computo» = esistono righe in `order_work_phases` /
`order_work_phase_voci`. «In economia» = c'è `appalto_contratto_id` con le sue `appalto_tariffe`.

**Esistono due documenti che si chiamano entrambi SAL, e non si parlano.**

- `sal_records` + `sal_voci` + `sal_voci_sottofasi` — il **verbale a percentuale**, cumulativo, che
  nasce dalle fasi (496 in produzione). È il caso A. Alla conferma **non riscrive niente** sulle
  fasi: fotografa.
- `appalto_sal` + `appalto_rendiconto_righe` — il **rendiconto del periodo**, somma di righe a
  prezzo di listino, con ritenuta e netto (12 in produzione). È il caso B.

Nelle commesse in appalto la vista del verbale è nascosta apposta (`detailNavigation.ts:256`), per
non avere due SAL e fatturare due volte.

**L'avanzamento oggi lo scrivono quattro strade diverse, con regole diverse:**

| Strada | Che cosa scrive | Storico |
|---|---|---|
| Editor fasi (ufficio) | percentuale **assoluta**, può anche scendere | no |
| Editor sottofasi (ufficio) | percentuale e quantità **assolute**, anche a blocchi | no |
| Approvazione del rapportino | quantità come **delta del giorno**, percentuale come **massimo** | tabella sì, **righe zero** |
| App di campo (`campo_registra_avanzamento`) | valore **assoluto**, con controllo di concorrenza | tabella sì, **righe zero** |

*(corretto in revisione)* Le due tabelle di storia esistono ma sono **vuote**, con 4.263 rapportini
approvati: di storia da travasare non ce n'è.

**Numeri veri** *(corretto in revisione)*: 1.215 commesse vive. Con fasi: **234**. Che usano davvero
l'avanzamento a quantità: **2** commesse, **63 sottofasi su 6.585**. In appalto: 81, ma solo **16**
hanno il contratto col listino — il caso B di oggi sono 16 commesse, non 81. Caso C: **zero**.

**Dove si rompe il caso C:** `appalto_rendiconto_righe` ha `fase_id` (0 righe su 147 lo usano) ma
**nessun legame** con la voce del computo o con la sottofase. E `order_work_phase_voci` non ha una
quantità eseguita: l'eseguito vive solo sulla sottofase, come totale senza data.

**Una base mobile** *(trovato in revisione)*: `order_work_subphases` non ha `company_id`, non ha
`order_id` e **non ha una colonna quantità**. La quantità di contratto della sottofase non esiste:
la calcola `sottofase_quantita_totale(id)` sommando le voci, e **dà NULL se le unità sono diverse**.

## 3. Le tre idee del modello

### 3.1 L'avanzamento diventa una storia, non un numero

Oggi «quanto è fatto» è un numero che ognuno riscrive a modo suo. Diventa la **somma dei movimenti**:
una riga per ogni «questo giorno, su questa lavorazione, ho fatto questo», con chi l'ha dichiarato e
con quale documento.

```
avanzamento_movimenti
  id, order_id, fase_id, sottofase_id        -- uno dei due: CHECK (num_nonnulls(...) = 1)
  data                      -- il giorno del lavoro, non quello della registrazione
  modo                      -- 'quantita' | 'percentuale'
  quantita, unita           -- l'unità si congela qui: le voci possono cambiare
  percentuale               -- valore ASSOLUTO dichiarato quel giorno, non un delta
  origine                   -- 'rapportino' | 'rendiconto' | 'ufficio' | 'campo' | 'apertura'
  documento_id, nota, created_by, created_at
  unique (origine, documento_id, sottofase_id)   -- vale solo coi documenti veri
```

Correzioni volute dalla revisione:

- **Quantità e percentuale non si sommano insieme.** 1.083 sottofasi hanno la base a quantità ma
  nessuna quantità dichiarata: la percentuale l'ha scritta una persona. Quindi: la **modalità si
  dichiara sulla sottofase** (quantità o percentuale), un CHECK impedisce di mischiarle, le
  **quantità si sommano** e le **percentuali valgono come valore assoluto, l'ultima vince** (oggi il
  rapportino prende il massimo: va deciso se tenere quella regola o passare a «l'ultima vince»).
- **La quantità e l'unità di contratto si congelano** sulla sottofase al primo movimento, come già
  fa `sal_voci_sottofasi.quantita_contratto`. Senza, una variante nel computo sposta l'avanzamento
  senza che nessun movimento lo dica — il contrario di quello che vogliamo.
- **Anche le fasi senza sottofasi** (261 oggi) devono poter registrare: per questo `fase_id` in
  alternativa a `sottofase_id`. Se no restano due modelli, che è il problema di partenza.
- **I numeri derivati si ricalcolano con il lock della sottofase preso prima della somma**, con lo
  stesso arrotondamento a 3 decimali che usa il controllo di concorrenza dell'app di campo, e
  riproducendo le regole di oggi (tetto al 99% finché la quantità non arriva al totale, minimo 1%).
  Altrimenti due rapportini approvati nello stesso minuto perdono un movimento, e nessun controllo
  se ne accorge.
- **Tre comportamenti da decidere prima di scrivere una riga di codice**: se un movimento negativo
  può riaprire una sottofase già spuntata «fatta» (e che fine fanno `fatta_il`, le automazioni di
  fase e le rate agganciate); che movimento genera la spunta «fatta» (quantità? quale data?); che
  ne è dei movimenti quando si cancella una fase o una sottofase.
- **La tabella non ha un'azienda propria**: `order_work_subphases` non ha `company_id`. Le regole di
  accesso passano dalla fase, e un trigger impone azienda e commessa leggendole da lì: un
  `company_id` scritto dal client sarebbe un buco fra aziende.

`order_work_subphases.quantita_fatta` e `percentuale` restano dove sono e diventano **derivate**.
Chi legge oggi (SAL, schede, app di campo, misure dei subappaltatori) non cambia una riga.

**Che cosa si guadagna:** niente doppio conteggio; la riapertura di un documento che si disfa da
sola; e soprattutto **«quanto è stato fatto dal 1° al 30 novembre»**, che è il numero che serve al
SAL del periodo.

**Che cosa non si guadagna** *(corretto in revisione)*: il pregresso. Non esistendo storia da
travasare, le 1.167 sottofasi con avanzamento entrano con un **saldo di apertura** senza data vera.
I periodi sono attendibili **da quel giorno in avanti**, e l'app deve dirlo invece di far finta.

### 3.2 Il rendiconto del giorno ha due facce

Nella scheda del rendiconto giornaliero, **se la commessa ha le fasi del computo**, compare una
seconda sezione: **«Avanzamento del giorno»**, con la stessa griglia di «Lavorazioni da
certificare» (fasi a sinistra, ricerca, voci con «su 30 ora», quantità e percentuale).

| Sezione | Risponde a | Dove finisce |
|---|---|---|
| **Lavorazioni del computo** | quanto ho fatto, delle cose già pattuite | movimenti → avanzamento → SAL verbale |
| **Economia ed extra** (quella di oggi) | che cosa ho speso oltre al pattuito | righe a prezzo → rendiconto del periodo |

**La regola «una lavorazione del computo non si mette anche fra le voci a prezzo» non è imponibile
così com'è** *(bocciata in revisione)*. I due cataloghi non hanno un'identità comune: il computo usa
le tariffe aziendali, il rendiconto usa il listino del **committente** (112 righe su 147) o il testo
libero. Le due strade possibili:

1. **Si crea il legame che manca**: `appalto_rendiconto_righe.voce_computo_id`, e quando la commessa
   ha un computo la riga a prezzo **obbliga** a dire se è una voce del computo o un extra. È la
   strada che rende la regola vera, e costa un pezzo di interfaccia in più su ogni riga.
2. **Resta un avviso**: l'app elenca i sospetti («questa descrizione somiglia a una voce del
   computo») e lascia decidere. Costa poco e protegge poco.

Tre casi veri che il modello deve risolvere comunque, e che oggi non hanno risposta:
**lavoro extra oltre la quantità di contratto** (oggi è impossibile superare il 100%: dove va?),
**voce del computo fatta da un subappaltatore** (la stessa quantità è il nostro avanzamento verso
il committente e il debito verso il sub: chi la dichiara?), **materiale che sta sia nel computo sia
in una bolla di magazzino** (quale dei tre posti comanda?).

La griglia si riusa, ma **non è una semplice parametrizzazione** *(corretto in revisione)*:
`SalDraftPhases.tsx` porta dentro cose che nel rendiconto non hanno senso (importo contrattuale
editabile, note per il cliente, confronto col SAL precedente). Rischio **medio**, non basso.

**Permessi** *(trovato in revisione)*: le voci del computo si leggono solo con il permesso Costi, e
le righe del rendiconto solo con «Venduto e importi». Senza, la sezione nuova mostrerebbe tutto «a
percentuale», e «quantità × prezzo di computo» non sarebbe calcolabile. La strada esiste già e va
rifatta uguale: una funzione del database che dà quantità e unità **senza i costi**, come
`campo_quantita_sottofasi` fa per il rapportino di cantiere.

### 3.3 Il SAL nasce dai giorni

- **quantità a oggi** = somma dei movimenti fino alla data del SAL;
- **quantità del periodo** = somma dei movimenti fra il SAL precedente e questo (colonna nuova);
- la compilazione a mano resta: anche la correzione è un movimento.

**Una riga di rendiconto già entrata in un SAL non si tocca più** (`trg_appalto_riga_congelata`).
Quindi «riaprire toglie i movimenti» vale solo prima dell'emissione: dopo, serve un **movimento di
storno**, non una cancellazione.

## 4. Come si dichiara la tipologia

```
orders.modalita_lavoro = 'semplice' | 'computo' | 'economia' | 'computo_ed_economia'
```

*(corretto in revisione)* Serviva un quarto valore: con le sole tre modalità, **1.177 commesse vive
su 1.215 — il 97% — non ricadrebbero in nessuna**. Sono i lavori ad acconto e saldo (serramenti e
simili), e 212 di esse hanno comunque le fasi. `semplice` è il loro posto, ed è il valore di
partenza: niente SAL, niente rendiconto al committente, le schede di oggi.

| Modalità | Chi è | Quante oggi | Che cosa si fattura |
|---|---|---|---|
| `semplice` | lavoro ad acconto e saldo | ~1.177 | le rate |
| `computo` | caso A | 22 | il SAL verbale |
| `economia` | caso B | 16 | il rendiconto del periodo |
| `computo_ed_economia` | caso C | 0 (da costruire) | **il SAL per il computo**, il rendiconto solo per gli extra |

La modalità si propone alla creazione in base a quello che c'è, e resta modificabile finché la
commessa non ha documenti emessi (SAL emesso, rendiconto del periodo, fattura).

## 5. Che cosa cambia, in ordine di lavoro

| Lotto | Che cosa | Rischio |
|---|---|---|
| **1** | `avanzamento_movimenti` + ricalcolo derivato col lock, modalità per sottofase, quantità e unità di contratto congelate, `fase_id` in alternativa. Le quattro strade di oggi scrivono un movimento. Saldo di apertura per le 1.167 sottofasi con avanzamento. | **Alto.** Tocca l'avanzamento di tutte le commesse con fasi, e con esso il cronoprogramma, le automazioni di fase, le rate agganciate agli eventi, il previsionale e **la misura di quanto si paga ai subappaltatori**: un saldo sbagliato muove soldi. Prova su copia e confronto prima/dopo **anche sui derivati**, non solo sulle sottofasi. |
| **2** | `orders.modalita_lavoro` coi quattro valori, riempito una volta; le schede seguono la modalità. | Medio. |
| **3** | La griglia delle lavorazioni diventa un componente riusabile. | Medio *(era «basso»)*. |
| **4** | Sezione «Avanzamento del giorno» nel rendiconto, con la funzione di lettura senza costi e la scelta fra regola imposta e avviso (§3.2). | Medio. |
| **5** | Il SAL verbale si precompila dai movimenti, con «del periodo» accanto a «a oggi». | Medio. |
| **6** | Lo stesso riquadro nel rapportino di cantiere. | Basso. |

Senza il lotto 1, aggiungere il rendiconto come quinta strada che scrive l'avanzamento **peggiora**
il problema invece di risolverlo.

## 6. Le decisioni che spettano al titolare

1. **Nel caso C, che cosa si fattura?** Proposta: il computo col SAL, il rendiconto del periodo solo
   per l'extra. Alternativa: tutto dal rendiconto, col computo come sola guida — più semplice da
   fatturare, ma si perde il certificato di SAL.
2. **La regola «computo o economia, mai tutt'e due» si impone o si avvisa?** Imporla vuol dire
   chiedere, su ogni riga a prezzo, se è una voce del computo o un extra.
3. **Quando scrivono sia il rapportino sia il rendiconto, chi comanda?** Proposta: nessuno, si
   sommano i movimenti. Alternativa: un solo documento per commessa può toccare l'avanzamento.
4. **Lavoro extra su una voce già finita** (hai fatto 120 mq dove il computo ne diceva 100): va come
   variante sul computo, o come voce a prezzo nel rendiconto?
5. **Una sottofase già spuntata «fatta» si può riaprire** con una correzione, o resta chiusa?
6. **Il pregresso non ha date.** I periodi sono veri da quando partiamo. Va bene, o serve un
   recupero a mano per le commesse aperte?

## 7. I tre punti su cui la revisione dice di non partire senza una risposta

1. **Quantità e percentuale nello stesso registro** (1.083 sottofasi hanno la base ma non la
   quantità): risolto dichiarando la modalità per sottofase — da confermare col titolare che la
   percentuale resti «l'ultima vince» o «il massimo».
2. **La regola computo/economia non è imponibile** senza creare il legame che manca: decisione 2.
3. **`modalita_lavoro` non classificava il 97% delle commesse**: risolto col valore `semplice`.
