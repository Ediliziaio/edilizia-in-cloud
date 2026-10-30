# Commesse generali — piano di sviluppo

> Piano di prodotto: cosa, come si usa e in che ordine. Ogni tappa, prima di essere costruita, avrà il suo piano tecnico a task (come `2026-10-06-commessa-fasi-economia-cronoprogramma.md`).
> Versione 3 (30/10/2026): modello standard a moduli + progettazione UX.

## 1. Il problema

La commessa (`orders`) oggi è piatta: SAL (`sal`, `sal_records`), fatture emesse (`invoices.order_id`), fatture ricevute, rate (`order_installments`), marginalità (`v_ordine_marginalita`, `ordine_margine_valuta`), POS e documenti vivono tutti sulla singola commessa. Restano fuori tre modi di lavorare molto diffusi:

| Chi | Come lavora | Cosa vuole vedere |
|---|---|---|
| **Impresa a contratto** (es. Pistilli) | Un appalto da 3 M€ con un committente; dentro, tanti lavori (ordini di lavoro) ognuno col suo cantiere | Il contratto che **scala**: assegnato, eseguito, a SAL, fatturato, incassato, residuo; margine a finire |
| **Costruttore / sviluppatore** | Compra un terreno, fa un business plan, costruisce un complesso, vende le unità a acquirenti diversi, spesso con investitori | **Previsto → reale → a finire**, capitale impegnato, margine per unità, quanto spetta a ogni investitore |
| **Compra-ristruttura-vendi** | Compra uno o pochi immobili, li ristruttura, magari li divide, li rivende | Le stesse cose del costruttore, in piccolo e più veloce |

## 2. L'idea: un oggetto standard, non tre funzioni su misura

Non costruiamo «la funzione per Pistilli» né «la funzione per i costruttori». Costruiamo **un oggetto solo, la commessa generale**, con **moduli** che si accendono. I tre casi sono **modelli già pronti**, cioè combinazioni di moduli con le parole giuste. Un caso nuovo, come un contratto quadro di manutenzione o un consorzio, si copre accendendo i moduli che servono, senza scrivere codice.

### 2.1 Il nucleo (sempre presente)

- Una commessa può avere sopra **una** commessa generale (`orders.parent_order_id`). **Due livelli al massimo**, con un vincolo nel DB.
- **Le figlie restano commesse normali:** fasi, rapportini, POS, magazzino, OdA, costi, marginalità e app di campo restano come sono.
- **Ereditarietà:** cliente, committente, DL/CSE, indirizzo e dati fiscali si scrivono sulla generale e le figlie li mostrano. Si modificano in un posto solo, ma una figlia può avere un indirizzo diverso.
- **Ogni euro una volta sola:** un costo o un ricavo sta o su una figlia o sulla generale. Totali, quote ripartite e indicatori si calcolano in lettura con **una RPC per generale**, che dà tutti i numeri in una chiamata.
- **Niente doppi conteggi:** cruscotto, dashboard e liste contano le figlie più i movimenti propri della generale, mai il valore della generale in aggiunta.
- **Fotografie mensili:** uno scatto dei numeri principali ogni fine mese, per vedere come cambia la stima nel tempo (modello: `cashflow_forecast_snapshots`).
- **Interruttore per azienda** `commesse_generali`, spento di base: chi non lo usa non vede nulla di diverso.

### 2.2 I moduli

