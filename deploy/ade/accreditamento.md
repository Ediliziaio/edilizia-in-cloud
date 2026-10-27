# Preparazione CSR e accreditamento

Il 27 ottobre 2026 sono state preparate sulla VPS quattro **bozze** di CSR, con chiavi indipendenti per client/server e collaudo/produzione. Non sono state inviate al portale. Non sono certificati rilasciati dall'AdE e non rendono operativo il canale.

## Fonte e limiti verificati

È stato recuperato direttamente il PDF pubblico AdE [Esempio di generazione delle CSR](https://www.fatturapa.gov.it/export/documenti/esempio_csr.pdf), SHA-256 `499dd30dca36cbe1e66ecc7319b62781403bfa5e7e63214c452049808b4d5284`. Indica RSA 2048, generazione con OpenSSL e Common Name `SDI-` seguito dall'identificativo fiscale del sottoscrittore. Gli altri dati del soggetto non sono stati inventati.

Questo esempio **non è una copia verificata** della guida completa `Nota per la generazione delle CSR_IT.pdf` del portale autenticato. Non specifica le regole distinte client/server, SAN/hostname, il numero di CSR da presentare né il rilascio per collaudo e produzione. I quattro file sono candidati preparatori: non implicano che il portale richieda quattro caricamenti.

Il soggetto proposto delle bozze è `C=IT, CN=SDI-02010390439`, derivato dalla partita IVA comunicata dall'utente. **Non attesta il codice fiscale personale del sottoscrittore.** Prima di caricare una CSR confrontare Paese e Codice con quelli effettivi della pratica esistente `SDI/WS/ME`. Se il portale richiede un identificativo, soggetto o estensioni diversi, riemettere le CSR appropriate con le chiavi già conservate, senza sostituire o cancellare le chiavi originarie.

## File e custodia

Directory sulla VPS: `/opt/eic-ade/accreditamento/csr-20261027`, proprietario root e permessi 0700. Le chiavi `.key` hanno permessi 0600 e rimangono esclusivamente sulla VPS, fuori dal repository e dal pacchetto da scaricare.

| Scopo candidato | Richiesta pubblica | Chiave privata sulla VPS |
| --- | --- | --- |
| Client collaudo | `test-client.csr` | `test-client.key` |
| Server collaudo | `test-server.csr` | `test-server.key` |
| Client produzione | `production-client.csr` | `production-client.key` |
| Server produzione | `production-server.csr` | `production-server.key` |

`manifest.json` riporta stato `DRAFT_NOT_SUBMITTED`, soggetto proposto, hash delle CSR e delle chiavi pubbliche, nonché le verifiche del portale ancora mancanti. Il pacchetto pubblico contiene solo CSR, manifesto, fonte e istruzioni.

Il generatore verifica la firma di ogni richiesta, corrispondenza chiave/CSR, algoritmo e dimensione della chiave, soggetto e indipendenza delle quattro coppie. Una riesecuzione verifica i file senza modificarli; file parziali, chiavi con permessi eccessivi o dati discordanti fanno fallire il controllo.

```sh
# Sulla VPS; genera soltanto se la directory non esiste, altrimenti verifica.
python3 /opt/eic-ade/deploy/ade/prepare-csr.py \
  --output /opt/eic-ade/accreditamento/csr-20261027 \
  --country IT --proposed-subscriber-code 02010390439

# Verifiche sintetiche locali, senza accessi AdE.
python3 deploy/ade/prepare_csr_test.py
```

## Passaggi da completare nella pratica

1. Aprire la linea già esistente e verificarne sottoscrittore, stato e guida CSR completa. Evitare una pratica duplicata. Confrontare il soggetto effettivo con quello delle bozze, inclusi eventuali requisiti specifici per CSR server e SAN.
2. Caricare soltanto le CSR corrispondenti ai campi effettivamente richiesti. La richiesta di rilascio certificati è distinta dall'attivazione dell'endpoint e dall'accreditamento finale. Le chiavi private non vengono caricate.
3. Recuperare i certificati emessi, le catene CA e i certificati pubblici client SdI previsti. Controllare per ogni ambiente validità, catena, corrispondenza con la chiave della CSR presentata e requisiti del ruolo client/server. Conservare separatamente collaudo e produzione.
4. Installare i file effettivi nelle directory `deploy/ade/certs/test` e, quando disponibile, `production`, con nomi e configurazione di `environment.example`. Assegnare lettura delle chiavi solo all'UID/GID 10001 del container e agli amministratori. Non usare le bozze CSR come certificati TLS.
5. Per il collaudo impostare `SMTS_SERVER_CERT`, `SMTS_SERVER_KEY`, `SMTS_CA` e `SMTS_SDI_CLIENT_CERTS` con i file reali; avviare l'ingresso HAProxy. Non sostituire la verifica mTLS con header HTTP. Tenere `SMTS_ACCREDITED=false` durante la preparazione.
6. Verificare dall'esterno handshake mTLS, certificato server e instradamento SNI, rifiuto dei client non previsti, notifiche persistenti e riavvio. Eseguire gli scenari di interoperabilità richiesti dal portale e conservare gli esiti effettivi. Le prove sintetiche locali non equivalgono al collaudo AdE.
7. Completare i passaggi contrattuali e di messa in produzione indicati dalla pratica. Solo dopo l'effettivo accreditamento e l'abilitazione SMTS impostare il relativo flag e le partite IVA abilitate.

URL tecnici predisposti (DNS verificati, HTTPS/mTLS ancora da attivare):

- Collaudo: `https://sdi-test.ediliziaincloud.com/sdi/trasmissione`
- Produzione: `https://sdi.ediliziaincloud.com/sdi/trasmissione`

La rotta implementa le notifiche del canale di **trasmissione**. Invio diretto delle fatture e ricezione diretta SdICoop richiedono ancora lo sviluppo dei rispettivi flussi: non dichiarare il canale pronto per tutte le funzioni solo dopo l'installazione dei certificati. L'ingresso HTTPS amministrativo verso Supabase e il backup cifrato esterno restano ulteriori attività prima dell'esercizio.
