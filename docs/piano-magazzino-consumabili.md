# Magazzino, consumabili e costi di commessa — analisi e piano

16/11/2026. Analisi di quello che c'è, e piano per: materiali di consumo, attribuzione dei
costi alle commesse, fabbisogno netto, report del risparmio.

Questo documento non modifica codice. I numeri sulle righe delle tabelle sono quelli del
database di produzione al 16/11/2026.

---

## 1. Cosa esiste già

### 1.1 Le fondamenta, e sono buone

**La regola d'oro contro il doppio conteggio c'è già, ed è scritta bene.** Una fattura
fornitore si divide in tre destinazioni:

```
imponibile = quote sulle commesse + quota a magazzino + spese generali
```

La quota a magazzino **non è costo di nessuna commessa**: lo diventa quando la merce esce,
perché lo scarico porta sulla commessa il costo medio della scheda. E non è nemmeno spesa
generale: è valore fermo in giacenza. Sta in `lib/fatturazione/ripartizioneFattura.ts` e
`quotaNonRipartita`, con i test in `fatturaQuotaMagazzino.test.ts`.

Questo è il punto più difficile del problema, ed è già risolto. Tutto il resto del piano si
appoggia qui.

**Il costo medio ponderato** è nel database (`magazzino_medio_ponderato`, migrazione
`20281129100000`), con verifica SQL dedicata. I movimenti portano `valorizza_medio`,
`medio_prima`, `costo_provvisorio`.

### 1.2 Tabelle vive

| Tabella | Righe | A cosa serve |
|---|---|---|
| `warehouse_movements` | 18.419 | Ogni carico e scarico, con `order_id`, `unit_cost`, `rientro_commessa`, `da_prelievo` |
| `purchase_order_items` | 1.130 | Righe d'ordine, con `quantity_received`, `warehouse_id`, `stock_item_id`, `ripartito` |
| `purchase_orders` | 305 | ODA con `expected_delivery_date`, `delivery_warehouse_id`, `order_id` |
| `warehouse_stock` | 205 | Articoli: `quantity`, `quantity_reserved`, `quantity_available`, `min_stock_level`, `reorder_quantity`, `unita_misura`, `article_family_id` |
| `ddt_ricezione` / `ddt_righe` | 480 / 585 | Bolle ricevute e righe |
| `stock_units` / `stock_lotti` | 937 / 163 | Matricole e lotti |
| `warehouse_uscite` | 54 | Uscite verso cantiere o cliente |

`quantity_available` è una colonna **generata**: `greatest(0, quantity - quantity_reserved)`.
Le prenotazioni quindi esistono già.

**Lettura delle bolle con l'AI**: `ddt-ai-extract`, `ai-ddt-analyzer`, `ddt-confronta-ordini`,
`email-ai-ddt-carico`. Funziona con qualunque fornitore, non con modelli predefiniti.

**Costi**: `company_costs` ha già `order_id`, `order_work_phase_id`, `allocations`
(`[{order_id, pct}]`, ripartizione percentuale su più commesse), `mese_competenza`,
`quota_magazzino`, `quota_magazzino_righe`, `purchase_order_id`, `senza_fattura`,
`annullato_*`.

### 1.3 Tabelle che esistono ma sono vuote

Ossatura costruita e mai usata. Prima di scrivere codice nuovo va deciso se riusarla o
toglierla di mezzo: oggi è rumore che confonde chi legge lo schema.

| Tabella | Righe | Giudizio |
|---|---|---|
| `material_consumption_daily` | 0 | **Da riusare**: è esattamente il consuntivo giornaliero che serve al consumo standard |
| `material_predictions` | 0 | **Da riusare** per la previsione del fabbisogno |
| `material_price_index` | 0 | **Da riusare** come prezzo di riferimento del report risparmio |
| `cg_rimanenze_magazzino` | 0 | **Da riempire**: oggi il controllo di gestione non ha le rimanenze |
| `rapportino_materiali` | 0 | Morta: i materiali del rapportino stanno in `campo_rapportini.materiali_usati` (jsonb) |
| `proposed_purchase_orders` | 0 | Da valutare come destinazione delle proposte d'ordine |
| `inventory_audits` | 0 | Inventario mai fatto da nessuno |
| `warehouse_transfers` | 0 | Trasferimenti fra magazzini mai usati |
| `ddt_valorizzazioni`, `warehouse_rincari` | 0 | Da chiarire |

