# Note operative del progetto

## Migrazioni: il repository e il database devono restare identici

Il controllo GitHub **Supabase Preview** confronta le versioni registrate in
`supabase_migrations.schema_migrations` con i nomi dei file in
`supabase/migrations/`. Se i due elenchi divergono, il controllo è rosso e il
deploy delle migrazioni si ferma. Il 5 settembre 2026 sono state riallineate
360 voci divergenti (vedi `docs/storico-migrazioni-riallineato.md`): da lì in
avanti il controllo è un guardiano vero, e va tenuto verde.

**Come applicare una migrazione**

1. Scrivere SQL **idempotente** (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP POLICY IF EXISTS` prima di `CREATE POLICY`).
2. Applicarla con il tool MCP `apply_migration` — **non** con `supabase db push`,
   che non è mai stato usato su questo progetto per lo schema.
3. MCP assegna una versione col timestamp reale (`20260905141822`), diversa dal
   nome del file. **Subito dopo, riallineare la riga al file:**

   ```sql
   update supabase_migrations.schema_migrations
      set version = '<versione del file>'
    where name = '<nome passato ad apply_migration>' and left(version, 4) = '2026';
   ```

4. Salvare il file come `<versione>_<nome>.sql`, con la stessa versione usata al
   punto 3, seguendo la numerazione post-datata del progetto (`2028…`).

Saltare il punto 3 è ciò che ha prodotto le 360 voci divergenti: nessuno se ne
accorge finché il controllo non diventa rosso, e a quel punto il disallineamento
è di mesi.

**Due file non possono avere la stessa versione.** La versione è la chiave
primaria di `schema_migrations`: se due migrazioni condividono il numero, il
push si ferma con `duplicate key`. Prima di scegliere un timestamp, verificare
che non sia già preso:

```bash
ls supabase/migrations/<versione>_*.sql
```

**Non cancellare `supabase_migrations.schema_migrations_archivio`.** Conserva
760 kB di SQL: 204 migrazioni applicate in passato, un centinaio delle quali non
ha alcun file nel repository.

## Migrazioni che toccano i dati, non solo lo schema

Il 5 settembre 2026 il database di produzione è rimasto irraggiungibile dall'esterno
per circa due ore. `pg_cron` continuava a girare dentro — 2.218 esecuzioni, zero
fallimenti — ma ogni connessione in ingresso andava in timeout: PostgREST non
riusciva più a ottenere una connessione e l'app era ferma. Il sospetto è una
migrazione di bonifica su una tabella da quasi centomila righe eseguita senza
protezioni, poi rifatta «in versione sicura».

Una migrazione che aggiunge una colonna o sostituisce una funzione è istantanea.
Una che **scrive righe** su una tabella grande può prendersi lock che bloccano
tutto il resto, e nessuno se ne accorge finché l'applicazione non si ferma. Prima
di un UPDATE o DELETE massivo:

```sql
SET LOCAL lock_timeout = '3s';       -- meglio fallire che bloccare la produzione
SET LOCAL statement_timeout = '60s'; -- e meglio fallire in fretta
```

Poi: restringere l'ambito (una sola azienda, un solo canale), preferire il
`deleted_at` alla cancellazione fisica, e lavorare a lotti invece che in un'unica
transazione. Se la migrazione fallisce per timeout è un buon esito: la si rifà
più piccola.

## Deploy

- Il frontend sta su **Cloudflare Pages**, non su Vercel. Il deploy parte dal
  push su `main` tramite l'app GitHub `cloudflare-workers-and-pages`.
- Le edge function vengono deployate dal job CI **Deploy edge functions** a ogni
  push su `main`: modificare un file sotto `supabase/functions/` e pushare è
  sufficiente, non serve `supabase functions deploy`.
- Le pagine admin sono lazy-loaded: dopo un deploy, l'hash del bundle principale
  può non cambiare anche se le pagine sono cambiate. Per verificare che una
  modifica sia online, guardare il chunk giusto (es. `adminRoutes-*.js`), non
  `index-*.js`.

## Segreti

I job `pg_cron` non devono contenere segreti scritti in chiaro: `cron.job.command`
è una tabella leggibile, e un dump se li porta via. L'header `x-cron-secret` si
legge dal Vault:

```sql
(select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
```

I nomi in uso sono `cron_secret`, `proactive_cron_secret` e
`silvio_internal_cron_secret`, uno per gruppo di edge function. Per ruotarne uno
basta aggiornare il valore nel Vault e la variabile d'ambiente della funzione
corrispondente: nessun job va toccato.

Anche i segreti di `platform_settings` stanno nel Vault, dal 19 settembre 2026,
col nome `platform_settings.<chiave>`. Segreta è ogni chiave con `_key`, `_secret`,
`_token`, `_pass` o `_password` (vedi `e_segreto_piattaforma()`); non lo sono le
chiavi pubbliche e gli indicatori come `openrouter_api_key_set`.
- Si leggono solo con `impostazione_piattaforma()` o `impostazioni_piattaforma()`,
  eseguibili dal service role. Nelle edge function passano da `getPlatformSetting`,
  `leggiImpostazionePiattaforma` o `leggiImpostazioniPiattaforma`: mai con una
  select sulla tabella, che per i segreti ha il valore vuoto.
- Si scrivono come prima (pagine admin, `manage-super-admins`): un trigger
  sposta il valore nel Vault e lascia nella tabella la riga vuota.

## Cron e pg_net: la coda è una sola

`pg_net` ha un solo worker, che elabora le richieste a lotti dentro **una**
transazione: finché la più lenta del lotto non risponde, nessuna risposta del
lotto è visibile e il lotto successivo non parte. È così fino alla 0.20.5, e non
c'è un'impostazione che lo cambi (`pg_net.batch_size` e `pg_net.ttl` sono altro).
Quindi **una funzione lenta ferma la coda di tutti i cron per tutto il tempo che
impiega**, fino a `timeout_milliseconds`. Il 20 settembre 2026 erano due:
`outreach-imap-poll` (oltre 120 secondi a ogni giro: coda ferma due minuti ogni
quarto d'ora) e `meta-leads-backfill` (90–120 secondi). Insieme, quasi tre ore
al giorno.

Due trappole viste quel giorno:
- Nei messaggi di timeout «DNS time: 120000 ms» **non vuol dire DNS lento**.
  pg_net lo deduce da due contatori di curl che restano a zero quando la
  connessione è riutilizzata: lo stesso job, agli stessi orari, alternava
  messaggi con e senza. Prima di credere al DNS, guardare se i timeout cadono a
  orari regolari (`extract(minute from created) % 15`): se sì, è un job.
  `created` è l'INIZIO del lotto, non il momento del timeout.
- Una funzione a cui pg_net chiude la connessione **non arriva in fondo**: il
  runtime non vede più né una richiesta né un `waitUntil` e ritira il worker
  (`EarlyDrop` in `function_logs`). `outreach-imap-poll` non completava un giro
  dal 16/09 e nessuno lo vedeva, perché avviso degli errori e registro dei giri
  stanno in fondo al giro.

Regole:
- Una funzione chiamata da un cron che può lavorare più di qualche secondo usa
  `serveConMetricheRapida` (`_shared/withMetricsRapida.ts`): a pg_net risponde
  entro 5 secondi (l'esito vero se ha finito, altrimenti 202) e finisce il lavoro
  sotto `EdgeRuntime.waitUntil`. Chi chiama dall'interfaccia riceve l'esito
  completo come prima: pg_net si riconosce dallo User-Agent `pg_net/…`.
- Un job nuovo che chiama una edge function aspetta **al massimo 15 secondi**
  (`timeout_milliseconds := 15000`). Oltre i 150 secondi è comunque inutile: il
  gateway chiude con un 504.
- Prima la funzione, poi l'attesa: accorciare l'attesa a una funzione ancora
  lenta fa salire i «timeout» del canarino, che conta ogni risposta senza status,
  e la fa ritirare a metà lavoro.
- Il lavoro che cresce coi dati (caselle, aziende, connessioni) va a rotazione,
  con un tetto per giro: il limite vero è la CPU del worker (2 secondi), non il
  tempo. Esempio: `outreach-imap-poll`, 25 caselle per giro dalle più vecchie.
- Sbloccata la coda, due giri della stessa funzione possono sovrapporsi: chi
  gira ogni minuto deve prendere in carico il lavoro in modo atomico
  (`_shared/presaInCarico.ts`).

Per vedere chi tiene ferma la coda: `execution_time_ms` per funzione in
`function_edge_logs` con User-Agent `pg_net/0.20.0`, oppure `latency_ms` in
`system_health_metrics`. Le query sono in testa alla migrazione
`20280920230000_cron_attese_brevi_pg_net`, che il 20 settembre 2026 ha portato a
15 secondi le attese delle otto funzioni già rapide (`email-poll-inbox`, i tre
`email-ai-*`, `outreach-imap-poll`, `meta-leads-backfill`,
`google-calendar-sync`, `outreach-dispatch`) e un tetto di 150 secondi a tutte
le altre. Lì c'è anche l'elenco di chi resta da convertire.

## Funzioni esposte ad anon

Una funzione `SECURITY DEFINER` eseguibile dal ruolo `anon` è chiamabile da
chiunque conosca l'URL del progetto. Il 7 settembre 2026 ne risultavano 235;
classificate, ne restano 43 con un motivo scritto. La classificazione vive nel
database, non nella memoria di chi l'ha fatta:

- `funzioni_pubbliche_di_proposito` — elenco delle RPC che DEVONO restare aperte
  (firma OdV/SAL via token, form talent, recensioni, slot calendario, token del
  portale, sonda del battito), con il motivo.
- `v_funzioni_aperte_ad_anon` — cosa è aperto adesso e perché. Una riga con
  motivo `NON CLASSIFICATA` è una funzione nuova rimasta aperta per sbaglio.

Regole: una funzione nuova nasce con `REVOKE ALL … FROM PUBLIC, anon` e un
`GRANT` esplicito a chi deve usarla. Le funzioni di trigger non hanno bisogno di
alcun `EXECUTE` (il privilegio non viene controllato allo scatto). Se una RPC
deve essere pubblica, va inserita in `funzioni_pubbliche_di_proposito` nella
stessa migrazione che la apre.

## Backup e ripristino delle aziende

Il job `company-backup-settimanale` (domenica 02:30 UTC) salva un JSON per
azienda in `company-exports`. Il contenuto lo decide `admin_tabelle_da_esportare()`
(ogni tabella con `company_id`, meno log e telemetria) e lo costruisce
`admin_esporta_azienda(uuid)` dentro il database — non via PostgREST, che taglia
a mille righe e su 628 tabelle costerebbe migliaia di chiamate.

`admin_ripristina_backup(dump, modo)`:
- `prova` — ricrea le tabelle in uno schema `ripristino_prova_*`, versa le righe,
  conta, butta via lo schema. Nessun effetto su `public`. Si lancia dalla scheda
  azienda → Lifecycle → Backup → «Prova ripristino», o via `company-restore`.
- `reale` — solo per un'azienda già purgata, tutto o niente. `profiles` non si
  ripristina: gli utenti vanno ricreati dall'auth.

Un backup che non ha passato la prova non è un backup. Collaudato il 7 settembre
2026 su Ke Bei Serramenti: 17.066 righe in 42 tabelle, tutte rientrate.
