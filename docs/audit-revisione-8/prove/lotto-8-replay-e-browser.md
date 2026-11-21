# Revisione 8 · Collaudo locale del lotto 8

Allineamento a `25f0b4ae19c0c583f68b02360b35ba6765297481` di `origin/main`. Il gestionale è stato provato in Chrome con login Supabase e due aziende sintetiche. PostgreSQL, Auth, PostgREST e Storage erano nello stack locale isolato. Il replay ha applicato tutte le **6.177 migrazioni**, comprese quelle dei lotti locali, con zero rinvii. Cron e richieste HTTP del database erano disattivati durante la prova.

## Correzioni

| Scheda | Prima | Dopo e prova |
| --- | --- | --- |
| EIC011 · Richiamate | Con errore in scrittura l’iscrizione avanzava mentre l’attività mancava. | Stato della coda verificato prima di avanzare. La ripetizione usa la stessa identità dell’attività e conserva quella già creata. Quattro casi con DB simulato, compresa una risposta persa. |
| EIC041 · Corsi | Con RPC indisponibile il secondo flusso cambiava il titolo e cancellava moduli e materiali prima del tentativo di reinserimento. | Il caricamento interrotto lascia integra la versione salvata e la bozza è disponibile nel browser. Ripetizione riuscita, visibile dopo un nuovo login. Un errore sul materiale ha fatto ripristinare l’intera transazione sul database completo. L’altra azienda vede zero righe. |
| EIC046 · Attività ricorrenti | Annulla cancellava anche l’occorrenza successiva già rinviata. | In Regia attività, completamento, rinvio e Annulla mantengono la data rinviata. Sul database, l’occorrenza intatta viene rimossa, una checklist modificata viene conservata e un annullamento sulla versione superata della madre viene respinto. |
| EIC073 · Rapportini | Il reinvio del solo testo produceva un payload ricostruito dalla squadra attuale. Nel database restavano 8 ore delle 16 originarie. | Il reinvio applica solo le modifiche esplicite alle presenze. La prova autenticata sul database completo mantiene due persone e 16 ore nella correzione del solo testo. Modifica e rimozione esplicita passano nei test della logica del modulo. |
| EIC004 · Registro di Silvio | L’anteprima troncata poteva far riconoscere una scrittura fallita come riuscita. Il registro la marcava eseguita e poteva registrare una bozza come creata. | Il registro usa l’esito strutturato di ogni strumento. La prova distingue fallimento, risultato parziale, successo e proposta in attesa. Un fallimento totale senza proposte non riceve la data di esecuzione e un errore di creazione non produce una traccia di bozza applicata. |
| EIC039 · Checklist offline | Il client accodava un salvataggio che poteva sostituire una checklist più recente. | Conserva entrambe le copie. Il database respinge una nuova riga con la stessa chiave e il client riconosce il proprio reinvio dopo risposta persa. Il browser autenticato come operaio ha accodato la checklist mentre era offline. Alla riconnessione la nota recente è rimasta sul server e la bozza è rimasta in IndexedDB con il conflitto. |
| EIC025 · Outlook | La scansione si fermava alla pagina 20 e confermava il successo. | Il test con Graph simulato raggiunge la pagina 21. Timeout, pagina ripetuta o aggiornamento del riepilogo fallito non vengono confermati. |
| EIC042 · Disdetta | Il titolo e il motivo sostituivano la descrizione. | Descrizione e motivo restano in campi distinti e visibili nel dettaglio. Il database conferma entrambi i casi con e senza motivo. Una scrittura obsoleta non invia notifiche nel test. |
| EIC070 · Opportunità in blocco | Con risposta persa dopo la scrittura del secondo lotto, il retry aggiungeva altre 501 opportunità. | Con la stessa operazione, il test verifica 501 opportunità dopo il retry e mantiene una modifica fatta nel frattempo. PostgreSQL verifica il comportamento della ripetizione con la stessa identità. |

## Verifiche sul database completo

- **EIC033** · Stornato il solo saldo da 800 € su un costo da 1.000 €. L’acconto da 200 € conserva la propria data. La ripetizione non genera un secondo storno. La scrittura da un’altra azienda riceve HTTP 403.
- **EIC060** · Due richieste autenticate salvano lo stesso listino dalla stessa revisione. Una riceve HTTP 200, l’altra HTTP 409. Dopo la rilettura resta una sola voce. La modifica da un’altra azienda riceve HTTP 403.
- **EIC076** · Due sessioni chiedono 60 unità ciascuna, con 100 disponibili. Una sola assegnazione viene registrata.
- **EIC081** · Le righe tutte indisponibili lasciano la richiesta senza ordine. Con un’offerta mista l’ordine contiene la sola riga disponibile con IVA al 10%.
- **EIC082** · Una revisione obsoleta o un client senza revisione non riapprovano un SAL contestato.
- Passano `permessi-retribuzioni-backend.sql`, `office-area-tasks.sql`, `controllo-gestione-tfr-patrimonio.sql` e `controllo-gestione-crediti-debiti.sql`.

La suite mirata iniziale ha superato 126 test in 15 file. Il controllo finale ha superato 684 test in 10 file, inclusi i casi parametrizzati di cantiere e le regressioni di corsi, richiamate, Silvio, Outlook, disdette e CRM. Passano il controllo TypeScript mirato e Deno sulle funzioni Edge interessate. La build Vite con minificazione disattivata è riuscita su uno stato intermedio del lotto. Gli ultimi interventi passano le verifiche mirate. ESLint rileva cinque errori già presenti sulla baseline in Regia attività e nel popup Appuntamento marketing. Le prove browser usano Auth locale e due contesti distinti. Il guasto del salvataggio del corso è simulato sulla richiesta del browser. Gli invii delle richiamate e gli strumenti di Silvio sono provati con fixture, senza contattare provider esterni.

## Caso confermato e ancora aperto

EIC074 · Dopo due approvazioni da 20 e 30 m², la voce mostra 50 m². Revocando prima quella da 20 m² il database mostra 50 e poi 20 m². Nell’ordine inverso mostra 20 e poi 0 m². La correzione deve conservare eventuali rettifiche manuali e gestire anche le revoche fuori sequenza.