### 1.4 Incoerenze trovate

**«Sotto scorta» si calcola in due modi diversi.** La lista acquisti
(`WarehousePurchaseListTab.tsx:368`) usa `quantity <= min_stock_level`; la statistica del
database (`20281022213000`, riga 253) usa `quantity_available < min_stock_level`. Un
articolo con 10 pezzi di cui 8 impegnati e scorta minima 5 risulta **sopra** scorta nella
lista e **sotto** scorta nella statistica. Due numeri diversi nella stessa pagina. Da
unificare su `quantity_available`, che è la domanda giusta: *quanto ne ho di libero.*

**I materiali del rapportino non diventano costo.** Il campo `materiali_usati` esiste, ma non
genera né scarico di magazzino né costo di commessa. Va detto però che oggi nessuno lo compila:
nei rapportini delle aziende reali (Bonarrigo 26, Vulcano 8) i materiali sono sempre vuoti.
Collegarlo serve solo se prima qualcuno comincia a usarlo — vedi
`piano-acquisti-magazzino-potente.md`.

**Le rimanenze non entrano nel controllo di gestione.** `cg_rimanenze_magazzino` è vuota: il
valore del magazzino a fine periodo non è in nessun conto economico.

### 1.5 Cosa manca del tutto

1. Una **classificazione dell'articolo** per metodo di attribuzione.
2. Il **consumo standard** per unità di lavoro.
3. La **ripartizione periodica** dei consumabili, con criteri.
4. Il **fabbisogno netto** (c'è solo il riordino sotto scorta, che è un'altra cosa).
5. Il **report del risparmio**.
6. La distinzione **effettivo / stimato** sul costo di commessa.

---

## 2. Logica funzionale proposta

### 2.1 Quattro nature dell'articolo

Un campo su `warehouse_stock` (ereditabile dalla famiglia articolo), non un'impostazione di
azienda: la stessa impresa ha articoli di tutte e quattro le nature.

| Natura | Acquisto | Carico | Prenotazione | Prelievo | Costo sulla commessa |
|---|---|---|---|---|---|
| **A. Diretto per commessa** | ODA con `order_id` | Carico con commessa già scritta | Non serve | Immediato o differito | Al prezzo d'acquisto della riga, alla ricezione |
| **B. A magazzino** | ODA senza commessa | Carico a magazzino, aggiorna il medio | `quantity_reserved` | Scarico con `order_id` | Al **medio ponderato** del momento dello scarico |
| **C. Consumabile condiviso** | ODA periodica senza commessa | Carico a magazzino | **Mai** | Nessuno scarico per commessa | **Attribuzione a valore**, puntuale o periodica |
| **D. Attrezzatura riutilizzabile** | ODA, cespite | Carico, non consumabile | Assegnazione a persona o mezzo | Rientro previsto | Nessuno: ammortamento o noleggio interno |

La natura **C** è il cuore del problema posto. Le altre tre esistono già quasi del tutto.

**Il reso** vale per A e B: `rientro_commessa` c'è già sui movimenti, va solo esposto e deve
stornare il costo alla stessa valorizzazione con cui era uscito (non al medio di oggi, o si
crea un utile dal nulla).

### 2.2 Le quattro modalità di attribuzione dei consumabili

Configurabili **per articolo o per categoria**, non per azienda.

**Puntuale** — quantità effettivamente prelevate. Si usa quando il materiale ha valore
unitario alto o quando chi è in cantiere lo registra comunque (un prelievo col barcode, una
riga del rapportino). Costo = quantità × medio ponderato. È la modalità già esistente.

**A consumo standard** — quantità o costo previsto per unità di lavoro. Si usa quando il
lavoro è ripetitivo e misurabile: serramento posato, kWp installato, metro quadrato,
ora lavorata. Il costo nasce dall'avanzamento, non da una registrazione di magazzino.

**Periodica** — un costo complessivo del periodo distribuito sulle commesse interessate. Si
usa quando registrare è troppo costoso rispetto al valore: viti, schiuma, silicone, nastri.
È il caso dei 1.000 €.

**Mista** — la norma reale: puntuale per i pochi articoli che contano, standard dove c'è una
unità di misura del lavoro, periodica per il resto.

