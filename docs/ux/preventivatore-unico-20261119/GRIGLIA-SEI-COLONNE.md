# Computo: griglia unica e anteprima a richiesta

Sviluppo locale in `/Users/andriciuc/worktrees/impostazioni-omogenee`, app su http://127.0.0.1:8096.

Il PDF cliente presenta N., descrizione con codice, U.M., quantità, prezzo unitario e importo. Per ciascuna voce il lettore trova prima la descrizione, poi le misure abilitate e infine la riga SOMMANO con i valori economici, senza ripetizione dei prezzi in testa. Le dimensioni utilizzate compaiono nelle righe di misura; il comando «Dettaglio delle misure» del passo Documento ne regola la stampa. IVA e sconto del computo restano nel riepilogo quando applicati, secondo i dati già presenti. Il totale finale rimane entro 12 pt.

Le intestazioni si ripetono sui cambi pagina, le voci proseguite vengono identificate e la chiusura resta insieme all'ultima porzione di misura. I sottocapitoli hanno uno stacco dalla tabella precedente.

Nell'editor i dettagli completi si aprono sotto la lavorazione. Aggiunta, duplicazione, riordino, costi interni, formule e opzioni tecniche mantengono le funzioni precedenti. «Mostra PDF / Nascondi PDF», vicino al totale, apre o chiude l'anteprima aggiornata; quando aperta l'indice laterale diventa un selettore per restituire spazio alla tabella e al PDF. Da 1024 px si usa l'affiancamento; sui dispositivi più stretti il pulsante apre l'anteprima in finestra. I filtri di lavoro non limitano il contenuto del PDF.

## Verifica

- PDF completo scaricato dall'app: `output/pdf/computo-genzano-sei-colonne.pdf`, 66 pagine.
- Confronto indipendente con il computo originale: 226 voci, 572 misure, quantità, fattori, unitari e importi coincidenti. Totale 2.642.936,35 euro; nessun duplicato. La voce 30 conserva la rappresentazione equivalente già presente nella bozza: quantità negativa e unitario positivo.
- Render e ispezione delle 66 pagine, nessun carattere fuori pagina o segnaposto irrisolto.
- 9 file di test: 92 superati, 1 test preesistente condizionale saltato. Inclusi apertura/chiusura dell'anteprima, modifica inline, aggiunta senza prezzo, generazione di tutte le voci mentre l'elenco è filtrato e aggiornamento dopo una modifica.
- Lint e controllo diff superati. Typecheck mirato al renderer superato.
- Ripristinato il server locale 8096 sulla copia aggiornata: la porta serviva un altro checkout con l'interfaccia precedente. Copia locale della bozza conservata tramite il comando dell'app prima di riaprire quella salvata.

Dati e verifiche indipendenti: `verifica-sei-colonne.json`. Nessun commit, push o rilascio eseguito.
