# «Crea con Silvio»: cosa serve per pubblicarlo (2/11/2026)

Ramo locale `claude/scm-completo`, mai pushato, unito con `main` il 2/11. Niente di questo documento è stato eseguito.
Controlli sul ramo: `typecheck:ci` 619 errori su soglia 703; build, lint e test `silvioCommessa*` passano.

## Prima del push
1. **`20281106160000_documenti_azienda_conta_versioni`**: è nel registro di produzione ma non ha file, né qui né su `main`.
   Va ricostruito da `supabase_migrations.schema_migrations.statements`, o Supabase Preview può diventare rosso.
2. Unire di nuovo `main` e controllare che le versioni `20281112*` siano ancora libere (`ls supabase/migrations/<versione>_*.sql`).
3. Rilanciare `typecheck:ci`, `build:fast` e i test. Non committare `preventivoRenderer.mjs` rigenerato.
4. Passare dal revisore di pubblicazione: il ramo ha 25 commit, compresa l'unione.

## Migrazioni, nell'ordine (`apply_migration`, poi riallineare la versione al nome del file)
- `20281112090000_silvio_correzioni`
- `20281112100000_commessa_bozze_silvio` (ridefinisce anche `commessa_pianifica_fasi`: stessa firma; con date incoerenti la data resta vuota)
- `20281112110000_silvio_crea_commessa_interruttore`
- `20281112120000_commesse_da_completare`
- `20281112130000_silvio_risorse_commessa`
- `20281112140000_silvio_autonomia`
- `20281112141000_silvio_piano_volo`
- `20281112142000_silvio_quanto_lavora`

Contengono `CREATE POLICY`, che su questo progetto prende lock su auth: scegliere un'ora con poco traffico. Non sono mai state
applicate davvero: le prove sono in transazioni annullate, e le policy solo come espressioni in un `SELECT`.

Il cron `supabase/migrations-pending/20281112142500_silvio_piano_volo_cron.sql` resta fuori dalla cartella finché `silvio-piano-volo`
non è online e provata a mano: un file in `supabase/migrations/` va in produzione al primo push.

## Funzioni edge
Il job parte solo dai file cambiati sotto `supabase/functions/`.
- Con `index.ts` toccato, partono da sole: `silvio-commessa`, `silvio-piano-volo`.
- Le altre importano `_shared/` cambiati, quindi vanno toccate o lanciate a mano col workflow:
  - `_shared/silvioTools.ts`: `ai-orchestrator`, `silvio-chat`, `silvio-execute-action`, `silvio-morning-brief`, `telegram-bot-processor`, `whatsapp-ai-processor`, `platform-mcp`;
  - `_shared/storageAmmesso.ts`: `generic-doc-ai-extract`, `ai-importa-condizioni`, `silvio-extract-pdf`, `ai-tabella-finanziamento-extract`, `ai-document-analyzer`, `ai-fattura-ricevuta-ocr`, `document-ai-router`, `ddt-ai-extract`, `ai-listino-extract`.
- L'elenco è per import diretto da `index.ts`: controllare anche gli import indiretti con `grep` prima del deploy.

## Dopo la pubblicazione, solo su Demo Azienda 2 (l'interruttore è acceso solo lì)
Prove mai fatte finora: migrazioni vere; letture con il provider AI vero (preventivo, contratto, computo, foto); iPhone e Android veri;
dettatura; annullamento su una commessa nata davvero prima; regole di accesso con utenti veri.

## Decisioni di Florin
- Soglia del margine (15 %).
- Autonomia predefinita per le aziende nuove.
- Testo del messaggio d'avvio al cliente.
- Lettura AI dei documenti del cliente.
- Le 2 aziende pilota.
- SAL nelle rate.
- «Completa» sui campi vuoti: oggi scrive senza chiedere conferma; chiederla ovunque cambierebbe il flusso.
- Squadra e condizioni della commessa: oggi Silvio le scrive solo per gli amministratori, come le policy.
- Annulla: nel dubbio rifiuta, anche per un trigger o un job che riscrive una colonna non tra quelle escluse.

## Cosa Silvio non sa ancora fare
Scrivere SAL dal contratto, acconto e saldo, bonus fiscali, ritenuta di garanzia, magazzino. Piano di volo «da solo» non esegue niente.
Fase 6: varianti, ritardi a catena, margine vero contro previsto, chiusura, imparare dalle commesse chiuse.
