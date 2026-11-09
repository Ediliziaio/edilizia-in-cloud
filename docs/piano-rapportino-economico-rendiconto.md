# Rapportino economico, giornale e rendiconto al committente

Piano del 09/11/2026. Base: lettura del codice su main e dati veri di Impresa Vulcano,
in sola lettura. Nessuna modifica fatta.

## L'idea

Il capocantiere, o l'ufficio, scrive una cosa sola al giorno: il rapportino.
Tutto il resto ne discende, una volta sola e senza riscrivere nulla.

```
Rapportino approvato
  ├─ Costi commessa     ore × costo orario, materiali, mezzi, voci libere
  ├─ Fasi               avanzamento
  ├─ Giornale lavori    una pagina per cantiere e giorno, con tutti i rapportini
  └─ Rendiconto         righe giorno per giorno a prezzo di vendita
        └─ SAL → firma per accettazione del committente → fattura
```

## Come funziona oggi

| Passaggio | Oggi | Stato |
|---|---|---|
| Costo del personale | All'approvazione: ore × costo orario, entra nel margine una volta sola | Funziona |
| Costo nel rapportino | Tariffa e costo per persona nel popup, solo con permesso costi | Funziona |
| Prezzo di vendita nel rapportino | Non si vede | Manca |
| Voci libere con importo | Non esistono, né da cantiere né da ufficio | Manca |
| Materiali | Quantità e basta: nessun costo, nessuno scarico | Manca il valore |
| Mezzi | Solo scritti nel rapportino: nessun costo | Manca il valore |
| Fasi | Si aggiornano, ma solo se la commessa ha le fasi e il rapportino le indica | Funziona a metà |
| Giornale | Bozza dai rapportini del giorno, a mano o di sera se attivato | Spento di base |
| Rendiconto | Una riga per rapportino e legge solo le ore dell'autore | **Errato con le squadre** |
| SAL e PDF | Giorno per giorno, senza nomi né lavoro svolto | Povero |
| Firma del committente | Non esiste: «approvato» lo clicca l'impresa | Manca |

## Vulcano, numeri veri

- 119 commesse, 6 rapportini, tutti inseriti dall'ufficio, 0 pagine di giornale.
- **Nessuna delle 119 commesse ha fasi**: per questo le fasi non si aggiornano mai.
- Nessun rapportino indica fasi o materiali.
- 1 contratto col committente, collegato a 1 sola commessa, e **0 tariffe di vendita**.
- 59 commesse hanno il tipo impostato (27 a corpo, 32 a misura), 60 no.
- 0 righe di rendiconto e 0 SAL.
- I costi del personale invece funzionano: 280 € e 1.015 € sui due rapportini approvati.

Quello che Vulcano si aspetta («scrivo il rapportino e si aggiorna il resto») oggi vale
solo per il costo del personale. Il resto dipende sia dagli errori sotto sia dai dati da impostare.

## Errori da correggere

Verificati sul database: E1, E2, E4 (in parte), E11. Gli altri dalla lettura del codice,
da provare quando si correggono.

**Danno numeri sbagliati**

| # | Cosa succede | Effetto |
|---|---|---|
| E1 | Il rendiconto legge `ore_lavorate`, che con squadra e ufficio resta 0 | Giornata non rendicontata. Se il capo ha ore sue, si fattura una persona sola |
| E2 | Straordinari e festivi non entrano nel rendiconto | Fatturato in meno |
| E3 | Il rendiconto non guarda se la commessa è a corpo | Giornate fatturate oltre l'importo concordato |
| E4 | Annullando un rapportino, fasi libere e avanzamento commessa restano alti, mentre il popup dice che tornano indietro | Avanzamento falso |
| E5 | Se chi approva non vede gli importi, la riga di rendiconto non nasce | Giornata persa, senza spiegazione |
| E6 | Ore registrate dall'ufficio senza operaio: tariffa generica o riga scartata, costo vuoto | Margine falso |
| E7 | 2 ore valgono una giornata intera; due cantieri lo stesso giorno, due giornate | Da decidere (D3) |
| E8 | Rapportino con più fasi: il costo non va su nessuna fase | Costo per fase sottostimato (il totale è giusto) |
| E9 | Dipendente senza tariffa: approvato a 0 € e nessun ricalcolo dopo | Margine gonfiato |
| E10 | Operaio senza scheda dipendente e senza presenze: ore perse, approvazione riuscita | Costo mancante |

**Bloccano o confondono**