### 2.3 I criteri di ripartizione periodica

| Criterio | Quando | Dato necessario | Settore |
|---|---|---|---|
| **Ore lavorate** | Il consumabile segue la manodopera | Rapportini | **Edilizia** — consigliato |
| **Lavorazioni eseguite** | Il consumo segue i pezzi | Serramenti posati, kWp | **Serramenti, fotovoltaico** — consigliato |
| **Costi diretti** | Nessun altro dato affidabile | Costi già attribuiti | Ripiego generale |
| **Quote uguali** | Cantieri davvero omogenei | Nessuno | **Da sconsigliare per difetto** |
| **Pesi personalizzati** | Il titolare sa qualcosa che i dati non dicono | — | Sempre disponibile |

**Quote uguali non va mai proposto per primo.** Un cantiere da 200.000 € e uno da 5.000 €
non consumano lo stesso silicone. Il sistema propone il criterio migliore fra quelli per cui
ha i dati, **dice quale ha scelto e perché**, e lascia correggere prima di confermare.

Ordine di preferenza automatico: lavorazioni → ore → costi diretti → quote uguali, con la
prima per cui esistono dati su almeno l'80% delle commesse del periodo.

### 2.4 Acquisto ≠ consumo ≠ costo attribuito

Tre momenti distinti, e il sistema non deve confonderli.

```
Consumo del periodo = Rimanenza iniziale + Acquisti del periodo − Rimanenza finale
                      ± rettifiche inventariali
```

Si ripartisce **il consumo**, non l'acquisto.

Due percorsi, scelti per categoria:

- **Con quantità** — giacenze, carichi, scarichi, resi e rettifiche. La rimanenza finale è
  calcolata. Precisa, richiede disciplina.
- **A valore semplificato** — nessuna quantità: si dichiara la rimanenza finale stimata
  (o la si lascia a zero), si ripartisce la differenza. Veloce, va marcata come stima.

**Una ripartizione economica non genera mai scarichi di quantità.** Il movimento fisico e
l'attribuzione gestionale restano due scritture diverse, collegate ma distinte. Se si
inventassero gli scarichi, la giacenza andrebbe a pezzi nel giro di due mesi.

---

## 3. Modello dati

### 3.1 Campi nuovi su tabelle esistenti

```sql
-- warehouse_stock
natura            text  -- 'diretto' | 'magazzino' | 'consumabile' | 'attrezzatura'
metodo_consumo    text  -- 'puntuale' | 'standard' | 'periodico' | null (eredita)
confezione_qta    numeric   -- multiplo d'acquisto
ordine_minimo     numeric
lead_time_giorni  integer
scorta_sicurezza  numeric   -- distinta da min_stock_level: una è l'allarme, l'altra il cuscinetto
```

### 3.2 Tabelle nuove

**`consumi_standard`** — il coefficiente per unità di lavoro.

```sql
id, company_id, stock_item_id (nullable), categoria (nullable),
unita_lavoro text,        -- 'serramento' | 'kwp' | 'mq' | 'ora' | 'intervento'
quantita_per_unita numeric,
costo_per_unita numeric,  -- alternativa alla quantità, per il metodo a valore
valido_dal date, valido_al date,
fonte text,               -- 'manuale' | 'storico'
note text
```

**`ripartizioni_consumabili`** — la testata di una chiusura mensile.

```sql
id, company_id, periodo_dal date, periodo_al date,
warehouse_id (nullable), categorie text[],
rimanenza_iniziale numeric, acquisti numeric, rimanenza_finale numeric,
rimanenza_finale_fonte text,  -- 'inventario' | 'giacenza' | 'stima'
consumo_da_ripartire numeric,
criterio text, criterio_motivo text,
stato text,                   -- 'bozza' | 'confermata' | 'rettificata' | 'annullata'
confermata_il, confermata_da, note
```

**`ripartizioni_consumabili_righe`** — la quota per commessa.

```sql
id, ripartizione_id, order_id,
base_criterio numeric,     -- ore, pezzi, costi diretti: il numero usato
peso numeric,              -- quota sul totale
importo numeric,
importo_proposto numeric,  -- quanto aveva proposto il sistema, per vedere le correzioni
company_cost_id            -- il costo generato, per tracciarlo e poterlo annullare
```

