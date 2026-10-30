# Il ciclo passivo: dall'articolo al pagamento del fornitore

Scritto il 29/10/2026 misurando il database di produzione e leggendo il codice.
Completa `docs/flussi-merce-bolle.md` (le porte d'ingresso della merce) e
`docs/piano-ddt-bolle-fatture.md` (il piano su bolle e fatture).

Ogni affermazione qui sotto è stata verificata, salvo dove è scritto
**«da verificare»**.

---

## 1. Che cosa c'è oggi, davvero

### Le fatture dei fornitori ci sono. Tutto il resto no.

| | Best Infissi | Innovasol | Dimora Torino | renova |
|---|---|---|---|---|
| Fatture dei fornitori | 7.137 | 4.525 | 1.271 | 355 |
| Valore | **9,0 M€** | **9,2 M€** | 0,76 M€ | 0,47 M€ |
| Fornitori diversi su quelle fatture | **792** | **575** | 101 | 109 |
| …collegati a un fornitore in anagrafica | **0** | **0** | **0** | **0** |
| Fornitori in anagrafica | 1 | 1 | 60 | 85 |
| Con l'XML (cioè coi dati di pagamento) | 0 | 0 | 0 | 322 |
| Diventate un costo da pagare | 0 | 0 | 39 | 224 |
| Collegate a una commessa | 0 | 0 | 0 | 0 |
| Collegate a un ordine d'acquisto | 0 | 0 | 0 | 0 |

**19,5 milioni di euro di fatture, da 1.577 fornitori, e nessuna è collegata
al suo fornitore.** Il sistema non sa rispondere a «quanto devo a Rossi
Serramenti, e quando».

Per tre aziende su quattro non sa nemmeno *come* si paga ogni fattura (RiBa,
bonifico, a rate, anticipata) né *quando*: le fatture arrivano da Fatture in
Cloud senza XML, e l'import le salva senza dati di pagamento. Per le fatture
**emesse** ai clienti lo stesso import legge le rate (`payments_list`: importo,
scadenza, data e stato del pagamento — `billing-import`, riga 782); per quelle
**ricevute** dai fornitori non le legge. Il dato esiste alla fonte e lo
lasciamo lì. *Che Fatture in Cloud restituisca `payments_list` anche per i
documenti ricevuti lo dice il commento del codice («stesso fieldset di
issued»): **da verificare** con una chiamata.*

### Una correzione su una lettura sbagliata

Nello scadenzario delle aziende vere compaiono delle «uscite»: 127 per Best
Infissi, 56 per Innovasol, 14 per Dimora, 12 per renova. **Non sono pagamenti
ai fornitori**: coincidono una per una col numero delle **note di credito
emesse ai clienti**. Sono rimborsi da fare ai clienti. Verso i fornitori, nelle
aziende vere, lo scadenzario è vuoto.

E per progetto è giusto che lo sia: i debiti verso i fornitori non stanno in
`scadenze` ma in **`company_costs`** — è scritto nel lavoro del 07/08/2026:
*«non collegare i costi alle scadenze o si raddoppiano le uscite»*. Il
previsionale di cassa legge `company_costs` direttamente.

### Ordini, bolle, magazzino: solo nelle Demo

Zero ordini d'acquisto, zero bolle, zero giacenze nelle aziende vere (vedi
`flussi-merce-bolle.md`). La catena ODA → DDT → magazzino non l'ha mai
percorsa nessun cliente.

### RiBa: un'etichetta, scritta in due modi

Non esiste nessuna gestione della RiBa: niente portafoglio, niente avviso della
banca, niente addebito atteso, niente insoluto. Esiste come voce di tendina, e
in due grafie diverse **nella stessa lista** (`src/lib/impostazioni/
pagamentiFornitori.ts`: `riba` e `ri.ba`), più `ri.ba` nello scadenzario e
nella prima nota. Un filtro «pagati con RiBa» oggi ne troverebbe metà.

Lato clienti la RiBa non la usa nessuno: le aziende vere incassano solo con
bonifico — scritto in cinque modi diversi («Bonifico Vista Fattura»,
«Bonifico vista fattura», «BONIFICO», «Bonifico», «MP05»).

