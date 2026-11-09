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

## Lavori, in ordine

**Lotto 0. Numeri giusti** — E1–E6, E9–E11, E15–E18. Prima di tutto il resto: senza, ogni
novità poggia su dati sbagliati. Per E1 una riga di rendiconto per persona, dalle presenze.

**Lotto 1. Rapportino con i soldi** — Nel popup, con permesso:

| Persona | Ore | Costo orario | Costo | Vendita oraria | Ricavo | Margine |
|---|---|---|---|---|---|---|

La vendita viene dalle tariffe del committente, con l'eccezione per cantiere (già esistenti).
Sotto: fasi con ore e costo (risolve E8), materiali e mezzi con valore, totale giornata.

**Lotto 2. Voci libere** — Righe nel rapportino: descrizione, quantità, unità, costo unitario,
vendita unitaria (trasporto, nolo, smaltimento). Entrano in costi e rendiconto una volta sola.

**Lotto 3. Materiali e mezzi con valore** — Valore da ordine, magazzino o listino. Regola
anti-doppione in D4.

**Lotto 4. Giornale automatico** — Una pagina per cantiere e giorno con tutti i rapportini:
persone con nome, lavori, materiali, mezzi. Si aggiorna finché non è firmata. Mai importi.

**Lotto 5. Rendiconto e accettazione**
- Righe giorno per giorno con nome, ore e lavoro svolto; voci libere; giornale allegato.
- Il committente riceve un link e firma per accettazione, riusando la firma elettronica già
  attiva sui contratti di subappalto. Può accettare o contestare, con il motivo.
- Accettato si fattura. Correzione di E13 ed E14.

**Lotto 6. Vulcano in produzione** — Con loro: fasi tipo sulle commesse aperte, tariffe di
vendita per qualifica, contratti collegati, tipo a corpo o a misura sulle 60 mancanti.
Prova su una commessa vera, per una settimana, confrontando con i loro conti.

## Decisioni di Florin

| # | Domanda | Proposta |
|---|---|---|
| D1 | Lo straordinario costa di più? | Sì: maggiorazione impostabile, 0 di partenza |
| D2 | Chi vede la vendita nel rapportino? | Chi vede i costi |
| D3 | Unità «giornata»: 2 ore cosa valgono? | Mezza giornata fino a 4 ore, impostabile sul contratto |
| D4 | I materiali del rapportino entrano nei costi? | Solo se non già pagati con ordine o magazzino; altrimenti si mostrano e basta |
| D5 | I mezzi entrano nei costi? | Sì, con un costo orario sul mezzo (oggi manca) |
| D6 | Il giornale prende anche i rapportini non approvati? | Solo approvati; gli altri segnati «in attesa» |
| D7 | A corpo le ore si rendicontano? | Solo come documento, importo 0; si fatturano solo gli extra |
