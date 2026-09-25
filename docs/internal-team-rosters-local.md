# Composizione delle squadre interne — incremento locale O1a

## Stato e confine

Interfaccia e proposta SQL implementate in locale. Nessuna migrazione applicata al backend condiviso. Non è ancora l'assegnazione collettiva del lotto O1 completo.

- Anagrafica esistente: `external_teams`, tipo `interna`.
- Composizione: versioni immutabili e membri basati su `employees.id`, con data di decorrenza e referente dipendente facoltativo.
- Un dipendente senza login può far parte della squadra. Nessun account o invito viene creato.
- Il referente della composizione non è automaticamente capocantiere. `leader_user_id` resta un riferimento anagrafico legacy separato: nessuna migrazione implicita né concessione di accessi.
- Nessun inserimento in `order_employees`, `order_external_teams` o `order_campo_assignments` dal nuovo salvataggio.
- Il nuovo selettore di subappalto esclude le squadre interne; le etichette delle assegnazioni storiche restano leggibili. Il controllo viene ripetuto nella mutation frontend. Non sostituisce la futura validazione database dell'assegnazione collettiva.

## Attivazione di sviluppo (solo backend isolato)

Sono richiesti entrambi:

1. `VITE_SUPABASE_URL` con hostname loopback esatto: `localhost`, `127.0.0.1` o `[::1]`.
2. `VITE_INTERNAL_TEAM_ROSTERS_LOCAL=true`.

La sola origine localhost del frontend non abilita nulla. Il client controlla nuovamente il blocco prima delle RPC. Il flag è un blocco di rilascio, **non un'autorizzazione**: le policy e le funzioni sul server verificano identità, azienda, ruolo e blocco utente.

SQL: `supabase/proposals/20260924125846_internal_team_rosters_local_proposal.sql`, creato con la CLI e tenuto fuori dalla catena delle migrazioni. La catena corrente contiene prerequisiti datati successivamente: non spostare questo file in migrations senza verificare ordine, schema reale e compatibilità. Non è uno script idempotente da rilanciare su uno schema già modificato.

Le RPC sono `SECURITY INVOKER`. Le tabelle nuove hanno RLS, grant SELECT/INSERT espliciti e nessun UPDATE/DELETE per authenticated; le versioni complete vengono create nella stessa transazione. Il comando usa una chiave operazione stabile, confronto di versione e lock per squadra. Un trigger differito rifiuta versioni senza membri anche per insert diretti. Il referente deve essere un membro tramite FK differita. Un membro non si aggiunge a una versione di una transazione già conclusa.

Le FK restrittive impediscono di eliminare persone/squadre referenziate nello storico: l'effetto sulle vecchie schermate di eliminazione va collaudato prima del rilascio. I cambi azienda/tipo di entità già referenziate richiedono ulteriore verifica sullo schema completo.

## Verifica riproducibile

```sh
npx vitest run src/test/logic/internalTeamRoster.test.ts src/test/ui/internalTeamRoster.test.tsx src/test/ui/internalTeamRosterGate.test.tsx src/test/ui/orderWorkPlanning.test.tsx src/test/ui/workAssignmentMutation.test.tsx
node scripts/test-internal-team-roster-sql.mjs /percorso/locale/node_modules/@electric-sql/pglite/dist/index.js
```

Lo script SQL crea solo un database PostgreSQL/WASM in memoria, due aziende sintetiche e ruoli fittizi. I 27 scenari verificano la proposta SQL, **non** l'implementazione reale delle guardie di autorizzazione, Auth, PostgREST, Storage o la concorrenza fra connessioni reali. Nessuna configurazione `.env` o credenziale viene letta dallo script.

## Prima del completamento O1

Aggiornamento O1b: implementata la pianificazione dei turni con persone effettive, sostituzioni, controlli di sovrapposizione e storico. Si veda `internal-team-shifts-local.md`. Non è ancora la concessione automatica degli incarichi Campo. Nel collaudo reale Auth/REST sono stati corretti i conflitti applicativi delle due proposte: ora `PT409`, non `40001`, per evitare retry automatici ripetuti.

- Riprodurre il backend completo isolato e verificare helper/permessi reali, grants e advisor.
- Collaudare la composizione tramite PostgREST con identità reali di test; verificare transazioni concorrenti, deattivazioni e cambi azienda/tipo.
- Implementare incarichi con composizione effettiva, periodi/turni, assenze e sostituzioni, senza duplicare righe economiche.
- Anteprima di accessi esistenti/aggiunti e delega del referente; salvataggio collettivo atomico.
- Lettura comune Campo, scadenza/revoca per fonte, verifiche operaio/capo/subappaltatore.
- Solo dopo, valutare un rilascio remoto esplicito. Nessun percorso di fallback scrive più righe individuali in sequenza per fingere atomicità.

La funzione pura `previewCrewAssignment` prepara e verifica il confronto con le assegnazioni di fase, ma non è ancora un flusso di assegnazione visibile nell'app.
