# Turni delle squadre interne — incremento locale O1b

## Confine del lavoro

Implementata la pianificazione collettiva giornaliera, **non ancora l'attivazione automatica degli incarichi Campo**. La nuova sezione si monta in `OrderWorkPhases` solo con backend loopback e `VITE_INTERNAL_TEAM_ROSTERS_LOCAL=true`. Su un frontend localhost che usa Supabase remoto resta assente, senza nuove query. Nessuna `.env` del progetto è stata modificata.

Il flusso: squadra abituale → giorno/orario/lavorazione → persone effettivamente previste → conferma. Si possono escludere membri e aggiungere dipendenti sostitutivi, anche senza account. La composizione standard resta invariata. Il referente non ottiene privilegi da capocantiere.

L'ufficio vede i turni per giorno, può annullarli con conferma e conserva lo storico. Per cambiare un turno già salvato, questa prima UI richiede annullamento e nuova pianificazione; la RPC supporta revisioni con confronto di versione, ma non c'è ancora un editor delle revisioni. Non sono implementati ripetizioni, intervalli di più giorni, turni notturni o calcolo di viaggio/pause/straordinari. La durata mostrata è una fascia oraria pianificata, non ore lavorate o costo preventivato.

## Database e accesso

Proposta `supabase/proposals/20260924133316_internal_team_shifts_local_proposal.sql`, fuori dalla catena di migrazioni; dipende dalla proposta dei roster. Non eseguire `db push` per questo incremento.

- `internal_team_shift_versions`: revisioni append-only, identificativo turno, predecessore, roster di origine, persone effettive, nomi/account fotografati e membri esclusi. Nessuna scrittura in `order_employees`, `order_external_teams`, `order_campo_assignments` o rapportini.
- Le RPC pubbliche restano `SECURITY INVOKER`. Le policy richiedono identità non bloccata, azienda accessibile, gestione persone oppure modifica commesse. La lettura dei turni rispetta anche la visibilità dell'ordine tramite RLS esistente.
- Il trigger verifica anche insert diretti: azienda, squadra interna attiva, lavorazione della commessa, versione della composizione, persone valide, referente presente, date e orari. L'annullamento conserva la fotografia anche se squadra o dipendente sono stati disattivati.
- Lock transazionale per azienda, poi per squadra. La granularità aziendale è deliberatamente conservativa: nessuna rete nella transazione; da misurare su volumi realistici. Richiesto READ COMMITTED. Vincolo univoco sul predecessore impedisce biforcazioni dello stesso turno.
- Le sovrapposizioni usano intervalli `[inizio,fine)`: cantieri consecutivi sono ammessi. Il controllo copre solo questi nuovi turni, **non** vecchie assegnazioni, appuntamenti, ferie o calendario esistente. Il trasferimento fra cantieri non è automaticamente valutato.
- Un solo lookup privilegiato, `internal_team_planning.has_overlap_v1`, in schema privato non esposto, restituisce esclusivamente un booleano per evitare sovrapposizioni con ordini non visibili. Controlla `auth.uid()`, permessi e azienda; `search_path` vuoto; EXECUTE revocato a PUBLIC/anon. Non espone nomi o dettagli di altri cantieri e non concede accessi Campo.
- Le FK restrittive preservano lo storico: cancellazioni di commesse, fasi e squadre referenziate richiedono verifica nel flusso reale. Non è una migrazione pronta per la produzione.

### Conflitti applicativi: PT409, non 40001

Il collaudo attraverso PostgREST ha riprodotto una richiesta in retry continuo quando una funzione sollevava `40001` per una versione obsoleta. Le due proposte e i rispettivi adapter ora usano/gestiscono `PT409` (HTTP 409); gli adapter riconoscono ancora `40001` per compatibilità. Non si cambia il trattamento degli errori di serializzazione reali del database. Problema descritto anche dalla [documentazione Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

## Collaudo isolato

`scripts/test-internal-team-shifts-local.mjs` usa Auth, PostgREST e PostgreSQL reali in una VM Docker dedicata; account `example.invalid`, dati sintetici, nessun file `.env` del repository. Le guardie aziendali e le tabelle legacy sono **fixture ridotte**, non lo schema reale completo. Il test di isolamento replica anche uno staff limitato a un solo ordine.

La ripetizione svuota esclusivamente le tre tabelle nuove della fixture, dopo verifica del marker e del contesto Docker. Non puntare lo script a un'applicazione installata: rifiuta un database con `orders` già presente senza il marker dedicato. Le modifiche strutturali successive richiedono un nuovo database di prova; il riavvio aggiorna solo le funzioni delle due proposte.

Verificati: retry con stessa operazione, ricevuta dopo annullamento, actor non falsificabile, ruoli negati, tenant separati, inserimento diretto, immutabilità, turni consecutivi, conflitti su altro cantiere anche nascosto, salvataggi e revisioni concorrenti. Test UI verificano conservazione selezioni, doppio invio, composizione aggiornata in background, stato vuoto distinto dall'errore e gate remoto.

## Per completare il flusso Campo

Aggiornamento O1c: l'agenda personale dei turni è ora integrata nel codice locale di Home/Lavori, con proposta SQL collaudata in transazione isolata. Non attiva automaticamente incarichi operativi: vedere `campo-crew-agenda-local.md` per confini, collaudi e installazione ancora non effettuata.

1. Riprodurre lo schema effettivo e gli helper reali, comprese deleghe, visibilità per ordine, disattivazioni/cambi azienda e cancellazioni. Il database sintetico non dimostra questa compatibilità.
2. Introdurre una fonte di autorizzazione per turno distinta da costi e assegnazioni manuali, con attivazione/scadenza/revoca. Conservare gli accessi derivanti da altre fonti.
3. Integrare quella fonte nella lettura comune Campo **e** nelle policy di ordini, lavorazioni, rapportini, materiali, foto/Storage, squadra del giorno e canali. Non basta aggiungere un filtro frontend.
4. Delega esplicita e revocabile del capocantiere; referente organizzativo separato.
5. Provare operaio, capo e subappaltatore, più cantieri nella stessa giornata, rapportini offline/retry, assenze e sostituzioni. Verificare una sola registrazione delle ore e dei costi approvati.
6. Solo dopo questi collaudi, proporre un'attivazione remota esplicita. Nessun deploy è incluso in questo lavoro.
