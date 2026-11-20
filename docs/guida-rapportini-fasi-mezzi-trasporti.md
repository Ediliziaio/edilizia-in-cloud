# Rapportini, lavorazioni, mezzi e trasporti

Le funzioni descritte in questa revisione richiedono il rilascio della PR e dell'aggiornamento delle funzioni del database associato.

## Correggere un rapportino

Aprire il rapportino dall'elenco generale o dalla commessa e scegliere **Modifica rapportino**. Si possono correggere descrizione, note, ore, operai, materiali e mezzi. Per sostituire un mezzo, togliere quello errato e aggiungere quello corretto. Nel quadro economico, la matita accanto a una voce già inserita permette di modificarne descrizione, quantità, unità, costo, prezzo di vendita se autorizzati e dettagli del viaggio.

Sugli approvati occorre motivare la correzione. Se un utente dello staff corregge il proprio rapportino già approvato, il documento torna in attesa di approvazione da parte di un altro utente dell'ufficio. Ore e costi sono ricalcolati insieme alla modifica. I documenti collegati a rendiconti confermati o a un giornale firmato impediscono la correzione: occorre prima gestire il documento collegato.

Se nel frattempo un altro utente ha modificato la stessa versione, il salvataggio si ferma: recuperare il testo digitato e riaprire il modulo. Una modifica del listino non riscrive i prezzi già salvati nelle voci.

## Togliere i rapportini di prova

Scegliere **Elimina rapportino** sui documenti non approvati oppure **Annulla rapportino** sugli approvati, quindi inserire un motivo e confermare. Il documento scompare dagli elenchi operativi e i suoi effetti vengono stornati. Lo storico resta consultabile e, nella commessa, il pulsante **Mostra annullati** consente di ritrovarlo. L'annullamento è definitivo; per reinserire le ore occorre un nuovo rapportino. Le ore già annullate dall'ufficio si reinseriscono da **Ore e persone**.

Questa revisione non rimuove automaticamente alcun dato di Vulcano: gli utenti possono scegliere quali prove eliminare.

## Rimuovere una fase ripetuta

Nella lista delle lavorazioni della commessa aprire **Altre azioni** (⋯) sulla fase da rimuovere e scegliere **Elimina fase**. Prima di confermare leggere i collegamenti e gli effetti indicati nel dialogo, soprattutto se la fase contiene già lavorazioni. Le fasi collegate a documenti possono richiedere la gestione preventiva dei collegamenti.

Riapplicando un modello, le fasi con lo stesso nome vengono mantenute, insieme alle date e al venduto: si aggiungono solo le fasi e sottofasi mancanti. Le copie esistenti restano da valutare manualmente.

## Capire mezzi, noli e listino

| Voce | Dove si imposta | Effetto |
|---|---|---|
| Costo interno orario del mezzo | Scheda del mezzo, Costo orario | Le ore dei rapportini approvati ripartiscono il costo sulla commessa. Può essere calcolato dalle spese o impostato manualmente. |
| Prezzo del nolo al cliente | Quadro economico del rapportino, **Collega il mezzo al suo nolo del listino** | Definisce il ricavo secondo la voce di listino collegata, distinto dal costo interno. |
| Noleggio acquistato da un fornitore | Pianificazione risorse e spese; fatture collegate e confermate | La tariffa pianificata stima il costo; la fattura alimenta il costo effettivo senza essere contata due volte. |

Le ore del mezzo vuote o pari a zero attivano la stima prevista dal sistema. Per un mezzo non utilizzato, rimuovere la riga. Le modifiche alla scheda non riscrivono automaticamente i prezzi già fissati nei rapportini approvati.

## Compilare il rapporto trasporti

Dalla sezione rapportini della commessa scegliere **Crea documento PDF → Rapporto trasporti**. Cliente, commessa e indirizzo sono precompilati. Compilare viaggi, carico, scarico, mezzo, DDT e importi, quindi usare **Anteprima PDF**. Il documento manuale è disponibile anche senza rapportini approvati.

**Rendiconto trasporti al cliente** prepara invece il documento dai viaggi registrati nei rapportini approvati, usando i prezzi di vendita; richiede il permesso di accesso alle voci economiche. Entrambi i comandi restano disponibili anche nell'elenco generale dei rapportini.
