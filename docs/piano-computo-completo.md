# Dal computo al cantiere: piano completo (17/11/2026)

Confronto fra quello che il gestionale fa oggi con un computo PriMus vero (226 voci, 182 di lavoro,
1.948.331,82 €) e un'analisi operativa fatta a mano con un'altra AI sullo stesso computo. I numeri
coincidono al centesimo; mancano il controllo del documento e la parte di cantiere (programma, noli,
acquisti nel tempo).

## Cosa c'è già (17/11/2026)

| Pezzo | Stato |
|---|---|
| Lettura PriMus PDF/XPWE: voci, misure, capitoli, detrazioni, voci a percentuale | fatto, al centesimo |
| Quadro economico (oneri tecnici, cassa, IVA, visto) spento all'import | fatto (`eNonLavoro`) |
| Preventivo → commessa: fasi per capitolo, sottofasi e voci con importi | fatto |
| Commessa diretta dal computo: lavorazioni, importi per fase | fatto (`commessa_lavorazioni_dal_computo`) |
| Materiali: ricette dell'azienda, libreria, AI per le voci senza ricetta | fatto; errori di quantità su poche voci |
| Costo previsto solo da listino a monte; margine «—» se parziale | fatto |
| Ordini in bozza per fornitore dopo il salvataggio | fatto, senza date |

## Cosa manca, in lotti

### Lotto 1 — Controllo del computo (prima di generare materiali e ordini)
Il computo contiene errori che il gestionale oggi trasforma in ordini. Regole pure, una per tipo,
con la voce, il motivo e l'importo in gioco:
1. **Metri usati come m²**: una voce in m seguita da voci in m² con la stessa quantità (spallette:
   637,20 m sommati come m², 446 m² di ciclo in più).
2. **Quantità frazionaria su pezzi**: unità cad/pz/n con decimali (inverter 0,88; cicogne 767,40).
3. **Barre contate a pezzi ma misurate in metri**: «barra da 3 m» con la lunghezza dentro la misura.
4. **Misura diversa dalla descrizione**: «larghezza 15 cm» nella descrizione, 0,30 nella misura.
5. **Sovrapprezzo «per ogni cm»**: la quantità è m²×cm, non superficie da comprare.
6. **A corpo con quantità diversa da 1** (1,50 a corpo).
7. **Unità superficie con un numero di pezzi nella descrizione** («n. 45 cassonetti», unità m²).
8. **Descrizione abbreviata** («…»): chiedere la voce integrale prima dell'offerta.
9. **Perimetro**: il titolo cita lavori (sismico) che non hanno un capitolo.

Dove: «Genera dal computo» (sezione «Da controllare nel computo», prima dei materiali) e il materiale
che nasce da una voce segnalata porta l'avviso. Nessun blocco: l'impresa decide.

### Lotto 2 — Materiali più fedeli
1. Spessore dal sovrapprezzo «per ogni cm in più» (cappotto 3 cm + 9 cm = 12 cm), senza aggiungere
   superficie.
2. Serramenti: superficie contabile ≠ vani; il numero di pezzi dalla descrizione o dalle misure
   (parti uguali), avviso «ordine da abaco».
3. «Incluso nel pacchetto»: un componente che la voce dichiara compreso (comandi dei fancoil, raccordi)
   non si ordina due volte.
