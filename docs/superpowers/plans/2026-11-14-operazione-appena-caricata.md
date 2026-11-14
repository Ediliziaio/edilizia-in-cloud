# L'operazione appena caricata: dal business plan all'operazione che si governa

Data: 14/11/2026. Caso reale: URBAN VISION (`ea2de8df-…`), tre operazioni immobiliari
caricate il 12/11 — Cherubini O-0001, Via Callimaco 28 O-0002, Via Antonio Lotti 196
O-0003 — con 358 voci di business plan e 38 fatture ricevute.

## Il problema

Il disegno della commessa generale è stato rifatto l'11/11
([allineamento grafico](2026-11-11-commesse-allineamento-grafico.md)) ed è collaudato su
un'operazione **già avviata**: Residenza Via Roma, con unità, calendario e incassi.
Un'operazione appena nata da un business plan è un'altra cosa, e oggi ci si ferma lì:

| Cosa c'è dopo l'importazione | Cosa manca per governarla | Quanto costa oggi farlo a mano |
|---|---|---|
| 111–131 voci di piano per operazione | il **mese** di ogni voce: senza, niente cassa, niente fabbisogno, niente capitale impegnato, budget non approvabile | un clic per voce, cioè 358 clic |
| le righe di vendita del piano (Unità 1 520.000, Posto auto 12.000…) | le **unità**: senza, niente stato vendite, acquirenti, compromessi, incassi | riscrivere a mano, riga per riga, quello che il piano dice già |
| 78 voci «da stimare» | un percorso unico per completarle | avvisi sparsi in tre punti della pagina |

Il piano risponde a tre domande, nell'ordine in cui il titolare se le fa:
**cosa vendo** (unità), **quando entrano ed escono i soldi** (calendario),
**cosa mi manca ancora** (stime). Più la pulizia dei dati di URBAN VISION.

## Regole che valgono per tutto

- Arricchire i punti che esistono, non aggiungere pannelli: testate strette, avvisi
  su una riga, la tabella visibile senza scorrere.
- La scelta che decide il lavoro va chiesta per prima e senza preselezione.
- Niente dati inventati: il calendario di URBAN VISION lo decide il titolare; qui si
  costruisce lo strumento per farlo in due minuti.
- Ogni pezzo si verifica **guardandolo**, coi dati veri: test e typecheck non vedono
  un'etichetta tagliata o un grafico vuoto.

## Lotto 0 — Vedere

Banco di prova con la pagina vera e i dati veri di URBAN VISION: le letture registrate
dal database in sola lettura, con l'identità del suo amministratore dentro una
transazione, e servite alla pagina al posto della connessione (metodo «pagina viva»,
vedi memoria `project_anteprima_pagine_senza_login`). Panoramica, Piano, Unità di O-0002
a 1440 px e da telefono. Esce l'elenco dei difetti, che diventa il lotto 3.

## Lotto 1 — Le unità dal piano

Nella finestra «Unità in serie», che esiste già e crea con `generale_unita_serie`:
una partenza **«Dal piano economico»** accanto alla scrittura a mano. Legge le righe
di vendita della versione del piano, le propone come unità (sigla, tipologia ricavata
dal nome — appartamento, posto auto, posto moto —, prezzo di listino), si correggono
nella stessa griglia e si confermano. Nessuna tabella nuova, nessuna funzione nuova
nel database.

Poi le unità di URBAN VISION, con la stessa logica: Cherubini 8, Callimaco 7 + 16
posti auto + 3 posti moto, Lotti 10.

## Lotto 2 — Il calendario rapido

Nel piano economico, per assegnare il mese a più voci insieme: si sceglie un gruppo
(una categoria, oppure le voci selezionate), il mese d'inizio e su quanti mesi si
distribuisce; l'anteprima dice quante voci cambiano e come si sposta la cassa prima di
salvare. Le voci che hanno già un mese si lasciano stare, salvo scelta esplicita.

Per URBAN VISION non si compila niente: i tempi sono del titolare.

## Lotto 3 — Il disegno dell'operazione appena caricata

Dai difetti del lotto 0, più una cosa nota: con piano incompleto e senza unità la
panoramica deve dire **una** cosa — cosa manca e da dove si comincia — invece di
avvisi sparsi. Un percorso «Completa l'operazione» in tre passi (unità, calendario,
stime) dentro la fascia «Da seguire» che c'è già, che sparisce a lavoro finito.

