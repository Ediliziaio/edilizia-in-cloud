# Piano completo: costi, pagamenti, ritenute, tesoreria, previsionale e F24

*Scritto il 01/11/2026 su richiesta di Florin («ragiona dall'alto… verifica tutti i sistemi, le ritenute di
garanzia, la ritenuta bancaria dell'11%, le schede fornitori e subappaltatori, tesoreria, previsionale,
F24»). Si basa su quattro controlli del codice e su misure del database fatte lo stesso giorno. Riprende
[flussi-acquisti-pagamenti.md](flussi-acquisti-pagamenti.md) e
[piano-personale-costi-commesse.md](piano-personale-costi-commesse.md) senza ripeterli.*

## Stato al 01/11/2026 sera

**Fatto** (migrazioni applicate e riallineate, test verdi):
- Lotto 0: C2 fattura d'appalto (trattenuta a garanzia in riga negativa, niente RT02).
- Lotto 1: A1-A3, A5, B1, C1 (fatture ricevute complete da ogni canale; rate, RiBa, ritenuta, F24 1040).
- Lotto 2: C3 (bonifico parlante dalla banca per fatture e rate), C4 (ritenute del condominio in
  Contabilità fiscale), garanzie nel previsionale.
- Lotto 3: D1 (Tesoreria → Previsioni = Previsionale), D2 (mutui, F24 1001 e INPS dai cedolini),
  D3 (fattura della ditta già in commessa), E1 (F24 «Segna pagato» con quietanza).
- Lotto 4: F1 (scheda fornitore «Fatture e debiti» con estratto conto), F2 (stessa vista nel
  subappaltatore; totali dei contratti non più a zero).
- Lotto 5: B2 (rate dall'accordo del fornitore), B4 (avviso RiBa a 5 giorni), D4 (RiBa passate pagate
  in blocco), E2 (codici F24 completi).
- Lotto 6: G1 (fatture registrate senza commessa con la proposta da confermare), G3 (costi pronti).
- Lotto 7: E6 (f24_componi spenta anche da zero), TD08 nella contabilizzazione.

**Resta**, e perché:
- C2 garanzie attive dalle fatture emesse nel registro: il registro accetta solo scritture di un
  amministratore (guardiano fiscale), e in produzione nessuna fattura emessa ha una trattenuta. Serve
  decidere se la scrittura automatica può passare dal guardiano.
- E3 F24 proposto dal mese: decisione 6. Le stime 1001/INPS/1040 sono già nel previsionale.
- E4 archivio unico: `f24_entries` e `adempimenti_fiscali` sono entrambi vuoti; da unire alla prima riga.
- E5 Cassa Edile: i cedolini non hanno il dato.
- B3/F3 fornitore dalla P.IVA: le 10.000 fatture con P.IVA non trovano un fornitore in anagrafica
  (0 collegabili): va creata l'anagrafica, non solo collegata.
- B5 acconto sull'ODA, B6 note di credito che stornano le rate, G2, G4, G5, H1-H5, A4, A6-A8:
  da fare; G4 e G5 aspettano le decisioni 3 e 4.

## L'obiettivo in una frase

Per ogni commessa e per l'azienda: **quanto ho venduto, quanto mi costa davvero (senza IVA), quanto devo
ancora pagare e incassare e in che giorno (con IVA, ritenute e trattenute al loro posto)**, con ogni
numero che porta al documento da cui viene, niente contato due volte, niente scelto in silenzio.

---

## 1. Cosa manca ancora: le criticità, dalla più costosa

### Gravi: i numeri o le scadenze sono sbagliati oggi