---

## 1-bis. Come si paga una fattura: lo dice l'XML, ma l'accordo vince

Aggiunto il 29/10/2026 dopo l'osservazione di Florin: *i termini di pagamento
non stanno solo in Fatture in Cloud, stanno nell'XML di ogni fattura
elettronica — e se l'accordo col fornitore è un altro, deve poterlo scrivere.*

### L'XML: letto, e buttato via

Ogni fattura elettronica ha il blocco `DatiPagamento`: condizioni (a rate,
completo, anticipo), e per ogni rata modalità (MP12 = RiBa, MP05 = bonifico…),
data di scadenza, importo, IBAN. Il sistema ha già un lettore,
`_shared/fatturapaReader.ts`, che però:

1. legge **solo il primo** `DettaglioPagamento` — una fattura a 30/60/90 diventa
   una data sola;
2. non legge `CondizioniPagamento` (rate / completo / anticipo);
3. e quello che legge **non lo usa nessuno**: `ricevi-sdi`,
   `openapi-fatture-ricevute` e il mappatore delle ricevute ricevono
   `scadenza`, `modalitaPagamento` e `iban` e li lasciano cadere.

### La conseguenza, misurata su renova — e corretta il 29/10/2026

`contabilizza_fattura_ricevuta` creava il costo con **scadenza = data della
fattura**, sempre. Su renova: 224 costi da fattura, tutti con quella scadenza,
tutti «scaduti» per 244.919 €.

**Correzione a quanto scritto qui in un primo momento**: avevo detto che
quei 245 mila euro di «scaduti» erano in gran parte falsi. Non è così. Rilette
le rate, dei 184 XML con una scadenza **153 dicono proprio la data della
fattura** (pagamento immediato): per loro la scadenza era già quella giusta.

| | Fatture | Imponibile | Dopo la correzione |
|---|---|---|---|
| L'XML stesso dice «il giorno della fattura» | 153 | 151.371 € | invariata, era giusta |
| L'XML dice una data successiva | **31** | 82.192 € | spostata alla data vera (30 su 31 comunque già passate) |
| Carta o contanti | 20 | 727 € | invariata, è giusta |
| Nessuna data in nessun posto | **20** | 10.628 € | «senza scadenza», dichiarata |

Il problema vero di renova è un altro: **nessuno dei 224 debiti risulta
pagato**. La correzione mette le date giuste, non svuota lo scaduto.

Cosa è cambiato (migrazione `20281029233000_scadenza_fornitore_dall_xml`):
- `rate_pagamento_da_xml()` legge **tutte** le rate dell'XML, nel database;
  provato sui 224 XML veri: 184 date su 184, identiche a un controllo
  indipendente;
- la contabilizzazione usa la rata più vicina, poi carta/contanti → data
  fattura, poi «senza scadenza» — **mai più la data della fattura per finta**;
- il metodo di pagamento si scrive sul costo: **207 costi su 224 ora ce
  l'hanno** (prima nessuno), di cui **3 RiBa**;
- **la RiBa ora esiste fra i metodi di un costo**: il vincolo
  `company_costs_payment_method_check` ammetteva bonifico, contanti, carta,
  RID, assegno, altro. Il primo tentativo della migrazione è fallito proprio lì
  (senza toccare niente). Aggiunta anche al dialogo «Registra pagamento», che
  ora parte dal metodo del costo invece che sempre da «bonifico»;
- con più rate il costo resta uno e il piano intero va nelle note. Esempio
  vero: Centrufficio, **4 RiBa** — 31/10, 30/11, 10/01, 31/01 — a 939,70 €.
  Fino alla scelta del modello delle rate, il previsionale vede l'importo
  intero alla prima: un'uscita anticipata, mai una dimenticata.

Provato su una fattura vera non ancora contabilizzata, in una transazione
annullata: fattura del 30/09, RiBa a 30 gg fine mese nell'XML → costo con
scadenza **31/10** e metodo **RiBa**. Prima sarebbe nato da pagare il 30/09.

### Per le fatture senza XML

