# Campi personalizzati: correzioni e stato del rilascio

26 ottobre 2026. Base locale riallineata con `main` a `f910dbca2`, preservando il lavoro precedente. Questo documento aggiorna l’audit e il primo blocco d’implementazione: non li sostituisce retroattivamente.

## Correzioni eseguite

### Pagina e catalogo

- Eliminata l’ambiguità del join documenti scegliendo la FK composita modello/azienda, con filtri tenant e modello attivo conservati. Prova browser Demo Azienda 2: risultato vuoto corretto, non più errore.
- Nuova origine «Moduli candidature (HR)»: configurazione dei campi nativi del modulo, con etichetta obbligatorio/nascosto. Richiede anche `canViewPersone`; non legge CV o risposte dei candidati e non crea copie nel CRM.
- Modelli vuoti di contratti, sopralluoghi e moduli visibili nel filtro, senza inventare nuove definizioni. L’elenco tecnico/documentale continua a derivare dagli ambiti con definizioni; non è ancora un inventario universale di tutti i contenitori vuoti.
- «Aggiorna catalogo» rilegge solo la fonte selezionata. Nessun polling su tutti gli archivi.
- Tipi tradotti, sottotitolo esteso e pulsante «Aggiungi campo» rimosso dal catalogo readonly.
- Dettaglio «Dove si può usare» sui custom: compilazione, testi, automazioni, PDF e AI, senza dichiarazioni di copertura universale.

### Database condiviso, dopo autorizzazione e test isolati

Applicate e riallineate al registro migrazioni:

1. `20281026160000_campi_personalizzati_validazione_alias.sql`
2. `20281026160100_campi_personalizzati_sola_lettura_crm.sql`

Sono additive; non riscrivono i valori esistenti. Aggiungono:

- RLS dei valori generici subordinata a permesso del modulo e visibilità del record padre, senza usare `SECURITY DEFINER` per i nuovi helper.
- Controllo record/azienda/definizione/oggetto, campo attivo e tipi dei valori su archivio generico e archivi valori CRM.
- Rispetto della modalità sola lettura anche nelle scritture CRM che passano da policy precedenti.
- Blocco delle nuove scritture custom su preventivi consolidati, secondo gli stati riconosciuti dalla guardia.
- Alias storici conservati quando cambia il nome, protezione da collisioni fra nomi/alias e blocco di alcuni cambiamenti strutturali sui campi valorizzati.
- Nessun `EXECUTE` per `PUBLIC`/`anon` sui quattro nuovi helper. Le funzioni trigger non sono esposte come API utilizzabili dagli utenti.

Verifica finale metadati: 32 definizioni attive, 0 valori generici, entrambe le versioni presenti, guardia CRM sola lettura presente, 0 concessioni `PUBLIC`/`anon` sui nuovi helper. I test non hanno installato campi nelle aziende né scritto valori cliente nel database condiviso. Eseguiti advisor sicurezza prima/dopo; non è una certificazione di assenza di problemi preesistenti nel resto del progetto.

### Preventivi e commesse, interfaccia locale

- Campi **interni di testata** sui preventivi già creati: classico, Serramenti, FV e otto computi (Bagni, Ristrutturazione, Tetti, Climatizzazione, Termoidraulico, Elettrico, Pavimenti, Piscine).
- Identità `quote` delle definizioni separata dall’istanza `quote_sr`, `quote_fv` ecc.: stesso UUID in due archivi non mescola i valori.
- Caricamento leggero delle definizioni; valori e controllo server di scrittura caricati aprendo la sezione. Errori di autorizzazione lasciano la sezione readonly.
- Campi commessa nella panoramica dell’ordine, con permesso modifica ordini.
- Upsert dei valori generici confermato solo se il server restituisce tutte le righe previste; invalidazione per ciascun record del lotto. Lettura delle definizioni paginata, non tagliata alle prime 1.000.
- Il registro centrale descrive ora 11 oggetti con compilatore collegato. Non significa che tutti i 36 oggetti o tutti i percorsi di creazione siano completi.

I campi aggiuntivi hanno un salvataggio esplicito separato. **Non** vengono dichiarati parte della transazione nativa del wizard; non modificano quantità, prezzi, IVA, rate, contratti firmati o PDF cliente. Non è stato aggiunto un editor custom per ogni singola riga del computo.