4. Sfrido per tipo (lastre/pannelli 5%, cavi 3-5%, su misura 0%) al posto di uno unico.
5. Quantità netta = fabbisogno + sfrido − magazzino − già ordinato (in parte già c'è: copertura).

### Lotto 3 — Noli, servizi e manodopera
Le voci della sicurezza e delle opere provvisionali (ponteggi, baracche, bagno chimico, piattaforma
con operatore, ore di installatore) non sono materiali: diventano noli/servizi con una durata in mesi
(«per 13 mesi», «mesi successivi 8») e il fornitore, nel piano costi della commessa.

### Lotto 4 — Piano di cantiere e cronoprogramma preliminare
1. Proposta AI di **macrofasi operative** (verifiche e acquisti, cantierizzazione, rimozioni, coperture,
   serramenti, cappotto, impianti, collaudi) con le voci assegnate; la vista per capitolo resta per i conti.
2. **Durata stimata** per sottofase: quantità × produttività (tabella per lavorazione, modificabile)
   e squadra; finestre e dipendenze (rilievi → produzione infissi → posa → cappotto).
3. Il piano si applica alle date delle fasi (esiste già `commessa_pianifica_fasi`).

### Lotto 5 — Piano acquisti nel tempo
Per ogni lotto (infissi, pompe di calore, VMC, cappotto, FV…): anticipo tipico, data in cui serve in
cantiere (dal cronoprogramma), data entro cui ordinare. Sulle bozze d'ordine e nello scadenzario acquisti.

## Stato (17/11/2026, sera)

| Lotto | Stato |
|---|---|
| 1 Controllo del computo | **fatto** (e7a8c0fea): 8 regole, tutte le incongruenze dell'analisi a mano sul PriMus di prova |
| 2 Materiali più fedeli | **fatto in parte** (a4125f720): spessore dai sovrapprezzi, serramenti dall'abaco. Restano «incluso nel pacchetto» e la quantità netta per riga d'ordine |
| 3 Noli, servizi, ore | **fatto** (a35f187d0): tipo, mesi e pezzi dalle misure; fuori dai materiali; elenco in «Genera dal computo» |
| 4 Piano di cantiere | **fatto** (89f643381): rese di partenza (`shared/piano-cantiere/resePartenza.ts`, ultima fonte delle ore); «Pianifica» per la commessa senza cronoprogramma (`pianoDalleLavorazioni`), con avvio e collaudi. PriMus di prova: 185 giorni lavorativi (l'analisi a mano: 11-13 mesi prudenti) |
| 5 Acquisti nel tempo | **fatto** (20290418170000): «ordina entro» usa l'anticipo tipico del materiale (serramenti 70 giorni, macchine 50, FV 45…) quando il fornitore non lo dice; prima 7 giorni per tutto |

### Cosa c'è già per il lotto 4 (da non rifare)
- «Calcola come finire» (`shared/piano-cantiere`): ore per voce da ore scritte → rese dell'azienda →
  costo di manodopera → incidenza del prezzario regionale; giorni, persone, previsione di fine.
- Cronoprogramma calcolato del computo (`cronoCalcolato`): lavorazioni in sequenza, attese fisse.
- Piano delle date dal cronoprogramma del preventivo (`pianoDalCronoprogramma`, `commessa_pianifica_fasi`).

### I due buchi
1. Il prezzario si interroga per **40 voci al massimo** (`testiSenzaManodopera`): su 182 voci ~140 restano
   senza ore. Alzarlo vuol dire più chiamate al database all'apertura (attenzione alla CPU del DB).
2. Una commessa **senza preventivo** non ha un piano delle date: `leggiPianoDellaCommessa` guarda solo il
   cronoprogramma del preventivo.

### Decisioni prese
- Rese: tabella di partenza del gestionale, superata dalle rese dell'azienda (scelta del 17/11/2026).

### Fatto dopo (17/11/2026, sera)
- «Incluso nel pacchetto»: un componente a pezzi della libreria o dell'AI che una voce vicina del computo
  fornisce già (il comando dei ventilconvettori) non si ordina due volte; avviso «già nel computo».
  I «compresi» non si estraggono più dai prodotti su misura né da frasi che non sono materiali.
- Rese dell'azienda per lavorazione intera: Impostazioni → Silvio e le commesse → «Rese di cantiere», in
  «m² al giorno con la squadra»; vincono sulla resa di partenza in tutti i calcoli dei tempi.
- Noli a prezzo mensile senza mesi nelle misure: «2*13» = 2 pezzi per 13 mesi (da confermare).
- Provato su Demo 2: «Pianifica» dà 9 fasi con le date (fine 2 agosto 2027) e «ordina entro» i serramenti
  il giorno stesso, la pompa di calore già in ritardo.

### Resta
- Il piano stimato è più corto dell'analisi a mano (9 contro 11-13 mesi): mancano stagionalità,
  struttura occupata e attese dei fornitori oltre la produzione dei serramenti.

## Ordine di lavoro
Lotto 1 → Lotto 2 → Lotto 3 → Lotto 4 → Lotto 5. Ogni lotto si prova sul computo PriMus di prova
(fixture `computoPrimusGenzano.tsv`) e dal vivo su Demo Azienda 2.
