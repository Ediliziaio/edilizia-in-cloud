# Organigramma e Sedi — revisione locale del 26 ottobre 2026

## Interventi

- Organigramma: separazione tra strutture gerarchiche e profili senza collegamenti, layout ortogonale calcolato sulle dimensioni dei sottoalberi, adattamento alle dimensioni effettive del contenitore, zoom manuale e rami richiudibili. La rotellina non viene intercettata.
- Ricerca per persona/ruolo/email, filtri reparto e sede, mantenimento degli antenati come contesto e lista con pulsanti accessibili per aprire il profilo.
- I profili autonomi non vengono classificati come errori. Riferimenti a responsabili non presenti tra gli attivi, riferimenti a sé stessi e cicli storici non fanno sparire persone: la vista interrompe i collegamenti problematici e li segnala, senza modificare il database.
- Corretto il montaggio del pannello Nuovo profilo anche con organigramma vuoto. Stati di errore distinti dagli stati vuoti.
- Sedi: ricerca nome/indirizzo/città/provincia, filtri attività/GPS, persone attive e inattive assegnate, pannello dettagli e collegamento alla sede filtrata nell'organigramma.
- Sede attiva e GPS configurato sono due informazioni distinte. La schermata mostra esplicitamente le sedi attive con coordinate da completare.
- Coordinate obbligatoriamente in coppia o entrambe vuote, intervalli validati e raggio 10–5000 m; ammessa la virgola decimale italiana. La validazione è ripetuta nei hook di scrittura per i valori forniti.
- Mappa e cerchio del raggio caricati solo su richiesta esplicita. Nessuna richiesta alla cartografia esterna all'apertura della pagina o del modulo. Nessuna nuova dipendenza.
- Utilizzato Leaflet diretto: la verifica nel browser ha rilevato l'incompatibilità del provider react-leaflet v5 con il React dell'app. La mappa diretta è stata riprovata nel browser e coperta da test di montaggio, aggiornamento, cleanup ed errore tile.
- Pulsanti di modifica disabilitati in sola lettura; consultazione organizzativa separata dal modulo editabile. Cambio azienda: moduli e stato locali vengono rimontati con la nuova identità aziendale.
- Lettura paginata dei profili dell'organigramma e delle assegnazioni alle sedi, ordinamento stabile e segnale di annullamento in ogni pagina. La query assegnazioni legge soltanto id, nome, cognome, mansione, sede_id, attivo, non dati retributivi o privati.
- Errore nella verifica dei dipendenti già sincronizzati: l'importazione si interrompe anziché trattare l'errore come elenco vuoto.
- Eliminazione meno esposta e disabilitata per sedi assegnate, anche a profili inattivi. La conferma resta aperta fino al successo. Nessuna garanzia di atomicità server aggiunta: il controllo e le policy esistenti sono conservati.

## Confine intenzionale: le due anagrafiche delle sedi

`sedi` e `hr_sedi` restano tabelle separate. Il pulsante è stato rinominato **Importa sedi mancanti** e la UI spiega che copia inizialmente i nomi non presenti, senza aggiornare sedi esistenti. Non è una sincronizzazione automatica.

Una sincronizzazione stabile richiede un riferimento persistente tra le due anagrafiche, regole per conflitti/duplicati e una migrazione coordinata. Non sono stati inventati collegamenti per nome né applicate modifiche al database condiviso in questo intervento.

## Verifiche

- Quattro nuovi file di test: `organizzazione.test.ts`, `organizzazioneHr.test.tsx`, `organizzazioneQueries.test.tsx`, `hrSedeMap.test.tsx`.
- 47 nuovi test; 256 test passati complessivamente su 21 file comprendendo presenze, ore, costi HR e Sedi aziendali.
- Test query con 1.001 profili e fallimento di una pagina successiva; nessun risultato parziale presentato come lettura riuscita, nessuna query senza company_id.
- Le scritture nei test sono simulate. Nessuna chiamata reale di creazione, modifica, sincronizzazione o eliminazione è stata eseguita.
- Browser, Demo Azienda 2: chiusura/apertura ramo, ricerca con antenati, dettaglio sede con attivi/inattivi, navigazione sede → organigramma, filtri GPS e ricerca per città.
- Mappa provata con coordinate pubbliche di esempio del centro di Milano, non con una posizione privata. Modulo chiuso con Annulla e nessun salvataggio.
- Immagini di verifica in `output/organizzazione-20261026/`.
- Build finale riuscita (`npm run build:fast`). Controllo TypeScript con ratchet riuscito: 655 errori preesistenti rispetto alla soglia 703, nessun incremento per file e nessun errore nei file di questo intervento. Baseline non modificata.
- Lint dei componenti, helper e nuovi test senza errori o warning; hook esistenti verificati senza errori di lint (restano warning preesistenti). `git diff --check` pulito.

## Pubblicazione

Solo implementazione locale. Nessuna migrazione, pubblicazione, push o invio ai clienti. Modifiche preesistenti degli altri terminali mantenute.