Best Infissi, Innovasol e Dimora non hanno l'XML salvato: le fatture arrivano
da Fatture in Cloud come righe e importi. Due strade, **da verificare**:
- Fatture in Cloud conserva l'XML SDI di ogni documento ricevuto e lo espone
  via API: si scarica e si legge col lettore che c'è già;
- in mancanza, le rate di `payments_list`.
Il Cassetto fiscale dell'Agenzia delle Entrate, se collegato, ha l'XML di tutte.

### L'accordo: ha già una casa, vuota

Sul fornitore esistono già `payment_method`, `termini_giorni`,
`termini_fine_mese` e `iban` (migrazione del 21/10/2026), modificabili nella
scheda fornitore. Misurato: **nessun fornitore** in nessuna azienda ha
`termini_giorni` compilato, e **nessuna funzione del database li legge** —
né il costo dall'ordine né quello dalla fattura. L'acconto non ha nessun campo.

### La regola proposta: tre fonti, e mai una scelta in silenzio

| Fonte | Che cosa dice | Esempio |
|---|---|---|
| **Fornitore** | l'accordo abituale | «con Rossi: RiBa 60 gg fine mese» |
| **Ordine (ODA)** | l'accordo di quest'acquisto — vince sul fornitore | «30% all'ordine, saldo alla consegna» |
| **Fattura (XML)** | quello che il fornitore chiede | «bonifico a vista» |

1. **Le rate si generano dall'accordo** (ordine, altrimenti fornitore) quando
   c'è; altrimenti dall'XML; se non c'è nessuno dei due la rata resta **senza
   data, dichiaratamente** — mai la data della fattura, che oggi la fa
   sembrare scaduta il giorno dopo.
2. **Quando accordo e fattura non coincidono, si dice**, non si sceglie: «Rossi
   in fattura chiede bonifico a vista, l'accordo è RiBa 60 gg f.m.: 59 giorni
   prima». Può essere un errore del fornitore o un tentativo di farsi pagare
   prima — in entrambi i casi è una cosa che il titolare vuole sapere.
3. **La persona decide e la decisione resta scritta**: sulla singola fattura si
   può sempre dire «vale l'accordo» o «vale la fattura», o scrivere le rate a
   mano. Chi e quando, come per le righe corrette della bolla.
4. **Imparare dalla fattura**: se il fornitore non ha un accordo e le sue
   ultime fatture dicono tutte «RiBa 60 gg f.m.», lo si propone come accordo —
   proposto, non scritto da solo.

L'acconto entra nello stesso schema: è una rata dell'**ordine**, con la sua
data, che si paga prima della fattura; quando la fattura arriva gli acconti
pagati le vengono imputati e il saldo è calcolato.

## 2. La catena completa, in otto anelli

```
ARTICOLO ──► ODA ──► CONFERMA ──► DDT ──► FATTURA ──► RATE ──► PAGAMENTO ──► BANCA
(listino)   (impegno) (fornitore)  (merce)  (debito)   (quando,  (il fatto)   (la prova)
                                                        come)
                  └─────────────── tutto imputato a una o più COMMESSE ───────────────┘
```

Il punto da tenere fermo — e che oggi il sistema confonde — è che questi sono
**quattro fatti diversi**, con quattro date diverse:

| Fatto | Documento | Che cosa dice | Data che conta |
|---|---|---|---|
| **Impegno** | ODA | quanto ho deciso di spendere | data ordine |
| **Debito** | fattura | quanto devo davvero, e a chi | data fattura |
| **Rata** | scadenza | quando e come lo pago | data scadenza |
| **Pagamento** | movimento di banca | che l'ho pagato | data valuta |

Il **costo di commessa** (il margine) nasce dall'impegno e si corregge col
debito. L'**uscita di cassa** nasce dalla rata e si chiude col pagamento. Sono
due conti diversi: uno dice se il cantiere guadagna, l'altro se l'azienda ha i
soldi in banca quel giorno.

Oggi `crea_costo_da_ricezione_oda` mescola le due cose: quando l'ODA diventa
«ricevuto» crea **un** costo, per **l'intero** imponibile, con scadenza
calcolata dal **giorno di ricezione**. È il punto da cui partono quasi tutti i
problemi qui sotto.

---

## 3. I flussi del serramentista, uno per uno

