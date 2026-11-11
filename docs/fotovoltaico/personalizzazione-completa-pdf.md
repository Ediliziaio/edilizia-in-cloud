# Personalizzazione del PDF fotovoltaico

L’editor del modello include «Testi e immagini di tutte le pagine». La selezione della pagina segue il documento effettivamente generato nella configurazione corrente, comprese le pagine condizionali attivate.

- Titoli, paragrafi, didascalie, etichette di tabelle e grafici si modificano e si vedono nell’anteprima live.
- Le foto standard, le icone e le illustrazioni possono essere sostituite, nascoste e ripristinate. Le illustrazioni della casa e del capannone si sostituiscono senza cancellare i flussi e i dati energetici.
- Ogni testo o immagine può tornare allo standard. Senza personalizzazioni il renderer mantiene l’HTML originale.
- I segnaposto dei dati automatici devono essere mantenuti: quantità, prezzi, rata e percentuali continuano a provenire dal preventivo. Le foto dei prodotti si modificano nel Listino, il tetto e il rilievo nel preventivo.
- Salvare il modello conserva le modifiche per la sua azienda e variante. Nella demo locale il salvataggio avviene solo nel browser; non scrive nel database online.

## Anteprime locali

- Casa: http://127.0.0.1:8087/modelli-fotovoltaico?modello=nuovo&section=page_testi_immagini
- Azienda: http://127.0.0.1:8087/modelli-fotovoltaico?modello=aziendale&section=page_testi_immagini
- Noleggio: http://127.0.0.1:8087/modelli-fotovoltaico?modello=aziendale-noleggio&section=page_testi_immagini

L’anteprima casa usa il documento completo e il finanziamento dimostrativo. La configurazione della pagina monitoraggio si gestisce nella sezione dedicata.

## Persistenza e rendering

Nessuna nuova colonna: le modifiche risiedono nel JSON esistente `pdf_blocchi`.

- `fv_testi_completi`: `{versione: 1, testi: {[id]: testo}}`.
- `fv_media_<id>`: `{foto: [riferimento], nascosta: boolean}`.

Le immagini usano il flusso esistente di caricamento e firma dei file privati. Il renderer incorpora i media personalizzati come gli altri blocchi. I valori dei testi vengono escapati; non si accetta HTML libero. I collegamenti immagine eseguibili vengono rifiutati. L’editor avvisa se il contenuto oltrepassa il fondo pagina; i testi lunghi devono essere verificati nel PDF esportato.

Gli identificatori derivano da sezione, tipo e testo standard con i dati sostituiti da segnaposto. Cambiare i dati del preventivo non cambia l’identificatore. Una futura revisione del testo standard può generare un nuovo identificatore e richiedere di riapplicare la personalizzazione di quel campo.

## Verifica

Test automatici su modifica/ripristino, escaping, segnaposto, sostituzione immagini, firma/incorporazione, conservazione dei flussi e pagine complete. Verificato nel browser locale il ciclo modifica → anteprima → salvataggio → ricaricamento → ripristino del modello casa; controllato anche il catalogo aziendale.
