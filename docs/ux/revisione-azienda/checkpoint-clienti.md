# Checkpoint: clienti e correzioni collegate

La revisione completa dell’area Azienda è ancora in corso. Questo checkpoint riguarda le correzioni a creazione clienti, scheda cliente e pannelli laterali, insieme alle regressioni di dashboard, manutenzione e ticket controllate nello stesso lotto. Tutte le modifiche sono locali: nessun commit, push o pubblicazione.

## Correzioni verificate

| Punto | Comportamento corretto | Verifica |
|---|---|---|
| Nuovo cliente | Blocca gli invii ripetuti durante la richiesta e dopo il successo; protegge campi e ritorno durante la creazione; conserva i dati dopo un errore e permette di riprovare. | 3 test frontend con API simulate. |
| Nuovo cliente in sola lettura | La modalità globale prevale anche per l’amministratore e blocca il submit, oltre al pulsante. | Fixture; nessun account reale creato. |
| Lettura del cliente | Un errore non viene più presentato come “Cliente non trovato”; sono disponibili riprova e ritorno all’elenco. Il cliente realmente assente conserva il suo stato dedicato. | Test con errore, riprova e risultato vuoto. |
| Riepilogo cliente | Durante caricamento o errore non mostra importi a zero o “niente di scaduto”. I dati già disponibili restano accompagnati dall’avviso di mancato aggiornamento. | Fixture e caricamento normale nel browser. |
| Eliminazione | Non è disponibile senza riepilogo affidabile, in sola lettura o durante il caricamento dei permessi. | Menu e callback protetti; nessuna cancellazione reale. |
| Anagrafica inline | I privilegi admin non scavalcano la sola lettura globale; durante il caricamento dei permessi non si apre la modifica. Il normale editor resta operativo. | Test di lettura e modifica simulata. |
| Pannello laterale | Comunica apertura e sezione ai lettori di schermo; “Chiudi” restituisce il focus al pulsante corretto. | Otto sezioni desktop e mobile visitate in Demo Azienda 2. |
| Note del nuovo cliente | Il campo ha un nome accessibile. | Verifica nel browser tramite ruolo e nome. |
| Salvataggio dashboard | Protezione dagli invii identici ripetuti da tastiera durante la richiesta. | Regressione riprodotta e corretta con test isolato. Non certifica tutti i casi di modifica concorrente/autosave. |

Non sono stati creati clienti, inviati messaggi o email, modificati dati anagrafici o eliminati record durante le verifiche nel browser.

## Esito dei controlli

- **113 test passati in un comando, su 15 file**: `/tmp/eic-azienda-clienti-blocco-finale-test.log`.
- Lint: nessun errore nei tre componenti clienti modificati e nei relativi test; due warning preesistenti nella pagina dettaglio. CreateCustomer, Builder e Hub mantengono gli errori di lint preesistenti documentati: il lint globale non è verde.
- `git diff --check`: passato.
- TypeScript generale: **passato senza errori, exit0**, `/tmp/eic-azienda-typecheck-clienti-blocco-finale.log`. La cache è stata confrontata con tutti i192 file TS/TSX modificati o nuovi: nessuna fonte diversa o assente.
- Ultima build completa: **243/243 pagine prerenderizzate, zero fallimenti**, `/tmp/eic-azienda-build-dashboard-listino.log`. È precedente agli ultimi ritocchi del blocco clienti e alla guardia CtrlS; non costituisce da sola una verifica di tutte le fonti attuali.

## Cosa manca

La mappa ha **221 voci ancora da verificare su 428**. Include layout, alias, schede e reindirizzamenti: non rappresenta 428 pagine distinte. Anche le voci già visitate mantengono copertura parziale dei loro flussi.

Per i clienti restano da approfondire le comunicazioni, le altre azioni del menu, l’accessibilità dei campi inline e alcune varianti documenti/duplicati/portale. Per le dashboard resta il comportamento di modifiche e risposte concorrenti durante l’autosalvataggio. Questi flussi non sono certificati da questo checkpoint.

Resta inoltre il problema strutturale dei piani di manutenzione senza contratto: possono non essere recuperati dalla scheda impianto. Serve definire il collegamento dei dati, mantenendo il contratto facoltativo. Nessuna migrazione è stata applicata.

La copertura dettagliata e i limiti sono nella [mappa della revisione](/Users/andriciuc/worktrees/impostazioni-omogenee/docs/ux/revisione-azienda/checklist.md).

## Anteprima locale

Il modulo è vuoto: i testi nei campi sono placeholder.

![Modulo nuovo cliente in locale](/tmp/eic-cliente-modulo-verificato.jpg)