### A. Serramento su misura: acconto all'ordine, saldo alla consegna

Il caso più comune. Ordino 12 finestre in PVC per il cantiere Rossi: 18.000 €
più IVA. Il produttore chiede il **30% all'ordine** (5.400 €, con bonifico) e il
**70% alla consegna**. Sei settimane dopo arriva la merce col DDT, poi la
fattura: 21.960 € IVA inclusa, di cui 6.588 già versati.

| Passo | Cosa succede nel mondo | Cosa fa oggi il sistema |
|---|---|---|
| Ordine | ODA 18.000 €, termini «30% acconto + 70% saldo» | La voce **esiste nella tendina dei fornitori** (`30_70`) |
| Acconto | Bonifico di 6.588 € il giorno dopo | Nessun posto dove registrarlo sull'ODA |
| Consegna | DDT, ODA → «ricevuto» | Il trigger crea **un costo di 18.000 €** |
| Scadenza | Saldo di 15.372 € alla consegna | «30_70» non contiene giorni → **scadenza = oggi**, per tutto |
| Fattura | 21.960 €, acconto dedotto | Nessun legame col costo dell'ODA |

E se qualcuno prova a registrare l'acconto a mano, va peggio:
- **se lo collega all'ODA**: alla ricezione il trigger vede che un costo con
  quell'ODA esiste già e **non crea niente** — il saldo da 15.372 € sparisce;
- **se non lo collega**: alla ricezione il trigger crea 18.000 € pieni — e in
  cassa l'acconto è **contato due volte**.

**Cosa serve.** Un ODA ha **N rate di pagamento**, non un costo solo. La rata
d'acconto nasce con l'ordine e si paga prima della merce; quando arriva la
fattura, il saldo è **totale fattura − acconti versati**, calcolato e non
scritto a mano. È lo stesso schema che c'è già sul lato clienti: nel lavoro del
08/08/2026 «il saldo va matchato sull'importo CALCOLATO totale ivato −
acconti, il campo può essere stantio».

### B. Ferramenta e accessori: fattura riepilogativa, RiBa 60 gg fine mese

Il secondo caso più comune. Il distributore di ferramenta consegna 8 volte nel
mese su 4 cantieri diversi, con 8 DDT. A fine mese manda **una** fattura che li
elenca tutti, pagabile con **RiBa a 60 giorni data fattura fine mese**.

| Passo | Cosa succede | Cosa fa oggi il sistema |
|---|---|---|
| Consegne | 8 DDT, 4 cantieri | (con la fase 1 di oggi) 8 bolle, ognuna col suo cantiere |
| Fattura | 1 fattura, 8 DDT citati | Nessun legame fattura ↔ DDT; una commessa sola possibile |
| Scadenza | fattura del 31/10 + 60 gg f.m. = **31/01** | Per le aziende vere: nessuna scadenza |
| Avviso banca | ~10 giorni prima, la banca avvisa la RiBa | Niente |
| Addebito | il 31/01 la banca addebita, da sola | Un movimento di banca da riconciliare a mano |

Il calcolo della data è un posto dove si sbaglia facilmente, e il sistema ha
già la regola giusta in `uscitaEventi.ts`: *«fine mese» parte dall'ULTIMO GIORNO
del mese della fattura — 3 marzo + 60 gg d.f.f.m. = 30 maggio, NON 2 maggio. È
l'errore che costa due mesi di cassa.* Ma il trigger dell'ODA la calcola dal
giorno di ricezione, non dalla data della fattura.

**Cosa serve.** (1) La fattura dice da sé come si paga: nell'XML c'è
`ModalitaPagamento` (MP12 = RiBa) e una `DataScadenzaPagamento` per ogni rata;
da Fatture in Cloud c'è `payments_list`. (2) La fattura collegata ai suoi DDT,
e da lì ripartita sui 4 cantieri (fase 4 del piano bolle).

### C. Vetri per tre cantieri, una consegna, una fattura

Variante del caso B senza magazzino: il vetraio consegna in un colpo i vetri
di tre cantieri. Un DDT, una fattura, tre commesse. Oggi né la bolla né la
fattura sanno stare su tre commesse: la bolla ha `order_id` singolo, la
fattura `order_id_suggerito` singolo. Serve la **ripartizione per commessa**
(fattura → N commesse, con la somma delle quote uguale al totale).

