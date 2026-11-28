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

## 6-bis. Le decisioni prese dal titolare (28/11/2026)

1. **Nel caso C si fattura il computo col SAL.** Il rendiconto del periodo porta solo l'extra in
   economia. Resta il certificato di SAL.
2. **La regola si impone, non si avvisa.** Quando la commessa ha un computo, ogni riga a prezzo deve
   dire se è una voce del computo o un extra: serve `appalto_rendiconto_righe.voce_computo_id` e la
   scelta obbligatoria nell'editor.
3. **Il lavoro extra su una voce già a contratto è una variante sul computo**: la quantità di
   contratto della voce sale, l'avanzamento resta dentro il computo, la variante resta tracciata.
   Quindi il tetto di oggi (mai oltre il 100%) non si alza: si alza la base.
4. **Si parte dal lotto 1**, il registro dei movimenti.

Restano aperte, e le decido io salvo smentita:
- **percentuale derivata = il massimo dei movimenti**, come fa oggi il rapportino (un 20 digitato
  dopo un 60 non fa tornare indietro il cantiere), **salvo una rettifica esplicita dell'ufficio**,
  che vince su tutto ciò che la precede;
- **la spunta «fatta»** genera un movimento con la quantità residua, alla data in cui si spunta;
- **un movimento di rettifica può riaprire** una sottofase spuntata, azzerando `fatta_il`;
- **cancellare una fase o una sottofase non cancella i movimenti**: restano come storia, senza più
  derivare niente.

## 7. I tre punti su cui la revisione dice di non partire senza una risposta

1. **Quantità e percentuale nello stesso registro** (1.083 sottofasi hanno la base ma non la
   quantità): risolto dichiarando la modalità per sottofase — da confermare col titolare che la
   percentuale resti «l'ultima vince» o «il massimo».
2. **La regola computo/economia non è imponibile** senza creare il legame che manca: decisione 2.
3. **`modalita_lavoro` non classificava il 97% delle commesse**: risolto col valore `semplice`.

## 8. Il travaso: provato il 28/11/2026 su dati veri, non ancora eseguito