| Modulo | Cosa aggiunge | Usato da |
|---|---|---|
| **Contratto** | Valore (base, ribasso, oneri sicurezza), atti aggiuntivi, date e penali, anticipazione, ritenute, garanzie date (cauzione, CAR) con scadenze, CIG/CUP, split payment/reverse charge | Appalto |
| **SAL di contratto** | SAL emesso sulla generale, numerazione del contratto, voci che vengono dalle figlie, ritenute e recupero anticipazione, firma via token esistente | Appalto |
| **Elenco prezzi e misure** | Prezzi del contratto con ribasso; figlie prezzate dall'elenco; quantità eseguite → SAL | Appalto (opzionale) |
| **Piano economico** | Ricavi e costi previsti per voce, con mese; versioni (approvato bloccato, revisioni); previsto · reale · a finire · scostamento; flusso di cassa; indicatori | Tutti: per l'appalto è il budget, per lo sviluppo il business plan |
| **Costi comuni** | Costi registrati sulla generale, ripartiti in lettura sulle figlie con un criterio a scelta: importo, m², millesimi, manuale | Tutti |
| **Unità e vendite** | Unità con m²/millesimi, listino → trattato → rogito, stato di vendita, acquirente, caparre e acconti, permuta, dividere un'unità, varianti dell'acquirente | Sviluppo, compravendita |
| **Fonti e investitori** | Mezzi propri, investitori (capitale o prestito), mutuo (erogazioni a SAL, frazionamento); versamenti, rimborsi, quote; rendiconto PDF | Sviluppo, compravendita |
| **Documenti richiesti** | Checklist per modello sull'archivio esistente, con scadenze e avvisi (es. fideiussione 122/2005 mancante) | Tutti |

### 2.3 I modelli pronti

| Modello | Moduli accesi | Le figlie si chiamano | Il «valore» in alto è |
|---|---|---|---|
| **Appalto / contratto** | Contratto, SAL di contratto, Piano economico, Costi comuni, Documenti (+ Elenco prezzi, a scelta) | Ordini di lavoro | Valore contrattuale aggiornato |
| **Sviluppo immobiliare** | Unità e vendite, Piano economico, Costi comuni, Fonti e investitori, Documenti | Unità | Ricavi previsti dal piano |
| **Compra, ristruttura, vendi** | Come sviluppo, con checklist e voci del piano più snelle | Unità | Ricavi previsti dal piano |
| **Personalizzato** | Scelti a mano | Nome scelto (Lotti, Interventi…) | Scelto |

I moduli si possono accendere o spegnere anche dopo. Spegnere un modulo nasconde i dati senza cancellarli.

### 2.4 Lo schema dati in una frase per tabella (indicativo)

- `orders.parent_order_id`: il legame con la generale.
- `commesse_generali`: una riga per generale con modello, moduli accesi, nome delle figlie e criterio di ripartizione.
- `contratti_generale`, `contratto_atti_aggiuntivi`, `contratto_garanzie`.
- `contratto_elenco_prezzi`, `contratto_misure`.
- `piano_versioni`, `piano_voci`: voce, categoria, importo, mese, figlia facoltativa. Le categorie si agganciano alle categorie di costo che già esistono, così il reale si classifica da solo.
- `unita_immobiliari` (1:1 con la figlia), `unita_movimenti` (caparre, acconti, rogito, permuta).
- `fonti_finanziamento`, `fonti_movimenti`, `rendiconti_inviati`.
- `generale_fotografie`.

Tutte con `company_id`, RLS per azienda, permessi per riga con `has_permission_for_company` e inserite nel catalogo backup.

---

## 3. Esperienza d'uso (UX)

### 3.1 Principi