### D. Al banco, pagato con la carta

Il posatore compra silicone e schiuma al rivenditore: scontrino o fattura,
carta aziendale o soldi suoi. Esiste ed è il flusso più completo che ci sia:
`/campo/merce` → `campo_acquisti` → verifica dell'ufficio → costo sulla
commessa, con rimborso se l'ha pagato lui. Il pagamento è **contestuale**: non
c'è una scadenza, c'è un addebito sulla carta da riconciliare.

### E. La posa in subappalto

Il posatore esterno manda fattura per la posa, spesso a SAL, spesso in
**reverse charge** (N6.3), a volte con ritenuta. `fatture_ricevute` ha già
`contratto_subappalto_id`, `sal_subappaltatore_id` e `aliquota_reverse_charge`:
questo ramo è predisposto. Il pagamento segue il SAL, non la consegna.

### F. Reso, merce difettosa, nota di credito del fornitore

Due finestre arrivano col vetro rotto. Il fornitore emette una **nota di
credito** (TD04) che riduce il debito. Oggi le note di credito ricevute sono
escluse dall'aggancio fattura→ODA (giusto) ma non riducono nessun debito,
perché il debito non c'è. Serve: nota di credito → riduce le rate ancora da
pagare della fattura che storna (sul lato clienti questo esiste dal 23/10:
«le note di credito stornano la fattura»).

### G. Il prezzo in fattura non è quello dell'ordine

ODA a 18.000, fattura a 18.640: trasporto aggiunto, listino aggiornato, un
pezzo in più. L'aggancio automatico fattura→ODA cerca l'importo **±0,01 €**:
con 640 € di differenza non aggancia, e nessuno lo sa. Serve: aggancio per
fornitore + periodo, e lo **scostamento mostrato** — il costo di commessa si
corregge dall'impegno (18.000) al debito vero (18.640).

### H. Fattura pagata a rate (30/60/90)

`CondizioniPagamento` TP01, tre `DettaglioPagamento` con tre scadenze. Oggi:
un costo, una data. Serve: tre rate.

---

## 4. La RiBa, dal punto di vista della cassa

### RiBa passiva — paghiamo noi il fornitore

1. Il fornitore emette fattura con RiBa (MP12) e una o più scadenze.
2. Il fornitore la **presenta alla sua banca**, che la manda alla nostra.
3. Circa 10-15 giorni prima della scadenza la **nostra banca ci avvisa**:
   l'elenco delle RiBa in arrivo.
4. Alla scadenza la banca **addebita da sola**. Non decidiamo noi di pagarla:
   possiamo solo **bloccarla** (richiamo, contestazione) prima che parta.
5. In estratto conto compare come «ADDEBITO RIBA», con il nome del fornitore.

Che cosa vuol dire per la tesoreria:
- una RiBa è **un'uscita certa a data certa**. Nel previsionale non è «una
  scadenza da decidere» come un bonifico: è un addebito che arriva comunque. Se
  quel giorno il conto non ha la provvista, la RiBa va **insoluta** e il nome
  dell'azienda finisce nelle segnalazioni bancarie — è il caso peggiore;
- serve quindi una vista «**RiBa in arrivo nei prossimi 30 giorni**» confrontata
  col saldo previsto, con l'avviso quando non c'è copertura;
- ogni RiBa è **una rata**: una fattura a 60/90 gg sono due RiBa, due addebiti,
  due riconciliazioni;
- la riconciliazione è facile ed è da automatizzare: importo esatto + data +
  nome del fornitore nella causale;
- il momento per contestare una fattura è **prima** dell'addebito: se la
  fattura è contestata (merce difettosa, caso F), la rata va segnata «da
  bloccare» e qualcuno deve chiamare la banca.

Gli stati di una rata RiBa: *attesa → avvisata dalla banca → addebitata*
oppure *→ da bloccare → richiamata*.

### Dove si vedono, dal 29/10/2026

