# Macro-commessa per tipologia: creazione, dati, pagina — piano completo (14/11/2026)

Domanda di Florin: cosa va sistemato nelle tre tipologie di macro-commessa (appalto, sviluppo,
compravendita) quando si crea, cosa manca da inserire, come migliorare la pagina di ognuna.

## Cosa dicono i dati veri

Sette aziende hanno acceso le macro-commesse. Quello che è successo:

| Azienda | Tipologie accese | Cosa ha fatto |
|---|---|---|
| URBAN VISION | sviluppo | 3 operazioni (create da noi dai business plan) |
| 2D S.r.l | appalto | 1 appalto con 2 lotti, **senza valore, contratto né piano** |
| Bonarrigo | appalto, sviluppo | appalto da 3,43 mln con 2 lotti, **nessun contratto**, cestinato dopo 3 giorni e mezzo |
| Impresa Vulcano | appalto, sviluppo | «TRASPORTI TECHBAU» creato e **cestinato dopo 2 minuti**: era una commessa normale |
| Dimora Torino | compravendita | **mai creata** una |
| Renova | appalto | **mai creata** una |
| Demo Azienda | tutte | gli esempi |

Su 18 macro-commesse vive: **nessuna ha una data di inizio lavori**, solo 4 hanno un indirizzo,
**nessun appalto vero ha il contratto compilato**. Il modulo del contratto ha già tutti i campi
giusti (importo, ribasso, oneri, date, penali, anticipazione, ritenuta, CIG, CUP, scissione dei
pagamenti): il problema non è che manchino, è che **nessuno ci arriva**.

## Cosa non va, per tutte e tre

1. **Il bivio «commessa / macro-commessa» non spiega abbastanza.** Vulcano ha creato una
   macro-commessa per un lavoro normale. Il bivio deve dire in una riga quando serve
   (più lavori sotto un contratto, un'operazione con più unità, un acquisto da rivendere), con
   un esempio per tipologia.
2. **La creazione chiede solo il nome.** Tipo, cliente e valore sono facoltativi, e dopo non c'è
   un posto per completare i dati: il cliente **non si può più cambiare** (ModificaGeneraleDialog
   ha nome, tipo, valore e criterio), indirizzo e date **non esistono** sulla generale. Il
   Dossier e i PDF di vendita hanno solo l'indirizzo dell'azienda, non quello del cantiere.
3. **La guida «Per partire» compare solo dopo la prima figlia.** Per un appalto vuol dire che
   «Completa i dati del contratto» non si vede finché non si crea un lotto: 2D e Bonarrigo
   hanno creato i lotti e mai il contratto.
4. **Testi da sistemare:** «La scelta manuale arriva col prossimo aggiornamento»
   (ModificaGeneraleDialog); «Gestione dell'operazione» anche per un appalto senza lotti.
5. **La data di inizio lavori non c'è**, quindi il calendario del piano parte da ipotesi
   (URBAN VISION: «03/2027 — ipotesi»).

## Una regola per tutte: la scheda «Dati»

Una scheda nuova **«Dati»** (prima delle altre, dopo Panoramica), una sezione per gruppo, ogni
campo modificabile lì e solo lì:

- **Comuni:** nome, codice, cliente/committente (modificabile), indirizzo del cantiere o
  dell'immobile, inizio e fine lavori previsti (alimentano il calendario del piano), responsabile
  interno, note.
- **Per tipologia:** le sezioni qui sotto.

La creazione chiede **per prima la tipologia** (senza preselezione, una riga d'esempio per
tipo), poi i pochi dati che servono a partire; tutto il resto si completa nella scheda Dati,
e la guida dice cosa manca.

## Appalto

**Creazione** (dopo la scelta «Appalto»):
- Committente **obbligatorio** (il codice lo dichiara già obbligatorio, l'interfaccia no).
- Pubblico o privato: decide se chiedere CIG/CUP, stazione appaltante, RUP, scissione dei
  pagamenti.
- Importo del contratto, ribasso, oneri della sicurezza, data di consegna lavori — oppure
  «Importa il contratto con l'AI» (c'è già), che li riempie.
- Lotti / ordini di lavoro: «quanti e come si chiamano» (righe veloci), opzionale.

**Dati da aggiungere** (sezione «Contratto e figure»):
- Stazione appaltante se diversa dal committente; RUP; direttore lavori; coordinatore sicurezza
  in esecuzione (oggi è solo un documento); categoria SOA prevalente; tipo pubblico/privato.
- Le date del contratto (consegna, fine prevista, ultimazione) diventano anche le date della
  commessa: un posto solo.

**Pagina:**
- «Per partire» visibile **da subito**, con il contratto come primo passo.
- Con zero lotti: «Lavori sulla commessa generale» invece di «Gestione dell'operazione».
- Testata: assegnato, eseguito, a SAL, fatturato, incassato (c'è) + **giorni alla fine
  contrattuale e penale maturata** quando c'è la data.

## Sviluppo immobiliare

**Creazione** (dopo la scelta «Sviluppo»):
- Indirizzo dell'area, superficie, quante unità (c'è), inizio lavori previsto.
- Piano: voci tipiche, business plan Excel/PDF (c'è), oppure dal Simulatore (c'è).
- Dal Simulatore: **il mese d'acquisto, il mutuo e gli investitori** oggi finiscono solo come
  voci del piano e fonti; devono diventare anche dati dell'operazione (data rogito terreno,
  finanziamento).

