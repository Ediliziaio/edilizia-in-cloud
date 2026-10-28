# Bonifici parlanti — prima implementazione locale, 27 ottobre 2026

## Stato e limiti di attivazione

Codice e migrazione preparati; nessuna migrazione applicata al database condiviso, nessun push, nessuna registrazione reale, nessun invio. La pagina locale usa ancora il backend collegato: finché non viene attivata la migrazione, il registro espone un avviso esplicito e il nuovo salvataggio fallisce senza ripiegare sull'incasso ordinario. Non è una funzionalità già attiva in produzione.

Migrazione creata con Supabase CLI e ordinata dopo le migrazioni prerequisito del repository: `supabase/migrations/20281027073933_ritenute_bonifici_parlanti.sql`. Il prefisso futuro segue le versioni già presenti nel progetto; non rappresenta la decorrenza fiscale.

## Flusso implementato

1. Registro incassi → Registra incasso → Bonifico parlante (con ritenuta).
2. Lordo pagato dal cliente distinto da ritenuta effettiva, commissioni e netto effettivo. Banca e TRN/CRO obbligatori.
3. Proposta non vincolante: lordo / 1,22 × aliquota; 8% dal 2015 al 29/02/2024, 11% dal 01/03/2024. Date precedenti richiedono verifica storica, date future non registrabili. Nessuna modifica all'IVA della fattura.
4. Conferma esplicita della contabile; ogni modifica ai dati disattiva la conferma.
5. RPC dedicata: riusa il flusso atomico esistente per saldare fattura/scadenza al lordo, registra il netto in prima nota, conserva la ritenuta nel registro. Se la prima nota non è univoca o lo storico fallisce, rollback completo.
6. Contabilità fiscale → Ritenute bancarie: periodo per accredito, KPI senza importi stimati, ricerca, stato, paginazione ed export CSV delle righe filtrate.
7. Riscontro della certificazione con riferimento, revisione e conferma. Non genera crediti dichiarativi o compensazioni automatiche.
8. Storno motivato: riapre il residuo lordo attraverso la funzione esistente e conserva ritenuta, importi e motivo nello storico. I percorsi ordinari di cancellazione sono bloccati per questi incassi.

Ritenute di garanzia, IVA della fattura, XML e versamento F24 1039 rimangono separati. Le commissioni qui indicate sono trattenute nell'accredito: non viene creata una seconda uscita di cassa che le conterebbe due volte.

## Sicurezza e concorrenza

- Nuova tabella con RLS e soli permessi di lettura per utenti autorizzati; nessuna scrittura diretta al registro dal client.
- Scritture amministrative: verifiche fiscali esistenti, azienda, sola lettura, blocchi del periodo e validazione centesimi anche sul server.
- Funzioni privilegiate con `search_path` vuoto, riferimenti qualificati e EXECUTE revocato ad anon/PUBLIC. Definer necessario per coordinare tabelle esistenti e registro append-only; non per aggirare i controlli di autorizzazione.
- Chiave idempotente riutilizzabile solo con stessi dati; contabile attiva univoca per azienda/banca/riferimento; lock su mese e documento; revisione nelle transizioni.
- Nessuna correzione automatica di incassi storici già esistenti e nessuna deduzione della ritenuta dalla sola differenza tra importo fattura e accredito.

## Verifiche

- Controllo esteso finale: 85 test superati in 12 file, tra calcoli e UI nuovi, PostgreSQL isolato PGlite e regressioni incassi/KPI/fiscalità.
- PostgreSQL isolato usa i corpi reali delle funzioni di registrazione/storno precedenti e il trigger di aggiornamento saldo, con fixture ridotte e funzioni di autorizzazione controllate; non equivale a test end-to-end contro lo schema completo remoto.
- Aggiunta regressione con due acconti e storno del primo: il nuovo percorso ancora il saldo allo snapshot bloccato prima dello storno, evitando la doppia sottrazione del percorso legacy con trigger DELETE. Non modifica gli storni ordinari di altri incassi.
- Controllo TypeScript selettivo: zero diagnostiche su 13 file. Lint mirato senza errori o avvisi dopo le correzioni.
- Build di produzione completata con esito positivo in directory temporanea, senza pubblicazione. Restano gli avvisi di chunk/import misti e Browserslist del progetto, non errori di compilazione.
- Browser locale, Demo Azienda 2: verificati accesso alla vista e avviso di backend non disponibile; compilata proposta 11.000 → 991,80 ritenuta / 10.008,20 netto senza selezionare fattura o salvare.

## Prima dell'uso reale

1. Autorizzare/applicare la sola migrazione dopo revisione dello schema reale e degli advisor; rigenerare i tipi centralizzati senza sovrascrivere modifiche concorrenti.
2. Eseguire un ciclo completo autorizzato su dati demo (creazione, riapertura, certificazione e storno) con tutti i trigger di produzione.
3. Estensioni ancora da realizzare: collegamento diretto al movimento bancario importato per impedire doppi abbinamenti anche tra percorsi manuali/automatici; ripartizione di un unico bonifico su più fatture; caricamento privato di contabili e certificazioni con confronto annuale certificato/registro. In questa versione il riscontro documentale è un riferimento testuale confermato, non la verifica automatica di un allegato.
4. Nessun aggiornamento del credito utilizzato in dichiarazione senza prospetto del commercialista; regimi speciali e future variazioni normative vanno validati separatamente.

## Fonti della regola

- Legge 213/2023, art. 1 comma 88: aliquota dell'11% dal 1 marzo 2024.
- Agenzia Entrate, circolare 40/E del 28 luglio 2010: scorporo convenzionale IVA e non cumulabilità con altre ritenute sugli stessi corrispettivi; aliquote storiche da contestualizzare.
- ANCE, focus ritenute sui bonifici: applicazione dello scorporo all'aliquota ordinaria del 22%. Si arrotonda la ritenuta finale, non la base a euro interi.
- Agenzia Entrate, codice 1039: adempimento dell'intermediario, non un nuovo versamento dell'impresa beneficiaria.

## Attivazione e collaudo del 28 ottobre 2026

Migrazione applicata e registro riallineato alla versione `20281027073933`. Verificati nello schema reale su Demo Azienda 2, con rollback integrale: registrazione 100 € lordi / 90,98 € netti, retry idempotente, una sola riga di cassa netta, saldo fattura lordo, certificazione e storno con ripristino saldo. Nessun incasso di prova conservato. Il rilascio frontend è incluso nel riallineamento a main; restano valide le estensioni non implementate elencate sopra.