| # | Cosa succede |
|---|---|
| E11 | Il costo per persona è leggibile via API anche senza permesso costi: il blocco costi dell'08/11 non copre i rapportini |
| E12 | Spostando di fase le ore o correggendo a mano il costo, l'annullo non torna o sbaglia |
| E13 | Fattura annullata: il SAL resta «fatturato» e non si può rifare |
| E14 | Il SAL si può portare a stati sbagliati con una chiamata diretta, e una proforma lo segna fatturato |
| E15 | Rendiconto: il testo dice «togli e rimetti l'approvazione», che non si può più fare |
| E16 | Rapportino rifiutato dopo che il giornale è firmato: nessun controllo |
| E17 | Materiali da WhatsApp: nel PDF risultano «Non specificato» |
| E18 | Materiali da ufficio: nella scheda materiali l'usato resta 0 |

## Le quattro cose da tenere insieme

### 1. Chi modifica il rapportino

Oggi l'ufficio può approvare, rifiutare o annullare e riscrivere, e completare i campi
mancanti. Non può correggere un rapportino in modo normale.

| Momento | Chi corregge | Cosa succede |
|---|---|---|
| Inviato, non approvato | Ufficio, direttamente | Si salva; resta scritto chi ha cambiato cosa |
| Approvato | Ufficio con permesso, con **Correggi** | In un colpo solo: toglie ore, costi, fasi e righe vecchie, rimette le nuove |
| Riga già in un SAL inviato, o giornale firmato | Nessuno | Bloccato col motivo: prima si riapre il SAL, sul giornale si annota |

Ogni correzione lascia un registro visibile nel rapportino: prima, dopo, chi, quando.

### 2. Chi vede cosa

Non si decide pagina per pagina, ma per **livello di informazione**:

| Livello | Operaio | Capocantiere | Ufficio senza costi | Ufficio con costi | Titolare |
|---|---|---|---|---|---|
| Ore proprie, lavoro svolto | Sì | Sì | Sì | Sì | Sì |
| Ore della squadra, fasi | No | Sì | Sì | Sì | Sì |
| Quantità materiali, mezzi | No, o solo i suoi | Sì | Sì | Sì | Sì |
| Costo orario e costi | No | No | No | Sì | Sì |
| Vendita, ricavo, margine | No | No | No | Sì | Sì |

I livelli costi e vendita si applicano nel database, come nel blocco costi dell'08/11, non solo a schermo.

### 3. Una persona su più cantieri

Oggi c'è già un rapportino per cantiere con le ore di ognuno, e il costo si divide da solo
in base alle ore. Mancano:
- **Vista per persona** in ufficio: «Luciano, oggi: A 2 h, B 3 h, C 3 h», si scrive su una
  riga e nascono i rapportini dei tre cantieri.
- **Controllo della giornata:** totale della persona contro timbrature e orario normale.
  Un avviso, non un blocco.
- **Unità giornata:** con 2 ore in un cantiere si fattura la frazione, non la giornata (D3).

### 4. Materiali: una sola fonte di costo

Il rapportino dice **quanto si è usato e per quale lavorazione**. Il costo arriva da un posto
solo, così non si conta mai due volte.

| Caso | Esempio | Nel rapportino | Da dove viene il costo |
|---|---|---|---|
| A. Previsto in commessa | 30 sacchi previsti, oggi 20 | Sceglie dalla lista: restano 10; avviso se si supera 30 | Ordine o magazzino già registrati |
| B. Non previsto, dal magazzino | 5 sacchi presi in sede | Lo aggiunge, indica la lavorazione | Scarico di magazzino all'approvazione |
| C. Non previsto, comprato o portato in cantiere | 10 sacchi dal rivenditore | Lo aggiunge, indica la lavorazione e il fornitore se lo sa | **Ordine se c'è, altrimenti bolla e poi fattura del fornitore** |
| D. Consumo minuto | Viti, silicone | Scrive la voce | Voce libera, o nessun costo |

**DDT di entrata (caso C).** L'ufficio trova «Materiali da regolarizzare» per cantiere: con un
tocco raccoglie quelle righe in una bolla di entrata, sulla stessa struttura delle bolle che
già esistono senza ordine (`ddt_ricezione`, `ddt_righe`). Arrivata la fattura, si abbina e il
costo diventa definitivo. Fino ad allora è stimato e segnato come tale.

Regola semplice, voluta da Florin: **si può ricevere una bolla senza ordine; il costo arriva
dall'ordine, se c'è, oppure dalla fattura del fornitore.** Bolla senza ordine e collegamento
bolla-fattura esistono già: i materiali del rapportino si agganciano lì, senza un percorso nuovo.

Oggi dal cantiere si può già scrivere un materiale libero, ma non genera nulla; dall'ufficio
solo articoli della commessa.

## Lavori, in ordine

