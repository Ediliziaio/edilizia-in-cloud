# Tetto reale, ostacoli e posa nel preventivatore

Aggiornamento locale del **10 novembre 2026**, ramo `codex/fotovoltaico-tetto-facoltativo`.

Per la successiva vista affiancata, la modifica diretta dei moduli e il caricamento delle immagini di riferimento, vedere [Foto interattiva e drone](foto-interattiva-e-drone.md).

## Anteprima

Aprire http://127.0.0.1:8087/?esempio=tetto-reale → **Modifica disposizione pannelli** nella fase Configurazione. La prova ora monta la finestra nativa del wizard, con il suo riepilogo, prezzo, annullamento e conferma; non usa più una pagina con un preventivo separato.

Nella stessa finestra sono disponibili:

- **Foto sul tetto**: ortofoto georiferita con le falde, tutti i pannelli della bozza e gli ingombri inseriti manualmente. **Segna ostacolo sulla foto** permette di trascinare tra due angoli di un rettangolo allineato al piano della falda. Il sistema ricalcola la posa, mantenendo le altre falde.
- **Pianta delle falde**: superfici sviluppate sul proprio piano metrico e separate in una tavola 2 × 2. Si possono aggiungere, spostare, ruotare o rimuovere i pannelli; selezionare/spostare gli ostacoli e regolare X, Y, larghezza e profondità. La tavola non è una mappa geografica e le sue misure sono sul piano inclinato.
- **3D reale**: stessi moduli e ingombri trasformati nelle coordinate XYZ del dataset, senza modificare le dimensioni. Ortofoto proiettata sul tetto e sul contesto piano, pannelli full black, rotazione/zoom e vista dall’alto. La camera conserva il punto di vista quando cambiano i moduli. La texture è disattivabile.

Contorni bloccati nel campione per mantenere l’associazione alla geometria originale. La finestra conserva una sola bozza; **Usa disposizione nel preventivo** applica quantità, kWp e JSON al wizard, mentre **Annulla** conserva la configurazione precedente. La vista aggiuntiva usa la cronologia dell’editor, quindi anche un ostacolo disegnato sulla foto supporta annulla/ripeti.

## Posa e ostacoli nell’editor condiviso

**Confronta pose e allineamenti** prova entrambi gli orientamenti e fino a 16 origini della griglia per orientamento, poi tenta un centraggio del gruppo quando valido. Il confronto è limitato a 120.000 verifiche per chiamata e 500 moduli; non è una ricerca esaustiva del massimo installabile. Rimane disponibile anche il comando di posa originale.

Inserire o modificare un ostacolo è un’operazione atomica: l’ingombro deve restare in una falda e non sovrapporsi ad altri ostacoli; vengono ricalcolate le sole falde coinvolte, conservando i moduli delle altre. Bordo, spazio tra pannelli e ingombri vengono ricontrollati. Quando la quantità diminuisce, il riepilogo nativo mostra immediatamente potenza e totale della bozza. Una modifica rifiutata non altera la disposizione precedente.

## Origine e limiti dei dati

