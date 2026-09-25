# Agenda personale dei turni — incremento locale O1c

## Stato e confine

Implementati adapter, hook e componente dell'agenda personale; integrati in Home Campo e nel giorno selezionato di Lavori. Attivazione esclusivamente con `VITE_INTERNAL_TEAM_ROSTERS_LOCAL=true` **e backend loopback**. Un frontend localhost collegato a Supabase remoto non mostra la sezione né esegue nuove RPC. Nessun file `.env`, migrazione ordinata, deployment o dato operativo remoto è stato modificato.

La proposta `supabase/proposals/campo_crew_agenda_local_proposal.sql` è stata eseguita e collaudata dentro una transazione locale poi annullata: **non è installata permanentemente**, né sul remoto né sulla fixture condivisa. Dipende dalle proposte roster e turni. Il browser dimostrativo usa il componente e l'hook reali con risposte API sintetiche, non una sessione operaio sul backend remoto.

## Funzioni

- Giorno, orario previsto, cantiere, indirizzo, squadra e lavorazione. Due cantieri nello stesso giorno restano due turni, senza sommare la durata nelle ore lavorate.
- Aggiornamento ogni 30 secondi quando visibile, al ritorno nell'app, alla riconnessione e manualmente. La Home cambia giorno secondo Europe/Rome anche restando aperta; la data scelta in Lavori resta quella selezionata.
- Chiavi query per azienda, utente e intervallo. Nessun dato precedente riutilizzato come placeholder al cambio identità. Errori distinti dall'assenza di turni; una risposta non verificabile non viene mostrata come calendario vuoto.
- Un turno annullato resta riconoscibile ma non propone azioni. Una revisione che esclude l'operaio o sposta la data non fa ricomparire il vecchio turno.
- «Apri cantiere» e «Vai alla timbratura» richiedono una delle assegnazioni operative già riconosciute dal modello Campo. La timbratura è proposta solo sul giorno corrente. Nessuna azione registra presenze da sola.
- In mancanza dell'incarico, la scheda indica «Accesso operativo da attivare». Il referente è solo organizzativo, non acquista privilegi da capocantiere.
- Salvataggio/annullamento lato ufficio invalida anche l'agenda nella stessa sessione; tra sessioni separate l'aggiornamento è tramite polling/focus, non push realtime.

## Contratto di sicurezza della proposta

La funzione pubblica è `SECURITY INVOKER`. Una funzione privata `internal_team_planning.my_agenda_v1` esegue una proiezione minima dei soli turni personali: non espone il roster completo, persone escluse, note libere, costi o ruoli operativi. È deliberatamente privilegiata perché concedere lettura alla tabella sorgente esporrebbe altri partecipanti e versioni. Richiede identità autenticata, utente non bloccato, azienda accessibile, dipendente attivo appartenente all'azienda e contemporanea corrispondenza dell'account corrente con quello fotografato nel turno. L'account non è un parametro della RPC.

L'ultima revisione è individuata prima dei filtri per persona e giorno. L'intervallo massimo è 32 giorni. Squadra, commessa e fase devono appartenere alla stessa azienda; la fase alla stessa commessa. Nessuna policy legacy viene modificata. Il feed autorizza la sola lettura dei dati organizzativi minimi del proprio turno, **non** la lettura completa dell'ordine, l'invio di rapportini o l'accesso Storage.

La separazione fra autenticazione e autorizzazione e il privilegio minimo seguono le verifiche della skill Supabase/Postgres e la [documentazione RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verifica ripetibile

- 293 test Vitest in 19 file, compresi roster/turni esistenti, ore, assegnazioni, rapportini e revisione costi.
- `node scripts/test-campo-crew-agenda-local.mjs`: 21 verifiche PostgreSQL con ruoli authenticated/anon e claim utente. Guardie di contesto Docker e marker della fixture; tutte le modifiche strutturali e i dati sono transazionali e vengono annullati. Gli helper di autorizzazione di base sono ridotti: non è il collaudo dell'intero schema applicativo.
- Verificati account/azienda estranei, utente bloccato, assenza di identità, ACL anonime revocate, sostituzione, annullamento, spostamento di data, disattivazione, cambio account/azienda, assenza di modifiche ai costi e alle assegnazioni legacy.
- 24 controlli browser a 320/390/768/1440 px con risposte sintetiche; errori, annullamento, rimozione di turno/incarico e assenza di overflow. Nessuna richiesta esterna.
- TypeScript: zero diagnostiche nei 7 file selezionati, incluso vite-env. ESLint pulito nei nuovi moduli e in InternalTeamShifts. CampoCalendario conserva 2 errori preesistenti, confermati sulla copia precedente, relativi a memoizzazione e geocoding/setState; CampoHome conserva 7 warning `any`. Non corretti perché estranei all'incremento.
- Bundle Vite isolato riuscito con heap Node di 8 GB; il primo tentativo con limite predefinito di 4 GB è terminato per memoria. Escluso il postprocessore HTML che scrive nella `dist` condivisa. Non eseguita la pipeline completa di pubblicazione.
- Advisor security della fixture locale senza segnalazioni; eseguito dopo il rollback, quindi **non** certifica la nuova proposta o le policy applicative complete.

Nota sul collaudo: la prima esecuzione di un blocco PL/pgSQL sotto ruolo anon ha causato un crash del processo PostgreSQL della VM sintetica, recuperato automaticamente. Il controllo anonimo è stato sostituito con la verifica delle ACL su entrambe le funzioni; non viene rivendicato un test REST anonimo end-to-end. Nessuna modifica della transazione fallita è stata conservata.

## Restante per l'integrazione operativa completa

1. Definire per quanto tempo, dopo il turno, è consentito inviare il rapportino. Non dedurre una scadenza di autorizzazione dagli orari di lavoro senza una regola condivisa.
2. Riprodurre helper e policy reali, introdurre la fonte turno con scadenza/revoca e verificare tutte le risorse collegate: ordine, fasi, materiali, foto, documenti, chat, rapportini. Preservare gli accessi manuali e da subappalto.
3. Verificare invio/approvazione/idempotenza e costi con due sessioni e dati di test, account operaio/capo/subappaltatore. L'agenda delle squadre interne non cambia i contratti dei subappaltatori.
4. Revisione e attivazione esplicita della migrazione definitiva, solo dopo il collaudo completo. Nessun `db push` per queste proposte.