- **Tesoreria → Panoramica, riquadro «RiBa ai fornitori»**: una riga per RiBa
  (anche le 4 di una stessa fattura, ognuna con la sua data e il suo importo
  lordo), quanto parte nei prossimi 30 giorni contro il saldo, e quante sono
  passate senza essere registrate. Se l'azienda non ha RiBa il riquadro non
  c'è. Legge la vista `v_riba_fornitori` (migrazione `20281029235000`).
- **Costi**: il metodo di pagamento ora si vede anche sui debiti **da pagare**
  (prima solo su quelli pagati), e c'è il filtro **«Metodo di pagamento»**. Il
  riquadro della Tesoreria porta lì già filtrato sulle RiBa.

Gli stati sono quelli che si possono **calcolare**: *in arrivo* (30 giorni),
*passata*, *futura*, *pagata*, *senza data*. «Passata» non vuol dire «pagata»:
la data è passata e nessuno l'ha registrata — addebitata, o insoluta. Lo dice
l'estratto conto. Primo caso vero, renova: Centrufficio, RiBa 1 di 4, 939,70 €,
addebito il 31/10/2026.

### Le rate esistono — 29/10/2026

Fatta, come proposto qui sotto (migrazioni `20281029236000_rate_fornitori` e
`20281029237000_rate_fornitori_riempite`):

- **`rate_fornitori`**: una riga per rata, di una coppia costo + fattura. Le
  crea il sistema quando una fattura diventa un costo, dall'XML (una per
  rata) o, se l'XML non ne ha, una col totale del documento. Riempite per i
  costi esistenti: **1.291 rate** (renova 228, di cui 6 RiBa; Dimora 39;
  Demo 2 1.024, 929 pagate come i loro costi).
- **Gli stati si registrano**: *avvisata dalla banca*, *pagata*, *da
  bloccare*, *richiamata*, *insoluta*, *da pagare* — dal menu di ogni RiBa nel
  riquadro della Tesoreria, con chi e quando.
- **Costo e rate allineati nei due sensi.** Provato da amministratore vero sui
  4 RiBa Centrufficio, in transazione annullata: avvisata → costo aperto;
  1 di 4 pagata → costo aperto; 4 di 4 → costo pagato alla data dell'ultima;
  tolto il pagamento alla 2 → costo riaperto e **le altre tre restano pagate**;
  costo segnato pagato dalla pagina Costi → tutte pagate; segnato non pagato →
  tutte da pagare.
- **Accessi ereditati dal costo**: chi vede il costo vede le rate; chi lo può
  modificare ne cambia stato, data e nota, e nient'altro (l'importo viene dal
  documento). Provato: un utente di un'altra azienda vede 0 rate di renova e ne
  modifica 0.

**Il previsionale legge le rate — 29/10/2026.** Il previsionale vero
(`/azienda/previsionale`: `useForecastLedger` + `src/lib/finance/forecastLedger.ts`)
fa uscire un costo a rate **rata per rata**, ognuna alla sua data e col suo
importo lordo; le rate già pagate non escono più; accanto all'uscita c'è lo
stato registrato («avvisata», «da bloccare», «richiamata», «insoluta»).
Centrufficio: 4 uscite da 939,70 € il 31/10, 30/11, 10/01 e 31/01, invece di
3.758,80 € tutte il 31/10. Il totale non cambia.
E una regola per tutti gli altri lettori «per costo» (badge della pagina Costi,
avvisi del mattino): **un costo a rate scade alla sua prossima rata aperta**,
aggiornato da solo (migrazioni `20281029238000`, `20281029239000`). Pagata la
RiBa 1, Centrufficio passa da solo a «scadenza 30/11». L'avviso dice l'importo
della rata: «939.70 € · RiBa 1 di 4 il 31/10/2026».

Restano da fare, dalla proposta:
- **la banca non chiude ancora la singola rata**: un addebito collegato al
  costo lo paga per intero (e con lui tutte le rate). Il collegamento
  rata ↔ movimento di banca è il passo 4, e senza un conto collegato in nessuna
  azienda vera non si può nemmeno provare sui dati veri;
- le **rate a mano** (un costo senza fattura spezzato in rate) non si creano
  ancora dall'interfaccia;
