# Commessa semplice — piano (18/10/2026)

Richiesta del titolare: rivedere la commessa scheda per scheda (Panoramica, Cantiere,
Materiali e acquisti, Economia e pagamenti) perché sia **semplice, intuitiva e veloce**.
Meno bottoni, niente doppioni, ogni numero in un posto solo e calcolato in un modo solo.

Analisi fatta leggendo il codice di `src/pages/azienda/OrderDetail.tsx` e dei componenti che
monta. I riferimenti `OD:n` sono righe di `OrderDetail.tsx` al 18/10.

## Regole che valgono ovunque

0. **Si capisce a colpo d'occhio** (richiesta del titolare): chi apre la pagina per la prima volta
   capisce cosa guardare e cosa fare senza spiegazioni. Dati puliti (niente «—» sparsi, niente
   codici tecnici, niente numeri senza unità), azioni con un verbo chiaro («Approva», «Inserisci
   ore», «Sposta»), al massimo un'azione principale per riquadro. Se serve un paragrafo per
   spiegare un riquadro, il riquadro è sbagliato.
1. **Un numero, un posto, un calcolo.** Incassato, margine, ore, costo materiali: una sola
   funzione li calcola e un solo riquadro li mostra; gli altri rimandano lì.
2. **In alto la risposta, sotto il dettaglio.** Ogni scheda apre con 3–5 numeri o con «cosa c'è
   da fare»; i dettagli stanno chiusi.
3. **Un'azione, un bottone.** Niente tre modi di creare un ordine d'acquisto o due finestre Note.
4. **Si carica quello che si guarda.** Oggi aprire una commessa lancia ~35 letture: i riquadri
   chiusi e le schede non aperte non devono leggere.
5. **Testi corti.** Una riga di spiegazione al massimo; il resto in un «?».

---

## 1. Intestazione e Panoramica

**Oggi:** 13 comandi prima del primo contenuto (intestazione + azioni rapide), il riquadro blu dei
numeri, il riepilogo, poi 4 avvisi di 4 colori diversi, cliente, comunicazioni, lavoro previsto,
attività d'ufficio, note, documenti.

**Non va (da correggere subito)**
- «Registra incasso» e «pagamenti» di CantiereDaOrganizzare portano alla scheda Economia anche
  dove è nascosta (interventi) — OD:1336, OD:1229.
- Ritardo e cambio di stato sono dentro il riquadro chiuso «Stato generale» (OD:1420): chi apre la
  commessa non vede che è in ritardo.
- «Prossima attività» d'ufficio porta alla Panoramica stessa (OD:1403).
- «Totale» e «Imponibile» aprono Pagamenti invece del conto economico (OrderFinancialOverview.tsx:73).
- Le letture per la finestra Documenti partono sempre (OD:544-562).

**Di troppo / doppioni**
- Note e Documenti: riquadro in pagina **e** finestra dalle azioni rapide → resta solo il riquadro.
- Diario: voce di menu verso `/diario` e link verso Cantiere › Diario → resta Cantiere › Diario.
- Contatto cliente in 3 posti (azioni rapide, menu, Comunicazioni) → un solo «Contatta ▾».
- Totale contratto e Imponibile come due riquadri dello stesso numero → uno, con IVA scritta piccola.
- Riga «Ordine diretto», riquadro Ufficio vuoto su ogni commessa, testi lunghi (OrderStatusWorkflow,
  ContractOfficeTasks, ContractCosts, ContractInterventions).

