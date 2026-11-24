# Rilascio di Gare e appalti in modalità bozza

Il frontend usa la sessione dell’app ufficiale. Cloudflare Pages inoltra le richieste autenticate al worker Linux. Il worker apre i file dal bucket privato e usa Ollama sulla rete Docker interna. Lettura, generazione, moduli e controlli DGUE continuano a usare gli originali, le versioni e il fascicolo aziendale.

La migrazione crea il pilota spento. L’azienda ammessa è **Demo Azienda 2 S.r.l.**, identificata dal suo UUID di produzione. Possono entrare gli amministratori dell’azienda e gli addetti con il permesso Ufficio acquisti. Il server verifica di nuovo azienda, ruolo e flag per ogni richiesta. Revisione interna e archivio bozza sono disponibili. Il database blocca gli stati definitivi, i pacchetti finali e la registrazione dell’invio.

## Preparazione del server

- Usare un host Linux dedicato con Docker Compose, 32 GB di RAM per la prima prova e spazio per immagini e pesi del modello.
- Impostare sul worker `GARE_SUPABASE_URL`, `GARE_SUPABASE_PUBLISHABLE_KEY`, `GARE_SUPABASE_SERVICE_KEY` e `GARE_PROXY_SECRET` dal gestore dei segreti. Il segreto di proxy è un valore esadecimale casuale di 64 caratteri.
- Preparare il volume `eic-gare-ollama` con `qwen3.5:4b` prima di avviare Compose. La rete del modello è privata e senza uscita. Il container di scaricamento dei pesi può accedere al registro Ollama senza ricevere credenziali o documenti dell’app.
- Prima provare `docker compose -f services/gare-appalti/compose.yaml build` e la configurazione del reverse proxy HTTPS verso `127.0.0.1:9081`. Non registrare corpi delle richieste, intestazioni di autenticazione o documenti.
- Configurare su Cloudflare Pages `GARE_WORKER_ORIGIN` con l’origine HTTPS del worker e `GARE_PROXY_SECRET` con lo stesso segreto. La porta di Ollama rimane sulla rete interna.

## Collaudo e attivazione

1. Collaudare su dati di prova l’apertura della gara, l’OCR, l’analisi con citazioni, la compilazione Word e PDF, i DGUE per operatore, il controllo e la consegna al revisore. Misurare anche un disciplinare corposo. Eseguire la prova sul container Linux che verrà usato per il rilascio.
2. Provare direttamente route, RPC, API worker e storage con un utente dell’azienda pilota, un utente di un’altra azienda e una sessione assente o revocata. Verificare le transizioni definitive.
3. Dopo il collaudo, pubblicare l’app da `main`, completare la migrazione dedicata nel registro Supabase e verificare la distribuzione Cloudflare Pages. Il flag resta spento durante questi passaggi.
4. Attivare il solo record pilota con una sessione amministrativa del database e ripetere i controlli sulla produzione. Aprire `/azienda/gare` con una sessione aziendale reale di Demo Azienda 2.
5. Per sospendere il pilota, impostare `gare_private.pilot.enabled` su `false`. Le bozze conservate tornano consultabili alla riattivazione.

Verifica SQL isolata con `node scripts/test-gare-pilot.mjs`. I test dei parser usano `GARE_PYTHON` per scegliere l’interprete con le dipendenze del worker installate.
