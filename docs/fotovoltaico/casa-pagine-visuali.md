# Fotovoltaico casa: pagine visuali

Sviluppo locale del 10 novembre 2026. Nessuna pubblicazione o modifica al database. La copertina non è stata modificata.

## Integrazione nel renderer e nei modelli

- `risparmio`: confronto della bolletta del primo anno con due colonne, kWh acquistati, quota proporzionale, quote fisse se disponibili e ricavi da cessione separati. I valori derivano dai flussi del preventivo e dalla tariffa indicata, senza ripartizioni percentuali inventate fra oneri, imposte e trasporto.
- `cassa_25`: andamento sui punti della serie calcolata. Terracotta per i saldi negativi e verde per quelli positivi, con intersezioni grafiche interpolate allo zero senza modificare i punti del calcolo. Recupero stimato, pagamenti e saldo finale restano distinti. Nessuna data di pareggio viene inventata; il saldo esattamente nullo è un pareggio, non un guadagno.
- `giorno_sera`: nuova pagina privata configurabile, con casa diurna e serale. La batteria e il suo percorso compaiono solo se previsti. Nessuna quantità oraria viene dedotta dal bilancio annuale; non viene promessa alimentazione in blackout.
- `schede_prodotti`: nuova pagina privata configurabile, con immagini degli articoli, spiegazione del ruolo del componente, marca/modello, quantità, specifiche e garanzie se presenti. Senza foto viene usato uno schema senza valori tecnici fittizi. Le immagini di categoria sono indicate come illustrative. Le schede sono distribuite su più pagine; la tabella completa della fornitura rimane disponibile.

- `decisione`: sintesi privata con prezzo IVA inclusa, configurazione, produzione stimata, minor costo energetico, copertura dei consumi, pagamento, recupero confermato e prossimo passo. La rata resta distinta dal beneficio energetico. Titolo, testo personalizzato, referente e istruzioni di firma sono conservati. I casi con molto testo aggiuntivo o una foto personalizzata nella pagina finale mantengono l’impaginato precedente per non eliminare contenuti.
- Il riepilogo usa il disegno commerciale salvato solo se quantità e posizioni risultano coerenti. Senza un disegno idoneo usa il render associato, quando disponibile e senza una geometria incoerente, oppure un’illustrazione dichiarata generica. La tavola nativa del tetto ha altezza limitata per tenere la nota sopra il piè di pagina.

Le due nuove pagine sono registrate nell’elenco condiviso fra editor e PDF e nascono spente nei modelli già salvati: si possono attivare e riordinare nelle impostazioni delle pagine. Il campione locale le attiva entrambe. Non entrano nelle varianti aziendali o nei moduli per interventi parziali. Il conteggio e i piè di pagina considerano tutte le schede effettivamente stampate.

Il campo opzionale `progetto.costi_fissi_annui_eur` è solo un input del contesto PDF. Se non è disponibile, la pagina dichiara le quote fisse non separate e non presenta gli importi come totale futuro della bolletta. Quando è fornito, la tariffa sui kWh deve escludere i costi fissi. Non è stata aggiunta una colonna o una migrazione al database.

## Anteprima locale e dati del campione

Aprire `http://127.0.0.1:8087/preventivo-casa-design`. Sette schede: tetto configurato, bilancio energetico, giorno/sera, prodotti, bolletta, investimento e riepilogo finale. Il selettore con/senza accumulo aggiorna flussi, componenti, prezzo e serie economica. Il selettore disegno/illustrazione cambia soltanto la presenza della disposizione campione, senza modificare prezzi o risultati; senza disegno le pagine diventano sei.

Il campione usa i flussi già presenti nella fixture privata: 7.400 kWh di produzione e 5.100 kWh di consumo; autoconsumo di 4.200 kWh con batteria e 2.590 kWh senza. Prezzi dimostrativi IVA inclusa di 18.000 e 11.000 euro. Tariffa variabile 0,32 euro/kWh, costi fissi 180 euro/anno, gestione 100 euro/anno, degrado 0,5%, tariffa costante; nessun ricavo per cessione, finanziamento o beneficio fiscale. Sono ipotesi dichiarate nell’anteprima, non offerte commerciali o condizioni fiscali attribuite al cliente. Le immagini prodotto del campione provengono dalle risorse locali e sono illustrative.

`bun --tsconfig-override tsconfig.app.json dev/fotovoltaico-locale/preparaCasaCompleta.ts` prepara un HTML autonomo con immagini incorporate in `output/pdf/fotovoltaico-casa-design.html`. Il PDF di sette pagine e le immagini riepilogative si trovano nella stessa cartella. `anteprima-casa-grafico-riepilogo.png` confronta le due pagine principali. Gli estratti usano le pagine native, senza copertina o contratti. Il flag esplicito `anteprima_dimostrativa` esclude firme e contratti dal solo campione; i preventivi reali mantengono il flusso di accettazione e il corretto numero di pagine.

## Verifica

209 test in 9 file, controllo TypeScript, lint dei nuovi file e build locale. Test su quote fisse, ricavi separati, consumi completamente autocoperti, tariffa non valida, accumulo opzionale, serie economiche assenti o duplicate, saldi negativi, paginazione, XSS, visibilità e numero di pagine. Conservata la formattazione delle rate tonde e al centesimo. Verificati tutti i sette fogli e i bordi rispetto al piè di pagina, inclusa la nota della tavola del tetto. Verificate anche sintesi con finanziamento e testo personalizzato. Nel browser sono stati provati con/senza batteria, disegno/illustrazione e riepilogo. Test aggiuntivi su cambi di segno ripetuti, pareggio esattamente nullo, disposizione incoerente o sovrapposta, XSS, rate/anticipo/TAEG e conservazione delle firme nei preventivi reali.