**Proposta**
- Intestazione: codice, cliente, **indirizzo del cantiere**, telefono, stato (cliccabile per
  cambiarlo), responsabile e capocantiere. Due bottoni: «Registra incasso» (solo se c'è Economia)
  e «Azioni ▾» (tutto il resto: nuova attività, appuntamento, contatta, fattura, PDF, duplica,
  elimina, Silvio).
- Panoramica in quattro blocchi:
  1. **Da fare adesso** — UN riquadro che sostituisce i 4 avvisi: ritardi, rate scadute, rapportini/
     bolle/timbrature da approvare, assistenze aperte, merce da ordinare, attività d'ufficio. Ogni
     riga porta dove si risolve.
  2. **A che punto siamo** — avanzamento lavori, date (fine in rosso se superata), fase in corso,
     ultimo aggiornamento dal cantiere (rapportino/foto: chi e quando).
  3. **Soldi in sintesi** — venduto, incassato, da incassare, margine (gli stessi numeri e lo
     stesso calcolo di Economia; vedi §4).
  4. **Cliente, note e documenti** — compatti.

## 2. Cantiere

**Oggi:** 5 viste — Lavorazioni, Cronoprogramma, Risorse e statistiche, Diario, Consegna e assistenza.

**Risorse e statistiche → «Ore e persone»** (richiesta del titolare)
Il registro c'è già e funziona — `DailyHoursPanel` + `ufficio_leggi_ore` / `ufficio_registra_ore`
/ `ufficio_annulla_ore` — ma è montato nel Diario e in Economia, non qui. La vista attuale mostra
solo totali e costi (`OrderResourceStatistics.tsx`) e non permette di inserire nulla.

Nuova vista:
1. Periodo «Tutta la commessa» (predefinito) o un mese; un solo bottone «+ Inserisci ore».
2. Tre numeri: ore confermate, ore in attesa, persone che hanno lavorato (costo solo a chi può
   vedere i costi).
3. **Tabella per persona**: nome, giorni lavorati, ore totali, di cui da rapportino / dall'ufficio /
   in attesa, ultimo giorno; in fase 2 anche **ore timbrate** con avviso se non tornano.
   Clic sulla riga → i giorni uno per uno, con fonte e stato; «Annulla» sulle righe dell'ufficio.
4. «+ ore» sulla riga con la persona già scelta; nel modulo prima le persone assegnate alla
   commessa, poi le altre; **più giorni o più persone in una volta** (una chiamata per giorno).
5. In fondo una riga: squadre, ditte, capocantiere → «Gestisci in Lavorazioni».

**Non va (da correggere)**
- `OrdineRapportiniCampo` «Ore registrate» somma anche i rapportini rifiutati e ignora le presenze
  (righe 126-133, 311).
- In `WorkAssignmentRow.tsx:150` si può riscrivere a mano il totale ore di una persona: il totale
  smette di tornare col registro giornaliero e non resta il giorno. Le correzioni passano dal registro.
- «Apri rapportini» nel registro è un link che ricarica la pagina e, nel Diario, punta a sé stesso.
- Il registro parte dal mese corrente: su una commessa vecchia sembra vuoto.
- L'ancora `section-squadra` porta a Lavorazioni, il vecchio link `manodopera` a Cantiere.

**Doppioni da togliere**
- `DailyHoursPanel` in Diario e in Economia → solo in «Ore e persone»; il Diario tiene
  approvazioni, rapportini e foto.
- Costi manodopera/subappalti in Risorse **e** in Economia → solo Economia.
- Mezzi in Lavorazioni e in Risorse → solo Lavorazioni.

**Diario** (già sistemato il 18/10): in testa «Da approvare dal cantiere» (rapportini, bolle,
timbrature dimenticate), poi rapportini, foto, WhatsApp chiuso.

## 3. Materiali e acquisti

**Oggi:** Articoli e misure · Ordini d'acquisto · Magazzino; il 18/10 aggiunte in locale
**Bolle e DDT** e **Fatture fornitori** (`OrderDocumentiFornitore.tsx`).

Il flusso reale è: articolo → ordine al fornitore → bolla → fattura → costo. Oggi è spezzato in
cinque posti e lo stato di ogni riga lo sceglie una persona a mano.

**Non va (da correggere)**
- Ogni riga ha **due stati** che possono contraddirsi: quello scelto a mano (7 valori) e quello
  ricavato dagli ordini. E tre conteggi diversi («da ordinare» nel riepilogo, nelle etichette, in
  OrderMaterialsSummary).
- `useDDTCountsByPO` legge le ricezioni di **tutta l'azienda** a ogni apertura e oltre 1000 righe
  conta male; il badge DDT non conta quelli «verificati» (un ordine controllato mostra «0/1»).
- `costoMaterialiGross` (OD:1236) è senza IVA ma confrontato con incassi IVA inclusa.

**Doppioni / di troppo**
- Tre bottoni per creare un ordine d'acquisto nella stessa vista → uno, «Ordina ▾».
- `LegacyWorkReview` compare in tutte le viste → solo in Articoli e solo se ci sono righe da riclassificare.
- `PosaInLavorazioniBanner` (manodopera) negli acquisti → in Cantiere.

**Proposta**
- **Stato per riga calcolato, non scelto**: da ordinare → ordinato → arrivato → fatturato, con
  quantità (es. «arrivati 8 di 10»). Una colonna sola.
- Ordini d'acquisto: una riga per ordine con la sua catena **ordinato → arrivato → fatturato →
  pagato**.
- Bolle: «Registra arrivo» sull'ordine, foto del cantiere → verifica in un tocco, anche le bolle
  arrivate via email/WhatsApp da confermare (`email_ddt_carico`).
- Fatture: «Collega» per quelle suggerite dall'AI, link alla singola fattura, avviso se il totale
  supera l'ordine.
- Barra delle viste con i numeri anche su Bolle e Fatture.

## 4. Economia e pagamenti

**Oggi:** Margini e costi · Manodopera e subappalti · Incassi e pagamenti · Varianti, SAL e documenti.
«Incassato» compare **6 volte** con **3 regole diverse**; il margine 4 volte nella sola vista Margini.

**Non va (errori nei numeri — prima di tutto)**
- «Totale fatturato» (OD:1980) somma proforma, DDT e preventivi, e le note di credito in positivo.
- Incassato con la rata del finanziamento esclusa in un riquadro (OD:1204) e inclusa in un altro
  (FinancialSummary.tsx:907); il costo della finanziaria si sottrae anche senza finanziamento
  (OD:1212); un terzo incassato viene dalla prima nota (useEsposizioneCommessa.ts:105).
- Il conto economico usa `order.total_amount` (OD:1722), il resto contratto + varianti.
- Errori/Perdite visibili anche a chi non può vedere i costi (OD:1893).
- Verifica «mezzi» porta alla Panoramica (OrderEconomicsSummary.tsx:202).
- Da pagare con due fonti diverse (costi registrati vs fatture).

**Proposta**
- In testa, sempre: **Venduto · Speso · Margine (€ e %) · Incassato · Da incassare**, calcolati da
  una funzione sola usata anche dalla Panoramica.
- Tre viste invece di quattro:
  1. **Incassi** — rate per scadenza (scadute in rosso), un solo «Registra incasso», fatture emesse
     con «Nuovo documento ▾», SAL e varianti come righe richiudibili, quanto resta da fatturare.
  2. **Pagamenti** — fornitori, subappalti (con ritenute) e manodopera da pagare per scadenza;
     «Chi finanzia il cantiere» chiuso.
  3. **Costi e margine** — materiali, manodopera (totale €, dettaglio ore in Cantiere), subappalti,
     altro, errori; provvigioni qui; mezzi, struttura e le 7 verifiche in «Analisi avanzata» chiusa.
- Tolti: ciambella, barra incassi del conto economico, «Stima di cassa sui materiali», ritenute
  quando non ce ne sono.

---

## 5. Documenti in finestra (richiesta del 18/10)

Oggi da Bolle/DDT, Fatture e Ordini d'acquisto si **esce** dalla commessa: il link apre la pagina
del documento. Il titolare vuole restare nella commessa.

- **Una finestra sola per ogni documento** (bolla del fornitore, foto della bolla dal cantiere,
  fattura del fornitore, ordine d'acquisto, DDT al cliente): anteprima del file (foto o PDF; per la
  fattura elettronica la versione leggibile), numero, data, fornitore, righe con quantità e
  prezzi, a quale commessa e ordine è legato.
- **Azioni nella finestra:** Scarica · Apri la pagina completa · **Sposta su un'altra commessa**
  · **Togli da questa commessa** (scollega, non cancella; resta in Magazzino/Fatture ricevute).
- **Bolla senza prezzi** (il caso normale): la finestra mostra i prezzi dell'ordine d'acquisto se
  c'è, poi quelli della fattura quando arriva e si abbina; finché mancano lo dice («prezzi in
  arrivo con la fattura»).

