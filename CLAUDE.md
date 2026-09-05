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