## Lotto 4 — Pulizie dei dati di URBAN VISION

- L'escavatore (EDILIZIA STIRPE, 5.000 €) è un bene strumentale, non un costo
  dell'operazione.
- La fattura DUEZETA è in reverse charge (N6.9): va segnata come tale.
- Il tipo dei fornitori dove è evidente (professionisti, materiali, utenze).

## Lotto 5 — Pubblicazione

Test, controllo di tipo col tetto di heap alto, revisione degli accessi per ogni
cambio al database, pubblicazione su `main`.

## Fuori da questo piano

- Gli originali (`.xlsx` delle operazioni, XML delle fatture): si caricano solo dal
  browser, che oggi non ha una sessione di URBAN VISION.
- Le 16 fatture senza operazione: servono le risposte del titolare.
- La catena rotta di `test:critical` (tre test di sicurezza mai eseguiti): decisione
  del titolare, perché riaccenderli fa diventare rossa la CI.

## Com'è andata (14/11/2026)

**Lotto 0.** Il banco con la pagina vera ha trovato un difetto che nessun test vedeva:
21 costi di URBAN VISION avevano categorie che il piano non sapeva abbinare, e il confronto
li metteva tutti sulla prima voce della categoria. Via Callimaco mostrava un margine finale
di −97.046 € sotto il previsto; con 14 categorie di costo create e agganciate alle voci
giuste (`categorie_costo`) lo scostamento vero è −14.606 €, e la composizione dei costi
dice «Terreno e acquisto 99,3%». Correzione fatta sui dati, nessuna migrazione.

**Lotto 1 — unità dal piano.** `unitaDalPiano.ts` legge le righe di vendita della versione
approvata (o della bozza), ricava la tipologia dal nome e propone sigla e listino; la
finestra «Unità in serie» si apre già compilata dalla scheda Unità vuota, dalla Panoramica
e dal pulsante «Dal piano (N)». Le unità di URBAN VISION **non** sono state create: lo
decide il titolare.

**Lotto 2 — calendario rapido.** «Calendario» tra le azioni della bozza e «Metti i mesi»
nel riquadro del budget: una riga per gruppo del piano, «dal mese» e «per mesi» contati
dall'inizio dell'operazione con i tempi tipici del modello come proposta, il mese d'inizio
vuoto finché non lo scrive chi conosce l'operazione, una linea del tempo per gruppo. Mette
il mese anche alle voci ancora a zero (e dice quante sono); quelle che hanno già un mese
si riscrivono solo con la spunta.

**Lotto 3 — disegno.** In Panoramica il percorso «Completa l'operazione» (cosa vendi,
quando entrano ed escono i soldi, le stime che mancano, il budget di riferimento) prende
il posto dei due avvisi sul budget e sparisce a lavoro finito; ogni passo porta dove si
fa la cosa (`?dal-piano=1`, `?calendario=1`, `?stime=1`). Nel piano un solo riquadro
«Budget da completare», una riga per problema con la sua azione (prima le stesse frasi
comparivano tre volte). Senza budget completo la barra del registrato non si disegna più
(era sempre piena: sembrava «budget consumato»). Gli euro sotto i diecimila hanno il punto
delle migliaia anche nel piano e nei riquadri della generale («4.100 €», non «4100 €»).
Al telefono la scheda del piano non c'è: il percorso dice cosa manca, senza azioni.

**Lotto 4 — dati di URBAN VISION.** Tipo a 24 fornitori su 26 (14 professionisti,
2 materiali, 2 noli e servizi, 4 generali, 1 mezzi, 1 subappalto); restano senza tipo
ANIMA HOME (venditore dell'immobile) ed EDILCENTRO (non si capisce dal DDT). DUEZETA è
subappalto in inversione contabile (il trigger ha creato la scheda subappaltatore); la sua
fattura era già nel registro IVA come reverse charge, per la natura N6.9. L'escavatore
di EDILIZIA STIRPE non era su nessuna operazione: ora ha la categoria «Mezzi e
attrezzature» e una nota; il cespite (aliquota, vita utile) lo registra il commercialista.