## 6. Fattura del fornitore ↔ bolle (richiesta del 18/10)

Il caso reale: l'operaio ritira la merce in magazzino e fotografa la bolla; a fine mese arriva
**una** fattura che richiama **più bolle**, spesso di **più cantieri**.

**Com'è oggi (verificato sui dati il 18/10):** le fatture elettroniche contengono già i
riferimenti delle bolle (`<DatiDDT>`: numero, data e righe collegate). Su 265 fatture con l'XML
salvato, 46 citano bolle (11 più di una), 63 riferimenti in tutto — e **0** sono abbinati a una bolla
del sistema: il riferimento non viene letto (il parser `_shared/fatturaRicevutaXml.ts` lo
ignora) e le bolle registrate non lo cercano. La fattura si lega alla commessa solo tramite
ordine d'acquisto, costo o suggerimento AI.

**Cosa fare**
1. **Leggere i riferimenti** quando la fattura entra (`salvaFatturaRicevuta`): tabella nuova
   `fattura_ricevuta_ddt` (fattura, numero e data della bolla, righe della fattura che le
   appartengono, importo, bolla abbinata, commessa, stato dell'abbinamento). Recupero per le
   fatture già arrivate (XML in tabella o nello storage).
2. **Abbinare da solo:** stessa azienda, stesso fornitore (P.IVA), numero bolla normalizzato
   (senza prefissi, spazi e zeri iniziali) e data vicina → bolla del fornitore (`ddt_ricezione`)
   o foto dal cantiere (`campo_acquisti`). Ogni bolla porta la sua commessa.
3. **Dividere il costo tra le commesse:** l'importo di ogni bolla è la somma delle righe della
   fattura che la citano; il costo della fattura si ripartisce sulle commesse delle bolle
   (`company_costs.allocations`, già usato da Economia → Pagamenti). Abbinamento sicuro = applicato
   da solo; incerto = «da confermare» con un tocco.
4. **Avvisi:**
   - la fattura cita una bolla **che nel sistema non c'è** → avviso in Fatture ricevute e
     all'ufficio («Manca la bolla 7904 del 03/06: fotografala o registrala»);
   - bolla registrata da più di 45 giorni **senza fattura** → in «Da fare adesso» della commessa;
   - importo della bolla molto diverso dall'ordine d'acquisto → da controllare.
5. **Fatture senza riferimenti nell'XML** (PDF, OCR): cercare i numeri di bolla nelle descrizioni
   delle righe; se non ci sono, resta l'abbinamento a mano dalla finestra della fattura.
6. **La bolla prende i prezzi** dalla fattura abbinata: il costo della commessa diventa vero.

## 7. Mezzi e attrezzature su più cantieri (analisi del 18/10)

**Com'è oggi:** un mezzo ha **una posizione alla volta** (una commessa, una persona o caricato su
un altro mezzo); a ogni cambio un trigger chiude un periodo e ne apre un altro (`mezzi_assegnazioni`).
Le attrezzature a quantità (ponteggi a m², pezzi) si possono dividere tra più commesse
(`mezzi_allocazioni`). Il rapportino segna a fine giornata dove resta il mezzo, se è stato usato, il
contatore (`mezzi_giornate`); il QR sposta gli attrezzi (`mezzi_scansioni`).