1. **Un posto per ogni cosa.** La generale è la regia; le figlie restano il posto dei lavori. Un dato ereditato si vede nella figlia ma si modifica solo nella generale, con un link «Modifica nel contratto».
2. **Ogni numero dice da dove viene.** Toccando un totale si apre l'elenco delle righe che lo compongono: fatture, SAL, figlie. Niente numeri magici.
3. **Le stesse tre colonne ovunque:** *Previsto · Reale · A finire*, con gli stessi colori e la stessa posizione in panoramica, piano, unità e figlie.
4. **Mostra solo ciò che è acceso.** I moduli spenti non lasciano schede vuote; un modulo acceso ma senza dati mostra **il prossimo passo**, non uno zero («Inserisci il valore del contratto per vedere il residuo»).
5. **Le parole del mestiere, una per concetto:** «Ordini di lavoro» o «Unità» secondo il modello, «Da assegnare», «Da incassare», «A finire». Mai «parent», «child», «sub-commessa».
6. **Si parte in un minuto:** creare una generale chiede quattro campi; il resto si completa dopo, guidati da una lista «Per partire».
7. **Si incolla da Excel.** Elenco prezzi, piano economico e unità accettano un incolla di righe da Excel, con anteprima e controllo prima di salvare: è da lì che arrivano oggi questi dati.
8. **Coerente con l'app:** stesse schede e viste della pagina commessa (`ORDER_DETAIL_TABS`, viste per sezione), `CampoIndirizzo` per l'indirizzo, campi a 14px, regole del telefono.

### 3.2 I flussi principali

| # | Flusso | Come funziona |
|---|---|---|
| F1 | **Creare una generale** | «Nuova commessa» → scelta *Commessa singola / Commessa generale* (solo con interruttore acceso) → tre schede di modello → una schermata con nome, cliente o società, indirizzo e valore (facoltativo) → si arriva sulla generale con la lista «Per partire» (3-5 passi del modello) |
| F2 | **Aggiungere figlie** | Un bottone «Aggiungi» con tre strade: *Nuova* (eredita i dati, chiede solo nome e importo); *Da commesse esistenti* (elenco filtrato sullo stesso cliente, scelta multipla, avviso se il cliente è diverso); *In serie* (per le unità: tabella A1…A6 da compilare o incollare) |
| F3 | **Spostare o scollegare** | Dal menu della figlia: «Sposta in un altro contratto» o «Rendi indipendente», con un riepilogo di cosa cambia nei totali prima di confermare |
| F4 | **Emettere un SAL di contratto** | Tre passi: periodo → avanzamenti o misure per ogni figlia, già precompilati da rapportini e misure → riepilogo con lordo, ritenute, recupero anticipazione e netto → PDF e firma |
| F5 | **Vendere un'unità** | Dal tabellone delle unità: tocco l'unità → cambio stato (prenotata → compromesso → rogito) → l'app chiede solo ciò che serve a quello stato (acquirente, prezzo, caparra) |
| F6 | **Fare e rivedere il piano** | Tabella tipo foglio di calcolo, modificabile nelle celle, con incolla da Excel → «Approva» blocca la versione → «Nuova revisione» la copia; il confronto con l'approvato è sempre visibile |
| F7 | **Rendere conto a un investitore** | «Rendiconto» → anteprima del PDF con i suoi numeri → invia per email; lo storico resta nella scheda dell'investitore |
| F8 | **Raggruppare quello che c'è già** | Procedura guidata dalla lista commesse: seleziono più commesse dello stesso cliente → «Raggruppa in una commessa generale» → controllo di cliente e importi → fatto |

### 3.3 Le schermate

**Lista commesse**
- Le generali sono righe con freccia: aprendole compaiono le figlie rientrate. Ogni figlia si trova lo stesso con la ricerca.
- Filtri «Solo generali» e «Senza generale». Sulle generali la colonna importo mostra il valore della generale; le figlie aperte mostrano il loro.

**Pagina della generale**, con le stesse schede della commessa più quelle dei moduli accesi:

