# Riconciliazione e collaudo integrato locale

Nessun comando di questa cartella legge `.env`, accetta URL di database o pubblica migrazioni. `db.py` collega esclusivamente `127.0.0.1:55439/eic_magazzino_integrato`. Il laboratorio interattivo 8096/8097 usa un altro database e rimane separato.

## Dati e perimetro

La copia del 18/11/2026 comprende le proiezioni necessarie di Demo Azienda 2: 257 ODA, 1.118 righe, 841 ricezioni, 251 bolle, 121 articoli e 1.121 costi. Contatti e dati fiscali dei contesti di test sono sintetici; nessun account o segreto di autenticazione è stato esportato. I JSON sorgente e il piano con identificativi reali restano nella cache privata dell’utente, fuori dal repository:

`~/Library/Caches/EdiliziaInCloud/magazzino-reconciliazione-20261118/`

Sono state riprodotte definizioni, vincoli, policy, funzioni e trigger pertinenti letti dal catalogo. Quattro colonne embedding e i loro indici vettoriali sono sostituiti/esclusi: non sono usati dai percorsi Magazzino. Gli `auth.uid()`/claim simulano il contesto passato da PostgREST; la verifica dei token e i worker esterni non vengono eseguiti. Le regole di ruolo/azienda/deposito e il generatore fiscale eseguiti nei test sono quelli reali, non i surrogati della fixture precedente.

## Riproduzione sulla sola copia dedicata

I comandi seguenti **resettano la copia locale integrata**; non eseguirli mentre si analizzano modifiche manuali su quel database. La copia sorgente privata deve già essere presente.

```sh
python3 scripts/magazzino-integrato/build_schema.py
python3 scripts/magazzino-integrato/load_history.py
python3 scripts/magazzino-integrato/install_proposals.py
python3 scripts/magazzino-integrato/reconcile.py
python3 scripts/magazzino-integrato/test_integrated.py
python3 scripts/magazzino-integrato/test_concurrency.py
```

`build_schema.py --finish` riprende l’installazione di indici, ACL, policy e trigger dopo aver aggiunto una dipendenza al catalogo locale. Non ripristinare le definizioni canoniche con questo comando sopra le proposte P2–P7 senza reinstallare poi le proposte.

## Riconciliazione

`reconcile.py` genera un piano e un CSV privati, controlla le ambiguità e applica la richiesta alla sola copia locale. Il database ricalcola il fingerprint sotto lock; un piano obsoleto viene rifiutato. Ripetere la stessa richiesta restituisce il risultato già registrato.

I 59 saldi storici conservano esattamente la quantità già registrata sull’ODA e la sua provenienza: **non certificano una consegna fisica e non creano carichi, seriali, bolle o costi**. Il solo contatore inferiore alla ricezione documentata viene allineato; lo stato della bozza resta invariato. Le posizioni su misura usano il proprio flusso e non vengono trasformate in carichi ordinari.

Un nuovo saldo successivo si aggiunge allo storico, senza riscrivere il precedente. I casi non univoci o oltre l’ordinato restano bloccati, senza assegnazioni ipotizzate.

## Test

Le 28 prove integrate usano transazioni con rollback. Le quattro prove concorrenti usano processi PostgreSQL separati, inseriscono esclusivamente record di test identificati da UUID e li puliscono, confrontando poi le impronte dello storico.

I 143 test precedenti sono eseguiti separatamente su `eic_magazzino_regressione`, con `EIC_TEST_DATABASE=eic_magazzino_regressione`. Il runner accetta soltanto i due nomi di database sintetici previsti e continua a usare esclusivamente loopback.

Rapporto: `docs/ux/magazzino-riconciliazione/revisione.md`.

## Prenotazione dal gestionale (18 novembre 2026)

La proposta `docs/sql-proposte/magazzino-p8-prenotazioni.sql` sostituisce soltanto la RPC di prenotazione, conservando firma e permessi. Dopo P2–P7 applicarla esclusivamente al database locale di collaudo: controlla anche il fabbisogno al netto di prelievi e resi. Il bootstrap integrato la include. I nuovi test con rollback sono `scripts/magazzino-integrato/test_reservations.py`; la prova concorrente prenotazione/prelievo è in `test_concurrency.py`. I runner che ripristinano dati vanno usati sul database di regressione separato, non mentre si usa il laboratorio interattivo.

Il gestionale offre Prenota nella barra e nel menu articolo. La riga materiali deve essere già associata alla commessa; il dialogo non crea righe contrattuali implicitamente. Carica articolo usa lo stesso percorso ODA/carico libero della pagina, con articolo precompilato. Il ciclo completo è documentato in `docs/ux/magazzino-prenotazioni/revisione.md`. Nessuna di queste proposte è stata pubblicata online.

## Controllo HTTP/JWT di rilascio (18 novembre 2026)

`test_http.py` esegue 11 prove contro PostgREST reale, esclusivamente su `127.0.0.1:8098` e sulla copia separata `eic_magazzino_http`. Usa JWT sintetici firmati (non un accesso GoTrue) e legge la configurazione privata, con permessi 0600, dalla cache locale `magazzino-release-frozen-20261118/http-private.json`. Questo file, la copia del database e il binario PostgREST 16.6 sono prerequisiti locali e non sono inclusi nel repository. Nessuna credenziale va inserita nei log.

L’adattamento locale di `auth.uid()` legge `request.jwt.claims` come PostgREST; non modifica il servizio di autenticazione online. Le prove HTTP creano record sintetici solo nella copia HTTP; non usare il database interattivo. A fine collaudo il server dedicato è stato fermato e il ruolo locale `eic_magazzino_http_auth` disabilitato (`NOLOGIN`, appartenenze anon/authenticated revocate). Per ripetere il collaudo occorre riabilitare intenzionalmente questo solo ruolo e avviare il solo PostgREST locale con quella configurazione, poi disabilitarlo di nuovo.

La proposta P10, installata dopo P9 dal bootstrap, conserva esattamente le ricezioni frazionarie per unità non a pezzi. Le prove native di questa fase sono 143 regressioni + 28 integrate + 6 prenotazioni + 4 concorrenza + 10 carico/costi = 191. I servizi Storage, GoTrue e i worker Edge non sono emulati da questi test.

Rapporto finale e limiti del collaudo: `docs/ux/magazzino-sicurezza-rilascio/revisione.md`.
