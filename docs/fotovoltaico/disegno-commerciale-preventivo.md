# Disegno commerciale del tetto — anteprima locale

**Aggiornamento:** la prima pagina dimostrativa è stata sostituita dall’[integrazione nel wizard esistente](integrazione-wizard-esistente.md). I dettagli e gli screenshot della prima anteprima qui sotto descrivono la versione precedente.

Implementato il 10 novembre 2026 nel ramo `codex/fotovoltaico-tetto-facoltativo`.
Anteprima: http://127.0.0.1:8087/ — avvio con
`./node_modules/.bin/vite --config vite.fotovoltaico-locale.config.ts`.

## Comportamento

- Editor reale della fase Impianto: tetto a due falde, falda singola, tetto a L; larghezza e profondità in metri. Disegno di falde aggiuntive o nuovo contorno di una falda esistente; vertici trascinabili.
- Moduli con dimensioni dalla scheda del prodotto (in mancanza, misure esplicitamente indicative); disposizione automatica verticale/orizzontale, selezione della falda, aggiunta, spostamento, rotazione, rimozione e annulla/ripeti.
- Bordo, distanza tra pannelli, ostacoli commerciali di 1 × 1 m, controllo di contenimento anche su poligoni concavi e collisioni. Modifiche a contorno o dimensioni del prodotto evidenziano in rosso i moduli da riposizionare senza cancellarli silenziosamente.
- Il numero dei pannelli realmente disegnati determina quantità e kWp. Le righe economiche e il totale usano le funzioni native `righeComponentiFv` e `calcolaPrezzoFv`. L’automatismo usa la quantità realmente collocabile, anche quando inferiore alla richiesta.
- Quantità numerica bloccata mentre il disegno è attivo; il modello pannello, inverter e accumulo restano modificabili. Ritornando dalla modalità senza mappa si riallineano quantità e potenza al disegno ripreso.
- Bozza nel JSON esistente `layout_overlay`, versione `disegno_commerciale:1`; nessuna migrazione. Salvataggio della fase 5 e del relativo pulsante Salva bozza comprendono le righe native. I progetti emessi mantengono la sola lettura.
- Nel PDF nativo compare la tavola SVG usando gli stessi dati; le immagini satellitari non vengono richieste per questa modalità. La generazione rifiuta una quantità del progetto diversa dal numero di moduli del disegno.
- I vecchi piani satellitari restano consultabili. Il kit a prezzo fisso conserva le proprie quantità: per il disegno modificabile occorre passare alla configurazione a componenti. L’eventuale prezzo manuale a corpo conserva la regola commerciale esistente.
- PVGIS ricava automaticamente i dati solari dalla località anche nel percorso con disegno. La stima non viene presentata come rilievo del tetto.

## Anteprima verificata

La pagina locale monta lo stesso editor del wizard e usa i calcoli nativi. Catalogo, misure e prezzi sono esempi, chiaramente indicati. Salva il disegno nel browser; nessuna chiamata al database di produzione. La sola richiesta remota è la stima pubblica PVGIS da località di esempio (Roma, Milano, Vicenza).

Verificati nel browser: trascinamento, rimozione e annullamento, variazione del prezzo unitario e del modello, disposizione limitata dalla capienza, proposta cliente. Con 16 moduli da 450 W: 7,2 kWp e 6.468 € IVA di esempio inclusa; rimuovendone uno: 6,75 kWp e 6.270 €. Proposta stampabile dal browser e tavola scaricabile come SVG.

Screenshot: `anteprima-disegno-preventivo.png` e `anteprima-proposta-cliente.png`.

## Verifiche

- Suite FV mirata: **481 test superati in 14 file** (geometria, editor, wizard reale, modalità senza mappa, bozze, PDF, prezzi e calcoli server).
- TypeScript mirato: `bun ./node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.fotovoltaico-locale.json --pretty false`, comprende wizard e anteprima. Superato.
- ESLint sui nuovi componenti, helper, anteprima e test: nessun errore o avviso.
- Build dell’anteprima Vite: superata. `git diff --check`: superato.

## Limiti voluti

Si tratta di una disposizione commerciale 2D in pianta, con misure da confermare nel sopralluogo. Fino a 12 falde, 500 pannelli e 100 ostacoli. Le sovrapposizioni delle falde non rappresentano livelli o quote: disegnare superfici adiacenti. Le dimensioni dei pannelli non sono proiettate secondo l’inclinazione della falda. Questa fase non esegue verifiche strutturali, elettriche, stringhe/MPPT, ombreggiamento analitico o compatibilità inverter: la progettazione tecnica verrà sviluppata separatamente.

Nessun push, deploy, migrazione o aggiornamento del database effettuato.
