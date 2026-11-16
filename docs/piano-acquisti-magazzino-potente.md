# Acquisti, magazzino e costi di commessa — piano per renderlo potente

16/11/2026. Complementare a `piano-magazzino-consumabili.md`, che progetta la logica dei
consumabili. Questo documento risponde a un'altra domanda: **perché oggi il modulo non lo usa
nessuno, e in che ordine costruire perché lo usino.**

Dati di produzione al 16/11/2026, aziende demo escluse dove indicato.

---

## 1. La fotografia d'uso

### Il magazzino

| Azienda | Movimenti | Su commessa | Periodo |
|---|---|---|---|
| Demo Azienda 2 | 18.312 | 14.924 | dati di prova |
| **Green Energy Group** | **68** | **0** | 26/06 → 19/07/2026, poi fermo |
| Demo Azienda | 39 | 6 | dati di prova |

**Su 18.419 movimenti, 68 sono di un'azienda vera, e nessuno è su una commessa.** Green
Energy (fotovoltaico) ha caricato 67 articoli, ha provato tre settimane e ha smesso. La
colonna `quota_magazzino` delle fatture vale zero per tutti. Le prenotazioni, il costo medio
ponderato, i lotti, le matricole: costruiti, testati, mai usati da un cliente.

### Gli acquisti — qui c'è la vita

| Azienda | Fatture ricevute | Diventate costo | Su commessa | Ferme |
|---|---|---|---|---|
| **Innovasol** (FV) | 4.625 | **0** | 0 | 4.624 mai aperte, **8,08 M€** |
| **Bonarrigo** | 2.601 | 261 | 261 | 2.428 storico importato, 131 mai aperte |
| **Impresa Vulcano** | 1.306 | 618 | 558 | **662 lette ma non registrate, 661 k€** |
| **renova solution** | 408 | 228 | **22** | 172 mai aperte; 206 costi senza commessa |
| URBAN VISION | 38 | 38 | 30 | allineata oggi a mano |

Vulcano ha anche **213 bolle** ricevute e zero articoli a magazzino: compra per la commessa e
basta.

### I rapportini

Bonarrigo 26, Vulcano 8. **Nessuno ha materiali compilati.** (Va corretto il documento sui
consumabili, che parlava di «materiali del rapportino buttati via»: non li compila nessuno, il
problema è a monte.)

---

## 2. La diagnosi

**Il modulo è stato costruito per un flusso che le aziende non seguono.**

Il flusso disegnato è quello del manuale: ordine al fornitore → bolla → carico a magazzino →
prenotazione → scarico sulla commessa → costo al medio. Richiede che qualcuno, ogni giorno,
carichi e scarichi. Nessuna impresa edile di 5-30 persone ha quella persona.

Il flusso reale è un altro, e passa da un solo documento:

```
la fattura arriva dallo SDI  →  (qualcuno la apre)  →  diventa costo  →  va su una commessa
```

E **si rompe già al primo passo**. Innovasol ha 8 milioni di acquisti che non sono mai
diventati costi: i margini delle sue commesse non contengono un euro di materiale. Vulcano ne
ha 661 mila letti e lasciati lì. Il magazzino, il fabbisogno netto e il report del risparmio
vengono **dopo** questo passo: costruirli sopra un primo miglio rotto vuol dire costruire
sopra il vuoto.

**Quindi «renderlo potente» non significa aggiungere funzioni al magazzino. Significa portare
dentro il dato che arriva già da solo — la fattura e la bolla — senza chiedere lavoro in più,
e far nascere il magazzino da lì, solo per chi lo vuole.**

---

## 3. I principi

1. **Nessun inserimento a mano che un documento possa sostituire.** Il carico nasce dalla
   bolla o dalla fattura, mai da un modulo da compilare.
2. **Il magazzino è uno strato facoltativo, per articolo.** Chi compra solo per commessa non
   lo vede. Chi tiene scorte lo attiva sugli articoli che contano.
3. **Una regola decisa una volta vale per sempre.** «Le fatture di Würth vanno sui
   consumabili», «le righe con CUP vanno su quella commessa»: si dice una volta, poi si
   applica da sola.
4. **Ogni euro ha una destinazione, e quella senza destinazione si vede.** Il numero che il
   titolare guarda è «X € di acquisti non attribuiti», e deve tendere a zero.
5. **Stimato ed effettivo sempre distinti.** Mai un numero preciso costruito su un'ipotesi.
6. **Regole deterministiche; l'AI propone, una persona conferma.**

---

## 4. Il piano, a ondate

Ogni ondata ha **una metrica di successo misurabile sui dati veri**. Se la metrica non si
muove, l'ondata dopo non parte.

