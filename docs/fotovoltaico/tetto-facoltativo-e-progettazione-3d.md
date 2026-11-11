# Preventivatore fotovoltaico: tetto facoltativo e sviluppo 3D

Analisi del 9 novembre 2026. Lavoro nel branch locale `codex/fotovoltaico-tetto-facoltativo`, partendo da `ff9d53158`. Nessun push, rilascio o intervento sul database di produzione.

## Modifica locale realizzata

I nuovi preventivi partono con **Preventivo senza mappa**. La scelta resta del singolo preventivo: si può passare ad **Analisi del tetto** nella fase Tetto o nella configurazione dell'impianto. I progetti esistenti con `layout_overlay = null` conservano il comportamento precedente.

Nel percorso senza mappa:

- Si selezionano componenti e numero di moduli dal catalogo. Un campo numerico consente anche impianti oltre i 60 moduli del vecchio cursore; la potenza segue i watt del pannello selezionato.
- La stima energetica viene ricavata automaticamente da PVGIS entrando nella fase Tetto, usando la località già selezionata nella fase Immobile, senza disegnare il tetto. Le ore equivalenti sono nascoste nelle impostazioni avanzate; non sono richieste all’utente nel percorso normale. Cambiando coordinate, stima e geometria precedenti vengono invalidate; una risposta ancora in corso del vecchio indirizzo viene ignorata. Il percorso PVGIS attuale assume sud e 30°; queste ipotesi sono dichiarate nella schermata.
- Non vengono caricate viste satellitari nelle fasi Tetto e Impianto. Nel codice locale del generatore PDF vengono escluse anche le richieste delle immagini e le pagine di satellite/piano di posa.
- PVGIS non genera superficie, numero massimo di pannelli o potenza massima. Prima il wizard suppliva ai dati assenti con 60 m², circa 30 pannelli e un riferimento da 540 W: questi limiti fittizi sono rimossi.
- L'assenza di geometria viene segnalata come verifica da fare con sopralluogo. Un limite già noto superato, un componente mancante o un prezzo da completare conservano i rispettivi controlli.
- Un piano già disegnato viene conservato nella scelta senza mappa e ripristinato tornando all'analisi del tetto.

La preferenza viene conservata nel JSON già esistente `fv_progetti.layout_overlay`, con discriminante `modalita: "senza_mappa"` ed eventuale `piano_precedente`. È salvata dalla creazione, dalla fase Tetto, dalla configurazione e dal salvataggio bozza; la normalizzazione del draft locale riconosce entrambe le forme. Non serve una nuova colonna. Il layout precedente resta compatibile.

Per una futura pubblicazione occorrerà rilasciare insieme frontend, `fv-onboarding-cliente` e `fv-genera-pdf`. Non sono stati pubblicati. I test usano dati sintetici e servizi simulati. Nell’anteprima locale è stata anche interrogata l’API pubblica PVGIS per località di esempio (Roma e Milano): nessun account, preventivo o calcolo è stato creato nel database di produzione.

## Cosa c'è già nel progetto

| Area | Stato del codice analizzato | Limite attuale |
|---|---|---|
| Cliente, catalogo, distinta, prezzi, PDF | Presenti nel wizard nativo | Da integrare con il futuro progetto geometrico mantenendo un'unica fonte di quantità |
| Google Solar | Edificio, orientamento e pendenza prevalenti, disposizione suggerita | Si usa Building Insights; non è un modellatore 3D modificabile |
| PVGIS | Irraggiamento e stima energetica | Non rileva poligoni, ostacoli o capienza del tetto |
| Posa satellitare | Un gruppo di pannelli trascinabile, rotazione, colonne, orientamento e misure | Non ci sono falde editabili, ostacoli, corridoi o controllo di collisione |
| Stringhe | Dimensionamento preliminare con controlli di tensione | Il wizard deriva le specifiche del modulo dalla potenza e usa un inverter di riferimento; il componente stesso indica che le specifiche esatte sono da integrare |
| Librerie | Three.js e Leaflet già nelle dipendenze | La loro presenza non costituisce un motore di progettazione e simulazione |

