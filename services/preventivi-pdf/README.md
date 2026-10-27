# PDF Originale Fotovoltaico

Stampa con Chromium l'HTML gia generato dal fotovoltaico. Non sostituisce i
modelli, gli stili o i contenuti. La firma congela il PDF completo in
`quote-pdfs`, ne registra l'impronta e aggiunge timbri e certificato soltanto
dopo la firma. L'anteprima HTML del progetto rimane invariata.

Le schede dei prodotti autorizzate dall'azienda sono incluse nel PDF congelato,
prima delle condizioni/accettazione, nell'ordine dei prodotti e senza doppioni.
Le pagine sono centrate su A4, mantenendo proporzioni, ritaglio e rotazione.
Una scheda autorizzata non raggiungibile blocca la firma: non viene omessa in
silenzio. Le origini delle schede devono essere nella lista autorizzata.

## Verifica Locale

Richiede le dipendenze del repository e Chromium di Playwright. Avviare prima
l'app locale sulla porta 8080, poi il servizio con un token di prova di almeno
32 caratteri:

```sh
PREVENTIVI_PDF_TOKEN="$TOKEN_LOCALE" node services/preventivi-pdf/server.mjs
```

Il servizio ascolta esclusivamente su `127.0.0.1:8096`. Non espone CORS e non
va chiamato dal browser dell'utente. Non stampare o inserire token in variabili
`VITE_*`. Per le funzioni locali/test impostare:

```sh
PREVENTIVI_PDF_RENDER_URL=http://127.0.0.1:8096/render \
PREVENTIVI_PDF_TOKEN="$TOKEN_LOCALE" \
EIC_QA_PDF_DIR=/tmp/eic-fv-firma-completa \
npx vitest run --maxWorkers=1 src/test/logic/preventiviOriginaliFlussoLocale.test.tsx
```

Nei test sono reali la conversione, i byte PDF, le impronte, i timbri e il
download dallo storage finto. Database, risposte AI, OTP e invii sono simulati;
non vengono scritti dati ne inviate firme in produzione. I cinque test nativi
FV sono abilitati solo quando viene indicato l'endpoint del renderer locale.

`PREVENTIVI_PDF_ASSET_BASE_URL` identifica l'origine delle immagini relative
(di serie `http://127.0.0.1:8080`). Eventuali origini aggiuntive di immagini,
font e fogli di stile vanno autorizzate esplicitamente in
`PREVENTIVI_PDF_ASSET_ORIGINS` (separate da virgola). JavaScript e service
worker sono disabilitati nei documenti; richieste ad altre origini, immagini
rotte o numeri di pagine incoerenti fanno fallire la conversione.

La conversione ha un limite di tempo, dimensioni e concorrenza. Se il servizio
non e configurato o non risponde, la richiesta di firma NON viene creata.
Un file FV senza PDF originale non viene piu spacciato per un preventivo
firmato completo con il solo certificato.

Nessuna configurazione, credenziale o distribuzione remota e inclusa in questa
verifica locale. Prima di un'eventuale pubblicazione serve configurare il
servizio server e le sue origini autorizzate nell'ambiente di destinazione.
