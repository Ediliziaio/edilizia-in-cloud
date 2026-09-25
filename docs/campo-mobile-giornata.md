# Campo mobile: timbratura e rapportino giornaliero

Stato: implementazione frontend locale, 24 settembre 2026. Nessun deploy o modifica al database remoto.

## Regole applicate

- Giornata civile in `Europe/Rome`, indipendente dal fuso del telefono, inclusi cambio ora, mese e anno.
- Il rapportino scritto permette oggi o ieri. Invio fino alle 23:59:59.999 del giorno successivo: non sette giorni, non una finestra mobile di 24 ore.
- Giorno scelto congelato nel modulo e trasportato in `?data=YYYY-MM-DD`, query ore, payload e diario. Nessuna conversione automatica di un modulo scaduto in un rapportino di oggi.
- Controllo al rientro nell'app e prima dell'invio, ripetuto dopo operazioni asincrone; i dati restano visibili in un modulo scaduto. Cambiare giornata richiede conferma se ci sono dati e ricrea il modulo.
- Il vincolo già esistente è autore + cantiere + giornata. Non è un unico rapportino per l'intera azienda né per tutti i cantieri del lavoratore. L'interfaccia non promette più di creare un secondo rapporto identico.
- Rapportino vocale: giornata della registrazione conservata anche alla conferma il giorno dopo; duplicati non sovrascritti con upsert. La coda offline conserva la giornata originale e non sposta la data al tentativo di sincronizzazione.

## Percorso operativo

1. Home o Timbratura: scegli cantiere, TIMBRA ENTRATA.
2. Durante il lavoro: pausa facoltativa, con comando secondario.
3. Al termine sul cantiere: TIMBRA USCITA, comando principale. Il GPS non disponibile non impedisce la registrazione; viene dichiarata l'assenza di posizione.
4. Se cambi cantiere: chiudi prima il precedente, scegli il successivo e timbra una nuova entrata. Pausa e uscita mantengono il sito della sessione aperta.
5. Rapportino: scegli oggi/ieri, verifica ore specifiche del cantiere al netto delle pause, descrivi lavoro, foto e materiali. Il modulo avvisa e impedisce l'invio della giornata corrente se la sessione sullo stesso cantiere è ancora aperta. Una sessione su un altro cantiere non deve bloccare la dichiarazione del precedente.
6. Home: promemoria distinti per giorno/cantiere, ieri prima di oggi, apertura diretta della giornata corretta. Le uscite notturne confermate vengono lette anche dal giorno successivo e ripartite alla mezzanotte italiana.

La pausa resta facoltativa, non è un passaggio obbligato prima dell'uscita. I comandi principali sono condivisi fra Home e pagina dedicata. Nel wizard resta nascosta la navigazione inferiore dell'app; quantità e unità materiali usano controlli più grandi e testo da 16px.

## Database: proposta, non migrazione applicata

`supabase/proposals/campo_daily_report_window_local_proposal.sql` contiene un trigger a privilegi invoker e una funzione pura di verifica della data. Il trigger usa l'ora del server, impedisce lo spostamento di data e l'inserimento/modifica tardiva dei dati di campo; consente successive approvazioni, rifiuti e aggiornamenti derivati (PDF/costi) senza allargare RLS o permessi. Nessuna cancellazione/backfill di dati esistenti.

Il test `scripts/test-campo-daily-window-local.mjs` funziona solo nel contenitore locale dedicato con marker `synthetic-shifts-v1`, rifiuta una tabella rapportini preesistente e annulla tutta la transazione. Le prove verificano la regola e il trigger su una tabella sintetica: non certificano l'intero insieme dei trigger/RLS reali.

Prima di promuovere la proposta: prova sullo schema completo, verifica interazione con trigger approvazioni/costi, definisci eventuale riapertura autorizzata e tracciata dall'ufficio. Non attivare automaticamente sul progetto Supabase remoto.

## Limiti dichiarati

- Validazione browser responsive con layout e pagine reali, hook del tempo e promemoria reali, dati/API sintetici. Non è una prova su telefono fisico né una validazione Capacitor/iOS/Android di GPS, fotocamera, tastiera e sospensione.
- Il blocco sul database remoto non è attivo finché la proposta non viene approvata e distribuita. Il solo client non è una barriera di sicurezza.
- La coda vocale legacy salva la nota in `rapportini_vocali`, non completa atomicamente il rapporto in `campo_rapportini`. Il messaggio offline non promette più che la commessa sia già aggiornata; questa sincronizzazione richiede un intervento separato.
- Una timbratura molto vecchia senza uscita, la riapertura dei rapportini scaduti/rifiutati, i conflitti fra telefoni e la riapprovazione dei costi non sono risolti inventando orari o sovrascrivendo dati. Servono percorsi ufficio/autorizzazioni dedicati.
- Nessuna nuova assegnazione di cantieri, nomina capocantiere, trasformazione del subappalto in costo orario, movimentazione automatica di magazzino o applicazione automatica di avanzamento.

## Collaudo

- 396 test di regressione su 28 file (logica, UI e contratti statici; non tutti end-to-end).
- 51 gruppi di controlli browser su 320, 390, 768, 1440px e viewport ridotta a 390×430: entrata, pausa, uscita, cambio cantiere, ieri, materiali, duplicati, scadenza al rientro e conservazione del modulo.
- 15 controlli PostgreSQL locali, transazione annullata.
- Build Vite isolata superata; escluso il postprocessore HTML che scrive su `dist` condivisa. Non eseguito l'intero prerender di produzione.
- Controllo TypeScript mirato a 14 file: resta un errore sul percorso generico preesistente `supabase.from(item.target)` della coda offline; non viene mascherato con un cast.
- ESLint: i file nuovi e le modifiche principali non introducono errori; restano l'effetto preesistente `setLocal(draft)` nel form vocale e sette warning `any` nella Home.
