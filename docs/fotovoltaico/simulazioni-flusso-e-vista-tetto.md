# Flusso, simulazioni e resa del tetto

Aggiornamento locale del 10 novembre 2026 nel ramo `codex/fotovoltaico-tetto-facoltativo`.

## Flusso verificato e corretto

Il disegno rimane nella finestra facoltativa della fase Configurazione del wizard esistente. Le modifiche sono ora una bozza della disposizione: il footer mostra numero moduli, kWp e totale IVA inclusa, usando `anteprimaFotovoltaico` con listino, servizi, sconti/regole aziendali, IVA e prezzo a corpo della configurazione reale. **Usa disposizione nel preventivo** applica i dati; **Annulla**, Escape e la chiusura della finestra conservano il preventivo iniziale. Anche riprendere un disegno escluso dal PDF non sostituisce le quantità prima della conferma.

La finestra mantiene il footer fuori dall’area scorrevole, con riepilogo e azioni sempre raggiungibili. I comandi del disegno sono divisi tra **Tetto e misure** e **Pannelli e posa**.

Correzioni emerse nelle simulazioni:

- La ridisposizione su una sola falda conserva i moduli delle altre e mantiene ID univoci, rispettando il limite totale di 500 moduli.
- La selezione della falda mostra la sua quantità, distinguendola dal totale dell’impianto.
- Annulla/ripeti ripristinano anche misure e forma, evitando campi diversi dal tetto effettivamente visualizzato.
- Il trascinamento consente il passaggio tra falde quando la destinazione è libera e il modulo vi rientra.
- Ridurre lo schema segnala la quantità realmente collocabile. Gli ostacoli vengono conservati; lo schema non si applica se ne lascerebbe uno fuori dal tetto.
- I pannelli fuori falda o sovrapposti sono evidenziati e impediscono la conferma; il controllo è presente anche nel salvataggio nativo e nella generazione PDF.

## Aspetto e vista della casa

I pannelli hanno una resa grafica **full black**, bordi sottili e griglia delle celle discreta. La tavola 2D del PDF usa la stessa finitura scura.

**Vista della casa** rappresenta i poligoni e i moduli effettivi del disegno su un fabbricato illustrativo. I moduli vengono proiettati sul piano della relativa falda, con un minimo distacco grafico dalla copertura. Sono disponibili quattro punti di vista e copertura antracite o tegole. Cambiare vista, copertura o rotazione non modifica quantità o prezzi. Scarica tavola esporta la vista attualmente selezionata in SVG.

È una visualizzazione commerciale, non una ricostruzione dell’immobile reale: altezze, pendenze, finestre e finitura della copertura sono convenzionali e non sono dati tecnici del progetto o caratteristiche garantite della fornitura. Le due falde rettangolari standard sono mostrate inclinate; gli altri contorni usano una copertura piana illustrativa. Non vengono calcolati ombre, strutture, stringhe o compatibilità elettrica. Il PDF nativo conserva la tavola in pianta; la vista illustrativa è esportabile dall’editor.

## Simulazioni e verifiche

- **549 test superati in 15 file**.
- 36 combinazioni di forma (due falde/singola/L), misure (4 × 4, 8 × 6, 14 × 10 m), posa verticale/orizzontale e modulo da 450/500 W: contenimento, quantità effettive, kWp, righe/prezzi e ripresa del JSON.
- 24 viste della casa: tre forme, quattro rotazioni e due coperture; SVG valido, numero moduli identico e dati di partenza invariati.
- Wizard reale: modifica temporanea, annullamento, conferma e ripresa di un disegno escluso dal PDF senza sostituzione involontaria delle quantità.
- Browser locale: con 16 moduli da 450 W, la rimozione mostra 15 moduli, 6,75 kWp e 6.270 € nella bozza; il preventivo iniziale resta a 16 moduli, 7,2 kWp e 6.468 € finché non si conferma. Annulla conserva i valori iniziali.
- TypeScript mirato, ESLint sui componenti/helper/test modificati e `git diff --check`: superati. Build Vite locale riuscita; resta l’avviso sulle dimensioni dei bundle del wizard completo.

Anteprima: http://127.0.0.1:8087/ — **Modifica disposizione pannelli → Vista della casa**.
Screenshot: `anteprima-casa-full-black.png` e `anteprima-casa-tegole-full-black.png`.

Nessun push, deploy, migrazione o aggiornamento al database di produzione.