| # | Criticità | Effetto | Dove |
|---|---|---|---|
| 1 | **Fatture in Cloud: le fatture ricevute perdono rate, scadenze, metodo (RiBa) e ritenuta.** L'import scarica `payments_list` ma lo butta, e non c'è l'XML | Per Dimora, Innovasol, Best Infissi ogni debito nasce «senza scadenza», una rata unica lorda | `billing-import/index.ts:927-945` |
| 2 | **Le fatture ricevute non contabilizzate sono invisibili alla cassa.** Rate e RiBa nascono solo alla contabilizzazione | Bonarrigo: 20 RiBa nell'XML, 0 in cassa. Innovasol e Best: migliaia di fatture mai diventate debito | `useForecastLedger.ts:340-350` |
| 3 | **Ritenuta d'acconto dei professionisti (20%) mai letta.** `fatture_ricevute` non ha colonne per ritenuta, cassa, bollo | Se manca `ImportoPagamento` si paga il lordo (si paga troppo); nessun F24 1040 al 16; niente CU | `fatturaRicevutaXml.ts`, `rate_fornitori.sql:179-196` |
| 4 | **Fattura d'appalto: la «ritenuta a garanzia» del contratto finisce nell'XML come ritenuta d'acconto fiscale (RT02).** Il rendiconto la chiama garanzia, la fattura la dichiara all'Agenzia come ritenuta fiscale | Errore fiscale. Oggi 1 sola fattura, in Demo 2: va corretto prima che capiti a un'azienda vera | `src/lib/appalto/fattura.ts:270-277` |
| 5 | **Ritenuta bancaria 11% dei bonifici parlanti persa alla riconciliazione.** Il bonifico netto (circa 91%) non si abbina alla rata lorda (tolleranza 1%); a mano la rata diventa pagata col netto e la ritenuta non si registra | Credito d'imposta non tracciato (circa 9% dei lavori in bonus); fattura «pagata in parte» per sempre | `rateBankMatch.ts:90`, `RiconciliaRateBancaDialog.tsx:118-138`, `riconcilia_bonifico_fattura` |
| 6 | **Un F24 non si può segnare pagato** (serve una quietanza che non si può caricare) | Il previsionale lo conta come uscita per sempre, anche dopo l'addebito in banca | `useF24.ts:96-99`, `F24Generator.tsx:555` |
| 7 | **La scheda «Previsioni» di Tesoreria guarda solo fatture vecchie e scadenze.** Mancano costi, rate e RiBa, stipendi, F24, IVA | Saldo a 90 giorni molto più alto del vero, in bella vista | `tesoreria/CashFlowForecast.tsx:34` |
| 8 | **Contributi INPS, ritenute dei dipendenti e Cassa Edile non stimati né generati.** Il calcolo automatico F24 dai cedolini è stato spento | Le uscite fiscali più grosse di un'impresa edile non sono in cassa | `useForecastLedger.ts:1202`, migrazione `20261026220848:145` |
| 9 | **File con più fatture (lotto) da SDI e OpenAPI: entra solo la prima**; le altre restano «da registrare a mano» | Costi e debiti mancanti | `salvaFatturaRicevuta.ts:178-180` |
| 10 | **Trattenuta a garanzia nelle fatture emesse senza registro**: la rata è lorda, la fattura netta, e quando la fattura è pagata la rata risulta pagata per intero | Incassato della commessa gonfiato; la quota trattenuta nessuno la ricorda allo svincolo | `CreaFatturaDialog.tsx:393,633`, `allinea_rata_da_fattura` |

### Importanti: buchi nel flusso

