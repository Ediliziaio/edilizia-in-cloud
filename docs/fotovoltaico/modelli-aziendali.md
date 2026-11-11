# Modelli fotovoltaico per le aziende

Implementazione locale del 10 novembre 2026. Nessuna migrazione, pubblicazione o modifica al database online.

## Due varianti personalizzabili

- `aziendale`: Fotovoltaico aziende, per acquisto diretto, finanziamento o leasing.
- `aziendale-noleggio`: Fotovoltaico aziende · Noleggio operativo.

Sono registrate nel catalogo Modelli → Fotovoltaico e riutilizzano `FotovoltaicoTemplateEditor`, `FvPagesOrderEditor`, l’archivio delle copie aziendali e il renderer originale del PDF privati. Il modello privati e quelli degli interventi esistenti restano disponibili. Le varianti aziendali sono diverse dalle tipologie geometriche dell’impianto: non vengono classificate come integrazioni di accumulo.

Entrambe includono copertina, presentazione e garanzie, come funziona, pianta, componenti, produzione e flussi energetici, investimento, percorso dei lavori, protezione, controlli, documenti, referenze se presenti, FAQ e chiusura. Foto e affermazioni del modello sono illustrative; nessuna certificazione o recensione fittizia viene aggiunta. Marchio e presentazione provengono dalla base aziendale quando disponibili.

Quattro capitoli economici sono ora parte dell’ordine pagine: `azienda_sintesi`, `azienda_flussi`, `azienda_scadenze`, `azienda_ipotesi`. Occhiello, titolo e introduzione sono modificabili nelle rispettive sezioni dell’editor. Riepilogo e ipotesi restano obbligatori; flussi e scadenze possono essere nascosti. Gli anni possono generare più pagine senza perdere righe.

Importi, grafici, avvertenze, IVA e scadenze vengono ricalcolati dagli input del preventivo. Il modello non memorizza coefficienti o importi del cliente. Le condizioni del noleggio restano in Impostazioni → Finanziamenti. Il renderer rifiuta il modello noleggio se la formula non è noleggio e viceversa. Finanziamento e leasing rimangono distinti.

## Copie e anteprima locale

Aprire `http://127.0.0.1:8087/modelli-fotovoltaico` con il server Vite locale. Le due copie sono create in modo idempotente nella namespace locale `demo-azienda-2-locale`, con l’adapter `localStorage` esplicito: non vengono usati upload o sincronizzazioni online. Le modifiche sopravvivono alla riapertura. Le copie hanno revisioni indipendenti; un salvataggio concorrente non viene sovrascritto. Il banco di prova aggiorna una sola volta le foto stock del prototipo iniziale, conservando testi e immagini personalizzate.

Il download dall’esempio GRENKE sceglie la variante per la modalità corrente e usa la copia locale personalizzata, se presente. La funzione `documentoAziendaLocale` non usa più la veste fissa di sei pagine; il numero e l’ordine seguono il modello. Il vecchio PDF a sei pagine in `output/pdf` resta un’istantanea della revisione precedente.

Il campione nell’editor usa dati di impaginazione chiaramente dimostrativi: 120 moduli, 60 kWp e 70.000 euro IVA inclusa. Il noleggio nell’anteprima dei modelli usa una tabella sintetica, dichiarata non contrattuale e diversa dalla tabella GRENKE reale. Il download dall’esempio GRENKE usa invece i suoi input correnti. Nessuna firma o contratto viene allegata alle simulazioni; la pagina finale mostra i passi per completare la proposta.

## Output e verifiche

`output/modelli-fotovoltaico/` contiene i due modelli JSON, le anteprime HTML autonome e i PDF dimostrativi: 19 pagine per acquisto e 18 per noleggio con questi dati. Tutte le immagini sono incorporate e nessuna richiesta esterna serve per aprire i documenti. Le lunghezze cambiano con contenuti, visibilità e durata dei flussi.

Generazione riproducibile: `bun --tsconfig-override tsconfig.app.json dev/fotovoltaico-locale/preparaModelliAzienda.ts`. I PDF sono stampati con Chromium isolato, richieste HTTP bloccate, e verificati con Poppler e controllo dei bordi.

Verifiche: 198 test in 14 file, controllo TypeScript dell’anteprima e build locale. Test su isolamento delle copie, conservazione del privato, ordine/visibilità, titoli con caratteri speciali, formule compatibili, conteggio pagine, assenza di detrazioni residenziali e firme nei campioni. Prova browser di modifica, salvataggio, riapertura e indipendenza della variante noleggio. Lint pulito nei nuovi file; l’editor originale ha due errori di `set-state-in-effect` e due avvisi di variabili inutilizzate già presenti in HEAD, verificati separatamente.

## Bilancio energetico

La pagina dei flussi aziendali usa un’unica scena vettoriale con capannone in prospettiva, pannelli scuri sul tetto e tre direzioni: autoconsumo verde, immissione ocra, prelievo blu. Quantità e percentuali si ricalcolano dai kWh del preventivo; autoconsumo e autosufficienza espongono denominatori distinti. Le frecce con energia nulla non vengono disegnate. I bilanci incoerenti vengono segnalati.

L’edificio e il numero di pannelli nel disegno sono illustrativi: non sono il render del tetto del cliente (che resta nella pagina dedicata). Le frecce indicano la direzione, senza codificare quantità nello spessore; il bilancio annuale non suggerisce contemporaneità degli scambi. Le due anteprime PDF sono aggiornate alla nuova pagina, senza cambiare i calcoli economici. Il privato conserva il suo renderer.

## Variante casa privata

La pagina nativa `flussi` del preventivo privati ora usa la stessa composizione editoriale, con un’abitazione a falde, moduli scuri e terminologia domestica. Il disegno mostra l’accumulo solo se previsto; non assegna kWh alla batteria perché `FvFlows` non separa uso diretto e transito dall’accumulo. Il totale di autoconsumo comprende l’effetto della batteria nel modello attuale, come specificato nella nota. Quantità e percentuali restano derivate dai dati del preventivo.

Anteprima locale dedicata: `http://127.0.0.1:8087/bilancio-casa`. Il selettore confronta le due fixture già presenti nel modello privati (7.400 kWh prodotti e 5.100 kWh consumati): con accumulo 4.200 kWh autoconsumati, senza 2.590 kWh. Nessun salvataggio o collegamento al database. La pagina è un estratto del renderer reale, senza copertina, importi o contratti dimostrativi. Il campione di test PDF precedente aveva consumo 4.200 kWh e flussi per 5.100: il fabbisogno della fixture è ora coerente.

`bun --tsconfig-override tsconfig.app.json dev/fotovoltaico-locale/preparaBilancioCasa.ts` prepara l’HTML autonomo in `output/pdf/anteprima-energia-casa.html`; PDF e PNG della singola pagina sono nella stessa cartella. Verificati il selettore nel browser, l’assenza di elementi fuori pagina, 131 test in 6 file, TypeScript e lint dei nuovi file.