**Lotto 0. Numeri giusti** — Fatti il 09/11: E1, E2, E3, E4, E5, E6, E13, E14, E15, E17; E7 con
mezza giornata fino a 4 ore. Restano: E9, E10, E12 (con «Correggi», Lotto 2b); E11 (protezione dei
costi nel database: prima il client deve smettere di leggerli con `select *`); E16 (Lotto 4);
E18 (Lotto 3).

**Lotto 1. Rapportino con i soldi** — Fatto il 09/11 per le persone. Nel popup, con permesso:

| Persona | Ore | Costo orario | Costo | Vendita oraria | Ricavo | Margine |
|---|---|---|---|---|---|---|

La vendita viene dalle tariffe del committente, con l'eccezione per cantiere (già esistenti).
Sotto: fasi con ore e costo (risolve E8), materiali e mezzi con valore, totale giornata.

**Lotto 2. Voci libere** — Fatto il 09/11 (dal popup del rapportino; manca il campo nel modulo di inserimento ufficio). Righe nel rapportino: descrizione, quantità, unità, costo unitario,
vendita unitaria (trasporto, nolo, smaltimento). Entrano in costi e rendiconto una volta sola.

**Lotto 2b. Correggi e livelli** — Correzione dell'ufficio con registro: fatta il 09/11 (risolve E12).
Vista per persona fatta il 09/11: popup con le giornate del mese e «Segna la giornata» (una riga per cantiere, avviso su orario e timbrature), sul registro `ufficio_registra_ore`.
Rendiconto accettato il 09/11: «Segna accettato» (chi, quando, come, copia firmata) o «Manda da firmare» (firma elettronica, si approva da solo).
Costi (E11): letture a colonne esplicite e `rapportini_costi` online; manca il GRANT per colonna.

**Lotto 3. Materiali** — Fatti il 09/11: aggiunta fuori commessa, «Materiali da regolarizzare», bolla di entrata. Fatto il 09/11: scarico da magazzino confermato dall’ufficio in «Materiali da regolarizzare» (D4), con rientro se il rapportino si annulla o si corregge. Resta: costo orario dei mezzi. I quattro casi: residuo sui previsti, aggiunta fuori commessa con
lavorazione e provenienza, scarico da magazzino, «Materiali da regolarizzare» e DDT di entrata.
Mezzi con costo orario.

**Lotto 4. Giornale automatico** — Fatti il 09/11: mezzi nella bozza. Restano: bozza serale accesa per chi la vuole, aggiornamento finché non è firmata. Obiettivo: Una pagina per cantiere e giorno con tutti i rapportini:
persone con nome, lavori, materiali, mezzi. Si aggiorna finché non è firmata. Mai importi.

**Lotto 5. Rendiconto e accettazione** — Fatti il 09/11: nomi nel PDF, E13, E14. Resta: firma del committente.
- Righe giorno per giorno con nome, ore e lavoro svolto; voci libere; giornale allegato.
- Il committente riceve un link e firma per accettazione, riusando la firma elettronica già
  attiva sui contratti di subappalto. Può accettare o contestare, con il motivo.
- Accettato si fattura. Correzione di E13 ed E14.

**Telefono, in ogni lotto** — Tutto ciò che si aggiunge si progetta prima per il telefono:
rapportino veloce per il cantiere, correzione e approvazione in popup, testo e bottoni piccoli.

**Lotto 6. Vulcano in produzione** — Con loro: fasi tipo sulle commesse aperte, tariffe di
vendita per qualifica, contratti collegati, tipo a corpo o a misura sulle 60 mancanti.
Prova su una commessa vera, per una settimana, confrontando con i loro conti.

## Decisioni di Florin

| # | Domanda | Proposta |
|---|---|---|
| D1 | Lo straordinario costa di più? | Sì: maggiorazione impostabile, 0 di partenza |
| D2 | Chi vede la vendita nel rapportino? | Deciso: l'ufficio con il permesso, compresi vendita e margine |
| D3 | Unità «giornata»: 2 ore cosa valgono? | Mezza giornata fino a 4 ore, impostabile sul contratto |
| D4 | Chi indica la provenienza dei materiali fuori commessa (casi B e C)? | Il capocantiere la propone, l'ufficio conferma |
| D5 | I mezzi entrano nei costi? | Sì, con un costo orario sul mezzo (oggi manca) |
| D6 | Il giornale prende anche i rapportini non approvati? | Solo approvati; gli altri segnati «in attesa» |
| D7 | A corpo le ore si rendicontano? | Solo come documento, importo 0; si fatturano solo gli extra |
| D8 | Chi può correggere un rapportino già approvato? | Chi può approvare; mai il proprio, salvo il titolare |
| D9 | Il capocantiere vede le ore degli altri? | Sì, sono la sua squadra |