| # | Criticità | Dove |
|---|---|---|
| 11 | **Lo svincolo della ritenuta di garanzia non genera niente**: né la fattura della quota (verso il cliente) né il debito (verso il sub). La quota trattenuta al sub non si può nemmeno pagare dal percorso SAL | `fiscalita_svincola`, `pagamenti_spese_atomici.sql:187` |
| 12 | **Ritenute di garanzia fuori dalla cassa**: le attive (soldi parcheggiati dal committente) e le passive (da dare al sub) non sono né in Tesoreria né nel previsionale | `useForecastLedger.ts` |
| 13 | **Ritenuta di garanzia nelle fatture dei sub non riconosciuta** (riga negativa o solo in causale): la quota trattenuta sparisce dal debito | `fatturaRicevutaXml.ts:120-190` |
| 14 | **Scheda fornitore: niente fatture, debiti finti.** Non mostra le fatture ricevute; scadenze e KPI leggono la tabella vecchia `scadenze` invece di rate e RiBa | `useOperationalSuppliers.ts:166-235` |
| 15 | **Scheda subappaltatore: totali vuoti su più contratti** (fatture e ritenute passate vuote), niente IBAN né termini, niente elenco unico di fatture e pagamenti | `ContrattiSubappalto.tsx:992` |
| 16 | **Fornitore e subappaltatore scollegati.** Tre anagrafiche (fornitori, subappaltatori «campo», schede sicurezza) più le ditte, legate a mano da un solo collegamento. Solo 9 subappaltatori su 107 con P.IVA risultano anche fornitori | `supplier_relations`, `cedenti_fatture_ricevute` |
| 17 | **Mutui e finanziamenti** (`cg_loans`) assenti dal previsionale | `useForecastLedger.ts` |
| 18 | **SAL dei subappalti verificati ma non fatturati** assenti dal previsionale; possibile doppio conteggio tra ditte in commessa e fattura del sub | `forecastLedger.ts:1061` |
| 19 | **IVA trimestrale e acconto di dicembre** (6031-6035, 6099) non registrabili, e quando ci sono la stima IVA si spegne | `useF24.ts:25-44` |
| 20 | **RiBa non riconciliate con la banca**: l'abbinamento va per costo intero, mai per la singola rata | `costiBankMatch.ts` |
| 21 | **Buste paga che non arrivano alle commesse**: 1.021 cedolini, nessuno corregge il costo stimato ore × tariffa | — |
| 22 | **Fatture fornitori non assegnate alle commesse**: Dimora 1.277 fatture, 0 su una commessa | — |

### Da sistemare: precisione e pulizia

- **Aruba**: niente importi, niente XML, tipo sempre TD01 (una nota di credito diventa fattura).
- **OCR da PDF/foto**: la scadenza viene letta e poi buttata; IBAN e metodo non vengono chiesti.
- **Note di credito TD08** e documenti TD16-19 trattati come fatture da pagare.
- **Metodo di pagamento preso solo dalla prima rata**; `CondizioniPagamento` non salvato; «giorni dalla data fattura» senza data di riferimento lascia la rata senza data.
- **IBAN della fattura mai confrontato** con quello noto del fornitore (antifrode).
- **Fatture allegate alle email** che dopo la conferma non diventano fatture ricevute.
- **Ritenute subite sulle nostre fatture** (condominio 4%) non diventano credito.
- **Riquadro bonus**: l'etichetta dice «÷ (1 + IVA reale)» ma il calcolo usa 1,22; l'11% viene applicato anche alle righe escluse dal bonus; il previsionale usa sempre l'11%, anche dove varrebbe l'8% (prima del 01/03/2024).
- **Due archivi delle scadenze fiscali** (`f24_entries` e `adempimenti_fiscali`) che dicono cose diverse; scadenza del 16 non proposta.
- **Quattro previsionali diversi** (ledger, Tesoreria, Controllo di gestione, rendiconto) che non danno lo stesso numero.
- **Rischio sull'ordine delle migrazioni**: rieseguite da zero, riaccenderebbero `f24_componi` (spento apposta).
- **Banca**: nessuna azienda vera ha un conto collegato; senza, niente risulta pagato e gli scaduti sono finti.

---

## 2. Le regole che valgono per tutto il piano

1. **Costo senza IVA, cassa con IVA.** Il margine sull'imponibile; scadenze e pagamenti su quanto esce davvero.
2. **Ogni trattenuta ha il suo posto e la sua data.** Ritenuta d'acconto → debito F24 al 16. Ritenuta di
   garanzia → debito (o credito) allo svincolo. Ritenuta bancaria 11% → credito d'imposta. Mai «sparita»
   da un imponibile o da una rata.
3. **Per la data di pagamento valgono tre fonti, in quest'ordine:** accordo (ordine, poi scheda fornitore),
   poi fattura (XML o Fatture in Cloud), poi niente. Mai la data della fattura da sola. Se accordo e
   fattura non coincidono, **si segnala**.
