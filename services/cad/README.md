# Servizio dedicato di lettura DWG

Il servizio converte un DWG in un riepilogo citabile da Silvio AI. È separato dall’app e dalle funzioni Supabase: il disegno originale non viene mandato al modello. La chat riceve estratti di testi e layer, avvisi e riferimenti agli elementi; non un computo geometrico certificato.

Stato: preparato per il collaudo, non distribuito né attivato. Nessun nuovo abbonamento è necessario per preparare il codice. Un server effettivo e il suo costo devono essere scelti prima dell’attivazione. Il daemon Docker non era disponibile sul Mac durante la preparazione: la build Linux dell’immagine resta una verifica obbligatoria.

## Flusso e autorizzazioni

1. Il popup del wizard conserva azienda, account e modello scelti. L’utente carica il DWG; il client verifica firma e limite di 64 MB.
2. Il servizio riceve `POST /v1/read` con la sessione utente. Prima di leggere il corpo chiama il solo percorso configurato `/functions/v1/ai-preventivo-conversazione/cad-access`.
3. Il backend verifica JWT, accesso all’azienda, permesso `can_edit_preventivi`, attivazione e regola di pagamento aziendale. Il convertitore non possiede chiavi amministrative, credenziali OpenRouter o accesso diretto alle tabelle.
4. Una sola conversione alla volta usa una directory temporanea privata. File oltre limite, processi scaduti e risultati incoerenti falliscono senza chiamare l’AI. I temporanei vengono eliminati alla conclusione o all’interruzione ordinaria; il container usa un filesystem temporaneo in memoria.
5. La risposta deve corrispondere ad azienda, richiesta e dimensione del file. L’utente sceglie lo stato di riferimento e specifica porzione, lavorazioni, esclusioni e misure. La scelta dello stato non ritaglia automaticamente le geometrie.
6. Solo il successivo turno AI passa al router del gestionale, con la propria azienda e il relativo portafoglio. La conversione non addebita token AI. L’eventuale tariffazione futura della CPU del convertitore richiede una regola esplicita, distinta dai consumi OpenRouter.

I parser nativi non ricevono JWT né variabili dei provider. Il servizio non segue URL o percorsi ricevuti dal client e non carica riferimenti esterni del disegno. Nei log non vanno scritti originali, estratti, nomi dei file o sessioni.

## Preparazione del container

Il Dockerfile scarica LibreDWG 0.14 dalla distribuzione GNU e ne verifica il checksum previsto. Il runtime Node LTS è fissato al digest dell’immagine ufficiale verificato durante la preparazione. Il Dockerfile conserva licenza GNU e sorgente del convertitore nell’immagine; nessun parser DWG viene incorporato nel frontend. La distribuzione dell’immagine richiede la verifica degli obblighi di licenza applicabili.

Il contesto Docker ammette soltanto i file necessari: non includere `work`, documenti cliente, screenshot, esportazioni CAD o file di ambiente.

Impostare nel gestore di configurazione del server, senza committare un file di credenziali:

- `CAD_SUPABASE_URL`: origine HTTPS del backend del gestionale.
- `CAD_SUPABASE_PUBLISHABLE_KEY`: chiave pubblicabile, mai `service_role`.
- `CAD_APP_ORIGINS`: origini HTTPS esatte dell’app, separate da virgole. Niente wildcard.

Per costruire, senza avviare il servizio:

```sh
docker compose -f services/cad/compose.yaml build
```

`compose.yaml` vincola porta al loopback del server, utente non privilegiato, filesystem di base in sola lettura, capacità Linux rimosse, limite di processi, CPU, memoria e spazio temporaneo. La prima distribuzione deve usare una singola replica. Le quote sono in memoria: tre conversioni per coppia azienda/utente ogni cinque minuti e un limite globale alle richieste di ammissione. Prima di scalare servono una coda e quote condivise, non più mappe indipendenti.

## Verifiche prima di attivare

- Costruire l’immagine Linux e verificare le dipendenze del binario, l’avvio, `/health`, arresto e pulizia dei temporanei, incluso un arresto forzato.
- Collaudare DWG grandi, corrotti e non supportati nel container con i limiti reali di memoria e spazio; una prova sul Mac non sostituisce questa verifica.
- Configurare un reverse proxy HTTPS con limite di 64 MB, attese coerenti con i 240 secondi massimi, limite del traffico e nessuna registrazione dei corpi. Non esporre direttamente la porta HTTP.
- Verificare isolamento di processo e regole di uscita di rete; l’unica destinazione richiesta dal processo di ammissione è il backend configurato. Non montare directory del server o altri documenti nel container.
- Distribuire il ramo `cad-access` del backend e collaudare sessione scaduta, account bloccato, azienda estranea, permesso mancante e pagamento non valido. Non rimuovere questi controlli per far riuscire un test.
- Abilitare `QUOTE_CAD_ENABLED=true` sul backend solo dopo il collaudo. L’attivazione della chat resta regolata anche da `QUOTE_CHAT_ENABLED` o dalla precedente modalità demo.
- Impostare nel frontend `VITE_QUOTE_CAD_ENABLED=true` e `VITE_QUOTE_CAD_ENDPOINT=https://DOMINIO_DEL_CONVERTITORE/v1/read` soltanto per un servizio pronto. Non sono valori da inserire ora nell’ambiente pubblicato.
- Ripetere il flusso Classico, computi edili, Serramenti e Fotovoltaico: apertura, allegato, domande, campi mancanti, anteprima, conferma e applicazione nel wizard originale. Nessun invio ai clienti per collaudare.

Senza attivazione esplicita, il client di produzione non carica il file e conserva la bozza. In sviluppo su loopback rimane il percorso locale, con lo stesso motore di conversione e senza chiamate remote di ammissione.

## Limiti della lettura

Il riepilogo conserva al massimo 300 testi distinti e 80 nomi di layer, entro un limite di byte; indica le occorrenze non riportate e le letture parziali. Gli estratti inviati all’AI sono ulteriormente limitati e scelti in funzione della domanda. Grafica importata da PDF, simboli, legende, unità dichiarate e scale di stampa non diventano misure verificate. Quote geometriche, selezione della tavola e confronto automatico tra stato attuale e progetto richiedono un ulteriore percorso di calibrazione e verifica.

La memoria della simulazione locale conserva il riepilogo, non il binario. I popup nativi mantengono una bozza isolata: «Scarta e chiudi» elimina anche il loro contesto CAD non applicato. Non è ancora un archivio CAD aziendale sincronizzato.