- **due previsioni secondarie non contano le rate**: il riquadro «Previsione
  Liquidità 90 giorni» della Tesoreria (`get_cash_flow_forecast`) prende le
  uscite solo dallo scadenzario — quindi per le aziende vere non vede i debiti
  verso i fornitori, e senza banca collegata non mostra comunque niente — e la
  previsione di Silvio (`silvio_cashflow_forecast_90d`) legge le fatture ricevute
  per conto suo;
- l'avviso del mattino scrive gli importi all'inglese («939.70», «3,080.98»):
  era già così prima.

### Proposta per gli stati che vanno registrati

*avvisata dalla banca*, *da bloccare*, *richiamata*, *insoluta* non si possono
calcolare: qualcuno li deve scrivere, e servono la RiBa come riga a sé. Proposta:

1. **Tabella delle rate** (`fornitori_rate`, nome da decidere): una riga per
   rata, con fattura, costo, numero, scadenza, importo lordo, metodo, IBAN e
   **stato**. Nasce dall'XML alla contabilizzazione (il lettore c'è già) e
   dall'accordo sull'ODA per gli acconti. `company_costs` resta il costo di
   competenza, una riga per fattura: non si tocca il legame
   `fatture_ricevute.company_cost_id`, su cui contano note di credito e SAL.
   È la strada «tabella nuova» del punto 1 di «Da decidere», preferita alla
   «una riga di costo per rata» proprio per non spezzare quel legame.
2. **Il pagamento si registra sulla rata**: il costo è pagato quando lo sono
   tutte le sue rate. Così «pagata» vale per la singola RiBa.
3. **Il previsionale legge le rate** quando ci sono: la RiBa 3 di 4 conta a
   gennaio, non a ottobre.
4. **La banca chiude la rata da sola** quando l'addebito combacia (importo,
   data, fornitore nella causale). Serve un conto collegato: oggi nessuna delle
   quattro aziende vere ne ha uno.

### RiBa attiva — incassiamo dal cliente

Oggi nessun cliente vero la usa (incassano tutti con bonifico), quindi è per
dopo. Per completezza, è un flusso diverso:
1. emettiamo fattura con RiBa al cliente;
2. **presentiamo** le RiBa alla nostra banca, in un **portafoglio**;
3. la banca può **anticiparci** l'importo «salvo buon fine» (SBF): soldi in
   conto subito, ma non ancora nostri;
4. alla scadenza il cliente paga → chiuso; oppure non paga → **insoluto**: la
   banca ci riaddebita l'anticipo più le commissioni, e il credito torna aperto.

Che cosa vuol dire: un incasso SBF **non è un incasso** finché non passa la
scadenza; la fattura resta «aperta con anticipo» e il rischio di insoluto va
tenuto a vista. Serve il portafoglio effetti, lo stato della singola RiBa e il
riaddebito dell'insoluto.

---

## 5. A livello di commessa

La commessa deve dire tre cose diverse sullo stesso fornitore:

| Domanda | Da dove viene | Oggi |
|---|---|---|
| Quanto mi costa (margine) | impegni (ODA) corretti dai debiti (fatture) | dagli ODA + costi senza ODA (`v_ordine_marginalita`) |
| Quanto ho già pagato | pagamenti imputati alla commessa | solo dove il costo ha `order_id` |
| Quanto mi resta da pagare, e quando | rate aperte imputate alla commessa | non c'è per le aziende vere |

E la quarta, quella che fa fallire le imprese di serramenti: **l'esposizione
di cassa**. Il cliente paga il 30% alla firma e il saldo a posa finita; il
produttore vuole il 30% all'ordine e il saldo alla consegna — che viene
**prima** della posa. Fra la consegna e il collaudo l'azienda ha già pagato
quasi tutto il fornitore e incassato solo l'acconto del cliente. Quel buco,
cantiere per cantiere e settimana per settimana, è l'informazione che vale di
più. La card «Chi finanzia il cantiere» (`EsposizioneCommessa.tsx`, agosto
2026) lo calcola già **col passato**: rate incassate contro costi pagati. Quello
che non può vedere è il **futuro** — quanto uscirà verso i fornitori e quando —
perché le rate ai fornitori non esistono. È esattamente la parte che serve per
non trovarsi scoperti.

