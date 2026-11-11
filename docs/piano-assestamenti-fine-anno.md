# Piano: le scritture di fine anno senza mano (rimanenze, ratei e risconti, cespiti)

11/11/2026. La contabilità generale registra da sola fatture, incassi, Prima nota, F24, cedolini,
ammortamenti e TFR. A fine anno restavano a mano le rettifiche che fanno il bilancio di competenza:
rimanenze, ratei e risconti; e i cespiti non avevano un registro vero.

## Il principio: i conti li sceglie l'azienda, una volta

Un piano dei conti di uno studio non ha i codici standard (04.02, 07.02…): ha i suoi, e a volte una
logica diversa (rimanenze iniziali e finali su conti separati). Ogni scrittura di fine anno usa un
**ruolo** (es. «Rimanenze di lavori in corso»), e in «Fine anno» si dice una volta quale conto del
piano fa da ruolo (contabilita_conti.codice_standard, il meccanismo che c'è già). Senza conto, il
programma lo dice e non registra.

## Lotto 1 — Rimanenze finali

- Lavori in corso su ordinazione: il valore è quello del Controllo di gestione (cg_rimanenze_lavori,
  proposto dalle commesse: maturato meno fatturato). Una sola fonte per CdG e partita doppia.
- Materiali di magazzino: tabella gemella cg_rimanenze_magazzino, proposta dalla valorizzazione del
  magazzino (giacenza × costo medio).
- Scrittura al 31/12 (origine «rimanenze»): si chiudono le iniziali (saldo del conto nel giornale) e
  si aprono le finali, sulla variazione (A.3 per i lavori, B.11 per i materiali). Se i valori
  cambiano, la scrittura di prima si storna e si rifà.
- Ruoli: 04.01, 04.02 (stato patrimoniale), 30.30, 20.03 (conto economico).

## Lotto 2 — Ratei e risconti

- Un elenco per esercizio: costo o ricavo, conto, importo, periodo dal/al. Il programma calcola la
  quota dell'anno dopo (risconto) o quella maturata e non ancora fatturata (rateo), a giorni.
- Scrittura al 31/12 e storno automatico all'1/1 dell'anno dopo.
- Dalla fattura ricevuta: «copre un periodo» → nasce il risconto.
- Ruoli: 07.01, 07.02, 14.01, 14.02.
- Fatto l'11/11 (20290220110000): elenco, quota a giorni, scrittura al 31/12 e riapertura all'01/01.
  Da fare: «copre un periodo» sulla fattura ricevuta (la colonna fattura_ricevuta_id c'è già).

Correzioni dopo la revisione (20290220120000): un conto che fa già da un ruolo (es. ricavi 20.01) non
si può scegliere per un altro, perché le fatture perderebbero il loro conto; i ruoli assegnabili da Fine
anno sono solo questi otto, ognuno con la sua natura; l'anteprima dice «da aggiornare» quando la
scrittura registrata non è più quella che verrebbe oggi; i conti dei materiali si chiedono solo a chi
ha magazzino.

## Lotto 3 — Registro dei cespiti

- Registro in contabilità: bene, conto del bene, conto del fondo, conto dell'ammortamento (proposti
  dalla categoria), fondo all'inizio della contabilità qui, quote anno per anno.
- Il fondo si legge dalle quote registrate, non si ricostruisce dagli anni.
- Cespite nato da una riga di fattura ricevuta.
- Cessione e dismissione con plusvalenza o minusvalenza.
- Fatto l'11/11 (20290312100000):
  - conti per cespite (bene, fondo, ammortamento), proposti dalla categoria con i ruoli;
  - fondo noto al 01/01 di un anno (fondo_iniziale) e quote registrate in contabilita_cespiti_quote:
    il fondo è il noto più le quote, e dove non c'è né l'uno né le altre è «stimato» e lo si dice;
  - contabilita_ammortamenti: anteprima, registrazione, e rifacimento se il registro cambia;
  - contabilita_cespite_cessione: quota in proporzione ai giorni fino alla cessione, chiusura di bene e
    fondo, prezzo in dare sul conto scelto (il ricavo della fattura di vendita, o banca/cassa),
    plusvalenza in 20.04 o minusvalenza in 30.40; si annulla con contabilita_cespite_annulla_cessione;
  - contabilita_cespite_da_fattura: dalla riga di una fattura ricevuta (pulsante «Cespite»), la riga
    passa sul conto del bene e la fattura già registrata si storna e si rifà.

## Fuori

Nota integrativa, XBRL e dichiarativi restano allo studio.