### Moduli contatto, codice locale del servizio

- Destinazione `cf:<UUID>` selezionabile fra campi contatto compatibili, senza crearne duplicati.
- Destinazioni e tipi convalidati dalle definizioni attive della stessa azienda e dal modulo salvato, non da istruzioni fornite nella richiesta pubblica.
- Destinazioni duplicate, archiviate, di altro oggetto/azienda e valori fuori formato respinti prima di scrivere il contatto.
- Zero e false preservati, decimali normalizzati, omissioni facoltative non usate per svuotare i dati esistenti.
- Il campo email custom non sostituisce il recapito standard necessario per identificare il contatto.
- Salvataggio custom prima della submission che emette gli eventi; niente conferma di successo se il salvataggio fallisce o manca l’acknowledgement.
- Pubblicazione di moduli con nuove destinazioni bloccata finché l’endpoint remoto non dichiara esplicitamente il supporto. Le bozze restano preparabili: non viene attivato un mapping che il vecchio servizio ignorerebbe.

Il flusso completo contatto + custom + submission **non è ancora un’unica transazione**: un errore tardivo può lasciare l’aggiornamento contatto già eseguito. Il servizio rende esplicito l’errore e non dichiara completato l’invio.

### Variabili e rinomina

- Il picker generico inserisce nuove variabili contatto per ID stabile, come il picker email.
- Resolver contatto e filtri automazioni aggiornati nel codice per leggere gli alias storici conservati nel DB.
- I filtri già salvati con un’etichetta leggibile risolvono anche l’alias normalizzato dopo una rinomina; priorità alle chiavi esatte e nessuna lettura di proprietà ereditate.
- La rinomina che cambia lo slug resta prudenzialmente bloccata nell’interfaccia locale finché i servizi di invio non sono pubblicati con il nuovo resolver. Anche un campo senza valori potrebbe essere già referenziato da un testo: il conteggio dei valori non basta.

## Cosa è online e cosa no

| Componente | Stato |
|---|---|
| Due migrazioni DB autorizzate | Applicate e registro riallineato |
| Interfaccia/catalogo/wizard | Modifiche locali, non pubblicate |
| `form-submit` e resolver dei servizi di invio | Codice preparato e testato, non deployato |
| Nuovi campi nelle aziende | Nessuna installazione automatica |
| Email, messaggi, documenti ai clienti | Nessun invio |
| Commit/push su `main` | Non eseguito in questo turno |

Prima di usare **realmente** le nuove destinazioni custom dei moduli pubblici serve un rilascio coordinato dell’interfaccia e di `form-submit`. La sola UI locale non aggiorna l’endpoint remoto già esistente. Prima di sbloccare la rinomina, aggiornare tutti i sender che importano il resolver condiviso: un deploy di una sola funzione non basta.

## Verifiche

- Suite applicativa campi, catalogo, variabili, form e automazioni: 605 test superati nell’esecuzione congiunta finale di 17 file dedicati.
- Handler reale `form-submit` eseguito con database/provider simulati e rete proibita: include errori prima delle scritture, conferma delle capacità e mancanza di conferma server.
- PostgreSQL 17 isolato via PGlite: 32 verifiche eseguibili con `deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-env scripts/test-custom-fields-server.mts`. Lo script usa le stesse due migrazioni, non un SQL alternativo; nessuna connessione remota.
- TypeScript: verifica rispetto alla baseline esistente, senza aumentare né riscrivere la soglia (655 errori preesistenti, limite 703).
- Deno check dei file del servizio form; lint del nucleo nuovo; `git diff --check`.
- Build di produzione `npm run build:fast` completata. Non equivale a pubblicazione o prerender completo.
- Browser autenticato: documenti, modelli contrattuali vuoti e configurazione HR. Screenshot locale in `output/campi-personalizzati-20261026/catalogo-hr.jpg`.

Non è un collaudo completo dei salvataggi browser con tutti i ruoli reali, né una prova di invio dei form pubblici. Prima del rollout rimangono inoltre editor di riga, mapping PDF/AI e collegamenti ai restanti oggetti, ciascuno con il proprio contesto e permesso. Non si devono ottenere questi collegamenti copiando indiscriminatamente i dati in `marketing_custom_fields`.