**`risparmio_eventi`** — ogni volta che il sistema evita una spesa o batte un riferimento.

```sql
id, company_id, tipo,      -- 'riuso_scorte' | 'prezzo' | 'sfrido' | 'urgenza'
order_id, stock_item_id, purchase_order_id,
quantita, valore_riferimento, valore_effettivo, risparmio,
riferimento_fonte text,    -- da dove viene il prezzo di confronto
attendibilita text,        -- 'alta' | 'media' | 'bassa'
data, note
```

### 3.3 Collegamenti da chiudere

- `campo_rapportini.materiali_usati` → `warehouse_movements` (oggi non esiste).
- `ripartizioni_consumabili_righe` → `company_costs` con `senza_fattura = true` e un flag
  **`stimato`** nuovo, per distinguerli nei conti economici.
- `cg_rimanenze_magazzino` ← valore di giacenza a fine periodo, così il controllo di gestione
  chiude.

---

## 4. Formule

### 4.1 Consumo del periodo

```
Consumo = Rim_iniziale + Acquisti − Rim_finale ± Rettifiche
```

Quadratura obbligatoria a ogni chiusura:

```
Σ quote attribuite + Rim_finale + Non_attribuito = Rim_iniziale + Acquisti ± Rettifiche
```

Se non torna, la chiusura non si conferma.

### 4.2 Quota per commessa

```
Quota(i) = Consumo × Base(i) / Σ Base(j)
```

L'ultima quota assorbe l'arrotondamento, così la somma fa esattamente il consumo.

### 4.3 Fabbisogno netto

```
Lordo(a,d)        = Σ fabbisogni da preventivi, computi, distinte e commesse entro la data d
                    + Σ consumi standard delle lavorazioni programmate entro d
Libero            = giacenza − impegnato_per_ALTRE_commesse
In_arrivo(d)      = Σ (ordinato − ricevuto) con consegna prevista ≤ d
Netto(a,d)        = max(0, Lordo + Scorta_sicurezza − Libero − In_arrivo(d))
Da_ordinare(a,d)  = max(Ordine_minimo, ceil(Netto / Confezione) × Confezione)
```

**Il doppio conteggio si evita qui**: dal disponibile si toglie l'impegnato delle **altre**
commesse, mai quello della commessa che sto calcolando — altrimenti il suo stesso fabbisogno
verrebbe sottratto due volte.

Tre numeri distinti da mostrare sempre:

- **Disponibilità immediata** = `quantity_available` di oggi
- **Disponibilità alla data** = immediata + in arrivo entro d − impegni di altre commesse entro d
- **Da acquistare** = `Da_ordinare(a,d)`

**Criticità**: un ordine con consegna prevista **dopo** l'inizio della lavorazione va marcato
in rosso anche se il fabbisogno netto è zero. Arriverà, ma tardi.

Per i consumabili senza distinta, il lordo viene dal consumo standard per le lavorazioni
programmate, e la riga va marcata **stimata**.

### 4.4 Risparmio

Cinque indicatori, **da non sommare**.

| Indicatore | Formula | Fonte | Attendibilità |
|---|---|---|---|
| **R1 · Acquisti evitati per riuso** | Σ qtà prelevata da magazzino × prezzo d'acquisto corrente | `warehouse_movements` + listino | Alta |
| **R2 · Risparmio sul prezzo** | Σ qtà × (prezzo riferimento − prezzo pagato) | `purchase_order_items` + `material_price_index` | Media: dipende dal riferimento |
| **R3 · Riduzione sprechi** | (consumo standard atteso − consumo reale) × costo unitario, a parità di lavorazioni | `consumi_standard` + consuntivo | Media |
| **R4 · Urgenze evitate** | Δ sovrapprezzi e trasporti urgenti, periodo su periodo | ODA con flag urgenza | Bassa finché l'urgenza non è tracciata |
| **R5 · Scostamento budget materiali** | Effetto prezzo = (Pr − Pb) × Qr · Effetto quantità = (Qr − Qb) × Pb | Piano economico + consuntivo | Alta dove c'è un budget |

**Le sovrapposizioni, dette esplicitamente:**

