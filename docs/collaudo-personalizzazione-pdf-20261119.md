# Copertina del computo e logo delle fatture

Segnalazioni aggiuntive del 19 novembre 2026. Percorso confermato dall'utente: **Impostazioni dei modelli/PDF**.

## Risultato

- **Computo metrico:** «Sfondo della copertina» sceglie un colore indipendente dai titoli e dalle tabelle. Il colore selezionato viene usato esattamente, senza la trasformazione in una variante scura del marchio. Sono disponibili selettore, codice esadecimale e ripristino automatico; i codici incompleti impediscono il salvataggio e mostrano un errore. Anteprima e PDF leggono la stessa impostazione. Titolo e dati si adattano anche a sfondi chiari.
- **Fatture:** in Fatturazione → Template PDF sono disponibili posizione in alto a sinistra/centro/destra, dimensione 50–200% e distanza dall'alto 0–30 mm. Centro e destra usano una riga sopra i dati, per evitare sovrapposizioni. Logo proporzionato e contenuto nel foglio. Il motore della copia di cortesia e l'anteprima condividono normalizzazione, CSS e struttura del logo.
- I modelli senza le nuove impostazioni conservano l'aspetto di serie. Il logo aziendale di riserva continua a funzionare.

## Diagnosi

Il computo aveva un colore generale, dal quale il PDF ricavava automaticamente lo sfondo scuro: mancava un controllo dedicato allo sfondo esatto della copertina. Il logo delle fatture aveva altezza, larghezza massima e allineamento fissati nel foglio di stile; le impostazioni permettevano di caricarlo, senza configurare questi aspetti.

## Verifiche

- Regressioni di computo, PDF fatture, XML, anagrafica e permessi: 16 file, 145 test passati; un caso del computo richiede una sorgente locale esterna ed è saltato esplicitamente.
- Test UI: colore salvato e ritrovato alla riapertura; codice incompleto rifiutato; posizione/dimensione/distanza del logo salvate e ripristinate; parità tra anteprima e HTML di stampa.
- Test SQL isolato: migrazione idempotente, dati precedenti conservati, salvataggio con i privilegi esistenti, RLS tra aziende, rifiuto di valori diversi da un oggetto.
- Salvataggio del colore sul database reale con ruolo amministratore demo, in transazione terminata con rollback: colore riletto correttamente, nessun dato di prova residuo.
- Chromium e WebKit a 375 e 1280 px: nessun errore JavaScript né scorrimento orizzontale involontario; il rapporto fra le altezze del logo al 100% e al 150% è 1,5001.
- PDF di prova generati con i motori reali, renderizzati con Poppler e controllati visivamente: sfondo rosso/bianco del computo e fattura A4 con logo a destra, 150%, distanza 8 mm. Nessuna sovrapposizione.
- ESLint dei file frontend modificati: nessun errore, cinque warning preesistenti.
- `deno check supabase/functions/generate-native-pdf/index.ts`: passato.
- TypeScript completo e build Vite: controlli avviati, log in `work/verifica-piano-20261119/`; l'esito finale è riportato nella consegna.

## Schema e rilascio

Il colore del computo usa il JSON esistente di `computo_modelli`; non richiede modifiche allo schema.

Il logo richiede `anagrafica_azienda.pdf_logo`, JSONB con valori di serie compatibili. La migrazione pronta è in `docs/migrazioni-pronte/20290420105000_logo_pdf_documenti_fiscali.sql`, fuori dalla cartella applicata automaticamente. **Non è applicata al database.** Non modifica policy o privilegi e non aggiorna le anagrafiche esistenti.

Dopo l'autorizzazione al rilascio: verificare che la versione sia ancora libera, applicare via MCP, riallineare il registro a `20290420105000`, spostare lo stesso SQL in `supabase/migrations/`, aggiornare i controlli della PR e integrare su main. La modifica a `generate-native-pdf/documentoHtml.ts` attiva il deploy della relativa funzione tramite CI. Frontend e funzione vanno pubblicati insieme.

Nessuna impostazione grafica reale dell'azienda è stata modificata durante le prove. Non sono stati inviati documenti o messaggi a clienti. Firefox e Safari su dispositivo reale non collaudati. Le schermate browser usano dati simulati; i PDF vengono prodotti dal codice effettivo.

## Ripristino

Il frontend e la funzione possono tornare alla versione precedente. La colonna è additiva: il codice precedente la ignora. Non eliminare dati di configurazione o versioni dal registro per un rollback.