**Non va**
- Il costo dei mezzi della commessa è una **stima** sui periodi di posizione, **non sull'uso**: quello
  che il cantiere segna nel rapportino (`mezzi_giornate`) non lo legge nessuno. Un mezzo dimenticato
  in cantiere costa tutti i giorni; un furgone assegnato a una persona non costa mai alla commessa.
- **Giorni contati due volte**: un mezzo spostato da A a B lo stesso giorno conta un giorno pieno su
  entrambe; cambiare solo la persona spezza il periodo e ricontà il giorno; i periodi a mano si
  possono sovrapporre. Giorni di calendario in un posto, lavorativi in un altro.
- Il costo si calcola in **quattro posti diversi** (vista SQL, card commessa, elenco e scheda mezzi).
- Rapportino: il contatore lo chiede solo per furgoni/auto (non per escavatori e gru); propone «sul
  furgone» anche per l'escavatore; con due furgoni prende sempre il primo; il furgone del collega di
  squadra non compare.
- **Nessuna prenotazione e nessun conflitto**: assegnare un mezzo lo toglie in silenzio all'altro
  cantiere; non si può dire «domani va su B». `cantiere_allocations` (pensata per questo) non è usata.
- **Scadenze che non bloccano**: assicurazione o revisione scadute, mezzo fuori servizio: si assegna e
  si usa lo stesso, anche dal QR.

