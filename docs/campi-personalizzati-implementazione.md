# Campi personalizzati: avanzamento dell’implementazione

26 ottobre 2026. Base: `aa3faee8f` di `main`. Modifiche locali, non pubblicate.

Aggiornamento successivo: [correzioni e stato del rilascio](campi-personalizzati-correzioni-20261026.md). Dopo questo primo blocco sono state autorizzate e applicate due migrazioni DB; il frontend e i servizi di invio restano locali. I limiti descritti sotto sono la fotografia del primo blocco, non lo stato finale.

## Completato nel primo blocco

- Registro canonico di 36 oggetti, condiviso fra catalogo azienda e copertura superadmin. Identità tecnica separata dalle etichette: i 150 campi esclusi dai filtri tornano nell’oggetto corretto. Conservati i 905 ID e token di sistema.
- Gruppi Candidato e Colloquio nel menu, senza dichiarare compilatori inesistenti. Categoria Listino resta censita senza inventare variabili non risolvibili.
- Nuova sezione **Modelli e schede tecniche**: definizioni del listino, documenti, sopralluoghi, contratti preventivo e moduli contatto. Lettura delle fonti esistenti; nessuna copia in `marketing_custom_fields`.
- Origine, modello/macrocategoria, chiave, tipo, unità, obbligatorietà dichiarata e flag PDF. Ricerca e filtro per ambito; gli omonimi non vengono fusi.
- Accesso alle definizioni subordinato al permesso Personalizzazione e al permesso della fonte. Filtri espliciti per azienda, cache per azienda e utente, annullamento e nessun riuso dei risultati se il permesso viene revocato.
- Letture paginate a 200 record, ordine stabile e limite esplicito: nessun successo parziale quando il catalogo supera il tetto. Origini lette soltanto quando selezionate; non vengono scaricate risposte, file o valori cliente.
- Variabili contatto copiate per UUID usando il formato già riconosciuto dal resolver. Rimane supportato il motore legacy; nessun nuovo namespace server inventato.
- Protezione dei nomi che collidono con variabili native o con lo slug di un altro custom. Rinomina che cambia lo slug bloccata per i campi già valorizzati, finché non esiste una gestione persistente degli alias storici.
- Conteggi d’uso per modifica/eliminazione comprendono anche JSONB prodotti, famiglie e tariffe. Un errore nel conteggio blocca l’operazione invece di presumere assenza di usi.
- Multiselezione effettiva, serializzata come array JSON nel vecchio storage testuale; zero e false preservati. Checkbox, testo lungo, email, URL, numeri, percentuali, date e ora usano input coerenti nei compilatori collegati.
- Editor del valore con conferma esplicita e attesa del server: doppio clic bloccato, bozza mantenuta dopo errore, nessun messaggio prematuro di successo. Collegato alla scheda contatto e alle sezioni generiche; il dialogo opportunità conserva gli array invece di convertirli in CSV.
- Sezioni generiche: stato di errore distinto da assenza di campi; modalità sola lettura e permessi del modulo; cache dei valori e invalidazione includono l’azienda.
- Nessuna nuova creazione di un campo File che simuli un upload: i riferimenti precedenti restano leggibili, gli allegati continuano a essere gestiti nell’area Documenti.

## Limiti intenzionali e lavoro ancora necessario

Questo blocco non completa tutte le fasi del piano iniziale.

1. **Validazione e autorizzazione server dei valori generici:** non sono state modificate le policy del database, né introdotte RPC o migrazioni. Le protezioni UI non vengono presentate come una chiusura dell’audit RLS. Servono autorizzazione per oggetto, verifica della terna azienda/record/definizione e test di scrittura con ruoli reali.
2. **Alias storici persistenti:** il token stabile contatto è già disponibile, ma i testi salvati con slug legacy non sono stati riscritti. Il controllo sul conteggio valori non è un inventario completo delle referenze presenti in tutti i template e nelle automazioni.
3. **Campi nei nuovi wizard:** nessun inserimento automatico di campi in testate e righe dei preventivatori nativi. Gli adattatori bidirezionali, l’obbligatorietà in creazione e i salvataggi atomici estesi restano da completare.
4. **Canali:** consultare una definizione nel nuovo catalogo non la rende automaticamente risolvibile in email, WhatsApp, PDF o AI. La pagina lo specifica; i motori di origine restano invariati.
5. **Pacchetti opzionali:** non sono state installate nuove definizioni aziendali né distribuiti campi alle altre aziende. Prima serve la convalida server del relativo ambito.
6. **Allegati:** non è stato aggiunto un upload generico; storage, autorizzazioni, scansione e ciclo di vita dei file rimangono nel flusso documentale esistente.
7. **Controlli visivi:** l’accesso alla scheda browser era bloccato nell’audit precedente. Questa sessione verifica componenti con test offline e bundle, non certifica una prova visiva autenticata o roundtrip di salvataggio remoto.

## Verifiche

- Suite campi/catalogo/variabili e sezioni generiche: 315 test in 11 file, comprendenti i controlli sul refresh senza perdita delle bozze.
- Integrazioni adiacenti: 107 test superati su 108. L’unico fallimento è preesistente in `rimandiImpostazioni.test.ts`, che cerca letteralmente «Nessuna previsione impostata» in `ComeStiamoAndando.tsx`; lo stesso testo manca già nel file letto da `git show HEAD:...`. Nessuno dei due file è stato modificato.
- `npm run typecheck:ci`: superato nella verifica del blocco, senza aumento della baseline; i 655 errori preesistenti non sono presentati come risolti.
- Lint sui file nuovi e sul nucleo modificato: nessun errore. Restano warning Fast Refresh nel componente storico che esporta anche il dizionario.
- `npm run build:fast`: bundle di produzione completato. Questo comando non esegue il prerender completo.
- `git diff --check`: superato.

Non sono stati eseguiti push, deploy, migrazioni o scritture di prova su dati remoti. Nessun messaggio o documento è stato inviato ai clienti.

## Come provare in locale

Aprire `/azienda/impostazioni/campi-personalizzati` nel gestionale locale autenticato:

1. In «Tutti i campi», filtrare Azienda, Intervento, Ordine Acquisto, Prodotto e gli altri oggetti: le voci di sistema rimangono visibili.
2. In «Modelli e schede tecniche», scegliere l’origine e poi il singolo modello. L’elenco cambia senza creare nuove definizioni.
3. Con un ruolo senza permesso dell’origine, verificare il messaggio di accesso e assenza di dati caricati.
4. Usare solo record di prova esplicitamente autorizzati per verificare modifica, errore e riapertura dei valori. Non testare scritture su record cliente reali.

Prima del rollout servono revisione delle modifiche, completamento delle protezioni server e collaudo autenticato dei flussi interessati.
