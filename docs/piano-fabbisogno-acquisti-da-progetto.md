# Piano — dal progetto agli ordini: fabbisogno, riconciliazione, promemoria

Richiesta di un'impresa cliente, 07/11/2026: una riconciliazione continua e tracciabile fra
elaborati esecutivi, computo metrico, fabbisogno materiali e ordini di acquisto, per non
dimenticare materiali, non ordinarli due volte e non ordinarli tardi.

La stessa richiesta era già arrivata il 22/10/2026 da un cliente di lavori pubblici, e buona parte
è stata costruita allora (`20281023011000_materiali_per_fase_base_dati.sql` e seguenti). Questo
piano parte da lì: dice cosa c'è, cosa manca e in che ordine farlo.

## Stato

- **Fase 1 — fatta (07/11/2026)**, migrazione `20281222140000_materiali_quantita_decimali`
  applicata. `order_items.quantity` e `quantity_received` sono `numeric(14,4)`; la generazione
  scrive la quantità calcolata senza portarla all'intero; il tecnico può scrivere 12,4 kg (in pz e
  cad restano i pezzi interi); la richiesta d'offerta non porta più a 1 le quantità sotto l'unità.
  Il magazzino resta a pezzi interi: le prenotazioni arrotondano per eccesso, uguali in entrata e
  in uscita, e una riga collegata a un articolo di magazzino rifiuta i decimali con un messaggio
  chiaro (trigger `order_items_magazzino_pezzi_interi`). La **divisione di un materiale su più
  fasi** accetta i decimali (12,4 kg in 7,4 + 5, provato nel database con un ODA già emesso, che si
  divide nello stesso modo); un articolo di magazzino si divide a pezzi interi
  (`erroreDivisione`). La **finestra di una riga della commessa** non arrotonda più all'intero:
  prima un materiale da 12,4 kg aperto e risalvato da lì diventava 12 in silenzio
  (`quantitaDaCampo`).
  Con `20281222160000_quantita_decimali_salva_e_crea_commessa`: `commessa_salva`,
  `create_order_atomic` e `duplica_lavoro_atomic` non riconvertono più la quantità in intero
  (prima salvare o duplicare una commessa con 12,4 kg si fermava con «invalid input syntax for
  type integer»).
  Simulato il 07/11/2026 sulla Demo 2, in una transazione annullata, come amministratore: crea
  commessa con 12,4 → salva con 12,5 → duplica (12,4 copiato) → articolo di magazzino con 12,5
  rifiutato → generazione 37,5 m² e 0,3 m³ → modifica a mano conservata alla rigenerazione,
  riga vecchia «13 su 12,4» riportata a 12,4 → invio al tecnico, modifica 41,25, validazione →
  RDO con 0,3 → ODA 41,25 in bozza → inviato → arrivo 20,25 (ODA «parziale») → arrivo del resto
  («ricevuto», stato «consegnato») → ODA annullato: il materiale torna «da ordinare».
  **Resta intero** dove il magazzino conta pezzi: `conferma_carico_ddt`, `magazzino_riordina` e
  `insert_goods_receipt_atomic` (la ricezione merce a magazzino somma un intero a
  `quantity_received`). L'arrivo di un ODA registrato con `oda_registra_arrivo` invece accetta i
  decimali (provato con 20,25 m²).
  **Fatto il 07/11/2026 (migrazione `20281222170000_crea_commessa_unita_misura`):** creando una
  commessa, «12,5 m² × 34 €» resta 12,5 m² × 34 € invece di diventare «1 × 425 €». Vale nelle
  quattro strade insieme — Nuova Commessa e import del contratto (`CreateOrder`), Silvio,
  preventivo → commessa (`_shared/righeCommessaDaPreventivo.ts`, edge `converti-preventivo-cantiere`
  e `useQuotePrefill`) — e `create_order_atomic` ora scrive anche `unita_misura`, senza la quale
  12,5 varrebbe 12,5 pezzi. Il ripiego «1 × totale» resta solo per un articolo di magazzino con
  decimali (`rigaConQuantitaIntera`), perché il magazzino conta pezzi interi: diventa «1 a
  corpo» con quantità e unità vere nella descrizione. Le commesse già create non cambiano.
  Fattura, proforma, DDT e nota di credito dalla commessa scrivono l'unità della riga
  (`unitaDocumento`) invece di «pz» fisso: altrimenti 12,5 m² sarebbe uscito «12,5 pz», anche
  nella fattura elettronica (che tronca l'unità a 10 caratteri).
- **Fase 2 — fatta nel database (07/11/2026)**, migrazione `20281222150000_materiali_riconciliazione`
  applicata: `materiali_riconciliazione(commessa)`, `materiali_riconciliazione_azienda(azienda, …)`
  a pagine (solo fasi validate) e il calcolo `_materiali_riconciliazione_righe`, solo service role.
  Provata con utenti veri: l'amministratore vede quello che vede la pagina, il cliente niente, anon
  non può chiamarla. **Non fatto:** `planMaterial` non è ancora un adattatore sopra la funzione;
  le due definizioni sono tenute uguali da `src/test/logic/riconciliazioneMateriali.test.ts`, con
  cinque casi fatti girare anche nel database. Nessuna pagina la usa ancora: la useranno
  cruscotto e promemoria (fase 5).
- **Fatto il 07/11/2026, secondo giro** (migrazioni `20281222180000`–`20281222230000`, tutte provate
  in transazioni annullate sulla Demo 2 e applicate):
  - **Validazione del tecnico per azienda** (Impostazioni → Acquisti e materiali, spenta di
    base). Sempre: nessun ordine né richiesta d'offerta su una fase in verifica o rimandata dal
    tecnico (prima l'ordine passava). Accesa: solo fasi validate. La regola sta in un trigger su
    `purchase_order_items`, quindi vale per ogni strada che crea un ordine.
  - **Fase 3 — varianti**: all'approvazione di una perizia, `materiali_variazioni` propone
    prima → dopo per ogni materiale (proporzione sulla parte che viene da ogni voce: 412,35 → 450
    m² porta l'EPS da 432,97 a 472,50) e segnala le voci nuove; il tecnico applica o scarta dal
    riquadro nella scheda materiali. Le quantità non cambiano da sole.
  - **Fase 5 — date e promemoria**: «entro quando ordinare» = data in cui serve (o inizio della
    fase) − giorni di consegna del fornitore (`lead_time_days`, altrimenti quelli dell'azienda);
    pagina `/azienda/fabbisogno-materiali` (in ritardo, 7 giorni, 30 giorni…); promemoria in
    campanella ogni mattina alle 06:30 UTC, uno al giorno per azienda.
  - **Ordini parziali**: una parte adesso, il resto dopo, mai oltre il residuo (quantità
    modificabile nel pannello «Ordina ai fornitori»).
  - **Fase 4 — documenti con revisioni**: tipo, codice elaborato, revisione, stato; approvando
    una revisione, quella approvata prima con lo stesso codice diventa «superata».
  - **Computo dall'AI, controllo sui dati veri** (22 computi in 120 giorni, 12 falliti): un
    Excel con più fogli era rifiutato (4 casi) e ora si leggono tutti i fogli con le voci
    (`_shared/computoExcel.ts`); una lettura interrotta restava «in corso» per sempre e ora dopo
    30 minuti diventa fallita con un messaggio (cron `computo-letture-interrotte`). Restano: 5
    fallimenti perché l'azienda non ha una carta di pagamento (l'AI è chiusa a chi non l'ha:
    regola di prodotto), 3 «Module not found» del lettore PDF fino al 01/11 (dal 04/11 le letture
    riescono).
- **Terzo giro (piano del 07/11/2026)**, in quest'ordine:
  1. *Analisi edili pronte*: la libreria standard copre solo impianti. Si aggiungono cappotto
     (posa, rasatura, finitura), massetto, radiante, intonaco, cartongesso (parete e
     controsoffitto), impermeabilizzazione, tinteggiatura, pavimento: consumi indicativi da
     schede tecniche, che il tecnico importa e corregge prima di usarli.
  2. *Ordine annullato*: una notifica all'ufficio acquisti quando un ordine con materiali di
     commessa viene annullato, perché quei materiali tornano da ordinare.
  3. *Riepilogo PDF della commessa*: quantità con la loro unità; nel totale non si sommano unità
     diverse.
  4. *Computo dall'AI senza carta*: il messaggio dice anche che PriMus (XPWE) ed Excel si leggono
     senza AI. Regalare la prima lettura resta una scelta commerciale, non fatta.
  5. *«Serve in cantiere» modificabile* dal fabbisogno (chi fa gli acquisti o modifica le
     commesse), con una funzione che controlla il permesso.
  6. *Ordinare dal fabbisogno*: si scelgono le righe di più commesse e si creano le bozze
     d'ordine, una per commessa e fornitore, con gli stessi controlli del pannello.
  7. *Controllo del tecnico in una schermata*: le fasi in verifica di una commessa, con i
     materiali da guardare (quantità cambiate a mano, sfrido alto, voci senza scomposizione), e
     «Valida tutte».
  8. *Revisione del computo → variante*: approvando un documento di tipo computo, la finestra
     propone di aprire la perizia di variante.
  Ogni punto si prova nel database (transazioni annullate) e con i test prima del successivo.

  **Stato al 07/11/2026 sera — fatti tutti e otto, non ancora su main:**
  1. 11 analisi edili in `lib/distinta/scomposizioniStandard.ts` (ambito «edile»), importate
     inattive: il tecnico le attiva dopo averle controllate.
  2. Trigger `purchase_order_annullato_avvisa` (20281222250000): avvisa chi ha
     `can_manage_purchasing`, tranne chi annulla; un ODA senza righe di commessa non avvisa.
  3. PDF della commessa: `quantitaConUnita` / `totaleQuantita` in `lib/orders/unitaDocumento.ts`;
     con unità diverse il totale è «—».
  4. `_shared/computoErroreLettura.ts`: carta mancante o crediti dell'azienda finiti →
     motivo + «PriMus ed Excel si leggono senza AI»; credito della piattaforma (OpenRouter 402)
     → niente JSON del provider, «riprova più tardi».
  5. `materiali_data_fabbisogno_imposta(uuid[], date)` (20281222260000): solo materiali, solo
     commesse visibili, `can_manage_purchasing` o `can_edit_orders`; un id sbagliato ferma tutto.
  6. `lib/acquisti/ordinaDalFabbisogno.ts`: una bozza per commessa e fornitore, residuo riletto
     al momento, una bozza ferma non ferma le altre. Ordina solo `can_manage_purchasing`.
  7. `RevisioneTecnico` sopra i materiali: righe con quantità cambiata a mano (oltre l'1% dal
     calcolo), aggiunte a mano (origine «manuale»), senza quantità; «Valida tutte» solo per le
     fasi senza righe a quantità zero. **Lo sfrido alto e le voci senza scomposizione non ci
     sono**: la riga non conserva lo sfrido né la voce non scomposta. Le 1.347 righe senza
     origine (dal preventivo) non si segnalano.
  8. Approvando una nuova revisione di computo o tavola, la finestra resta aperta: «Apri una
     variante» (Economia → Varianti) o «Vedi i materiali». Le quantità della commessa non si
     aggiornano da sole se non con una variante del computo (`computo_approva_variante`, solo
     nella contabilità dei lavori pubblici).

## Il miglioramento che conta

**Chiudere il giro «revisione approvata → materiali → ordini».** Oggi la distinta si genera dal
computo una volta, e da quel momento vive per conto suo:

- approvare una variante del computo (`computo_approva_variante`) **non tocca i materiali**: se il
  progetto passa da 400 a 440 m² di cappotto, la distinta resta a 400 e nessuno lo vede;
- annullare o ridurre un ODA non avvisa nessuno: il materiale torna «da ordinare» solo nel
  calcolo della pagina, se qualcuno la apre;
- il confronto previsto/ordinato/residuo/eccedenza si calcola solo nel browser
  (`lib/orders/materialProcurement.ts:planMaterial`), quindi né un cruscotto né un promemoria
  possono leggerlo.

È esattamente il caso che la richiesta vuole evitare: le omissioni nascono quando il progetto
cambia dopo che gli ordini sono partiti. Tutto il resto (documenti con revisioni, date, cruscotto)
serve, ma senza questo giro il sistema dà numeri giusti solo il primo giorno.

## Cosa c'è già

| Punto della richiesta | Stato | Dove |
|---|---|---|
| 1. Documenti di commessa con revisioni | Solo cartelle, nessuna revisione | `order_attachments`, `order_document_folders`; versioni solo per `planimetrie` / `planimetrie_versioni` |
| 2. Dal computo ai materiali | Fatto | import PriMus, `scomposizioni_voce` + `_componenti` (quantità per unità, sfrido), `lib/distinta/generaDistinta.ts`, `materiali_salva_generazione` |
| 3. Validazione tecnica e ordini | Fatto | `materiali_fasi_validazione` (bozza → da_validare → validata), permessi `can_validate_bom` / `can_manage_purchasing`; RDO, ODA per più fornitori, ordini parziali sul residuo |
| 4. Riconciliazione | Solo nel browser, non segue varianti e annullamenti | `planMaterial`, `OrderMaterialsSummary.tsx` |
| 5. Cruscotto e promemoria | Quadro acquisti sì, date e promemoria no | `lib/acquisti/pipelineAcquisti.ts`, `acquisti_materiali_da_ordinare` |

Uso reale al 07/11/2026: una scomposizione in tutta la piattaforma, nessuna validazione. La
funzione c'è, ma nessuno l'ha ancora portata fino in fondo su una commessa vera.

## Difetti da correggere prima

- **Quantità intere sui materiali.** `order_items.quantity` è `integer`: il generatore arrotonda
  per eccesso (12,4 kg → 13, 0,3 m³ → 1) e tiene il decimale in `quantita_calcolata`. Gli ODA
  invece sono decimali (`purchase_order_items.quantity` è `numeric`). Ordinando 12,4 kg il
  materiale resta «da ordinare» per 0,6 kg; ordinandone 13 risulta pieno, ma l'eccedenza vera non
  si vede. Su unità grandi (t, m³) l'errore pesa.
- **Data di fabbisogno assente sui materiali.** Esiste solo sulla RDO (`data_fabbisogno`), quindi
  il quadro acquisti non sa cosa è urgente finché non c'è già un'offerta.

## Fasi

### Fase 1 — Quantità decimali (piccola, prerequisito)

- `order_items.quantity` e `quantity_received` → `numeric(14,4)`. La tabella è grande e usata
  ovunque: migrazione con `SET LOCAL lock_timeout = '3s'`; se fallisce si riprova in un momento
  tranquillo. Prima va contato chi legge `quantity` come intero (RPC con `returns table (...
  quantity integer ...)`, tipi generati, form).
- Il generatore smette di arrotondare per eccesso le unità divisibili; resta l'arrotondamento
  alle confezioni solo dove il componente ha una confezione (sacco, rotolo, pallet), da aggiungere
  come campo facoltativo di `scomposizioni_voce_componenti`.
- Test: quelli di `distinta*.test.ts`, più un caso 12,4 kg ordinati per intero → residuo 0.

### Fase 2 — Riconciliazione nel database (il cuore)

- Una funzione `materiali_riconciliazione(p_order_id)` che restituisce, per materiale: previsto
  validato, in bozza ODA, ordinato, ricevuto, residuo, eccedenza, stato, data di fabbisogno, fase.
  Stessa definizione di `planMaterial` (che diventa un adattatore sopra la funzione, per non avere
  due verità). Ordini annullati esclusi.
- Una funzione per azienda, a pagine, per cruscotto e promemoria (mai il caricamento di tutte le
  commesse dal browser: vedi la saturazione del database).

### Fase 3 — Varianti e annullamenti

- All'approvazione di una variante: si rigenera la distinta delle voci toccate **in prova**, si
  salva la differenza in una tabella `materiali_variazioni` (materiale, prima, dopo, motivo:
  variante n., voce) e la fase interessata torna «da validare» solo per quelle righe.
- Il tecnico vede le differenze («+40 m² rete», «−12 sacchi collante: 12 già ordinati, eccedenza»)
  e le conferma o le corregge. Le righe già ordinate non si cancellano mai: si segna l'eccedenza.
- Annullamento o riduzione di un ODA: evento nel registro della commessa e avviso agli acquisti se
  il materiale torna scoperto.

### Fase 4 — Documenti di commessa con revisioni

- Su ogni documento: tipo (tavola, computo, specifica tecnica, relazione, altro), codice
  elaborato, revisione (A, B, C… o 00, 01…), stato (in lavorazione, approvato, superato),
  approvato da / il, documento che sostituisce.
- Caricare una nuova revisione dello stesso codice segna «superata» la precedente, che resta
  consultabile. In elenco si vede solo l'ultima approvata, con lo storico a un clic.
- Collegamento facoltativo fra il computo importato e il documento da cui viene (revisione del
  computo = revisione del documento): così nella riconciliazione si legge «calcolato sul computo
  rev. C».
- Riusa lo schema di `planimetrie_versioni` (versioni immutabili), non lo duplica.

### Fase 5 — Date di fabbisogno, cruscotto, promemoria

- Data entro cui ordinare = inizio della fase (`order_work_phases.start_date`) meno i giorni di
  consegna del fornitore (campo nuovo su `suppliers`, facoltativo; in mancanza un valore
  dell'azienda). Modificabile a mano sulla riga.
- Cruscotto acquisti: in ritardo, entro 7 giorni, entro 30, poi il resto; filtri per commessa,
  fase, fornitore. Dalla riga si apre la RDO o l'ODA già precompilati.
- Promemoria quotidiano all'ufficio acquisti (campanella + email riepilogativa, non un avviso per
  materiale). Cron con `timeout_milliseconds := 15000` e funzione rapida, come da regole in
  `CLAUDE.md`; idempotenza nel database.

### Fase 6 — Prova su una commessa vera

Una commessa sola, con il computo vero del cliente e le sue analisi, prima di rifinire le fasi 4 e
5. Le scomposizioni le può proporre l'AI (origine `ai` esiste già), ma le valida il tecnico
dell'impresa: è sapere loro, non nostro.

## Da chiedere al cliente prima di iniziare

- Con cosa fanno il computo (PriMus, altro, Excel) e se ce ne mandano uno vero.
- Se hanno già analisi o distinte di composizione, anche in Excel.
- Chi valida la distinta e chi fa gli acquisti (persone e ruoli in piattaforma).
- Se le tavole arrivano da un progettista esterno con codici e revisioni propri.
- Se ordinano per fase o per commessa intera, e i tempi di consegna dei fornitori principali.

## Ordine consigliato

1 → 2 → 3 (il giro chiuso), poi 6 sulla commessa vera, poi 4 e 5 tarate su come lavorano.
Le fasi 4 e 5 sono quelle che il cliente vede di più, ma senza 2 e 3 mostrerebbero numeri che
smettono di essere veri alla prima variante.