**Proposta**
- **Un costo solo, sull'uso vero**: giorni d'uso = giorni in cui il mezzo è segnato usato su quella
  commessa (rapportino) o vi è rimasto; un giorno diviso tra due cantieri vale metà ciascuno.
  Tariffa del mezzo al giorno o all'ora (proposta dal costo annuo + ammortamento, correggibile);
  per i mezzi a ore, le ore del rapportino. Calcolo solo nel database, letto da tutti.
- **Programma dei mezzi**: una vista settimana × mezzi (dove è, dove andrà); prenotare «dal… al…»
  su una commessa; avviso se due cantieri lo vogliono negli stessi giorni.
- **Blocchi**: scaduto o fuori servizio non si assegna e non si usa; in officina chiede conferma.
- Rapportino: contatore per ogni mezzo che ce l'ha, scelta del furgone, mezzi della squadra.

## 8. App del cantiere ↔ ufficio (analisi del 18/10)

Quasi tutto quello che si fa dal telefono arriva nella commessa giusta. I buchi:

- **Avanzamento fasi**: dal telefono la fase si chiude subito, senza approvazione, senza evento e
  senza avviso — mentre per il rapportino «le fasi si muovono quando l'ufficio approva». Da decidere.
- **Approvazione del rapportino in due scritture separate** (rapportino, poi fasi dal browser): se la
  seconda fallisce, il rapportino è approvato e le fasi no. Va fatta in una sola operazione nel database.
- **Due «collaudi»**: quello firmato dal telefono va nel Diario, la vista «Collaudo» della commessa
  mostra un'altra tabella (`order_acceptance_reports`). Vanno nello stesso posto.
- **Chat su due canali**: se l'ufficio apre prima le «Note interne», il canale nasce con un altro nome
  e il telefono non lo trova (e viceversa le note interne diventano visibili agli operai).
- **Dati scritti e mai letti dall'ufficio**: km e contatori dei mezzi, checklist di sicurezza, scorte
  del furgone (il riordino apre un ticket senza commessa).
- **Correzioni di timbratura senza cantiere**: non compaiono da nessuna parte.
- **Foto in tre archivi** (galleria, foto delle fasi, foto dei rapportini): una galleria sola.
- **Notifiche**: il rapportino lo notifica il telefono (se fallisce nessuno lo sa), solo al
  responsabile o a chi ha creato la commessa e senza push; merce presa e timbratura lontana vanno a
  tutto l'ufficio ogni volta (rumore con 30 cantieri); nessun avviso per cantiere senza rapportino.
  Regola unica: **avvisa il responsabile della commessa** (in mancanza i titolari), dal database,
  con push; il resto in un riepilogo per cantiere.
