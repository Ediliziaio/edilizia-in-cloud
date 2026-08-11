# Migrazioni — regola d'oro

**Se applichi SQL a mano in produzione, registralo subito.**

```bash
supabase migration repair --status applied <versione>
```

## Perché

Il registro `supabase_migrations.schema_migrations` è l'unica cosa che dice
"questa migrazione è già stata eseguita". Applicare SQL dal pannello Supabase o
via Management API **non** lo aggiorna: il database cambia, il registro no.

Quando le due cose divergono succedono due guai, entrambi visti davvero:

1. **Il check "Supabase Preview" resta rosso su ogni commit.** All'11/08/2026 il
   registro contava 4.007 versioni e la cartella del repo 3.675: 393 migrazioni
   erano state applicate a mano e non erano mai tornate nel codice. Sono state
   ricostruite dagli `statements` conservati nel registro (commit `dd47b9910`).

2. **Le migrazioni già applicate vengono rieseguite.** Il check applica le
   pendenti **in produzione**, in ordine, e si ferma al primo errore. Una
   `CREATE POLICY` senza `IF NOT EXISTS` esplode con "already exists"; peggio,
   una migrazione che semina dati demo li seminerebbe una seconda volta.

## Prima di dichiarare "applicata" una migrazione

Non fidarti del ricordo: **verifica che gli oggetti esistano davvero**.
Registrare come fatta una migrazione mai applicata è il modo più silenzioso di
perdere un fix per sempre — non verrà mai più eseguita.

- tabelle/viste → `to_regclass('public.x')`
- funzioni → `pg_proc`; per una `CREATE OR REPLACE` **non basta che la funzione
  esista**: cerca un frammento del corpo in `prosrc` (normalizzando gli spazi,
  in produzione il codice risulta riformattato)
- colonne → `information_schema.columns`
- policy → `pg_policies`, confronto **case-insensitive**
- indici → `pg_indexes`, trigger → `pg_trigger`

Caso reale: `20260610181000_ai_response_cache` risultava "da applicare" da due
mesi perché creava un indice con predicato `WHERE expires_at > now()`, che
Postgres rifiuta (`now()` è STABLE, non IMMUTABLE — errore 42P17). L'errore
faceva fallire l'intera migrazione, quindi la tabella non è mai esistita e la
cache delle risposte AI non ha mai funzionato, in silenzio.

## Timestamp duplicati

Due file con la stessa versione mandano in errore la CLI. Se la versione è già
registrata sul remoto **non rinominare il file**: cambiargli versione la fa
risultare pendente e la fa riapplicare. Rinomina solo quelle non ancora
registrate (al secondo successivo: `...000000` → `...000001`).