Il campione è un edificio pubblico di Delft, Paesi Bassi: impronta 71,52 m² e quattro superfici di copertura. La geometria proviene da [3DBAG](https://docs.3dbag.nl/en/delivery/webservices/), fonte altimetrica AHN 2023; la foto da [PDOK](https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-). Fonti originali, licenze, crediti, bbox e trasformazioni sono in `dev/fotovoltaico-locale/esempi/README.md`.

Il campione usa le quote originali, triangolate; l’ortofoto usa UV geografiche coerenti con la sovrapposizione in pianta. Materiali delle pareti e luce sono illustrativi. Gli ingombri arancioni sono aree di esclusione manuali, senza altezza rilevata: non rappresentano un camino ricostruito e non producono ombre tecniche. La foto non rileva automaticamente camini o abbaini e può avere una data diversa dal modello. Distanza dal bordo di 30 cm e modulo di 1,134 × 1,762 m sono parametri di esempio.

Il modello precedente del wizard conserva la sua vista illustrativa per i disegni manuali. Il campione reale e la sua fonte restano nel codice di sviluppo: questa prova non è un importatore per gli immobili italiani. Prima di una pubblicazione del 3D reale servono una fonte per indirizzo, metadati di origine/CRS/quote persistiti e un contratto per associare ogni falda alla geometria. Il JSON commerciale del campione conserva la tavola di posa; la trasformazione XYZ è ricavata dalla fonte pubblica locale.

## Percorso verso la progettazione

| Livello | Dati necessari |
| --- | --- |
| Preventivo veloce | Quantità, potenza, listino, località per la stima solare; disegno facoltativo. |
| Foto e disegno | Immagine georiferita o con scala/orientamento, contorni delle falde, misure moduli e ingombri conosciuti. |
| 3D fedele | Vertici XYZ oppure altezze di gronda/colmo, pendenze e orientamenti misurati; ostacoli quotati, fonte e data. |
| Progettazione tecnica | Rilievo validato, alberi/edifici vicini e ostacoli, meteo/sole, schede moduli e inverter, stringhe/MPPT, vincoli di posa e strutturali. |

Una foto da sola non determina tutte le quote. LiDAR/DSM o fotogrammetria da drone sono fonti utili; si possono anche inserire quote e pendenze misurate manualmente. [Solarvis](https://solarvis.co/it/solutions/solar-3d-design) descrive sia LiDAR sia pendenze manuali, oltre a ombre e verifiche elettriche: sono dichiarazioni del produttore, non funzioni provate con una loro utenza.

Per l’Italia occorre verificare [copertura Google Solar per il singolo indirizzo](https://developers.google.com/maps/documentation/solar/coverage), oppure una fonte DSM regionale o un rilievo autorizzato. Le [Data Layers](https://developers.google.com/maps/documentation/solar/data-layers) comprendono DSM, RGB, maschere e dati solari, con credenziali, URL temporanei e condizioni da gestire. La documentazione [EEA](https://developers.google.com/maps/comms/eea/solar) non indica una rimozione generale di DSM/RGB.

La funzione esistente `fv-solar-api-fetch` conserva parte dei dati dei segmenti ma non il contratto completo delle falde quotate; limita inoltre la lettura dei pannelli a 50 e usa 540 W come ripiego. Questi aspetti richiedono una revisione prima di collegare un importatore reale. Questa modifica non tocca la funzione server, migrazioni o dati di produzione.

## Verifiche

- **171 test superati in 8 file**: georeferenziazione foto/modello, quote e superfici, posa e ostacoli, conservazione delle altre falde, quantità/prezzi, editor, wizard e stampa nativa.
- TypeScript mirato e lint dei componenti/helper/test modificati superati. Build locale riuscita; resta l’avviso sulle dimensioni del bundle del wizard e della libreria 3D nel dimostratore.
- Browser: con 11 moduli iniziali, un ingombro disegnato sopra i pannelli produce una proposta da 7 moduli, 3,15 kWp e 4.686 € di esempio, mentre il preventivo resta a 11 moduli e 5.478 € fino alla conferma. Verificati annulla/ripeti, chiusura con Annulla, conferma nel preventivo e ripresa del disegno confermato con gli stessi ingombri e valori.
- Le coordinate dell’ingombro del test sono una simulazione: non attestano un ostacolo rilevato né una posa fattibile sull’immobile.

Screenshot: `anteprima-ostacolo-foto-wizard.png` e `anteprima-ostacoli-3d-wizard.png`. La precedente `anteprima-tetto-reale-3d.png` documenta la prima prova separata, antecedente all’integrazione nella finestra nativa.

Nessun push, deploy o aggiornamento al database. Salvataggio della prova nel solo browser locale, separato dal precedente esempio di Roma.