| Scheda | Contenuto |
|---|---|
| **Panoramica** | La **barra che scala** (appalto: assegnato · eseguito · a SAL · fatturato · incassato sul valore aggiornato; sviluppo: unità libere · prenotate · compromesso · rogitate e incassato sui ricavi previsti); i quattro numeri chiave (*Valore · Margine a finire · Da incassare · Capitale impegnato* o *Residuo*); «Cosa richiede attenzione» (garanzia in scadenza, figlia oltre il costo previsto, SAL non firmato, documento mancante); la lista «Per partire» finché serve |
| **Ordini di lavoro / Unità** | Tabella delle figlie con importo, avanzamento, previsto/reale/a finire, margine, stato e ritardo; per le unità c'è anche il **tabellone disponibilità** a caselle colorate per stato, raggruppato per piano o edificio |
| **Economia** | Piano economico (previsto · reale · a finire · scostamento per voce), costi comuni e loro ripartizione, flusso di cassa mese per mese con il picco del capitale impegnato, andamento dalle fotografie mensili |
| **Contratto e SAL** (modulo) | Dati del contratto, atti aggiuntivi, garanzie, SAL emessi, fatture, incassi, ritenute |
| **Investitori** (modulo) | Fonti, versamenti e rimborsi, quote, rendiconti inviati |
| **Documenti** | Checklist del modello con stato (presente, mancante, in scadenza) sull'archivio esistente |

**Pagina della figlia:** in alto il percorso «Contratto Via Roma › ODL 12» e una striscia con la sua quota (*importo di 2.970.000 € · 8%*), il resto invariato.

### 3.4 Telefono, tablet, computer

- **Telefono:** generale in sola lettura, con la barra che scala, i quattro numeri, «Cosa richiede attenzione» e l'elenco delle figlie da toccare. Niente piano, SAL, investitori o importazioni. Le figlie si usano come oggi, anche dall'app di campo. Su un'unità si può cambiare lo stato di vendita, perché è il caso del commerciale in visita.
- **Tablet e computer:** tutto. Il piano economico e il tabellone delle unità sono progettati prima di tutto per lo schermo largo.

### 3.5 Velocità

La panoramica di una generale con 50 figlie si apre in meno di un secondo: una sola RPC per i numeri, figlie a pagine, piano caricato solo quando si apre la scheda.

### 3.6 Come verifichiamo che la UX funziona

- **Prima del codice, un prototipo cliccabile** di F1, F2, F4, F5 e della Panoramica, da provare con Pistilli e con un costruttore.
- **Obiettivi misurabili:**
  - creare un contratto con 5 ordini di lavoro in meno di 5 minuti;
  - dire «quanto resta da incassare» in meno di 5 secondi dalla panoramica;
  - emettere un SAL di contratto in meno di 3 minuti;
  - un utente che non ha mai visto la funzione capisce da solo cosa sono le figlie.
- **Controllo a 375 px** di ogni schermata del telefono e **prova sui dati reali in sola lettura** prima di ogni rilascio.

---

## 4. Tappe