- **La pagina aperta non si aggiorna** per correzioni, bolle, foto, ticket, fasi e mezzi.

## 9. Tutti i cantieri insieme (analisi del 18/10)

Oggi per sapere cosa succede bisogna aprire una commessa alla volta. Non esistono: chi è dove oggi,
cantieri senza rapportino, cantieri fermi, ore della settimana per cantiere, una coda unica di cose da
approvare, il controllo di una persona su due cantieri lo stesso giorno.

**Proposta: «Cantieri oggi»** — una riga per cantiere aperto:
persone pianificate / timbrate · rapportino sì/no · cose da approvare · ultimo segnale (ora e chi) ·
avvisi (fermo da N giorni, ritardo, mezzo bloccato, bolla senza fattura). Clic → la commessa.
Sopra, **«Da approvare»** di tutta l'azienda (rapportini, correzioni anche senza cantiere, bolle,
fasi) con approvazione a gruppi; e le **ore della settimana** per cantiere e per persona.
Nella lista commesse due colonne: ultimo rapportino e cose da approvare.
Avviso se la stessa persona o lo stesso mezzo è pianificato su due cantieri nello stesso giorno.

## 10. Fasi dell'ufficio (richiesta del 18/10)

Il cantiere ha Lavorazioni con fasi e persone; il lavoro d'ufficio della stessa commessa (contratto,
misure, ordini, pratiche e permessi, detrazioni/ENEA, SAL e fatture, consegna, documenti di fine
lavori) non ha un posto suo. Oggi esiste a pezzi che non si parlano:
- «Ufficio · attività» in Panoramica (`ContractOfficeTasks`): usata quasi solo per i contratti di
  manutenzione stradale, 6 passi fissi nel codice;
- **flusso di lavoro aziendale** (`order_task_template` + `applicaFlusso`): ha già ordine, uffici,
  assegnatario, scadenze, sblocco a catena e avanzamento dello stato commessa — ma i passi finiscono
  mescolati tra le attività generiche e la card Ufficio non li mostra;
- stati della commessa, che ripetono gli stessi passaggi (contratto, acconto, ordine, SAL…).

**Proposta:** vista **«Ufficio»** accanto a Lavorazioni: elenco ordinato delle fasi d'ufficio con
responsabile o ufficio, scadenza, stato e «in attesa di…» (anche di una fase del cantiere: «ordine
materiali dopo le misure»). Si costruisce sul flusso di lavoro che c'è (un campo «ufficio/cantiere»
sul passo, l'ordine copiato sul task, la dipendenza da una fase delle Lavorazioni), modelli per tipo
di lavoro, i 6 passi fissi diventano un modello. Restano attività vere: ognuno le vede nelle sue
Attività e nella campanella. Lo stato lo vede chiunque possa vedere la commessa; le modifica chi ne è
responsabile. Un solo legame con gli stati della commessa (la fase d'ufficio chiusa fa avanzare lo stato).

## 11. Ciclo economico completo (analisi del 18/10)

Dal preventivo alla commessa passano bene i **ricavi** (articoli, rate, venduto delle fasi). I **costi
previsti** si perdono, la commessa non si **chiude** mai, e i margini si calcolano in più modi.

**Errori nei numeri (prima di tutto)**
- **Ditte esterne contate con l'IVA** nel margine ufficiale (`v_ordine_marginalita`, economia per
  fase): costo lordo contro ricavi netti → margini più bassi del vero (circa il 22% del costo ditte).
- **Totali subappalti moltiplicati**: `v_subappaltatori_dashboard` unisce SAL e ritenute prima di
  sommare (N SAL × N ritenute righe).
- **Costo orario sottostimato**: solo lordo + INPS; mancano TFR, INAIL, Cassa Edile, ratei 13ª/14ª e
  ferie → margini più alti del vero. Il cedolino reale non corregge mai la commessa.
- **Fattura di saldo senza varianti**: il saldo con le varianti è calcolato solo a schermo; la
  fattura parte dalla rata salvata (da verificare con un dato reale).

