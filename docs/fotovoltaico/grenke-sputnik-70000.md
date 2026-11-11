# GRENKE SPUTNIK++ e simulazione aziendale da 70.000 euro

Lavoro locale del 10 novembre 2026. Nessun caricamento nel database o nell’azienda di produzione. L’utente ha autorizzato l’alternativa nell’anteprima locale; la cartella di lavoro e l’archivio del browser identificano il caso come `demo-azienda-2-locale`.

## Documento importato

Fonte: PDF `Tabella_Sputnik++++ (1).pdf`, verificato integralmente con testo estratto e immagine della pagina. Sono conservati il PDF originale, il suo SHA-256, il CSV verificato e la trascrizione JSON sotto `dev/fotovoltaico-locale/esempi/grenke/`.

36 righe: durate 24, 30, 36, 48, 60 e 72 mesi; sei fasce da 500 a 100.000 euro netti. I coefficienti sono percentuali **mensili** del valore del bene e i pagamenti sono **trimestrali anticipati**. Le fasce sono quelle letterali del documento: nessuna estensione oltre 100.000 euro o sugli intervalli non descritti.

La pagina non riporta date di validità. L’assicurazione è obbligatoria, non inclusa nei coefficienti e non quantificata. Non sono specificati costi accessori o un acquisto finale. La versione importata è quindi utilizzabile solo per simulazione: date lasciate vuote, avvisi espliciti, emissione commerciale bloccata. Non è contrassegnata come tabella sintetica: i coefficienti provengono dal documento. Importazione in IndexedDB, con originale conservato; caricamento idempotente per UUID, senza sovrascrivere dati o altre versioni.

## Progetto dimostrativo

- Totale richiesto: 70.000,00 euro IVA inclusa, con IVA del 22% esplicita per questo esempio; imponibile 57.377,05 euro.
- Capannone parametrico 30 x 20 m, altezza 8 m. È uno schema dimostrativo, non un rilievo del cliente.
- 120 moduli da 500 Wp, 60 kWp, strutture est-ovest a 10 gradi e corridoio centrale. Inverter trifase da 50 kW come componente dimostrativo da verificare tecnicamente.
- Località dimostrativa Roma. Risposte ufficiali PVGIS-SARAH3 consultate il 10/11/2026, esposizioni ovest/est a 10 gradi: H(i)_y 1.632,90 / 1.639,68 kWh/m². Media ponderata sui 64/56 moduli: 1.636,064. Con il fattore del preventivatore 0,7565: 74.260,94 kWh/anno. Profilo mensile derivato da H(i)_m e conservato nel file verificato. L’archivio viene usato solo quando località e gruppi geometrici coincidono esattamente, senza fallback a dati di un altro edificio.
- Ipotesi dimostrative: consumo 90.000 kWh/anno ripartito uniformemente, quota di autoconsumo 80% soggetta al limite mensile dei consumi, energia evitabile 0,22 euro/kWh, costi fissi bolletta 1.800 euro/anno, cessione valorizzata a zero. Nessun recupero IVA o beneficio fiscale incluso. Non sono dati del cliente.

## Risultati riproducibili

| Durata | Coeff. mese | Equivalente mensile + IVA | Canone trimestrale + IVA | Totale canoni IVA inclusa |
|---|---:|---:|---:|---:|
| 60 mesi | 2,218% | 1.272,62 € | 3.817,87 € | 93.156,00 € |
| 72 mesi | 1,936% | 1.110,82 € | 3.332,46 € | 97.574,40 € |

Arrotondamento al centesimo per scadenza; l’equivalente mensile è informativo. Il piano contrattuale andrà confermato dal fornitore.

Risparmio in bolletta stimato al primo anno: 12.777,29 euro; bolletta residua: 8.822,71 euro. A 60 mesi la cassa cumulata è **-29.741,08 euro**, a 72 mesi **-21.616,77 euro**, prima del premio assicurativo e dei costi accessori da quotare. Il risparmio nelle ipotesi scelte non copre i canoni. Non vengono azzerati i saldi negativi o aggiunti benefici dopo la scadenza di un bene di cui non è stato concordato l’acquisto.

## Documento aziendale

Il PDF usa lo stesso `renderFvPdfHtml` dell’app e le sezioni economiche condivise. Sei pagine: copertina con render e sintesi; pianta con fornitura e valore del bene; canoni con confronto 60/72 mesi; cassa annuale; scadenze del primo anno; ipotesi e fonti. La veste compatta è attivata esplicitamente solo per questa simulazione locale (`simulazione_azienda_compatta`), mantenendo il percorso commerciale esistente. Nessuna detrazione residenziale, firma o contratto nella simulazione. Render e pianta derivano dagli stessi 120 moduli e dal modello usato nell’editor, incluso il corridoio centrale. È un’illustrazione geometrica, non una foto generata del cliente.

Documento completo aggiornabile dal bottone locale «Scarica documento aziendale con tetto e render». L’HTML si stampa con il motore nativo. Il PDF consegnato è stato stampato con Chromium usando un profilo temporaneo isolato e senza richieste HTTP; testo vettoriale, A4, fondi di stampa attivi. Controllo delle sei pagine con Poppler e misura degli elementi: nessuna uscita dal bordo pagina.

Output: `output/pdf/simulazione-azienda-grenke-70000.pdf` e relativo HTML, JSON degli input congelati, render SVG e pianta SVG. Il generatore locale è `dev/fotovoltaico-locale/generaDocumentoGrenke.ts`.

Anteprima: `http://127.0.0.1:8087/?esempio=grenke-70000`.
Archivio della tabella: `http://127.0.0.1:8087/azienda/impostazioni/finanziamenti?tipo=noleggio&company=demo2`.

## Revisione della fase 6 e del PDF

La fase Finanza mette in primo piano risparmio annuo, confronto tra bolletta prima/dopo e canone effettivo IVA inclusa. L’equivalente mensile è separato dal pagamento trimestrale. Le quattro formule restano distinte: acquisto, finanziamento, leasing e noleggio. Condizioni, confronto e flussi hanno viste separate; consumi, IVA e fiscalità sono modificabili nei dettagli. Le viste supportano anche frecce, Home ed End da tastiera. I saldi negativi e i costi da confermare restano visibili.

Il documento usa una nuova veste chiara con render a tutta larghezza, pianta ingrandita, tipografia verde scuro, grafico quotato e tabelle semplificate. Il dettaglio delle ipotesi conserva fonte, assicurazione da quotare, fiscalità e profili mensili. I dati e le formule di calcolo non sono cambiati.

Verifiche: 123 test in 11 file, TypeScript dell’anteprima, lint dei file modificati e build locale. Prova browser di tab, tastiera e cambio 60/72 mesi. PDF A4 di 6 pagine controllato con Poppler, senza contenuto fuori bordo. Screenshot `grenke-finanza-ridisegnata.jpg`. Nessun push, deploy o modifica al database online.

## Modelli aziendali personalizzabili

La revisione successiva sostituisce il download compatto locale con i due modelli aziendali riordinabili. L’istantanea a sei pagine rimane in questa cartella; il nuovo percorso è descritto in `modelli-aziendali.md`. L’esempio GRENKE legge la copia personalizzata della variante noleggio della stessa azienda locale, mantenendo i coefficienti e i dati della propria simulazione.