### Ondata 0 — Pulizia (pochi giorni)

| Cosa | Perché |
|---|---|
| Un solo criterio di «sotto scorta», su `quantity_available` | Oggi la lista acquisti e la statistica danno numeri diversi |
| Decidere le 9 tabelle vuote: riusare 4, togliere `rapportino_materiali` | Lo schema racconta funzioni che non esistono |
| Togliere dall'interfaccia ciò che non è collegato a niente | Ogni schermata morta insegna a non fidarsi delle altre |

### Ondata 1 — Il primo miglio: ogni fattura diventa costo (2-3 settimane)

**È l'ondata che vale di più, e non tocca il magazzino.**

1. **Registrazione automatica.** Una fattura passiva con fornitore riconosciuto diventa costo
   da sola, senza che qualcuno la apra. Oggi passa da «non letta» a «letta» a «contabilizzata»
   a mano, una per una: è lì che si fermano 8 milioni.
2. **Destinazione per riga, non per fattura.** Una fattura Würth da 1.000 € con 600 € di
   viti e 400 € di un trapano ha due destinazioni diverse. Oggi `quota_magazzino_righe` e
   `allocations` ci sono già: va esposta la scelta per riga.
3. **Regole di destinazione.** Per fornitore, per categoria AI, per parola chiave nella riga,
   per CUP/CIG/codice commessa (`fatture_proponi_commessa_da_codici` esiste già). Quattro
   destinazioni possibili: **commessa**, **consumabili condivisi**, **magazzino**, **spese
   generali**. Il titolare scrive la regola una volta.
4. **La casella «Da destinare».** Le fatture che nessuna regola ha saputo destinare, in una
   coda unica, con la proposta dell'AI già pronta (oggi `ai-fattura-classify`, migliorata
   stamattina) e la conferma in un clic. `FattureDaAssegnare` è già il germe di questa schermata.
5. **Recupero dello storico.** Un lancio guidato per le aziende con migliaia di fatture ferme:
   applica le regole a ritroso, propone il resto, mostra quanto margine compare.

**Metrica**: quota dell'imponibile dei fornitori dell'ultimo trimestre con una destinazione.
Oggi Innovasol 0%, Vulcano ~70%, renova ~5% su commessa. Obiettivo: **oltre il 90% per
ogni azienda attiva**.

### Ondata 2 — I consumabili condivisi (2 settimane)

Il caso dei 1.000 € del documento sui consumabili, ma alimentato dall'ondata 1: le righe con
destinazione «consumabili condivisi» si accumulano nel mese, e a inizio mese la procedura
guidata le ripartisce sulle commesse attive (ore, lavorazioni, costi diretti), con quadratura
obbligatoria e costi marcati **stimati**.

Senza ondata 1 non c'è niente da ripartire: per questo viene dopo.

**Metrica**: aziende che chiudono almeno un mese di consumabili; tempo medio della chiusura
sotto i 3 minuti.

### Ondata 3 — Il magazzino leggero (3 settimane)

Il magazzino diventa conveniente **solo** se riempirlo non costa lavoro.

1. **Carico dalla bolla o dalla fattura.** Le righe con destinazione «magazzino» caricano da
   sole: articolo riconosciuto (codice fornitore, poi descrizione con suggerimento AI da
   confermare), quantità, prezzo. La lettura delle bolle c'è già (`ddt-ai-extract`,
   `ddt-confronta-ordini`).
2. **Articolo creato al primo acquisto.** Non si parte da un'anagrafica vuota da compilare:
   l'anagrafica si costruisce dagli acquisti.
3. **Scarico in un gesto.** Dal telefono, sulla commessa del giorno: barcode (esiste), o
   «ho preso questi» da una lista dei più usati. Nessuna quantità obbligatoria per i
   consumabili.
4. **Prenotazione dal preventivo.** Quando una commessa nasce da un preventivo con materiali,
   quelli si prenotano da soli (`quantity_reserved` esiste).
5. **Rimanenze nel controllo di gestione.** `cg_rimanenze_magazzino` si riempie a ogni
   chiusura: oggi il CE non sa quanto vale il magazzino.

**Metrica**: aziende con movimenti di magazzino su commessa negli ultimi 30 giorni. Oggi zero.

### Ondata 4 — Fabbisogno netto e proposta d'ordine (2-3 settimane)

