# Prova dei documenti su telefono

Fixture di sviluppo: usa i componenti reali e il CSS dell'app, con identità e dati sintetici. Non si collega alle tabelle o ai documenti di produzione. Non fa parte delle route dell'app distribuita.

Avvio, dalla radice del repository:

```sh
bun run dev --config dev/mobile-documents-audit/vite.config.mts
```

Aprire `http://127.0.0.1:4187`. Le richieste `/__qa-upload` e `/documento.pdf` vengono simulate dal test Playwright; l'invio senza il test non rappresenta un caricamento sul backend.

In un ambiente Python con Playwright e i browser WebKit/Chromium installati:

```sh
python dev/mobile-documents-audit/browser_test.py --output /tmp/eic-documenti-qa
```

Per usare Chrome installato sul computer, aggiungere `--chromium-channel chrome`. Il test verifica PDF canvas, contenuto del download, pulsante HR da 44×44 px, upload con MIME vuoto, errore HTTP, conservazione del file senza rete e nuovo invio dopo riconnessione. Salva screenshot e risultati JSON.

L'opzione `?native=1` genera e apre un PDF sintetico mediante il visualizzatore del sistema. Serve esclusivamente per una copia QA dell'app avviata su simulatore/emulatore con questo server locale. La configurazione di distribuzione deve mantenere gli asset incorporati e nessun `server.url` remoto.

Le regressioni automatiche dei documenti si eseguono con `bun run test:mobile-documenti`; i servizi nativi sono simulati nei test unitari.
