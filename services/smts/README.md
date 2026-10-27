# Collegamento diretto AdE: SdICoop / SMTS

Codice preparato il 27 ottobre 2026. Il servizio è eseguibile e verificato localmente; **non è un canale accreditato né un servizio già pubblicato**. Non sono state inviate richieste reali all'Agenzia, accettati accordi o consumati crediti ITALA durante lo sviluppo.

## Cosa fa

- Genera l'InputMassivo secondo l'XSD 1.5 e lo include nella busta RichiestaServiziMassivi 1.0: è la **busta esterna** che il titolare/intermediario deve firmare CAdES.
- Verifica crittograficamente il CMS caricato e confronta i byte con la richiesta originale. Non sostituisce la verifica AdE di qualifica, revoca e delega del firmatario.
- Chiama le tre operazioni SOAP `inoltroRichiesta`, `esitoRichiesta`, `scaricoFile`, con certificato client mTLS e verifica della CA/hostname attiva.
- Conserva bozze, ID AdE, contatori e stato su SQLite persistente, con WAL e synchronous FULL. Un periodo già preparato restituisce la stessa bozza. Un inoltro dal risultato incerto non viene ritentato automaticamente.
- Rispetta il limite di dieci richieste giornaliere per partita IVA, dieci verifiche di esito per richiesta e limita la frequenza degli scarichi. Gli esiti intermedi sono conservati per un'ora; le verifiche sono manuali, non un polling automatico ogni minuto.
- Scarica soltanto gli archivi elencati nell'esito della stessa richiesta, verificando partita IVA e ID. L'importazione contabile degli archivi usa il caricamento XML/ZIP esistente del gestionale.
- Può esporre separatamente `/sdi/trasmissione` per le sei notifiche one-way del canale SdICoop di **trasmissione**. Verifica mTLS e il certificato pubblico client SdI previsto, conserva la notifica su disco prima dell'acknowledgement. Non è un canale di ricezione SdICoop delle fatture né un sistema di emissione fatture.

## Avvio locale

Richiede Node 24+, OpenSSL con comando `cms` e un volume persistente privato. Non richiede dipendenze npm aggiuntive.

```sh
cd services/smts
cp .env.example .env
# Compilare .env con i valori propri, senza committare credenziali o chiavi.
npm start
npm test
```

Per preparare bozze non servono certificati già emessi. Per inoltrare, controllare esiti e scaricare occorrono tutti i requisiti, altrimenti il servizio rifiuta l'operazione:

- `SMTS_ACCREDITED=true` **solo dopo** il completamento della procedura di accreditamento e l'abilitazione SMTS.
- `SMTS_CLIENT_CERT`, `SMTS_CLIENT_KEY`, `SMTS_CA`: percorsi ai file PEM effettivamente rilasciati/previsti per il colloquio con AdE; passphrase in `SMTS_KEY_PASSPHRASE` se presente.
- `SMTS_PROVIDER_ENABLED_VATS`: elenco separato da virgole delle partite IVA che hanno abilitato **questo** provider in Fatture e Corrispettivi. L'abilitazione di ITALA non abilita automaticamente questo canale.
- `SMTS_GATEWAY_SECRET`: segreto casuale di almeno 32 caratteri, identico a quello impostato nella funzione Supabase. Mai una chiave Supabase o un token cliente.

Il gateway ascolta sul loopback (`HOST=127.0.0.1`, `PORT=3098`). Pubblicarlo tramite un reverse proxy HTTPS con limite corpo 3 MB, timeout coerenti e nessun log dei corpi o dell'header Authorization. La funzione Supabase `billing-massive` deve avere `SMTS_GATEWAY_URL=https://<dominio-effettivo>` e `SMTS_GATEWAY_SECRET`. Non inserire URL non ancora operativi nel portale di accreditamento.

Per le notifiche SdICoop, configurare anche `SMTS_SERVER_CERT`, `SMTS_SERVER_KEY`, `SMTS_SDI_CLIENT_CERTS` (percorsi separati da virgole ai certificati pubblici client SdI attesi), `SMTS_CALLBACK_HOST` e `SMTS_CALLBACK_PORT`. Questo listener termina direttamente HTTPS/mTLS: un eventuale bilanciatore deve fare TCP passthrough. Nessun header di proxy può fingere la validazione del certificato. Separare certificati di test e produzione e pianificarne il rinnovo. Non attivare i callback finché dominio, catena CA e collaudo non sono stati verificati.

Usare una sola replica: SQLite e i lock in memoria non costituiscono una coda distribuita. Fare backup cifrati del volume e conservare chiavi e passphrase nel gestore dei segreti dell'hosting. La base dati locale contiene richieste fiscali e notifiche e non deve essere esposta via HTTP.

## API privata del gateway

`POST /actions`, `Authorization: Bearer <SMTS_GATEWAY_SECRET>`, corpo JSON con `company_id`, `partita_iva`, `action`. Non chiamare questo endpoint dal browser: l'app passa attraverso `billing-massive`, che verifica sessione, ruolo di amministratore, azienda e partita IVA dal database.

| Azione | Parametri aggiuntivi | Risultato |
| --- | --- | --- |
| `list` | — | richieste della sola azienda, requisiti mancanti |
| `create` | `input` (date, tipo richiesta, criterio) | bozza persistente e XML da firmare |
| `unsigned` | `id` | bozza della sola azienda |
| `sign` | `id`, `signed_base64` | verifica CMS e inoltro AdE |
| `status` | `id` | stato ed eventuale elenco archivi |
| `download` | `id`, `file_id` | archivio base64 e nome file |

Un `ESITO_INCERTO` richiede riconciliazione con AdE/assistenza: non cancellare la riga per aggirare il blocco e inoltrare di nuovo. Lo scarico di documenti messi a disposizione può avere effetto di presa visione; il gestionale lo indica prima dell'operazione.

## Stato dei passaggi esterni

Restano da completare dominio/hosting, CSR e certificati effettivi, contratto e collaudo SdICoop, eventuale invio delle fatture di test previste dall'AdE, attivazione SMTS e abilitazione delle partite IVA. I test locali non attestano il superamento del collaudo ufficiale. Il servizio non contiene una firma qualificata automatica dei clienti: il percorso implementato usa il caricamento manuale della richiesta firmata.

## Contratti ufficiali verificati

Copie dei contratti usati sono in `contracts/`. Fonte: [Documentazione Sistema d'Interscambio](https://www.fatturapa.gov.it/it/norme-e-regole/DocumentazioneSDI/) e [Servizi massivi, versione vigente dal 18 marzo 2026](https://www.fatturapa.gov.it/it/norme-e-regole/DocumentazioneSDI/Servizi_massivi/).

- [Istruzioni SMTS 1.5](https://www.fatturapa.gov.it/export/documenti/Servizi_Massivi_Specifiche_Tecniche_v1.5.pdf)
- [Formato dei file SMTS 1.5](https://www.fatturapa.gov.it/export/documenti/Servizi_Massivi_Specifiche_Tecniche_di_formato_file_v1.5.pdf)
- [REST API ITALA 2.0](https://www.fattura-elettronica-api.it/documentazione/)
- [Richieste massive ITALA](https://www.fattura-elettronica-api.it/documentazione/richieste-massive/)
