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