| # | Tappa | Cosa ottiene l'utente | Chi ne beneficia |
|---|---|---|---|
| **P** | Prototipo UX | Prototipo cliccabile delle schermate e dei flussi chiave, provato con due aziende | Decide forma e parole prima di scrivere codice |
| **0** | Nucleo | Generale e figlie, modelli e moduli, ereditarietà, lista raggruppata, Panoramica con figlie, raggruppare l'esistente (F8), cruscotti senza doppi conteggi, permessi, backup | Tutti |
| **1** | Contratto e SAL di contratto | Barra che scala, atti aggiuntivi, garanzie, CIG/CUP, SAL sulla generale, fatturato/incassato, costi comuni | Pistilli e imprese a contratto |
| **2** | Piano economico | Versioni, previsto/reale/a finire, categorie agganciate ai costi, flusso di cassa, indicatori, fotografie mensili, scenari | Tutti (budget dell'appalto e business plan) |
| **3** | Unità e vendite | Unità, tabellone, stati di vendita, caparre, permuta, dividere un'unità, varianti dell'acquirente, margine per unità | Costruttori e compravendite |
| **4** | Elenco prezzi e misure | Figlie prezzate dall'elenco, misure → SAL, subappalti sul contratto | Appalti con elenco prezzi |
| **5** | Fonti e investitori | Mezzi propri, investitori, mutuo, quote, rendiconto PDF | Costruttori e compravendite |
| **6** | Documenti richiesti | Checklist per modello, scadenze, avvisi | Tutti |
| **7** | Estensioni | Portafoglio contratti nel cruscotto, cassa aziendale, Silvio e connettore AI, export Excel, affitti, post-vendita, vita del contratto (sospensioni, riserve, revisione prezzi, collaudo) | — |

Ogni tappa si può rilasciare da sola e lascia l'app coerente: chi ha solo la tappa 0 ha già generali e figlie usabili.

### Criteri di collaudo comuni a ogni tappa

- Per le aziende con l'interruttore spento non cambia nulla: stessi numeri nei cruscotti, confrontati prima e dopo.
- La somma delle figlie più i movimenti propri è uguale al totale della generale, con un test su dati reali in sola lettura.
- Nessun euro compare in due totali dello stesso cruscotto.
- Permessi provati con tre ruoli: titolare, capocantiere di una figlia, commercialista.
- Le tabelle nuove sono nel backup: `admin_backup_tabelle_scoperte()` resta vuota.
- Le schermate del telefono sono controllate a 375 px.

---

## 5. Scelte prese (cambiabili)

- Il SAL al committente si emette sulla generale; il SAL sulla figlia resta possibile.
- Ripartizione dei costi comuni per millesimi, altrimenti per m², altrimenti per importo; calcolata in lettura.
- Importi al netto dell'IVA; l'IVA non detraibile è un costo.
- Piano approvato bloccato; ogni modifica è una revisione.
- Niente terzo livello: i «lotti» sono un'etichetta sulle figlie.
- La funzione sta in un piano tariffario superiore o in un modulo a parte: da decidere col listino.

## 6. Da sentire prima di costruire

- **Pistilli:** SAL sul contratto o per lavoro? Lavorano con un elenco prezzi? Committente pubblico o privato? Ritenute e anticipazione?
- **Un costruttore e chi fa compravendite:** come fanno oggi il business plan (ci serve il loro Excel), come rendicontano agli investitori, se l'operazione sta in una società veicolo.
- **Commercialista:** IVA e imposte sulle vendite di immobili, e la permuta.
- **Dati reali:** quante commesse di Pistilli andrebbero raggruppate, e se i loro importi corrispondono a un contratto.

---

## 7. Stato (30/10/2026)

**Tappa 0 scritta** nel ramo `commesse-generali` (non ancora pubblicata):
- Migrazione `20281030270000_commesse_generali.sql`: `workflow_kind = 'generale'` (importo zero), `orders.commessa_generale_id`, tabelle `commesse_generali` e `company_commesse_generali_settings`, RPC `commessa_generale_crea / aggiorna / collega / scollega / riepilogo` e `commesse_generali_impostazioni_salva`. La generale non riceve il flusso di attività né le automazioni «commessa creata» verso il cliente. **Applicata il 30/10** e provata con una prova annullata.
- Impostazioni → Commesse generali: un interruttore per tipo (appalto, sviluppo, compravendita). Spento = la scelta non compare.
- «Nuova commessa»: se c'è almeno un tipo acceso, la scelta del tipo offre «Commessa generale · …» → una schermata con nome, committente/società e valore.
- Pagina della generale: scala del valore, quattro numeri, «Cosa richiede attenzione», tabella delle figlie con totali; azioni Nuovo ordine di lavoro/Nuova unità, Collega commesse, Modifica, Togli da questa generale. Da telefono solo lettura.
- Commessa figlia: «Parte di …» in cima; la creazione da una generale ci entra da sola, col cliente già scelto.
- Lista commesse: «Generale · N» e importo «—» sulle generali, «in C-…» sulle figlie.

- Contatori: la lista commesse non conta le generali; il cruscotto aziendale le toglie dal portafoglio con `20281030271000_cruscotto_senza_generali.sql` (**da applicare**).

**Da fare nella tappa 0:** prova dal vivo con un utente vero.