---

## 6. Il modello che regge tutti i flussi

Senza cambiare quello che funziona, il pezzo che manca è uno: **la rata di
pagamento al fornitore**, come entità.

```
ODA ──(0..N rate d'acconto)──┐
                             ├──► RATA DI PAGAMENTO ──► PAGAMENTO (banca)
FATTURA ──(1..N rate)────────┘     · importo
   │                               · data scadenza
   └──► ripartita su N commesse    · metodo: bonifico | RiBa | SDD | carta | contanti
                                   · stato: attesa → (avvisata) → pagata
                                            | da bloccare → richiamata
                                   · ODA e/o fattura di riferimento
```

Le regole, scritte nel database come per le bolle:
1. **Una rata d'acconto nasce dall'ODA**, prima della fattura.
2. **Quando arriva la fattura**, le rate d'acconto pagate le vengono imputate,
   e le rate di saldo si generano dai suoi termini (XML / Fatture in Cloud):
   **saldo = totale fattura − acconti imputati**, calcolato.
3. **Il trigger dell'ODA smette di creare un costo unico** quando esistono
   rate: oggi è la causa del doppio acconto e del saldo che sparisce.
4. **La RiBa è un metodo di una rata**, con data certa, e un codice solo.
5. **Una nota di credito riduce le rate aperte** della fattura che storna.
6. **Un pagamento si collega a una o più rate**, mai a un «costo» generico.

Questo **va deciso prima di scrivere codice**, perché tocca il patto attuale
«i debiti stanno in `company_costs`»: la rata o diventa una tabella nuova
accanto a `company_costs`, o `company_costs` diventa la rata (una riga per
rata). La seconda è meno invasiva — il previsionale e le notifiche
continuerebbero a funzionare — ma va verificata contro tutti i lettori.

---

## 7. In che ordine, se si decide di farlo

Ordinati per **valore per un cliente vero oggi**, cioè per quanto lavoro gli
risparmiano senza chiedergli niente di nuovo.

| # | Cosa | Perché prima | Fatica |
|---|---|---|---|
| 1 | **Fornitore dalla fattura**: crearlo/agganciarlo dalla P.IVA | 1.577 fornitori, 0 collegati: senza questo niente è «per fornitore» | bassa |
| 2 | **Rate dalla fattura** — ✅ fatto per le fatture con l'XML il 29/10/2026. Resta: recuperare l'XML dove manca (Best Infissi, Innovasol, Dimora) | i dati c'erano già e li buttavamo | bassa-media |
| 2-bis | **Accordo che vince sull'XML**, con la segnalazione quando non coincidono | è il pezzo che dice al titolare quando un fornitore chiede di essere pagato prima del pattuito | media |
| 3 | **Debiti per fornitore e per scadenza**, con le RiBa dei prossimi 30 giorni contro il saldo | la domanda «quanto devo e quando» trova risposta | media |
| 4 | **Ripartizione della fattura sulle commesse** | l'unico modo per avere il costo per cantiere senza ODA né bolle | media |
| 5 | **Acconti sull'ODA** e saldo calcolato alla fattura | serve a chi usa gli ODA — oggi solo le Demo | media-alta |
| 6 | **RiBa attiva**: portafoglio, SBF, insoluti | nessun cliente la usa oggi | alta |

I passi 1 e 2 non chiedono all'utente di cambiare niente e trasformano 19,5
milioni di fatture mute in debiti con un nome e una data.

Prima del passo 2: **verificare** come recuperare l'XML delle fatture arrivate
da Fatture in Cloud (l'XML SDI del documento ricevuto, o in mancanza
`payments_list`).

## Da decidere

1. La rata: tabella nuova, o `company_costs` diventa una riga per rata?
2. Il costo di commessa si corregge dall'ODA alla fattura in automatico, o
   resta l'ODA e lo scostamento si mostra soltanto?
3. Fornitori creati in automatico dalle fatture (792 per Best Infissi), o
   proposti e confermati da una persona?
4. Il codice della RiBa: uno solo (`riba`), con la conversione dei `ri.ba`
   esistenti?