**Manca**
- **Budget dal preventivo**: costo interno della posa, assegnazioni di manodopera e costo standard
  delle righe non arrivano alla commessa; le righe materiali nascono senza fase. Il confronto
  «margine del preventivo ↔ margine reale» non esiste.
- **Chiusura della commessa** con controlli (tutto fatturato e incassato, ordini con fattura,
  rapportini approvati, collaudo firmato, ritenute, documenti obbligatori come DiCo) e un
  **consuntivo fisso** salvato.
- **Subappalti nel margine**: contratti e SAL dei subappaltatori non sono costo della commessa.
- **Varianti fino in fondo**: aggiornano ricavi ma non budget di costo, venduto della fase, rata salvata.
- **SAL → fattura**: la fattura prende la rata, non l'importo del SAL; nessun controllo «SAL
  maturato»; ritenute di garanzia fuori dal nuovo SAL; le lavorazioni restano fuori dalla fattura per articoli.
- **Una sola previsione a finire** (oggi tre, diverse) e un solo avanzamento della commessa.
- Materiali al costo della **fattura** del fornitore, non solo all'impegnato dell'ordine.
- Costi di assistenza/garanzia nel margine.

## 12. Persone, regole e documenti (analisi del 18/10)

I dati ci sono quasi tutti; **nessuna regola blocca il lavoro**, ci sono solo avvisi.
- **Operai**: corso sicurezza o visita scaduti, ferie o malattia → si assegnano e timbrano lo stesso.
  «Blocca dal cantiere» di Silvio disattiva il dipendente in tutta l'azienda.
- **Subappaltatori**: DURC scaduto non blocca accesso, contratto, SAL, pagamento; nessun avviso
  quotidiano sul DURC delle ditte; due date DURC diverse in due tabelle.
- **Doppioni**: formazione/visite/DPI in tre sistemi (solo `hr_documenti` ha le schermate; Silvio legge
  gli altri), persone in `hr_profili` ed `employees`, subappaltatori in due anagrafiche, cedolini in tre tabelle.
- **Sicurezza**: la checklist la vede solo l'operaio (l'ufficio mai), non per cantiere, non blocca nulla;
  DPI senza schermata; verbale «non conforme» senza azione correttiva.
- **Pratiche**: `pratiche_edilizie` (CILA, SCIA, PdC, silenzio-assenso) senza schermata e senza avvisi;
  **notifica preliminare assente**; nessuna scadenza ENEA (90 giorni dalla fine lavori), nessuna
  data di fine lavori formale.
- **Giornale dei lavori** presente (automatico, firme, PDF); mancano **sospensioni e riprese** e i
  giorni di fermo per maltempo.
- **Prezzi d'acquisto** solo a mano: le fatture e le bolle non aggiornano il listino del fornitore,
  niente costo medio né storico.

**Proposta:** un controllo nel database all'assegnazione e alla timbratura (visita, formazione,
DURC, assenze) con eccezione motivata dall'ufficio; una fonte sola per documenti delle persone e una
anagrafica sola delle ditte; pratiche, notifica preliminare, fine lavori, ENEA e sospensioni nelle
fasi d'ufficio (§10) con le loro scadenze; checklist visibile in commessa.

## Ordine dei lavori

Ogni lotto è piccolo, verificato e pubblicabile da solo.

