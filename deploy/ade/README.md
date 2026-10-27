# Server dedicato al canale AdE

VPS dedicata **creata il 27 ottobre 2026**, distinta dal server WhatsApp: `eic-ade-fra1-01`, DigitalOcean ID `613146862`, IP `164.90.222.101`, regione `fra1`. Il gateway privato è installato e risponde correttamente a `/health`; il firewall Cloud è associato solo a questa VPS. DNS, certificati e accreditamento restano da completare. Le notifiche HTTPS sono disabilitate fino alla configurazione dei certificati effettivi. Questi file non creano risorse a pagamento automaticamente.

Piano attivato: DigitalOcean Basic Regular, 1 vCPU / 2 GiB / 50 GiB, **12 USD/mese**, imposte ed extra esclusi ([listino ufficiale](https://www.digitalocean.com/pricing/droplets), verificato il 27 ottobre 2026). Backup esterni e relativi costi vanno configurati prima dell'esercizio. Non riutilizzare il server WhatsApp né modificarne DNS, proxy o container.

| Ambiente | URL proposto, ancora da pubblicare | API amministrativa sulla VPS |
| --- | --- | --- |
| Collaudo | `https://sdi-test.ediliziaincloud.com/sdi/trasmissione` | `127.0.0.1:3098` |
| Produzione | `https://sdi.ediliziaincloud.com/sdi/trasmissione` | `127.0.0.1:3099` |

I nomi vanno verificati contro i requisiti del portale prima di generare le CSR. Il proxy instrada per SNI e passa TLS integro al servizio Node: la CA e il certificato client SdI vengono verificati dal listener mTLS. Serve anche verificare nel collaudo ufficiale l'invio SNI da parte del client SdI. Nessun certificato o segreto entra nell'immagine Docker. Database e directory certificati sono distinti per ambiente. La produzione resta disattivata finché non è esplicitamente avviato il relativo profilo.

## Preparazione sulla nuova VPS

Il bootstrap effettivamente utilizzato è in `cloud-init.yaml`: Ubuntu 24.04, Docker, Compose, SSH senza password e firewall locale. Il firewall DigitalOcean limita ulteriormente SSH al solo indirizzo amministrativo.

Richiede Docker Engine, Buildx e Docker Compose >= 2.24. Installare gli aggiornamenti del sistema. Configurare il firewall dell'hosting per consentire TCP 443 e SSH solo dagli indirizzi amministrativi; non aprire 3098, 3099 o 3100. Puntare i due record DNS al nuovo IP, senza un proxy HTTP/CDN. Il servizio usa una sola replica per ambiente.

Dalla radice del repository:

```sh
mkdir -p deploy/ade/certs/test deploy/ade/certs/production
cp deploy/ade/environment.example deploy/ade/test.env
# Compilare test.env e usare un segreto casuale: openssl rand -hex 32
chmod 600 deploy/ade/test.env
```

Generare CSR e chiavi sulla VPS secondo i requisiti effettivi del portale AdE. Le chiavi private restano sulla macchina; caricare solo le CSR richieste. Dopo il rilascio, installare in `certs/test` il certificato server con la relativa catena, la chiave server, la CA prevista e i certificati pubblici client SdI attesi. I file `client.pem`/`client-key.pem` sono quelli necessari alle chiamate SMTS in uscita, quando abilitate. I percorsi sono elencati in `environment.example`. Dare lettura ai file solo al processo UID/GID 10001 e agli amministratori; non rendere le chiavi leggibili a tutti.

```sh
docker compose -f deploy/ade/compose.yaml build
docker compose -f deploy/ade/compose.yaml up -d
docker compose -f deploy/ade/compose.yaml ps
curl --fail http://127.0.0.1:3098/health
```

Il bootstrap corrente avvia soltanto `test`, con `SMTS_SERVER_CERT` e `SMTS_SERVER_KEY` non impostati: funziona esclusivamente il gateway privato su loopback, senza listener HTTPS e senza ingress pubblico. Non registrare questo stato nel portale come endpoint pronto. Per attivare il listener servono certificati effettivi; non usare certificati inventati o vuoti. Prima di inserire l'URL nel portale verificare dall'esterno DNS, catena server, hostname, handshake mTLS e persistenza della notifica dopo il riavvio. Un semplice HTTP 200 su `/health` non collauda il canale. I test sintetici locali non sostituiscono il collaudo AdE.

Per la produzione ripetere con **certificati, segreto e dati separati**, creando `production.env`; quindi avviare `docker compose -f deploy/ade/compose.yaml --profile production up -d`. Mantenere `SMTS_ACCREDITED=false` fino al completamento dell'accreditamento e dell'abilitazione SMTS. Il flag blocca le operazioni massive in uscita, mentre il listener delle notifiche permette il collaudo.

## Collegamento al gestionale e limiti attuali

`/sdi/trasmissione` riceve soltanto le sei notifiche del canale di **trasmissione**; non implementa la ricezione diretta delle fatture né l'invio delle fatture al SdI. Per ora ITALA resta il servizio operativo per emissione e ricezione. L'abilitazione completa del canale diretto richiede ancora questi flussi e il collaudo ufficiale.

Le API SMTS `/actions` restano private e sono raggiungibili solo via SSH/loopback. Prima di collegarle alla funzione Supabase serve un ingresso HTTPS amministrativo separato, autenticato e con limiti sui corpi e sui tempi; non usare il dominio SdI né pubblicare HTTP 3098/3099. Non impostare `SMTS_GATEWAY_URL` finché quell'ingresso non esiste ed è verificato.

Prima dell'esercizio configurare backup cifrati fuori dalla VPS e verificarne il ripristino; per una copia coerente fermare l'istanza interessata o usare l'API SQLite backup, senza copiare il solo file principale mentre il WAL è attivo. Non usare `docker compose down -v`: eliminerebbe i dati. Per aggiornare ricostruire e riavviare con `up -d`; i volumi persistono. Monitorare spazio libero, scadenza dei certificati, salute dei container e disponibilità esterna con mTLS.

## Verifica locale ripetibile

Richiede anche Python 3 e OpenSSL sul computer di prova. Dalla radice del repository:

```sh
docker build -f services/smts/Dockerfile -t eic-smts:local .
python3 deploy/ade/verify-local.py
npm --prefix services/smts test
```

La prova usa porte casuali sul loopback, certificati sintetici di un giorno e un progetto Docker dal nome casuale. Verifica TLS passthrough, rifiuto di certificati assenti/non autorizzati e SNI sconosciuto, separazione degli ambienti e deduplica persistente dopo un riavvio. Rimuove esclusivamente i container e i volumi temporanei della propria prova. Non chiama AdE, non legge chiavi reali e non configura il server WhatsApp.
