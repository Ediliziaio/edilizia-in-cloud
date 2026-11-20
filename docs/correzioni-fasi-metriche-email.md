# Fasi, rapportini, metriche ed email in attesa

Il riordino delle fasi viene salvato con una sola operazione: tutte le posizioni vengono aggiornate oppure nessuna. Se un altro utente ha modificato l'elenco o l'ordine, occorre ricaricare le fasi prima di riprovare. Anche dopo un errore di rete l'elenco viene riletto, perché una risposta può perdersi dopo un salvataggio riuscito.

Quando non è possibile annullare un rapportino, il messaggio indica il motivo: documento confermato, pagina di giornale firmata, versione cambiata o permessi insufficienti. Restano validi i blocchi dei documenti ufficiali e la richiesta del motivo dell'annullamento.

In **Impostazioni amministrazione → Operazioni → Sincronizzazioni → Funzioni server**, i totali coprono tutte le chiamate misurate nelle ultime 24 ore. La tabella mostra al massimo 15 funzioni, ma questo limite non taglia i totali. I blocchi per pagamento o credito sono indicati separatamente nel totale delle risposte non riuscite. Un caricamento fallito mostra **Riprova metriche**, senza presentare falsi valori zero.

L'estrazione automatica delle opportunità dalle email viene accodata soltanto quando sono soddisfatti i requisiti di pagamento e credito AI dell'azienda. Le email già in attesa per credito riprendono al giro successivo del dispatcher dopo lo sblocco, senza aspettare il vecchio rinvio di un'ora. Il controllo preliminare non addebita crediti né avvia il provider; la funzione di estrazione ripete i controlli autorevoli prima dell'elaborazione. Restano separati i rinvii per guasti tecnici e lo stop dopo sei errori consecutivi.

Migrazione: `20290422195000_fasi_metriche_email_sblocco.sql`. Nessuna bonifica dei dati aziendali o modifica dei saldi è inclusa.