4. **Un costo, una fonte.** Ordine, bolla, fattura, ditta, SAL e costo a mano si collegano, non si sommano;
   ogni lotto ha un test che lo prova.
5. **Stimato e consuntivo si distinguono**, in commessa e in cassa.
6. **Un solo previsionale.** Tesoreria, Controllo di gestione e commessa leggono la stessa fonte.
7. **Niente nasce pagato da solo**: lo dicono la banca, la prima nota o una persona; le regole automatiche
   (RiBa scaduta = pagata) solo se l'azienda le accende.

---

## 3. Il piano, per aree

### A. Fatture ricevute: leggere tutto, da ogni canale

- **A1. Fatture in Cloud**: leggere `payments_list` (rate, scadenze, stato, pagato il), metodo,
  `amount_withholding_tax`; salvare tutto sulla fattura. Se FIC ha l'XML, scaricarlo e trattarlo come
  gli altri.
- **A2. Colonne sulla fattura ricevuta**: piano di pagamento (rate, metodo, IBAN, condizioni), ritenuta
  d'acconto (tipo, aliquota, importo, causale), cassa previdenziale, bollo, trattenuta a garanzia
  (riconosciuta da riga negativa, causale o AltriDatiGestionali), split payment. Lette **all'arrivo**
  da un lettore unico per SDI, OpenAPI, ITALA, caricamento a mano.
- **A3. Lotti**: tutte le fatture del file, non solo la prima (come fa già ITALA).
- **A4. Aruba**: importi, tipo documento, XML; **OCR**: salvare scadenza, chiedere IBAN e metodo.
- **A5. Tipi documento**: TD04 e TD08 come note di credito; TD16-19 fuori dai costi e dai debiti.
- **A6. Metodo per rata**, `CondizioniPagamento` salvato, «giorni dalla data fattura» col ripiego giusto.
- **A7. IBAN diverso da quello noto** del fornitore: avviso antifrode prima di pagare.
- **A8. Email**: la fattura confermata da un allegato diventa una fattura ricevuta.

*Fatto quando:* la stessa fattura (RiBa 30/60/90 da 10.000 €, con ritenuta e trattenuta) arrivata da FIC,
SDI, OpenAPI o caricata a mano produce gli stessi tre debiti alle stesse date, lo stesso debito F24 e la
stessa garanzia da svincolare.

### B. Debiti e pagamenti ai fornitori

- **B1. Debiti appena arriva la fattura**: rate e RiBa nel previsionale come uscite probabili anche prima
  della contabilizzazione; impostazione «contabilizza da sole le fatture con fornitore e commessa certi».
- **B2. Accordo col fornitore usato davvero** (i campi ci sono già: termini, fine mese, metodo, IBAN):
  letto quando la fattura non dice niente, proposto dalle ultime fatture, confrontato con la fattura.
- **B3. Fornitore riconosciuto dalla P.IVA** su ogni fattura; doppioni uniti.
- **B4. Portafoglio RiBa**: in arrivo, avvisata, addebitata, insoluta; avviso 5 giorni prima con il
  totale della settimana; riconciliazione **per singola rata** con l'addebito in banca.
- **B5. Acconto sull'ordine d'acquisto**: il saldo resta debito finché non arriva la sua fattura.
- **B6. Note di credito dei fornitori** che stornano costo e rate della fattura corretta.

### C. Ritenute

**C1. Ritenuta d'acconto sulle fatture ricevute (professionisti, agenti).** Costo = lordo; al
professionista il netto; nasce un **debito F24 codice 1040 al 16 del mese dopo il pagamento**, collegato
al pagamento e alla commessa; registro per la CU e il 770.

**C2. Ritenuta di garanzia, tutto il ciclo.**
- *Verso il cliente*: la trattenuta della fattura emessa (clausola e SAL) scrive la riga nel registro;
  la rata della commessa non conta come incassata la quota trattenuta; allo svincolo nasce la bozza di
  fattura o l'incasso atteso, con la data; le attive hanno sempre una data di svincolo.