La formula del documento sui consumabili (§4.3): lordo dalle commesse e dai consumi standard,
meno libero (senza l'impegnato della commessa stessa), meno in arrivo entro la data, più
scorta di sicurezza, arrotondato a confezione e minimo d'ordine. Criticità in rosso quando
l'ordine arriva dopo l'inizio della lavorazione. La proposta diventa un ODA con un clic.

Viene qui, e non prima, perché ha bisogno di giacenze vere (ondata 3) e di prezzi veri
(ondata 1).

**Metrica**: ODA nati da una proposta del sistema sul totale degli ODA.

### Ondata 5 — Consumo standard e report del risparmio (2 settimane)

Coefficienti per unità di lavoro (€/serramento, €/kWp, €/m², €/ora), alimentati anche dallo
storico che le ondate 1-3 avranno prodotto. I cinque indicatori del risparmio, **separati e
mai sommati**, con «non calcolabile» dove mancano i dati. Il riuso delle scorte sotto
«benefici di cassa», non nei risparmi.

**Metrica**: titolari che aprono il report almeno una volta al mese.

### Ondata 6 — Verticali (a richiesta)

- **Fotovoltaico**: il kit dell'impianto dal preventivo (moduli, inverter, strutture,
  quadri, cavi) diventa prenotazione e fabbisogno; consumo standard €/kWp di default. È il
  verticale con più dati in casa (Innovasol, Green Energy).
- **Serramenti**: import delle distinte da SchüCal / FP Pro / Opera, il terreno di Depy. Da
  fare solo se un cliente serramentista lo chiede e si impegna a usarlo: è un lavoro grosso e
  di nicchia.

---

## 5. Cosa NON fare

- **Non rifinire il magazzino prima dell'ondata 1.** Ogni funzione aggiunta oggi a un modulo
  con zero utenti reali è debito, non valore.
- **Non chiedere quantità sui consumabili.** Chi le vuole, le mette; il default è a valore.
- **Non copiare il contatore del risparmio di Depy così com'è.** Somma il riuso delle scorte
  ai risparmi veri e presenta un beneficio di cassa come margine guadagnato.
- **Non generare scarichi di quantità da una ripartizione economica.** Movimento fisico e
  attribuzione del costo restano due scritture distinte.
- **Non usare l'AI per calcolare.** Solo per leggere descrizioni libere e proporre, con
  conferma visibile.

---

## 6. Le metriche, in una tabella da guardare ogni mese

| Ondata | Metrica | Oggi | Obiettivo |
|---|---|---|---|
| 1 | Imponibile fornitori con destinazione, ultimo trimestre | Innovasol 0%, renova ~5%, Vulcano ~70% | > 90% |
| 1 | Fatture ferme da più di 30 giorni | migliaia | < 20 per azienda |
| 2 | Mesi di consumabili chiusi | 0 | 1 al mese per azienda attiva |
| 3 | Aziende con scarichi su commessa negli ultimi 30 giorni | 0 | 5 |
| 4 | ODA nati da proposta del sistema | 0% | > 30% |
| 5 | Titolari che aprono il report risparmio | — | mensile |

Queste metriche vanno calcolate da una funzione del database e mostrate nel pannello super
admin: se non le vediamo ogni mese, non sappiamo se il piano sta funzionando.

---

## 7. Decisioni da prendere

| # | Decisione | Proposta |
|---|---|---|
| 1 | La registrazione automatica della fattura (ondata 1.1) parte per tutti o su consenso? | **Su consenso, azienda per azienda**, con anteprima di quanto cambierà il margine delle commesse. Spostare 8 M€ di costi in un colpo senza avvisare è uno shock per chi guarda i numeri. |
| 2 | Lo storico (Bonarrigo, 2.428 fatture importate già «contabilizzate» senza costo) si recupera? | **Sì, ma solo l'anno in corso**, e solo su richiesta: gli anni chiusi non servono al margine delle commesse aperte. |
| 3 | Destinazione di default di una riga senza regola | **«Da destinare»**, mai «spese generali»: le generali nascondono il problema invece di mostrarlo. |
| 4 | Ondata 6 serramenti (SchüCal) | **Solo con un cliente pilota impegnato.** Senza, è un prodotto nel prodotto che nessuno usa — esattamente come il magazzino di oggi. |
| 5 | Green Energy Group | **Chiamarli.** Hanno provato il magazzino e hanno smesso dopo tre settimane: sapere perché vale più di qualunque analisi del codice. |
| 6 | Chi possiede la metrica di ondata 1 | Il pannello super admin, con un allarme quando un'azienda attiva scende sotto l'80%. |

---

## 8. In una riga

Il magazzino è già potente sulla carta. Non lo è nei fatti perché ci si arriva solo
caricando a mano, e nessuno lo fa. **Prima si fa entrare da solo il dato che arriva comunque —
fatture e bolle — poi il magazzino nasce da lì per chi lo vuole, e solo allora fabbisogno e
risparmio hanno qualcosa su cui contare.**
