# Storico migrazioni riallineato (5 settembre 2026)

## Il sintomo

Su ogni push a `main` il controllo **Supabase Preview** era rosso con un solo messaggio:

```
Remote migration versions not found in local migrations directory.
```

Era rosso da prima di questa serie di interventi: la stessa riga compare anche su
`f4a7b924e`, il commit precedente ai lavori sul SuperAdmin. Non è un effetto di
una migrazione recente, è un debito accumulato.

## La causa

Le migrazioni di questo progetto vengono applicate a produzione tramite MCP
(`apply_migration`), perché `supabase db push` non funziona da tempo sulla storia
disallineata. MCP registra la migrazione con il **timestamp reale del momento**
(`20260904124759`), mentre il file nel repository segue la convenzione
post-datata del progetto (`20280904100000_fix_cleanup_cestino_documenti.sql`).

Stessa migrazione, stesso SQL, due numeri diversi. Ripetuto per mesi, questo ha
prodotto due elenchi che non si incontravano mai:

- **204 versioni presenti in produzione e assenti dal repository** — le
  registrazioni MCP, più due voci `20280907000000` / `20280908000000`;
- **156 file presenti nel repository e mai registrati in produzione** — i file
  scritti dopo l'applicazione, o applicati direttamente dall'editor SQL, che non
  lascia traccia in `schema_migrations`.

Il controllo si ferma sul primo dei due elenchi e non arriva mai al secondo.

### Verifica, non supposizione

Il confronto non è stato fatto a occhio né sui conteggi: conteggi uguali non
significano insiemi uguali. È stata calcolata l'impronta `md5` dell'elenco
ordinato delle versioni, mese per mese, sui due lati. Su 26 mesi, 22 avevano
impronte identiche; la divergenza era tutta in `202608`, `202609`, `202802`,
`202809`.

Che i 156 file fossero davvero già applicati è stato verificato sugli oggetti,
non dedotto dai nomi: `openwa_campagne`, `openwa_campagna_destinatari`,
`v_ordine_esposizione`, `riepilogo_piattaforma`, `canarino_vitali`,
`openwa_campagna_prossimi` esistono tutti in produzione.

## L'intervento

Nessun DDL è stato eseguito sullo schema. Sono state toccate soltanto le righe
di `supabase_migrations.schema_migrations`:

1. Le 204 registrazioni orfane sono state **copiate integralmente** in
   `supabase_migrations.schema_migrations_archivio` — 760 kB di SQL, colonna
   `statements` compresa — e poi rimosse dall'elenco attivo. È l'equivalente di
   `supabase migration repair --status reverted`, ma senza perdere il testo:
   l'archivio resta interrogabile.
2. Le 156 versioni presenti solo nel repository sono state registrate come già
   applicate. È `supabase migration repair --status applied`.

Risultato: 4.311 versioni da entrambe le parti, con la stessa impronta
`85229bd84b9de406a02dbd0fc347dd35`. Il `db push` del controllo non ha più nulla
da applicare, e quindi nulla che possa andare storto su produzione — che era il
vero rischio di una correzione fatta a metà: allineare un solo lato avrebbe
sbloccato il push e mandato 156 migrazioni vecchie contro il database di
produzione.

## Cosa resta da sapere

Delle 204 registrazioni archiviate, circa 110 hanno un file omonimo nel
repository: il loro SQL è leggibile lì. Le altre ~94 sono correzioni intermedie
di sessioni passate (`blocca_prezzo_niente_check_bloccante`,
`fix_conteggio_utenti_distinti`, sonde temporanee) che non hanno mai avuto un
file proprio. Il loro SQL vive ora solo nella tabella di archivio: non va
cancellata.

Per rileggerne una:

```sql
select statements
  from supabase_migrations.schema_migrations_archivio
 where version = '20260904124759';
```

Questo riallineamento **non ripara il difetto a monte**: finché le migrazioni si
applicano via MCP, ogni nuova migrazione continuerà a registrarsi con un
timestamp diverso dal nome del file e lo scarto ricomincerà ad accumularsi. La
soluzione stabile è nominare il file con lo stesso timestamp che MCP userà, o
riportare `supabase db push` in funzione.