- **R1 non è un risparmio di margine.** Riusare materiale già comprato evita un esborso, ma
  il costo resta sulla commessa al medio ponderato. È un **beneficio di cassa**. Va detto in
  chiaro, o si promette un margine che non esiste. È qui che il confronto commerciale col
  concorrente diventa scorretto se non si sta attenti.
- **R2 e R5-effetto-prezzo misurano la stessa cosa** da due angoli: R2 contro il listino, R5
  contro il budget. Mai sommarli.
- **R3 e R5-effetto-quantità** idem.

Tre famiglie separate nell'interfaccia: **risparmi realizzati** (R2, R3), **opportunità**
(fabbisogno non ancora ordinato dove il prezzo è migliorabile), **benefici di cassa** (R1).

Dove mancano i dati: **«non calcolabile»**, mai uno zero o un numero inventato.

---

## 5. Flusso mensile

Procedura guidata, otto passi, a inizio mese.

1. **Periodo, magazzino, categorie** — default: mese scorso, tutti i magazzini, categorie con natura `consumabile`.
2. **Il quadro** — rimanenza iniziale, acquisti, consumi già registrati puntualmente, rimanenza finale, **costo ancora da attribuire**. La rimanenza finale si può prendere dalla giacenza, da un inventario, o dichiarare a stima: la fonte resta scritta.
3. **Le commesse interessate** — quelle con attività nel periodo (rapportini, movimenti, SAL). Si possono togliere a mano; una commessa chiusa nel periodo resta, una chiusa prima no.
4. **Il criterio proposto** — con la frase del perché: «Ripartito sulle ore dei rapportini: 1.000 ore su 18 commesse». E le alternative a un clic.
5. **Importi, percentuali, impatto sul margine** — per ogni commessa: quota, peso, margine prima e dopo. Una commessa che va in perdita per la ripartizione si vede subito.
6. **Correzione** — si modifica una quota, le altre si riproporzionano, il totale resta bloccato sul consumo da ripartire.
7. **Conferma** — nascono i `company_costs` marcati `stimato`, collegati alla ripartizione.
8. **Rettifiche** — una ripartizione confermata non si cancella: si rettifica, con una nuova riga e lo storico delle modifiche.

**Stime del mese corrente e consuntivi del mese scorso stanno in due posti diversi.** Il mese
corrente mostra una previsione dal consumo standard, marcata chiaramente, e non genera costi
finché non si chiude.

**Controlli bloccanti**: nessuna doppia attribuzione dello stesso periodo e categoria; somma
delle quote mai oltre il costo disponibile; nessuna quota su commesse senza attività nel
periodo; quadratura del §4.1.

---

## 6. Schermate

| Schermata | Contenuto | Drill-down |
|---|---|---|
| **Disponibilità e scorte** | Giacenza, impegnato, libero, in arrivo, sotto scorta | → movimenti dell'articolo |
| **Prenotato per commessa** | Cosa è riservato, per quale commessa, da quando | → commessa |
| **Consumabili da attribuire** | Quanto costo resta senza commessa, per categoria e periodo | → fatture e carichi |
| **Ripartizione mensile** | La procedura in otto passi | → ogni quota fino al costo generato |
| **Fabbisogno netto** | Per articolo: lordo, libero, in arrivo, netto, da ordinare, entro quando, per quali commesse | → commesse che lo richiedono |
| **Report risparmio** | I cinque indicatori separati, mai sommati | → eventi che compongono ciascuno |
| **Costi materiali in commessa** | Effettivi / stimati distinti, con quota ripartita evidenziata | → documenti |

**Ogni importo è cliccabile fino al documento o al movimento che lo ha generato.** Quattro
stati visibili e distinti: **effettivo**, **stimato**, **confermato**, **da verificare**.

---

## 7. Piano per priorità

### MVP — il minimo che risolve il caso dei 1.000 €

1. Campo `natura` e `metodo_consumo` sull'articolo, con eredità dalla famiglia.
2. Tabelle `ripartizioni_consumabili` e `..._righe`.
3. Flag `stimato` su `company_costs`.
4. Procedura mensile: criteri ore / lavorazioni / costi diretti / quote uguali / pesi.
5. Quadratura obbligatoria e controlli contro la doppia attribuzione.
6. Costi stimati distinti nel conto economico di commessa.
7. **Correggere «sotto scorta»**: un solo criterio, `quantity_available`.