**Dati da aggiungere** (sezioni «Area e titoli», «Tecnici», «Unità»):
- Area: indirizzo, dati catastali (foglio, particella), superficie, cubatura.
- Titolo edilizio: tipo (permesso di costruire, SCIA…), numero, data, scadenza; agibilità.
  Oggi sono solo voci dei documenti, senza estremi né date.
- Tecnici: progettista, direttore lavori, coordinatore sicurezza, impresa esecutrice se non si
  costruisce in proprio (la domanda D2 di URBAN VISION).
- Unità: catastali per unità (sub), notaio del rogito.

**Pagina:** testata «in costruzione» / «in vendita» (fatta oggi), Cantiere, Unità, Piano,
Investitori, Documenti. Da aggiungere: scadenza del titolo edilizio fra gli avvisi.

## Compravendita (acquisto, ristrutturazione, rivendita)

**Creazione** (dopo la scelta «Compravendita»):
- **L'immobile acquistato** come primo dato: indirizzo, catastali, m², prezzo d'acquisto,
  data compromesso e rogito d'acquisto, venditore, notaio, agenzia d'acquisto. Il prezzo e le
  date alimentano la voce «acquisto» del piano (oggi il prezzo si scrive solo come importo di
  una voce).
- In quante parti si rivende (1 = si rivende intero; più parti = frazionamento): crea le unità
  collegate all'immobile d'origine.

**Dati da aggiungere** (sezioni «Immobile acquistato», «Ristrutturazione», «Rivendita»):
- Immobile acquistato come sopra; mutuo d'acquisto (oggi solo come fonte in Investitori).
- Ristrutturazione: titolo (CILA/SCIA) con numero e data, impresa o ditte, inizio/fine.
- Rivendita: prezzo obiettivo, agenzia, provvigione (c'è sulle unità), data di rivendita attesa.
- Legame unità ↔ immobile d'origine (oggi esiste solo «dividi unità»).

**Pagina:** oggi è identica allo sviluppo. Da fare: in testata **prezzo d'acquisto → costi di
ristrutturazione → prezzo di rivendita** (la catena della compravendita), mesi dall'acquisto,
documenti ridotti (c'è già la lista corta).

## Lotti

| Lotto | Cosa | Perché prima |
|---|---|---|
| **T1** | Scheda «Dati» comune: cliente modificabile, indirizzo, date inizio/fine (con calendario del piano), responsabile; Dossier e PDF col vero indirizzo; testi da sistemare | serve a tutte e tre, sblocca il resto |
| **T2** | Creazione: tipologia per prima con esempi; bivio commessa / macro-commessa più chiaro; «Per partire» visibile da subito | 3 aziende su 5 si sono fermate qui |
| **T3** | Appalto: committente obbligatorio, pubblico/privato, contratto in creazione, figure (stazione appaltante, RUP, DL, CSE, SOA), giorni e penale in testata | nessun appalto vero ha il contratto |
| **T4** | Compravendita: «Immobile acquistato» con prezzo e date nel piano, frazionamento collegato, testata acquisto → lavori → rivendita | Dimora Torino l'ha accesa e non l'ha mai usata |
| **T5** | Sviluppo: area e titoli edilizi con scadenze, tecnici, dal Simulatore anche le date e il mutuo | URBAN VISION: date e domande D2/D5 |

Ogni lotto: migrazione idempotente con `apply_migration` e riallineo, test dei componenti,
prova in transazione annullata sui dati veri, pubblicazione.

## Da decidere con Florin

- **D1** Il committente dell'appalto diventa obbligatorio alla creazione? (il codice lo dice
  già; 2D e Bonarrigo ce l'avevano)
- **D2** Per lo sviluppo e la compravendita servono i catastali per unità, o bastano quelli
  dell'area / dell'immobile?
- **D3** «Impresa esecutrice» per lo sviluppo: basta un nome, o deve poter aprire un appalto
  collegato (l'impresa che costruisce per noi diventa un fornitore con contratto e SAL)?