- *Verso il subappaltatore*: la quota trattenuta resta un **debito futuro con la sua data**; allo svincolo
  si paga dal percorso SAL; la trattenuta scritta nella fattura del sub si riconosce e si confronta col SAL.
- *Fattura d'appalto*: la percentuale del contratto è **garanzia**, non ritenuta d'acconto. Si toglie
  dall'XML la ritenuta RT02 e si scrive come trattenuta; si controlla la fattura di Demo 2.
- In Tesoreria e nel previsionale: soldi da ricevere e da dare allo svincolo.

**C3. Ritenuta bancaria 11% dei bonifici parlanti.**
- La riconciliazione banca riconosce l'accredito netto di una rata o fattura in bonus (lordo ÷ 1,22 ×
  11%, 8% prima del 01/03/2024): la rata risulta **incassata per intero**, la fattura pagata, e nasce la
  riga della ritenuta subita.
- Lo stesso da «Riconcilia con banca» della commessa e dalla spunta «Incassata» quando la commessa è in bonus.
- La ritenuta subita diventa un **credito d'imposta** visibile (Tesoreria, stato patrimoniale), da usare in
  dichiarazione o compensazione F24.
- Il riquadro bonus usa la stessa formula del registro (1,22, righe escluse, aliquota per data).

**C4. Ritenute subite sulle nostre fatture** (condominio 4%, altri sostituti) come credito.

### D. Tesoreria e previsionale: una sola verità

- **D1. Un solo previsionale**: la scheda «Previsioni» di Tesoreria, il Controllo di gestione e la
  commessa leggono il ledger completo; la funzione ridotta va in pensione.
- **D2. Fonti mancanti nel previsionale**: fatture ricevute non contabilizzate (rate XML/FIC), mutui e
  finanziamenti, contributi INPS e ritenute dei dipendenti stimati dai cedolini, Cassa Edile, tredicesima,
  SAL dei sub verificati non fatturati, ritenute di garanzia (entrate e uscite allo svincolo), F24 1040 dei
  professionisti, credito dell'11%.
- **D3. Doppioni ancora possibili**, chiusi con test: ordine + fattura non collegata; ditta in commessa +
  fattura del sub; provvigioni + costo «provvigioni» a mano; acconto a mano non collegato.
- **D4. Pagato vero**: riconciliazione banca per rata (RiBa, F24, stipendi), spunta in blocco dallo
  scadenzario, regola «RiBa scaduta = pagata salvo insoluto» se accesa.
- **D5. Tesoreria completa**: saldi, uscite e entrate con date, scaduti, RiBa, ritenute da svincolare,
  crediti d'imposta, in una pagina.

### E. F24

- **E1. Segnare un F24 pagato**: con la quietanza (PDF) o col movimento di banca; allora esce dal previsionale.
- **E2. Codici completi**: IVA trimestrale e acconto (6031-6035, 6099), INPS (DM10), addizionali,
  IRES/IRAP, codici di credito per le compensazioni.
- **E3. F24 proposto dal mese**: ritenute dei dipendenti e contributi dai cedolini, 1040 dalle parcelle
  pagate, IVA dalla liquidazione; scadenza al 16 (o giorno lavorativo dopo) proposta; da confermare
  sempre col prospetto del consulente.
- **E4. Un solo archivio** delle scadenze fiscali (`f24_entries` e `adempimenti_fiscali` uniti).
- **E5. Cassa Edile** come obbligo mensile di pagamento.
- **E6. Migrazioni**: rendere impossibile che `f24_componi` torni acceso rieseguendo da zero.

### F. Schede fornitore e subappaltatore

**F1. Scheda fornitore**: fatture ricevute con stato contabile e di pagamento (pagata, parziale,
scaduta); debiti veri da rate e RiBa (prossime, scaduto, pagato, residuo, stati RiBa); ordini, bolle e
acconti; commesse servite e costo per commessa; note di credito; **estratto conto dare/avere** con saldo
progressivo e cronologia; se è anche subappaltatore, SAL, ritenute e documenti (DURC) in un riquadro.