Risolve l'attribuzione. Non tocca il fabbisogno né il risparmio.

### Fase 2 — il fabbisogno netto

8. `confezione_qta`, `ordine_minimo`, `lead_time_giorni`, `scorta_sicurezza`.
9. Calcolo del fabbisogno netto con la formula del §4.3.
10. Schermata con i tre numeri distinti e la criticità sulle date.
11. Proposta d'ordine con arrotondamento alle confezioni → ODA esistente.
12. Riempire `cg_rimanenze_magazzino` a ogni chiusura.

### Fase 3 — consumo standard e risparmio

13. `consumi_standard` con i coefficienti, alimentati anche dallo storico.
14. Previsione del fabbisogno dei consumabili dalle lavorazioni programmate.
15. `risparmio_eventi` e i cinque indicatori, separati.
16. `material_price_index` come prezzo di riferimento.

### Fase 4 — avanzate

17. Materiali del rapportino → movimenti di magazzino (chiude la rilevazione puntuale dal campo).
18. Inventario periodico con rettifiche (`inventory_audits`).
19. Conguaglio automatico standard vs reale.
20. Attrezzatura riutilizzabile con assegnazione e rientro.

---

## 8. Esempi numerici

### 8.1 Il caso dei 1.000 € — edilizia

Dati: rimanenza iniziale 300 €, acquisti del mese 1.000 €, rimanenza finale rilevata 500 €,
nessuna rettifica. **20 cantieri attivi**, 1.000 ore nel mese.

```
Consumo da ripartire = 300 + 1.000 − 500 = 800 €
```

**Non si ripartiscono 1.000 €.** 500 € restano a magazzino, 200 € erano già in casa.

**Ripartizione a quote uguali** — 800 / 20 = **40 € a cantiere**.
Il cantiere da 250 ore e quello da 8 ore prendono lo stesso importo: sbagliato.

**Ripartizione sulle ore** (criterio proposto):

| Commessa | Ore | Peso | Quota |
|---|---|---|---|
| Rossi | 250 | 25,0% | 200,00 € |
| Bianchi | 180 | 18,0% | 144,00 € |
| Verdi | 120 | 12,0% | 96,00 € |
| … altre 17 | 450 | 45,0% | 360,00 € |
| **Totale** | **1.000** | **100%** | **800,00 €** |

Quadratura: 800 attribuiti + 500 rimanenza finale = 300 iniziale + 1.000 acquisti. ✓

### 8.2 Serramenti — consumo standard

Schiuma, silicone, nastri: coefficiente **8 €/serramento posato**.

Mese: 120 serramenti posati. Atteso 960 €. Consumo reale (300 + 1.000 − 500) = 800 €.

- Attribuzione standard: 8 € × serramenti di ciascuna commessa.
- Conguaglio: 800 − 960 = **−160 €**, cioè 1,33 €/serramento meno del previsto.
- **R3 · riduzione sprechi = 160 €**, attendibilità media.
- Il conguaglio si ripartisce con lo stesso criterio, o si aggiorna il coefficiente a 6,67 €.

### 8.3 Fotovoltaico — fabbisogno netto

Minuteria di fissaggio, coefficiente **45 €/kWp**. Tre impianti in programma entro il 30/11:
6 + 9 + 12 = 27 kWp → **1.215 € di lordo stimato**.

Su un articolo specifico, staffa a L:

```
Lordo entro 30/11      240 pz   (da distinta, non stimato)
Scorta sicurezza        50 pz
Giacenza               180 pz
Impegnato altre comm.   60 pz
Libero                 120 pz
In arrivo entro 30/11   50 pz   (ODA 12/2026, consegna prevista 24/11)
───────────────────────────────
Netto = max(0, 240 + 50 − 120 − 50) = 120 pz
Confezione 25 pz → Da ordinare = ceil(120/25) × 25 = 125 pz
```

Se l'ODA 12/2026 slittasse al 2/12 e la posa iniziasse il 28/11, il netto resterebbe 120 ma
la riga andrebbe segnata **in ritardo sulla lavorazione**.

### 8.4 Risparmio dello stesso mese, senza sommare

