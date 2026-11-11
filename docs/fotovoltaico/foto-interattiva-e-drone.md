# Foto interattiva, selezione 3D e immagini del drone

Prova locale del 10 novembre 2026 nel ramo `codex/fotovoltaico-tetto-facoltativo`.

## Risultato nel flusso esistente

http://127.0.0.1:8087/?esempio=tetto-reale → **Modifica disposizione pannelli**.

La vista iniziale **Foto + 3D** affianca le due rappresentazioni nella finestra di posa nativa. Sui display più stretti le dispone una sotto l’altra; restano disponibili anche Foto, 3D e Pianta separate. La selezione di pannelli e ostacoli è condivisa tra foto e 3D. Il raycast nel 3D rispetta le superfici dell’edificio, evitando di selezionare pannelli nascosti attraverso le pareti; il trascinamento della camera viene distinto da un clic.

Sulla foto si possono selezionare, aggiungere e trascinare i pannelli, anche tra falde. Durante lo spostamento entrambe le viste mostrano la posizione provvisoria; il rosso evidenzia un tentativo non valido. Il rilascio applica una sola modifica alla cronologia se bordo, ingombri e spazio tra moduli sono rispettati, altrimenti ripristina il disegno precedente. Un semplice clic seleziona senza modificare la posa.

La selezione condivisa offre spostamenti di 5 cm, rotazione centrata del modulo e rimozione. Gli ostacoli si possono spostare con i comandi precisi, ricalcolando le falde coinvolte. **Inquadra falda selezionata**, scelta della falda e **Tetto intero** aggiornano le inquadrature; la foto ha anche i comandi di zoom. La selezione cambia l’evidenza grafica, senza influire su quantità e prezzo.

Quantità, kWp e totale continuano a provenire dalla stessa bozza e dalle funzioni native del preventivo. Annulla/ripeti rimangono quelli dell’editor. Il contesto WebGL viene riutilizzato durante modifiche e trascinamenti; geometrie, materiali, controlli ed eventi vengono rilasciati quando cambiano o la vista si chiude.

## Foto del drone: cosa funziona adesso

La sezione **Hai immagini del drone?** accetta fino a quattro JPG, PNG o WebP da 15 MB ciascuno, con selezione dell’immagine e rimozione. Le foto sono riferimenti visivi temporanei: rimangono nel browser mentre la finestra è aperta, senza caricamento a servizi esterni o salvataggio nel preventivo. Gli URL degli oggetti vengono rilasciati alla rimozione/chiusura. Cambiare la vista di posa non cancella la galleria; chiudere la finestra sì.

Una foto caricata qui non sostituisce l’ortofoto georiferita e non fornisce quote o scala automaticamente. RAW e GeoTIFF richiedono percorsi d’importazione dedicati e non vengono presentati come immagini metriche già utilizzabili. Il test nel browser usa l’ortofoto pubblica del campione come immagine di riferimento; non sono state fornite foto di un drone reale.

## Passo successivo per un rilievo da drone

| Materiale disponibile | Uso | Informazioni necessarie |
| --- | --- | --- |
| Foto singola, anche obliqua | Controllo visivo di tegole e ingombri | Data, immobile e punti di vista; per un’eventuale posa su quella foto occorre un allineamento verificato alla singola falda. |
| Ortofoto di un rilievo | Base per disegno e sovrapposizione metrica | GeoTIFF o immagine con trasformazione, CRS, scala/risoluzione, copertura e data; controllo di corrispondenza con il tetto. |
| DSM o nuvola di punti | Ricostruzione delle quote e degli ostacoli | CRS orizzontale, riferimento verticale, unità, data e controlli del rilievo. |
| Modello 3D con texture | Vista realistica di tetto, facciate e dettagli | Geometria e texture, scala, posizione/orientamento e georeferenziazione verificabili. |

Un’elaborazione fotogrammetrica di più scatti sovrapposti può produrre ortofoto, nuvola e superfici con texture: sono output documentati da [OpenDroneMap](https://docs.opendronemap.org/outputs/). Non si ricostruisce un rilievo affidabile semplicemente trascinando una fotografia nel preventivo. Il limite di quattro immagini riguarda solo la galleria di riferimento, non un futuro dataset fotogrammetrico.

Prima di usare un nuovo rilievo per il 3D commerciale, il sistema dovrà registrare fonte, data, unità, CRS e trasformazione, allinearlo al fabbricato e mantenere le quote stimate distinguibili da quelle rilevate. Ombre e verifiche elettriche/strutturali restano nella progettazione tecnica successiva.

## Verifiche

- **182 test superati in 11 file**: movimento/rotazione e cambio falda, rifiuto delle posizioni non valide, sola lettura, selezione/cancellazione sulla foto, dimensioni e georeferenziazione, cronologia nativa, righe/prezzi e stampa, validazione e ciclo di vita delle immagini locali.
- TypeScript mirato e lint superati. Build Vite locale riuscita; avviso sulla dimensione del bundle del dimostratore.
- Browser: selezione foto → 3D e 3D → foto; trascinamento fuori tetto rifiutato; spostamento valido, trascinamento valido e annullamento; rimozione da 7 a 6 moduli con totale da 4.686 € a 4.488 €, poi ripristino a 7; inquadratura condivisa; caricamento/rimozione dell’immagine pubblica di prova.

Screenshot finale: `anteprima-foto-3d-sincronizzati.png`, con lo stesso pannello evidenziato nelle due viste.

Nessun push, deploy, migrazione o scrittura nel database di produzione. Il campione quotato rimane quello pubblico di Delft: nessun rilievo da drone è stato ricostruito da queste immagini.
