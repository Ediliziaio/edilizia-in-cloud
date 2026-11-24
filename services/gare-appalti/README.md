# Gare e appalti in modalità bozza

Il frontend usa la sessione aziendale. Cloudflare Pages inoltra le richieste al servizio documentale Node. Il servizio legge gli originali dal bucket privato, esegue OCR, compila Word e PDF e valida i DGUE XML. Il backend Supabase inoltra a OpenRouter gli estratti della procedura e applica il borsellino AI già presente nel gestionale.

Il pilota parte spento. L’UUID ammesso appartiene a **Demo Azienda 2 S.r.l.** Possono entrare gli amministratori dell’azienda e gli addetti con permesso Ufficio acquisti. Il worker e la funzione AI verificano sessione, azienda e ruolo a ogni richiesta. Il database limita i documenti a bozza e revisione interna e impedisce i pacchetti finali, gli stati definitivi e la registrazione degli invii.

## Collaudo gratuito su questa macchina

Il servizio documentale può girare direttamente con Node 24 e Python. Installa le dipendenze Python fissate in `services/gare-appalti/requirements.txt` in un ambiente virtuale e imposta `GARE_PYTHON` sul suo interprete. Il Mac usa Apple Vision tramite `swiftc`. Linux usa Tesseract con le lingue italiana e inglese. Poppler, LibreOffice, Unzip, OpenSSL e `certutil` supportano lettura, conversione, anteprime e controlli dei file. Per il solo worker Docker è facoltativo.

Per provare senza chiavi, consumi e account remoti:

```sh
node scripts/test-gare-pilot.mjs
node --test services/gare-appalti/proxy.test.mjs
GARE_DOC_SMOKE=1 GARE_PYTHON=/percorso/python node --test services/gare-appalti/openrouter.test.mjs
```

L’ultima prova avvia il worker su loopback e simula Supabase e OpenRouter. Esegue la rotta Filtri AI, compila un Word e genera due DGUE sintetici distinti. Usa il compilatore documentale reale. Per una prova AI offline con il modello già installato sul Mac, configurare nel worker `GARE_AI_BACKEND=ollama` e `GARE_AI_MODEL=qwen3.5:4b`. L’opzione Ollama è separata dalla configurazione OpenRouter.

## Modalità OpenRouter

- `free` usa `openrouter/free` o un modello esplicito `:free`. Le richieste impongono prezzo massimo zero, JSON strutturato, raccolta dati negata e Zero Data Retention. Se il catalogo o le quote non permettono la richiesta, l’utente riceve un errore recuperabile. Non parte un modello a pagamento.
- `credits` usa un modello esplicito configurato sul backend. La funzione controlla il saldo prima della chiamata, registra i token e i costi con il codice `gare_appalti` e attende conferma dal registro consumi. La stessa richiesta HTTP al provider non viene ripetuta automaticamente in caso di errore di trasporto.
- Gli estratti delle fonti di gara possono passare a OpenRouter. I documenti aziendali, le identità DGUE e i dati riusati nei moduli stanno nel fascicolo. Il confronto testuale con le prove e la compilazione documentale restano disponibili. Per l’analisi AI dei documenti aziendali e delle bozze riservate si usa il motore privato.

Per una prova OpenRouter reale, configura la chiave come `OPENROUTER_API_KEY` **nel runtime Supabase locale** di `gare-pilot-ai`. Usa il profilo `GARE_OPENROUTER_PROFILE=free` e materiali sintetici. Imposta sul backend `GARE_AI_BRIDGE_SECRET` e, quando serve, `GARE_OPENROUTER_MODEL`. Il segreto del bridge è una stringa esadecimale di 64 caratteri, distinta dal segreto del proxy. Il modello impostato sul worker deve coincidere con quello della funzione. Verifica il saldo reale solo in un ambiente autorizzato con il profilo `credits`.

## Avvio del servizio documentale

Imposta `GARE_SUPABASE_URL`, `GARE_SUPABASE_PUBLISHABLE_KEY`, `GARE_SUPABASE_SERVICE_KEY`, `GARE_PROXY_SECRET`, `GARE_AI_BRIDGE_SECRET` e `GARE_AI_MODEL` dal gestore dei segreti. Il worker riceve il token della sessione aziendale e usa il segreto del bridge per chiamare `gare-pilot-ai`. La chiave OpenRouter rimane sul backend Supabase.

Per eseguirlo in locale imposta `GARE_LOCAL_ONLY=1`, una porta libera con `GARE_PORT` e l’indirizzo del backend di prova su `http://127.0.0.1`. Il backend di prova deve avere lo schema del pilota e la funzione `gare-pilot-ai`. Avvia il worker con `node services/gare-appalti/server.mjs`. La modalità locale rifiuta un Supabase remoto e ascolta solo su loopback.

Per un futuro rilascio, il file Compose avvia un solo servizio documentale senza Ollama. Il proxy HTTPS punta a `127.0.0.1:9081`. Cloudflare Pages usa `GARE_WORKER_ORIGIN` e lo stesso `GARE_PROXY_SECRET` del worker.

## Verifiche prima dell’attivazione

1. Sul servizio documentale destinato al pilota, prova un disciplinare lungo, una scansione, Word e PDF e un DGUE con dichiarazioni condizionate per due operatori. Registra tempi, qualità delle citazioni e costo AI.
2. Prova route, RPC, API AI e storage con un utente del pilota, un utente di un’altra azienda e una sessione assente o revocata. Verifica il blocco delle azioni definitive.
3. Durante il rilascio autorizzato, applica la migrazione e prepara la funzione AI e l’app con il flag del pilota spento. Accendi il solo pilota dopo le verifiche.
4. Per sospenderlo, imposta `gare_private.pilot.enabled` su `false`. Le bozze conservate tornano consultabili alla riattivazione.