Riferimenti nel codice: `FotovoltaicoWizard.tsx`, `FvPianoTetto.tsx`, `FvDimensionamentoStringhe.tsx`, `src/lib/fotovoltaico/stringhe.ts`, `_shared/fvPianoTetto.ts`, `fv-solar-api-fetch`, `fv-pvgis-fetch`, `fv-calcolo-finanziario`.

## Confronto con Solarvis

Solarvis presenta un sistema che comprende modellazione del tetto, posa automatica o manuale, ostacoli, analisi delle ombre, stringhe/MPPT e simulazione energetica oraria. La pagina descrive inoltre uso di immagini satellitari e LiDAR. Sono capacità dichiarate dal fornitore: in questa analisi non è stato collaudato un suo account.

Fonti del confronto: [progettazione 3D Solarvis](https://solarvis.co/it/solutions/solar-3d-design), [panoramica del prodotto](https://solarvis.co/it).

Possiamo costruire funzioni equivalenti per il nostro flusso. Una scena con un tetto e rettangoli 3D è solo una visualizzazione: non dimostra fattibilità della posa, compatibilità elettrica o precisione della produzione.

## Ordine di sviluppo consigliato

### 1. Percorso commerciale senza mappa

È la modifica implementata localmente. Consente alle aziende di preparare l'offerta senza affrontare una progettazione geometrica. I dati mancanti restano indicati, senza fabbricare misure.

### 2. Editor del tetto in pianta

Salvare falde poligonali in metri, pendenza e azimut per falda, ostacoli, distanze e aree escluse. Posizionare singoli moduli con dimensioni dal catalogo; consentire selezione multipla, rotazione, annullamento/ripristino e salvataggio delle revisioni. Il riempimento automatico deve rispettare perimetri, ostacoli e distanze configurate.

Una sola rappresentazione geometrica alimenta editor, distinta, PDF e successiva vista 3D. Vanno definiti esplicitamente proiezione, origine geografica, scala, quote e unità: non salvare posizioni percentuali dello schermo.

### 3. Vista 3D dello stesso progetto

Costruire le superfici dalle falde e dalle quote, visualizzare moduli e ostacoli, consentire rotazione della camera e passaggio 2D/3D. Three.js è già disponibile. Non costruire un secondo modello indipendente che possa divergere dalle quantità del preventivo.

### 4. Verifica elettrica dai componenti reali

Completare nel catalogo Voc, Vmpp, Isc/Impp, coefficienti termici, ingressi e limiti MPPT, potenza e tensione DC ammesse. Collegare le stringhe ai moduli effettivi e agli ingressi dell'inverter scelto. Specifiche mancanti devono risultare non verificate, senza dichiarare una compatibilità sulla base di componenti generici.

### 5. Ombre e simulazione oraria

Servono geometria 3D e ostacoli affidabili, posizione solare, dati meteo orari, un modello elettrico e una validazione su casi noti. Separare l'ombra visiva in una scena dalla perdita energetica: una percentuale uniforme non modella l'effetto dei diodi di bypass o degli MPPT. Batterie e autoconsumo richiedono profili orari di consumo e regole di funzionamento documentate.

### 6. Rilevamento automatico del tetto

Valutare API/dati disponibili per ogni edificio prima di costruire un motore proprietario. Prevedere correzione manuale e provenienza/qualità dei dati. Copertura, condizioni d'uso e costi dei fornitori sono dipendenze effettive del prodotto.

Google documenta Building Insights e Data Layers/GeoTIFF per dati dell'edificio, modello di superficie, flusso solare e ombre; la copertura va verificata sul sito e può avere zone non disponibili. Le limitazioni per progetti con fatturazione SEE vanno verificate prima di fissare l'integrazione. PVGIS fornisce dati di irraggiamento/produzione e serie temporali; l'integrazione deve passare dal backend perché il servizio non ammette chiamate AJAX dal browser.

Fonti tecniche: [Google Solar overview](https://developers.google.com/maps/documentation/solar/overview), [copertura](https://developers.google.com/maps/documentation/solar/coverage), [adattamenti SEE](https://developers.google.com/maps/comms/eea/solar), [API PVGIS/JRC](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en).

## Complessità e tempi indicativi

Stime tecniche orientative di lavoro aggiuntivo per uno sviluppatore esperto a tempo pieno, con dati/API e catalogo disponibili; comprendono verifiche ma non garantiscono le date. Le attività si sovrappongono e i tempi non si sommano come un preventivo commerciale.

| Obiettivo | Complessità | Ordine di grandezza |
|---|---|---|
| Rendere facoltativa la mappa | Contenuta | Prima versione locale realizzata in questa attività |
| Editor 2D con falde, ostacoli e posa coerente | Media | 2–4 settimane |
| Vista 3D coerente con l'editor 2D | Medio-alta | 3–6 settimane aggiuntive |
| Stringhe sui dati reali di catalogo | Medio-alta | 2–4 settimane, oltre alla raccolta delle specifiche |
| Ombre e simulazione oraria validate | Alta | 6–12 settimane o più, dopo geometria e dati |
| Parità estesa con l'insieme delle funzioni Solarvis | Molto alta | Diversi mesi, con competenze di sviluppo e validazione fotovoltaica |

La priorità proposta è: percorso rapido già realizzato, poi editor 2D e catalogo elettrico, quindi 3D e simulazione. Il 3D non deve diventare un requisito per le aziende che vogliono solo preparare un'offerta.

## Verifica locale

Sono coperti da test navigazione senza mappa, chiamata PVGIS simulata senza geometria inventata, payload della creazione, scelta persistita nella fase Tetto, 200 moduli con potenza del pannello scelto, ripresa di un disegno precedente, validazione dei dati e omissione/conteggio delle pagine PDF.

Il comando di verifica delle 12 suite è riportato in `verifica-locale.txt`, insieme agli esiti. La prova che scansiona tutto il repository richiede sul computer corrente un timeout di 20 secondi, senza modificare il test né la configurazione generale.


## Anteprima locale pronta

La fase Tetto reale è disponibile su http://127.0.0.1:8087/ durante l'esecuzione del server. L’anteprima usa località di esempio e un adattatore senza client Supabase. Le stime arrivano dall’API pubblica PVGIS tramite un proxy locale su loopback; il browser non può connettersi direttamente a servizi esterni. Non richiede credenziali e non crea progetti. Il proxy di sviluppo usa PVGIS 5.3/SARAH3; l’integrazione server esistente del prodotto resta invariata su PVGIS 5.2/SARAH2.

Avvio dalla cartella del worktree:

```sh
./node_modules/.bin/vite --config vite.fotovoltaico-locale.config.ts
```

Verificati nel browser il cambio tra i due percorsi, la stima automatica reale per Roma e il ricalcolo scegliendo Milano, mantenendo chiuse le impostazioni avanzate e senza superficie/capienza inventate. Screenshot: `anteprima-senza-mappa.jpg`. Questa anteprima riguarda la fase Tetto; le altre fasi sono verificate nei test del wizard nativo.


Esito finale delle verifiche del codice: 478 test passati (447 FV e 31 indirizzi) e controllo TypeScript mirato senza errori su wizard, nuovi moduli e dipendenze (`tsconfig.fotovoltaico-locale.json`). Una piccola annotazione di ritorno esplicito nel callback del campo indirizzo risolve il tipo implicito segnalato dal controllo. La build dell'anteprima è passata. Il lint del wizard conserva le stesse 10 segnalazioni e 2 avvisi del codice di partenza: nessuno nuovo, confrontando anche le righe interessate. Il controllo TypeScript generale dell'intero repository è stato interrotto per durata e non è dichiarato completato; la verifica mirata è documentata separatamente.