**F2. Scheda subappaltatore**: totali su tutti i contratti (maturato, approvato, fatturato, pagato, da
pagare, ritenute trattenute e da svincolare con le date); una sottoscheda «Fatture e pagamenti» unica;
IBAN, metodo e termini (dal fornitore collegato o propri); estratto conto.

**F3. Un'anagrafica sola per la stessa ditta**: fornitore, subappaltatore (campo e schede sicurezza) e
ditta in commessa collegati dalla P.IVA, con proposta automatica e conferma; tutte le schede sicurezza
della stessa ditta collegate, non una.

### G. Costi della commessa

- **G1. «Fatture da assegnare»**: coda con proposta di commessa (ordine, bolla, fornitore abituale,
  indirizzo del cantiere, AI) e conferma in un clic; divisione su più commesse; «spesa generale».
- **G2. Regole dell'azienda** per fornitore (sempre spese generali / sempre la commessa attiva).
- **G3. Costi senza fattura del cantiere già pronti** (oneri comunali, suolo pubblico, bolli,
  smaltimento, polizza CAR, fideiussioni, permessi, trasferte), pagabili anche con F24.
- **G4. Spese generali di struttura** ripartite, mostrate a parte.
- **G5. Manodopera dal cedolino**: chiusura del mese con ripartizione della differenza per ore; tariffe
  storicizzate; avvisi sulle ore da approvare; quota stipendi e contributi nella cassa della commessa.

### H. Controllo e chiusura

- **H1. Previsto, speso e «a finire» per lavorazione**, con allarme oltre la soglia.
- **H2. Semaforo «dati completi»** per commessa e per azienda: fatture da assegnare, ore da approvare,
  costi senza data, F24 da segnare, RiBa da chiudere, ritenute da svincolare.
- **H3. Chiusura della commessa** con verbale economico finale.
- **H4. Avvio per azienda**: data di taglio dello storico, banca, accordi dei 20 fornitori principali,
  assegnazione delle fatture recenti; percentuale di completamento.
- **H5. Silvio** con le stesse domande e gli stessi numeri.

---

## 4. In che ordine

| Lotto | Cosa | Perché |
|---|---|---|
| **0 (subito)** | C2 parte «fattura d'appalto» | Errore fiscale in un documento che va all'Agenzia |
| **1** | A1, A2, A3, A5, B1, C1 | Ogni fattura entra completa, da ogni canale, con le sue rate e la sua ritenuta |
| **2** | C3, C2 (resto), C4 | Le tre ritenute al loro posto: 11% bancaria, garanzie, condominio |
| **3** | D1, D2, D3, E1, E3, E4 | Un solo previsionale con tutte le uscite vere, F24 compresi e segnabili pagati |
| **4** | F1, F2, F3, B3 | Le schede fornitore e subappaltatore che dicono tutto |
| **5** | B2, B4, D4, D5, E2, E5 | Accordi, RiBa per rata, banca, Tesoreria completa, codici F24 completi |
| **6** | G1-G5 | Ogni costo sulla commessa giusta, manodopera consuntivata |
| **7** | H1-H5, A4, A6, A7, A8, B5, B6, E6 | Controllo, chiusura, adozione, pulizia |

Ogni lotto si chiude con migrazione applicata e riallineata, test (date giuste, niente doppioni, ritenute
al centesimo), prova su Demo 2 e su una copia dei dati di un'azienda vera in una transazione annullata, e la
pagina vista a schermo, computer e telefono.

## 5. Decisioni che servono da Florin

1. **RiBa scaduta = pagata** in automatico (salvo insoluto), o solo con la banca o una persona?
2. **Contabilizzare da sole** le fatture con fornitore e commessa certi?
3. **Differenza della busta paga**: ripartita per ore sulle commesse del mese, o tutta in struttura?
4. **Spese generali**: percentuale sul ricavo, per ore, o importo fisso al mese?
5. **Soglie degli allarmi** (proposta: lavorazione oltre il 10%, margine a fine lavori sotto il minimo dell'azienda).
6. **F24 proposto dal sistema**: va bene come bozza da confermare col prospetto del consulente (proposta), o solo a mano come oggi?
