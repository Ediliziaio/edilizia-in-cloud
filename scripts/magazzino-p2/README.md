# Collaudo locale Magazzino P2

Questo laboratorio usa esclusivamente PostgreSQL nativo su `127.0.0.1:55439`, database `eic_magazzino_p2`, con dati sintetici. Non legge `.env`, non usa JWT del gestionale e non chiama Supabase. Il server HTTP ascolta solo su loopback; le scritture richiedono origine locale e token di questa istanza.

## Ambiente già preparato

- PostgreSQL 17: `/opt/homebrew/opt/postgresql@17/bin`.
- Cluster dedicato: `/Users/andriciuc/Library/Caches/EdiliziaInCloud/magazzino-audit-postgres/data`.
- Nessun servizio Homebrew permanente avviato.
- Frontend gestionale: <http://127.0.0.1:8096/azienda/magazzino>.
- Laboratorio interattivo: <http://127.0.0.1:8117>.

Se il cluster è fermo:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/andriciuc/Library/Caches/EdiliziaInCloud/magazzino-audit-postgres/data -l /Users/andriciuc/Library/Caches/EdiliziaInCloud/magazzino-audit-postgres/server.log -o '-h 127.0.0.1 -p 55439 -k /Users/andriciuc/Library/Caches/EdiliziaInCloud/magazzino-audit-postgres -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix -c max_connections=20 -c shared_buffers=32MB' start
```

Dalla radice del worktree, caricare solo nel database dedicato:

```sh
/opt/homebrew/opt/postgresql@17/bin/psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -d eic_magazzino_p2 -f scripts/magazzino-p2/schema-locale.sql -f docs/sql-proposte/magazzino-p2-transazioni.sql -f scripts/magazzino-p2/schema-operazioni.sql -f docs/sql-proposte/magazzino-p3-operazioni.sql -f docs/sql-proposte/magazzino-p4-valorizzazione.sql
python3 scripts/magazzino-p2/test_transazioni.py
python3 scripts/magazzino-p2/test_operazioni.py
python3 scripts/magazzino-p2/test_controllo.py
python3 scripts/magazzino-p2/test_valorizzazione.py
python3 scripts/magazzino-p2/server_locale.py
```

`schema-locale.sql` rifiuta database con nome diverso da `eic_magazzino_p2`, ricrea lo schema di prova e installa colonne, vincoli e trigger pertinenti verificati sullo schema reale. I test aprono processi `psql` distinti, con transazioni sovrapposte; chiamano le RPC come ruolo `authenticated`. I controlli dei permessi usano identità e aziende sintetiche. La fixture include i trigger reali di prenotazione, quantità, costo del movimento, medio ponderato e scarico automatico. Il calcolo del prezzo da ODA è escluso: i test impostano esplicitamente i costi. Audit, automazioni e ricalcoli globali della piattaforma non sono riprodotti.

Il runner ripristina i dati sintetici prima di ogni caso. Non eseguirlo mentre si sta usando il laboratorio interattivo; dopo un giro di test usare «Ripristina dati di prova» nel laboratorio. Il pulsante aggiorna anche gli identificativi conservati dal server.

Le proposte SQL sono deliberatamente fuori da `supabase/migrations`: non vengono pubblicate dal flusso di migrazione. Il frontend rileva le capacità del servizio e usa i protocolli 2 e 3 solo quando disponibili; errori di rete, permessi o delle nuove RPC non causano un ripiego automatico verso scritture legacy.

## Dentro il gestionale (aggiunta successiva)

Con server 8117 e Vite 8096 attivi, aprire <http://127.0.0.1:8096/azienda/magazzino?warehouseLocal=1>.

Il plugin `dev/magazzino-local/plugin.mts` funziona solo con Vite `serve`; i moduli del gestionale effettuano le scritture sulle RPC PostgreSQL del laboratorio. Il collegamento non richiede o inoltra credenziali del servizio online. Cache persistente e identità delle richieste vengono isolate. Le funzioni non supportate vengono rifiutate.

Test del collegamento: `python3 scripts/magazzino-p2/test_bridge.py`. Questo comando ripristina la fixture a ogni caso: usarlo fuori dal collaudo interattivo e poi ripristinare i dati di prova dal banner, prima di riprendere l'interfaccia.

Per il dettaglio dei flussi verificati, vedere `docs/ux/magazzino-integrato/revisione.md`.

## Trasferimenti, inventario e riordino

Lo schema aggiuntivo `schema-operazioni.sql` riproduce le colonne e la numerazione ODA verificate; la proposta P3 aggiunge transazioni, conteggi decimali e rilevamento delle richieste ripetute. Anche queste funzioni sono installate soltanto nel database sintetico locale. I nuovi casi concorrenti sono in `test_operazioni.py`.

La fixture ripristinata contiene due depositi, cavo in metri, pannelli in mq, una pompa già consegnata e un motore con due matricole disponibili. Dal gestionale: pulsante Trasferisci, azione Inventario di ogni riga in Giacenze e pulsante Riordina. Per risultati e schermate vedere `docs/ux/magazzino-operazioni/revisione.md`.

## Audit completo 17–18 novembre 2026

Aggiunti recupero delle richieste con esito incerto, importazione atomica con unità esplicita e movimenti iniziali, autorizzazioni dei depositi nelle RPC P2 e valorizzazione protetta con copertura parziale dei lotti dichiarata. Il cluster è stato spostato nella cache utente perché la cartella temporanea è stata rimossa durante il collaudo. Per il rapporto vedere `docs/ux/magazzino-controllo-completo/revisione.md`.

La sonda di risposta persa è solo nel server locale: un file `/private/tmp/eic-magazzino-audit-response-loss.json` con `{"resource":"rpc/warehouse_inventory_count_v3"}` fa perdere una singola risposta dopo il commit. Il file viene consumato e cancellato. Non eseguire test che resettano la fixture mentre si sta lavorando nell’interfaccia.

## Prepubblicazione: ricezioni ODA/DDT (18 novembre 2026)

Dopo lo schema e le proposte P2–P4, caricare **esclusivamente** nella fixture:

```sh
/opt/homebrew/opt/postgresql@17/bin/psql -X -1 -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55439 -d eic_magazzino_p2 -f scripts/magazzino-p2/schema-ricezioni.sql -f docs/sql-proposte/magazzino-p5-ricezioni-ddt.sql
python3 scripts/magazzino-p2/test_ricezioni.py
python3 scripts/magazzino-p2/test_bridge.py
```

`schema-ricezioni.sql` riproduce le firme e i corpi verificati delle funzioni canoniche; la proposta P5 le corregge. Il generatore fiscale e l'insieme dei permessi fiscali restano surrogati espliciti della fixture. Sono reali i corpi delle nuove RPC, i lock, il registro delle richieste, i movimenti, le prenotazioni e il ricalcolo delle ricezioni; audit e automazioni globali non sono riprodotti.

Le ricezioni da scansione e documentali condividono il residuo tramite un registro interno chiuso alle letture dirette. Le richieste incerte si recuperano dal pannello del Magazzino con la stessa chiave. `create_ddt_from_uscita` blocca la riga dell'uscita e riapre il documento esistente senza un secondo scarico. Il collegamento locale legge anche le viste degli elenchi fiscali dalla fixture.

Non installare la proposta su un ambiente esistente senza riconciliare le ricezioni pregresse: le vecchie scansioni non disponevano del registro P5. Nessuna migrazione online è stata creata o applicata. Il rapporto di questa fase è `docs/ux/magazzino-prepubblicazione/revisione.md`.

## Prenotazione dal gestionale (18 novembre 2026)

La proposta `docs/sql-proposte/magazzino-p8-prenotazioni.sql` sostituisce soltanto la RPC di prenotazione, conservando firma e permessi. Dopo P2–P7 applicarla esclusivamente al database locale di collaudo: controlla anche il fabbisogno al netto di prelievi e resi. Il bootstrap integrato la include. I nuovi test con rollback sono `scripts/magazzino-integrato/test_reservations.py`; la prova concorrente prenotazione/prelievo è in `test_concurrency.py`. I runner che ripristinano dati vanno usati sul database di regressione separato, non mentre si usa il laboratorio interattivo.

Il gestionale offre Prenota nella barra e nel menu articolo. La riga materiali deve essere già associata alla commessa; il dialogo non crea righe contrattuali implicitamente. Carica articolo usa lo stesso percorso ODA/carico libero della pagina, con articolo precompilato. Il ciclo completo è documentato in `docs/ux/magazzino-prenotazioni/revisione.md`. Nessuna di queste proposte è stata pubblicata online.

## Carico libero con costo aziendale (P9, solo locale)

Dopo P2–P8 applicare `docs/sql-proposte/magazzino-p9-carico-costi.sql` solo ai database di collaudo. Il bootstrap integrato la include. Conserva firma e chiave della RPC: l'opzione costo entra nel payload idempotente della prima riga; movimento, costo e relativi trigger sono una sola transazione. Nessun costo è creato se l'opzione non è selezionata. Servono permessi Magazzino e costi/acquisti; un servizio senza la capacità `atomic_company_cost` viene fermato prima di qualunque scrittura con costo.

`Preleva articolo` apre ora lo stesso flusso di uscita della barra, con articolo e deposito precompilati. Per un'uscita senza commessa rimane il destinatario Libero, utilizzabile anche per indicare uso interno/scarto. La vista Valore separa le quantità per unità e Da preparare distingue contrattuale, prenotato, netto fuori deposito e residuo da coprire. Prove: `docs/ux/magazzino-correzioni-rilascio/` e `scripts/magazzino-integrato/test_carico_costi.py`. Nessuna applicazione online.
