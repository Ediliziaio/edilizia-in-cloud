# La voce selezionata porta alla sua posizione nel PDF

Intervento locale sulla porta 8096. Il clic su una lavorazione o il focus nei campi rapidi di quantità, prezzo, unità e misure seleziona anche la voce nell'anteprima, senza rigenerare il documento alla sola selezione. Il PDF resta apribile e richiudibile a richiesta.

Ogni voce stampata ha una destinazione nativa legata al suo ID, registrata dopo la paginazione sulla prima riga effettiva. I riferimenti vengono inclusi nei formati cliente, tecnico, senza prezzi ed elenco prezzi e sopravvivono alla normalizzazione dei font e all'aggiunta degli allegati. La selezione raggiunge la pagina e la posizione verticale della voce. Dopo una modifica e la rigenerazione la destinazione viene risolta nel nuovo PDF, anche se il numero della pagina cambia; lo zoom resta invariato. Cliccando di nuovo la stessa voce si può ricentrare la vista. Le voci escluse dalla stampa mantengono la vista corrente con un messaggio esplicito.

Il pannello condiviso conserva il comportamento precedente degli altri moduli, compresa la posizione nel capitolo durante la navigazione per sezioni. Le risposte asincrone superate da una nuova selezione vengono ignorate.

Verifica nell'app sul computo Genzano: voce 1 a pagina 3, voce 58 a pagina 21, voci 101 e 102 a pagina 39. Il PDF esportato conserva 66 pagine e 226 destinazioni native; il testo estratto è identico alla versione precedente. Nessuna variazione di quantità, misure, prezzi o totale.

8 file di test: 88 passati, 1 test condizionale preesistente saltato. Coperti numeri e descrizioni uguali, righe multipagina, spostamento su un'altra pagina dopo modifica, allegati, selezione ripetuta, zoom, selezioni asincrone e campi rapidi. Lint, typecheck mirato del renderer e del pannello condiviso e controllo diff superati. Nessun push o deploy.
