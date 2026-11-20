# OCR dei documenti di sicurezza su CPU

Il servizio accetta una pagina PDF su `POST /ocr` e restituisce il testo trascritto. Viene usato dalla coda del PSC e dalla lettura delle singole pagine del rapporto del rumore. Usa OCRmyPDF e Tesseract in italiano. La copia usata per leggere le colonne è temporanea. Gli originali si conservano nello storage dell'app.

Per attivarlo, costruire questa immagine e servirla dietro HTTPS. Configurare lo stesso segreto come `OCR_SERVIZIO_TOKEN` nel container e `POS_OCR_SERVIZIO_TOKEN` nell'Edge Function. Impostare `POS_OCR_SERVIZIO_URL` all'endpoint completo `https://…/ocr`. La coda usa il provider di visione già configurato nell'app quando l'endpoint privato è assente. Con l'endpoint privato configurato tutta la trascrizione delle scansioni resta su quel servizio. La generazione delle proposte AI è una fase separata.

Il servizio riceve soltanto le pagine da trascrivere. I risultati OCR si possono confrontare con l'originale nel POS. `GET /healthz` verifica che il processo risponda.