| Indicatore | Valore | Che cosa dice |
|---|---|---|
| R1 · acquisti evitati per riuso | 1.350 € | Cassa non uscita. **Il margine non migliora.** |
| R2 · risparmio sul prezzo | 420 € | Pagato meno del listino, a pari quantità |
| R3 · riduzione sprechi | 160 € | Meno consumo del coefficiente |
| R4 · urgenze evitate | non calcolabile | L'urgenza non è tracciata |
| R5 · scostamento budget | −580 € (prezzo −420, quantità −160) | Scomposto |

**Totale da non scrivere.** R2 e R5-prezzo sono lo stesso risparmio visto due volte; R1 è
cassa, non margine. Nel report: «risparmi realizzati 580 €, benefici di cassa 1.350 €».

---

## 9. Decisioni da prendere

| # | Decisione | Proposta e perché |
|---|---|---|
| 1 | I costi stimati entrano nel margine di commessa? | **Sì, ma marcati e filtrabili.** Un margine senza consumabili è falso per difetto; uno che li confonde con gli effettivi non è verificabile. |
| 2 | Rimanenza finale: inventario o giacenza? | **Giacenza di default, inventario quando c'è, stima dichiarata come ripiego.** La fonte resta scritta sulla chiusura. |
| 3 | Si può chiudere un mese senza inventario? | **Sì**, con la rimanenza marcata stimata. Chiedere l'inventario a tutti vuol dire che nessuno chiude. |
| 4 | Commesse chiuse nel periodo | **Restano** nella ripartizione del periodo in cui hanno lavorato. La chiusura non cancella il consumo. |
| 5 | Registrazioni tardive | **Rettifica del periodo già chiuso**, con storico. Mai riaprire la chiusura. |
| 6 | Criterio di default | **Lavorazioni** per serramenti e fotovoltaico, **ore** per edilizia. Quote uguali solo se non c'è altro, e sempre dicendolo. |
| 7 | Tabelle vuote: riusare o togliere? | **Riusare** `material_consumption_daily`, `material_predictions`, `material_price_index`, `cg_rimanenze_magazzino`. **Togliere** `rapportino_materiali` (superata da `materiali_usati`). |
| 8 | AI dove? | **Solo** nell'interpretazione delle descrizioni non strutturate (riga di bolla → articolo), come suggerimento da confermare. Calcoli, abbinamenti e ripartizioni **deterministici**. |
| 9 | R1 nel titolo del report? | **No.** Va mostrato, ma sotto «benefici di cassa». Metterlo nel totale dei risparmi è pubblicità, non controllo di gestione. |

---

## 10. Casi di test

**Quadratura**
1. 300 + 1.000 − 500 = 800 ripartiti; somma quote = 800,00 al centesimo.
2. Con rettifica inventariale −50: consumo 850, quadratura ancora esatta.
3. Arrotondamenti: 800 / 3 commesse → 266,67 + 266,67 + 266,66 = 800,00.

**Doppio conteggio**
4. Fattura con quota magazzino 300: le commesse vedono 0 finché non esce merce.
5. Chiudere due volte lo stesso periodo e categoria → rifiutato.
6. Attribuire 900 su 800 disponibili → rifiutato.
7. Commessa senza attività nel periodo → esclusa, e se forzata lo segnala.

**Fabbisogno netto**
8. Impegnato della commessa stessa non sottratto; impegnato di altre sì.
9. Confezione da 25 su netto 120 → 125, non 120.
10. Ordine in arrivo dopo l'inizio lavorazione → criticità anche con netto 0.
11. Netto negativo → 0, mai un ordine negativo.

**Risparmio**
12. Senza prezzo di riferimento → «non calcolabile», non 0.
13. R1 non entra nel totale dei risparmi realizzati.
14. R2 e R5-prezzo non si sommano.

**Resi e rettifiche**
15. Reso da cantiere: storna al valore di uscita, non al medio di oggi.
16. Rettifica di una ripartizione confermata: nuova riga, vecchia conservata, storico completo.

**Criteri di accettazione**

- Chiudere un mese di consumabili richiede **meno di 3 minuti** su 20 commesse.
- Ogni importo sul conto economico di commessa è tracciabile fino al documento.
- Effettivo e stimato sono distinguibili a colpo d'occhio e filtrabili.
- Nessuna ripartizione economica genera movimenti di quantità.
- La quadratura del §4.1 è verificata a ogni conferma e blocca se non torna.