`private.avanzamento_travaso_commessa(commessa, prova)` dà il saldo di apertura a una commessa per
volta. La regola che la governa è una sola: **accende solo dove il registro ridà esattamente i
numeri di adesso**. Decide il modo dal valore che c'è (quantità fatta più una base di contratto →
`quantita`; tutto il resto → `percentuale`), calcola che cosa direbbe il registro dopo il solo
movimento di apertura, e se percentuale, quantità o spunta si muoverebbero di un soffio **non
accende**: quella lavorazione finisce nell'elenco degli scostamenti coi due numeri a confronto, e
la decide una persona. Dove accende, rilegge la riga dopo la scrittura e, se qualcosa si è spostato,
alza un errore e annulla tutto. Con `prova => true` non lascia niente (il blocco con gestione
dell'errore è un savepoint, e alla fine solleva di proposito).

Le prove, su EDILIZIA SCAVOLO (`7fe09d74…`, 25 lavorazioni, 15 con avanzamento), in transazioni
annullate:

| prova | esito |
| --- | --- |
| modo prova sulla commessa vera | 15 accese, 0 scostamenti, 0 fasi mosse; a prova finita 0 movimenti e 0 lavorazioni accese nel database |
| travaso reale con cinque casi difficili fabbricati | 12 accese, 3 rifiutate: percentuale dichiarata 80 con quantità al 50%, quantità 20 su una lavorazione senza base, quantità 70 su una base di 65,67 |
| parziale coerente (9 su 18) | accesa a quantità, movimento di 9 m³, 50% |
| percentuale senza quantità (40%) | accesa a percentuale |
| nessun numero spostato | `lavorazioni_mosse` e `fasi_mosse` vuoti in tutte le prove |
| secondo giro subito dopo | 0 accese, 12 movimenti in tutto: l'indice unico su (origine, documento, lavorazione) impedisce il doppione |
| le 157 tabelle legate alla commessa, contate prima e dopo | cambia solo `avanzamento_movimenti` (0 → 15); cronoprogramma, rate, SAL, previsionale, automazioni: identici |

Tre cose trovate per strada, che il modello non diceva:

1. **Una lavorazione ha una sola voce di computo**: `order_work_phase_voci` ha un vincolo unico su
   `subphase_id`. Quindi il caso «unità diverse nella stessa lavorazione» non esiste, e
   `sottofase_quantita_totale` è semplicemente la quantità di quella voce. «Senza base» vuol dire
   voce assente o a quantità zero.
2. **A percentuale il registro non tiene una quantità**: una lavorazione che oggi ha una quantità
   fatta ma nessuna base verrebbe azzerata nella quantità. Il travaso la rifiuta prima di toccarla
   (zero e «niente» contano per la stessa cosa, qui e nella verifica dopo la scrittura).
3. **2.219 lavorazioni sono spuntate come fatte con la percentuale a 0**, e sono **tutte di Demo
   Azienda 2**: nelle aziende vere non ce n'è nessuna. Il travaso le rifiuta, come deve. Il perché
   è nella sezione 9: sono dati nati prima che la percentuale esistesse.

**Nelle aziende vere non è ancora eseguito.** Finché nessuna strada scrive movimenti (i lotti 2-6),
un saldo di apertura non serve a niente e nel frattempo l'editor delle fasi continua a scrivere la
percentuale da sé: il primo movimento che arrivasse dopo una modifica a mano la sovrascriverebbe.
L'accensione va quindi insieme al lotto 2, commessa per commessa, con l'elenco degli scostamenti
davanti. Il comando è `select private.avanzamento_travaso_commessa('<commessa>', false);`.

## 9. Demo Azienda 2: il registro è acceso per davvero (28/11/2026)

Su Demo Azienda 2 (`d2000000-0000-4000-a000-000000000002`) il travaso è stato **eseguito**, non
solo provato: è l'azienda di prova, e un registro acceso su dati veri dice cose che una transazione
annullata non dice.

### Prima: le 2.219 spuntate a zero erano dati pre-riforma

Il trigger `trg_sottofasi_a_avanzamento` (`sottofase_avanzamento_coerente`) impone da sé, a ogni
scrittura, che una lavorazione spuntata abbia percentuale 100. È arrivato con
`20281207100000_avanzamento_della_sottofase`, **pubblicata il 5 novembre 2026**. Le 2.219 righe
incoerenti sono state create fra il 9 ottobre e il 4 novembre: sono nate quando la percentuale di
una lavorazione non esisteva ancora come concetto, e c'era solo la spunta. Non è un dato sbagliato
da qualcuno, è un dato che la regola di oggi normalizzerebbe alla prima scrittura.

Sanate con la regola del database stesso, a lotti di 500 e solo su Demo 2:

```sql
update public.order_work_subphases s set percentuale = 100
 where s.id in (select s2.id from public.order_work_subphases s2
                  join public.order_work_phases f on f.id = s2.phase_id
                 where f.company_id = 'd2000000-0000-4000-a000-000000000002'
                   and s2.fatta and coalesce(s2.percentuale, 0) = 0
                 limit 500);
```

**La percentuale delle fasi non si è mossa**, e il motivo è istruttivo:
`private.fase_percentuale_da_voci` legge `case when s.fatta then 100 else s.percentuale end`, cioè
considerava già al 100% una lavorazione spuntata, qualunque percentuale avesse. Le sole 4 fasi
mosse su 1.491 erano **già disallineate dal proprio derivato prima di toccare qualunque cosa**
(3 dichiarate più alte, 1 più bassa): la scrittura le ha riallineate a un valore che il database
considera corretto da sempre. Verificato contando, fase per fase, la percentuale memorizzata contro
`fase_avanzamento_derivato` prima di qualsiasi modifica.

### Poi: il travaso, 284 commesse in tre lotti

| | |
| --- | --- |
| commesse | 284 (244 con fasi) |
| lavorazioni accese | **2.271** — 44 a quantità, 2.227 a percentuale |
| movimenti di apertura | 2.271, uno per lavorazione |
| rifiutate per scostamento | **4** |
| lavorazioni spostate dal travaso | 0 |
| fasi mosse dal travaso | 0 |
| il derivato ridà i valori dell'app | 2.271 su 2.271: zero discordanze su percentuale e quantità |

Le quattro rifiutate sono esattamente il caso per cui l'elenco degli scostamenti esiste — la spunta
data in anticipo sulla quantità registrata:

| lavorazione | quantità | base | dice la scheda | direbbe il registro |
| --- | --- | --- | --- | --- |
| Demolizione tramezzi | 60 | 120 | fatta, 100% | 50% |
| Muri perimetrali in blocchi | 60 | 90 | fatta, 100% | 67% |
| Posa corrugati e cavi | 200 | 450 | fatta, 100% | 44% |
| Cassetta ABS presidi | 7 | 17 | non fatta, 0% | 41% |

### Il controllo largo: due tabelle si muovono, e la seconda è giusta

Le 157 tabelle con `order_id`, contate sulle commesse di Demo 2 prima e dopo (sanatoria + travaso,
in una transazione annullata):

- `avanzamento_movimenti`: 0 → 2.271. Atteso.
- `commessa_campo_sync`: 41 → 205. È `commessa_campo_segnala_modifica()`, che segna le commesse
  cambiate perché i telefoni le riscarichino: una riga per commessa toccata (164 nuove su 172
  commesse), ed è il suo mestiere.

Tutto il resto invariato: rate agganciate agli eventi, SAL, cronoprogramma, previsionale,
automazioni, misure dei subappaltatori.

### E l'ufficio continua a lavorare

Provato con un utente vero di Demo 2 (`demo2@azienda.srl`, permesso Commesse), in una transazione
annullata, su una commessa con lavorazioni accese:

| prova | esito |
| --- | --- |
| la scheda legge le lavorazioni | 14 righe su 14: nessun GRANT rotto dalle colonne nuove |
| cambiare la percentuale di una lavorazione accesa | passa (finché il lotto 2 non arriva, l'editor è ancora la strada) |
| togliere la spunta | passa |
| spegnere `a_movimenti` a mano | rifiutato dalla guardia |
| cambiare `quantita_contratto` a mano | rifiutato dalla guardia |
| scrivere un movimento dal browser | rifiutato: permission denied |

Da qui in avanti, su Demo 2 ogni prova del lotto 2 parte da un registro vero: 2.271 saldi di
apertura, e le quattro lavorazioni discordanti lasciate dove sono, da guardare a mano.

## 10. Lotto 2: come si misura una commessa sta scritto sulla commessa (28/11/2026)

`orders.modalita_lavoro`, quattro valori, con un CHECK e il valore di partenza `semplice`
(migrazione `20290630180000_commessa_modalita_lavoro`).

### Riempita una volta, da quello che c'era

| modalità | commesse | di cui vive | di cui con documenti emessi |
| --- | --- | --- | --- |
| `semplice` | 1.319 | 1.188 | 208 |
| `computo` | 38 | 37 | 9 |
| `economia` | 18 | 18 | 2 |
| `computo_ed_economia` | 0 | — | — |

La deduzione (`private.commessa_modalita_dalle_cose`) guarda due cose: una voce di computo con
quantità su una fase → computo; un rendiconto d'appalto, delle tariffe di commessa o un contratto
d'appalto → economia. Il SAL verbale **non** entra nella deduzione, e qui sta la scoperta del lotto:

> **147 commesse `semplice` hanno un SAL verbale.** Il SAL a percentuale sulle fasi lo usa anche chi
> non ha un computo. Quindi la modalità decide che cosa l'app **propone**, non che cosa vieta:
> `mostraSalAlCliente` continua a mostrare la vista a chi la usa già, e la modalità la aggiunge dove
> prima mancava — per esempio in appalto col computo, il caso C, dove prima spariva.

`order_type` ('cliente' / 'appaltatore_lavoro') dice con chi si lavora, non come si misura: 84
commesse sono in appalto ma solo 18 hanno tariffe o rendiconti. Restano due colonne diverse.

### Il riempimento non ha svegliato niente

Provato in transazione annullata contando prima e dopo 24 tabelle di automazioni, code, notifiche,
webhook e attività: **zero righe nuove** in tutte. Si muove solo `finanza_revisioni`, e in giù
(453 → 356): `finanza_segnala_modifica` scrive un segnale per azienda e nello stesso giro ripulisce
fino a 100 segnali vecchi di oltre un giorno. Il motivo per cui le automazioni dormono è che
`trigger_automation_on_order` e `notify_order_status_change` reagiscono solo al cambio di
`current_status_id`, e `registra_azione_utente` esce quando `auth.uid()` è nullo.

### La guardia, e un difetto trovato provandola

La modalità si cambia finché la commessa non ha documenti emessi — un SAL verbale o un rendiconto
non più in bozza, una fattura che non sia bozza o annullata
(`private.commessa_ha_documenti_emessi`). La guardia è nata sbagliata:

> `current_user not in ('authenticated', 'anon') then return new` — copiata da
> `public.sottofase_guardia()`, che però **non** è SECURITY DEFINER. Dentro una funzione definer
> `current_user` è il **proprietario**, non l'utente: la condizione era sempre vera e la guardia
> usciva subito per tutti. Provata con `demo2@azienda.srl` su una commessa con una fattura emessa,
> l'update passava. Corretta in `20290630190000` con `auth.role()`, che legge il JWT e una funzione
> definer non cambia. **Da ricordare: una funzione di trigger definer non può usare `current_user`
> per sapere chi sta scrivendo.**

Dopo la correzione, con l'utente vero di Demo 2:

| prova | esito |
| --- | --- |
| cambiare modalità (niente emesso) | passa |
| cambiare modalità (con una fattura emessa) | rifiutato, col motivo |
| riscrivere lo stesso valore su una commessa con emessi | passa, perché non cambia niente |
| modifica normale (descrizione) su una commessa con emessi | passa |
| un valore fuori elenco | rifiutato dal CHECK (23514) |
| il quadro di una commessa di un'altra azienda | rifiutato |

### In interfaccia

- `public.commessa_modalita_quadro(uuid)` (service role e authenticated, con `assert_company_access`)
  dà la modalità di adesso, quella che i dati suggeriscono e se si può ancora cambiare.
- `ModalitaLavoroCard` in Panoramica, sotto i riferimenti PA: una tendina quando si può cambiare, il
  motivo quando non si può, e il suggerimento con un pulsante quando i dati dicono altro.
- `src/lib/orders/modalitaLavoro.ts` tiene le funzioni pure: `mostraRendicontoAlCommittente` e la
  modalità dentro `mostraSalAlCliente`. Il rendiconto resta legato all'appalto, perché il suo
  contenuto ha bisogno del contratto e del committente: una vista che si apre vuota è peggio di una
  vista che non c'è. La modalità lì serve a **togliere** il rendiconto dove il titolare ha detto che
  non si usa (appalto + solo computo → si fattura il SAL).
- 13 prove nuove: `src/test/logic/modalitaLavoro.test.ts` e `src/test/ui/modalitaLavoroCard.test.tsx`.
- `ModalitaLavoroCard.tsx` non è negli otto dizionari: i file dell'ufficio si traducono a blocchi e
  questo non è ancora in `BLOCCHI_UFFICIO`, quindi il controllo della lingua non lo guarda.

### I tipi del database restano un lavoro a sé

`src/integrations/supabase/types.ts` nel repository è **indietro di 13.571 righe** rispetto al
database vero (163.024 contro 176.595), e identico su `origin/main`: non è il ritardo di una
sessione, è un debito di tutto il progetto. Rigenerarlo con `node scripts/genera-tipi-database.mjs`
funziona, ma fa emergere una **catena di TS2589** («tipo troppo profondo») nelle select con più
embed di aree che non c'entrano con questo lotto: `BankAccountsList`, `usePrimaNota` (due punti),
`QuoteDelMovimento`… e ogni giro del cricchetto — venti minuti — ne scopre il successivo, perché il
budget di istanziazione dei tipi si esaurisce nel primo punto che lo sfonda.

Il rimedio, dove serve, è di una riga: tenere la stringa di select in una costante annotata
`string`, così TypeScript non prova a calcolare il tipo della riga più gli embed (il tipo inferito
in quei punti non veniva usato: le righe erano già tipizzate a mano).

Per non far pagare a questo lotto una catena di correzioni in file di altri, il types.ts **non** è
stato rigenerato qui: la colonna e la funzione nuove passano da due accessi non tipizzati, scritti
una volta sola in testa a `ModalitaLavoroCard.tsx`, da cancellare quando i tipi saranno in pari.

### Due difetti che solo la prova in app ha trovato

La tendina salvava e il valore non cambiava. In console, due cose diverse, una dopo l'altra:

1. **`chiediIlQuadro is not defined` → la card spariva senza dire niente.** Avevo staccato il
   metodo dal client (`const f = supabase.rpc as ...`): chiamato così perde il suo oggetto e va in
   errore, e la card, che su errore della query non si disegna, non c'era più. Il cast va fatto sul
   **client**, non sul metodo. I test con il client finto (`vi.mock(... { supabase: {} })`) non
   possono prenderlo: lì nessuno chiama davvero.
2. **`PGRST204 — Could not find the 'modalita_lavoro' column of 'orders_visibili'`.** Il client
   riscrive verso le viste protette **anche le scritture** su `orders`: `protectedOrderUrl` non
   riceve il metodo, al contrario di `protectedPhaseUrl` e `protectedSalUrl`, quindi ogni PATCH del
   browser su `orders` finisce su `orders_visibili`. La vista elenca le colonne una per una: quello
   che non compare non si legge e non si scrive. Risolto in `20290630210000` aggiungendo la colonna
   in coda alla vista, con la definizione presa dal catalogo invece di ricopiata.

> **Regola:** una colonna nuova su `orders` va aggiunta anche a `orders_visibili`, altrimenti dal
> browser non si scrive. Verificata subito dopo, in app: tendina → salvato, pulsante del
> suggerimento → salvato, e il dato di prova rimesso come era.

**Trovato per strada, non corretto:** `orders.tariffa_manodopera_id` non è nella vista e non è
protetta da un CASE — è rimasta fuori, e chi la scrive dal browser prende lo stesso PGRST204.

## 11. Lotti 3-6: il giorno dichiara, il SAL legge (28/11/2026)

### Lotto 4 — «Avanzamento del giorno»

Tre pezzi nel database (`20290630220000`, corretta da `20290630230000`):

1. **`appalto_rendiconto_righe.voce_computo_id`**, il legame che mancava fra la riga a prezzo e la
   voce del computo. Con il legame la regola decisa dal titolare diventa vera: su una commessa che
   si misura sul computo ogni riga di «Altre voci» deve **dire** se è una voce del computo (e quale)
   o un lavoro extra. Manodopera, mezzi, trasporti e materiali restano economia per natura e non
   chiedono niente.
2. **`rendiconto_lavorazioni_del_giorno(commessa, origine, documento)`** — le lavorazioni con
   quantità e unità di contratto, quanto è già fatto, quanto dichiara **questo** documento e qual è
   la loro voce di computo (`20290630250000`). **Nessun importo**: la griglia funziona anche per chi
   non ha il permesso Costi, come `campo_quantita_sottofasi` fa per il rapportino.
3. **`avanzamento_del_giorno_salva(commessa, data, origine, documento, righe)`** — un movimento per
   lavorazione: risalvare lo stesso giorno **sostituisce** (l'indice unico su origine + documento +
   lavorazione), dichiarare zero **cancella**, giorni diversi **si sommano**. Un rendiconto già
   confermato non si riscrive: la correzione è una rettifica.

Chi può: chi può modificare la commessa (l'ufficio con «Commesse → modifica», o chi è assegnato al
cantiere), non bloccato e non cliente esterno. **Non** si chiede «Venduto e importi»: l'avanzamento
è una quantità, non un prezzo, e il capocantiere che non vede i soldi deve poterlo dichiarare.

Una lavorazione non ancora nel registro si accende da sé al primo numero dichiarato, col suo saldo
di apertura (`private.avanzamento_apri_sottofase`): a differenza del travaso di commessa non si
rifiuta mai — c'è una persona che sta dichiarando il lavoro di oggi — e se percentuale e quantità
non erano d'accordo lo dice nel riepilogo (`spostate_dall_apertura`).

Perché il rendiconto non si sarebbe più salvato, e la correzione: `rendiconto_giornaliero_salva`
scriveva `extra_contratto = false` fisso e non conosceva `voce_computo_id`, quindi la regola nuova
avrebbe bloccato il salvataggio su ogni commessa a computo. Ora la funzione legge i due campi dal
JSON delle righe (`20290630240000`), e le righe di un rendiconto continuano a passare solo da lì
(`rendiconto_giornaliero_righe_guardia`).

### Lotto 3 — la griglia

`AvanzamentoDelGiorno` riusa la **veste** della griglia del verbale (le classi `sal-phase-*`: fasi a
sinistra, ricerca, tabella scorribile) e non il suo componente: `SalDraftPhases` porta dentro importi
contrattuali editabili, note per il cliente e il confronto col SAL precedente, che in un giorno non
hanno senso. Le colonne qui sono cinque: lavorazione, a contratto, fatto a oggi, **oggi**, diventa.
L'ultima è il conto che si vedrà dopo il salvataggio, calcolato con le stesse regole del registro
(`anteprimaAOggi`, 14 prove).

### Lotto 5 — il SAL legge i giorni

`sal_quantita_del_periodo(commessa, dal, al)` (`20290630260000`) somma i movimenti: «a oggi» fino
alla data del verbale, «nel periodo» dal verbale precedente, più **quanti giorni** l'hanno
dichiarato e **da dove** vengono (rendiconti, rapportini, ufficio). Provata su tre giorni veri
(5/10: 100, 10/11: 250, 25/11: 80 su una base di 780):

| periodo | a oggi | nel periodo | giorni |
| --- | --- | --- | --- |
| fino al 31/10 | 100 (13%) | 100 | 1 |
| novembre | 430 (55%) | 330 | 2 |
| 20-30 novembre | 430 (55%) | 80 | 1 |
| tutto | 430 (55%) | 430 | 3 |

In interfaccia è una riga sotto la lavorazione nel verbale — «Nel periodo: 28 m² · 3 giorni · da
rendiconti, rapportini» — e non una colonna nuova: il verbale è un documento che va al cliente e
resta cumulativo, la percentuale la scrive chi lo compila. Dove nessun giorno ha dichiarato niente
la riga non c'è.

### Lotto 6 — anche il cantiere scrive un movimento

`sottofase_applica_avanzata`, la strada del rapportino approvato, era l'ultima delle quattro che
scriveva **direttamente** su `order_work_subphases`. Da `20290630270000`: se la lavorazione è nel
registro scrive un movimento (origine `rapportino`, documento il rapportino), e la riga la aggiorna
il derivato; se non lo è, tutto come prima, riga per riga. Lo storico
`sottofasi_dal_rapportino` resta in entrambi i casi, perché lo legge l'ufficio.

Due cose che cambiano dove il registro è acceso, e sono il motivo del lavoro:
- una lavorazione già spuntata non blocca più la dichiarazione (prima `if s.fatta then return`);
- **la percentuale può scendere**: un rapportino corretto in basso riporta indietro la lavorazione,
  perché la storia non sta più in un numero solo. Provato: 50 → corretto a 20 → +30 da un secondo
  rapportino → 99999 (tetto al contratto, spuntata) → corretto a 5 (55, 21%, non più spuntata).

### Le prove del caos

Tutte su dati veri di Demo Azienda 2, in transazioni annullate dove non diversamente detto.

| prova | esito |
| --- | --- |
| quantità negativa | **difetto trovato**: cancellava il movimento invece di rifiutare, perché il controllo «niente da dichiarare» stava prima del segno. Corretto in `20290630230000`; adesso 23514 e il giorno resta intatto |
| lavorazione a percentuale che riceve una quantità | **difetto trovato**: scriveva un movimento a percentuale con la percentuale a NULL. Adesso si ferma col motivo |
| percentuale 150, percentuale negativa | rifiutate (23514) |
| percentuale su una lavorazione a quantità | si ferma col motivo, le altre righe passano |
| lavorazione di un'altra commessa, `sottofase_id` nullo | si ferma col motivo, nessun errore |
| `sottofase_id` che non è un uuid | rifiutato (22P02) |
| origine inventata, documento nullo | rifiutati (22023) |
| quantità oltre il contratto | tetto alla base, 100% |
| due giorni diversi | si sommano (200 + 100 = 300) |
| rendiconto e rapportino sulla stessa lavorazione | si sommano (380), come deciso il 28/11 |
| lo stesso giorno risalvato | sostituisce (500 invece di sommare) |
| lo stesso giorno a zero | cancella solo il proprio movimento (restano 180) |
| rendiconto confermato | rifiutato, col motivo |
| utente di un'altra azienda | scrittura rifiutata (42501), lettura 0 righe |
| anonimo | rifiutato in scrittura e in lettura |
| lavorazione a corpo (senza base) | va a percentuale; 100% la spunta con la data |
| 60 lavorazioni in un salvataggio | 60 scritte, 59 accese, **478 ms** |
| due salvataggi in parallelo (due documenti, stessa lavorazione) | 120 + 60 + 30 + 45 = 255, niente perso: il lock del derivato regge |
| voce a prezzo che non dice niente, su commessa a computo | rifiutata col messaggio |
| voce legata a una voce di un'altra commessa | rifiutata |
| voce del computo **e** extra insieme | rifiutata |
| voce del computo inesistente | rifiutata (23503) |
| manodopera che non dice niente | passa |
| commessa in economia, voce che non dice niente | passa: nessuna regressione |

I dati di prova lasciati su Demo 2 dalla prova di concorrenza (4 movimenti, 2 rendiconti) sono stati
cancellati e la lavorazione è tornata spenta e vuota.