| # | Lotto | Perché prima | DB |
|---|-------|--------------|----|
| 1 | **Numeri giusti**: una funzione per incassato/da incassare/fatturato/margine; «Totale fatturato» solo fatture meno note di credito; Errori dietro il permesso costi | sono numeri sbagliati oggi | no |
| 2 | **Ore e persone** al posto di Risorse; registro tolto da Diario ed Economia; totale ore dei rapportini corretto; rettifica del totale tolta | richiesta del titolare | no (fase 2: ore timbrate per commessa = funzione nuova) |
| 3 | **Intestazione + «Da fare adesso»**: 13 comandi → 2, 4 avvisi → 1, stato e ritardo in vista, link morti | è la prima cosa che si vede | no |
| 4 | **Materiali**: stato per riga calcolato, catena per ordine, un solo «Ordina», conteggio DDT per commessa | flusso acquisti leggibile | forse (vista per lo stato per riga) |
| 5 | **Economia in 3 viste** con i 5 numeri in testa | dopo il lotto 1, che dà i numeri | no |
| 6 | **Velocità**: niente letture per riquadri chiusi e schede non aperte; finestra Documenti a richiesta | ~35 letture all'apertura | no |
| 7 | **Documenti in finestra**: bolla, foto, fattura, ordine, DDT si aprono senza uscire; scarica, sposta, togli | richiesta del titolare | no (sposta/togli: forse una funzione) |
| 8 | **Fattura ↔ bolle**: leggere i riferimenti, abbinare da solo, dividere il costo tra commesse, avvisare se manca la bolla | il caso di ogni fine mese | sì (tabella `fattura_ricevuta_ddt`, recupero, abbinamento) |
| 9 | **App ↔ ufficio**: approvazione del rapportino in una sola operazione; collaudo in un posto solo; chat su un canale; avvisi al responsabile dal database; una galleria foto | dati che oggi si perdono | sì |
| 10 | **Cantieri oggi + Da approvare di tutta l'azienda + ore della settimana** | controllare 10–30 cantieri | forse (una vista di riepilogo) |
| 11 | **Mezzi sull'uso vero**: costo dai giorni/ore d'uso, tariffa del mezzo, niente giorni doppi, rapportino migliore | costo mezzi oggi sbagliato | sì |
| 12 | **Programma mezzi**: settimana × mezzi, prenotazioni, conflitti, blocchi per scadenze | mezzi su più cantieri | sì |
| 13 | **Numeri del costo giusti**: ditte senza IVA nel margine, totali subappalti, costo orario completo | margini oggi sbagliati | sì |
| 14 | **Fasi dell'ufficio** (vista «Ufficio», modelli per tipo di lavoro, legate alle Attività e al cantiere) | richiesta del titolare | sì (colonne sul flusso) |
| 15 | **Budget dal preventivo + varianti fino in fondo + una previsione a finire** | confronto previsto/reale | sì |
| 16 | **SAL → fattura → rata** con ritenute, subappalti nel margine, materiali dalla fattura | filo economico unico | sì |
| 17 | **Chiusura commessa** con controlli e consuntivo fisso | sapere davvero quanto si è guadagnato | sì |
| 18 | **Regole che bloccano** (visite, corsi, DURC, assenze) + pratiche, notifica preliminare, ENEA, sospensioni + checklist in commessa | sicurezza e obblighi | sì |

## Decisioni del titolare (18/10)

- Lotto 2: le ore **timbrate** entrano subito nella tabella per persona (funzione nuova nel database).
- Lotto 4: lo stato per riga è **calcolato** da ordini, bolle e fatture; la scelta a mano resta solo
  per le eccezioni (es. «fornito dal cliente»).
- Si parte dal lotto 1, «Numeri giusti».
- Aperta: «Errori / Perdite» resta una voce a sé o entra nei costi (lotto 5).
- Lotto 9: l'avanzamento delle fasi dal telefono **lo decide l'azienda** in Impostazioni → Fasi:
  «vale subito, l'ufficio è avvisato» oppure «aspetta l'approvazione dell'ufficio».
- Lotto 8: anche l'abbinamento fattura↔bolle **lo decide l'azienda**: «applica da solo se sicuro»
  oppure «sempre da confermare».
- Lotto 11: costo dei mezzi **secondo il mezzo** — a ore (contatore) per escavatori e gru, a
  giornata per furgoni e attrezzi; tariffa proposta dal costo annuo, correggibile.
- Ordine dei lotti: quello proposto (1-2 → 3 → 9 → 10 → 7-8 → 11-12 → 4-6).
