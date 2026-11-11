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

## Fuori

Nota integrativa, XBRL e dichiarativi restano allo studio.
