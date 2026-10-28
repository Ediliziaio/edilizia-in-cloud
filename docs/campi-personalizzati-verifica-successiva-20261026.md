# Campi personalizzati: verifica successiva all’implementazione

26 ottobre 2026. Verifica in sola lettura di codice, definizioni del database e pagina autenticata di Demo Azienda 2. Nessuna definizione o risposta cliente creata/modificata; nessun push, deploy o migrazione.

## 1. Sono stati aggiunti altri campi?

Il confronto con `output/audit-campi-personalizzati-20261026/INVENTARIO.json` non evidenzia nuove definizioni centrali:

| Archivio | Inventario precedente | Verifica attuale | Osservazione |
|---|---:|---:|---|
| Variabili di sistema | 905 | 905 nella pagina | Non sono campi custom creati dalle aziende |
| Custom aziendali attivi | 32 | 32 | Tutti contatto, una sola azienda; nessuna aggiunta/rimozione o variazione dei metadati confrontati |
| Definizioni tecniche listino | 539 | 539 | Identici nome, chiave, tipo, unità, obbligatorietà e flag PDF/picker, confrontati senza unire gli ambiti |
| Campi documentali | 168 | 168 | Identici nome, etichetta, tipo, segnaposto e obbligatorietà nei metadati confrontati |
| Variabili contrattuali nei modelli | 14 occorrenze modello/variabile | 14 | Invariato il multinsieme delle chiavi; non significa 14 campi in ciascuna azienda |
| Elementi dei moduli contatto | 172 in 30 moduli | 172 in 30 moduli | Invariati nome, etichetta, tipo, mapping e obbligatorietà; esclusi dal confronto gli alias legacy id/key |
| Modelli sopralluogo | 10 | 10 | Nessuna modifica successiva alla data di creazione/aggiornamento più recente del 19 ottobre; confronto visivo aggiunto per la demo |
| Moduli candidature | 1 | 1 | Configurazione di visibilità/obbligatorietà di campi HR nativi, non un elenco di nuovi custom |

Il confronto dei metadati senza ID/ambito non certifica che ogni singolo record sia rimasto identico. Non sono state lette risposte compilate o file cliente per stabilirlo. Le 32 definizioni centrali sono state confrontate singolarmente per oggetto/nome/tipo/sezione/obbligatorietà/help.

## 2. Cosa compare davvero in Demo Azienda 2

Verificato dal browser sulla pagina `/azienda/impostazioni/campi-personalizzati`:

| Origine | Risultato |
|---|---|
| Tutti i campi | 905 variabili di sistema; nessun custom proprio della demo |
| Schede tecniche | 490 campi in 70 schede, caricamento riuscito |
| Sopralluoghi | 412 campi in 8 modelli con definizioni, caricamento riuscito |
| Contratti dei preventivi | 0 variabili `contratto.*`; coerente con i testi dei 6 modelli attivi della demo |
| Moduli di contatto | 3 campi in 1 modulo: Email, Nome, Telefono; mapping standard visibile |
| Modelli documentali | Errore di caricamento, non un risultato vuoto attendibile |

Nel database la demo ha 9 modelli sopralluogo attivi accessibili, incluso un modello senza definizioni. Il catalogo conta solo gli 8 che producono campi: non è una perdita di 1 modello compilato. Sarebbe però utile mostrare anche i modelli vuoti con un’etichetta esplicita.

La SELECT SQL tenant-scoped trova **0 campi documentali attivi della demo**. I 168 globali appartengono ad altri ambiti aziendali e non devono essere copiati qui per far tornare il conteggio.

## 3. Problema concreto trovato: origine documentale

L’errore è riprodotto nella UI. La nuova query in `src/hooks/useFederatedFieldCatalogue.ts:17` usa un embed non disambiguato:

`documento_templates!inner(...)`

Nel database risultano due FK da `documento_template_fields` a `documento_templates`:

- `documento_template_fields_template_id_fkey` su `template_id`;
- `documento_fields_template_company_fk` su `template_id, company_id`.

L’ambiguità è una causa fortemente supportata dallo schema e dal precedente già documentato in `src/lib/documenti/templateQuery.ts`, che specifica la relazione per evitare PGRST201. Il log browser osservato in questa prova non espone il codice completo della risposta: non viene quindi presentato come PGRST201 letto direttamente dalla rete.

**Intervento P0 proposto:** scegliere esplicitamente la FK dell’embed, mantenere entrambi i filtri azienda e il filtro modello attivo; verificare via browser sia un’origine vuota sia un tenant di prova con campi reali. Aggiungere una regressione sulla query generata e un collaudo contro lo schema effettivo. I mock del client non rilevano da soli questo genere di ambiguità.

Non corretto in questo turno: l’incarico corrente è di controllo e censimento.

## 4. Cosa manca ancora, in ordine di priorità

1. **P0 — Query documenti:** correzione e prova integrata del caso descritto sopra.
2. **P0 — Protezioni server dei valori generici:** validare azienda/record/definizione/oggetto, permesso specifico e tipo del valore. Le protezioni del frontend non sostituiscono RLS e validazioni server. In questa verifica non sono state cambiate policy.
3. **P1 — Copertura dei compilatori:** il registro comprende 36 oggetti, ma il compilatore centrale ne dichiara 9. Per i restanti 27 va descritta la capacità reale e completato l’adattatore pertinente; non basta rendere selezionabile un oggetto. Non sono 27 moduli completamente privi di form: alcuni hanno form nativi o importatori differenti.
4. **P1 — Preventivi e commesse:** collegare testata e righe dei wizard classico, computi, Serramenti e FV ai relativi dati, con salvataggio coerente e riapertura; mantenere snapshot di preventivi/contratti già firmati. Importi, IVA e misure native non vanno duplicati come testo custom.
5. **P1 — Moduli contatto:** il catalogo mostra il mapping dichiarato, ma `form-submit` continua a mappare principalmente l’anagrafica standard. Serve destinazione custom tramite ID stabile, validazione dei tipi e test della scrittura. Una domanda presente nel modulo non diventa automaticamente un custom del contatto.
6. **P1 — Candidature:** il menu contiene Candidato/Colloquio, ma manca un’origine HR nel catalogo federato. `hr_candidatura_forms.campi` contiene configurazioni dei campi nativi (nel record attuale, chiavi città/email), non nuove definizioni da copiare sul CRM. Censirle separatamente, solo con permessi HR. Questionari/valutazioni personali restano fuori dai normali picker cliente.
7. **P1 — Identità e canali:** completare gli alias storici e la matrice di disponibilità per email, WhatsApp, PDF, filtri, automazioni e AI. Non dichiarare universale l’uso di una chiave solo perché è copiabile dalla pagina.
8. **P1 — Aggiornamento del catalogo:** la fonte viene letta al caricamento, con cache di 30 secondi; non è un abbonamento realtime. Collegare invalidazioni mirate agli editor di origine o offrire un aggiornamento esplicito. Il browser testato non prova una sincronizzazione istantanea dopo ogni modifica fatta altrove.
9. **P2 — UX:** ricerca unica tra origini; distinzione custom/sistema/modello; conteggio per fonte; dettaglio delle capacità; tipi tradotti; modelli senza campi riconoscibili. Il sottotitolo limitato a contatti/opportunità e “Aggiungi campo” visibile anche nel catalogo readonly possono creare equivoci su dove venga creato un campo.
10. **P2 — Pacchetti facoltativi:** proporre solo estensioni non già native, con anteprima e deduplicazione per azienda. Esempi: protocollo accesso cantiere, codice posizione cliente sulla riga, istruzioni di posa particolari, riferimento gestionale esterno. Non installarli automaticamente in tutte le aziende.

Non sono lacune da colmare copiando tutto: i campi di piattaforma superadmin, i default delle famiglie, i metadati interni di firma/prezzario e le proprietà native dei prodotti devono conservare il loro ambito e le relative autorizzazioni.

## 5. Stato del codice degli altri terminali

`git fetch origin main` rileva un commit successivo alla base locale `aa3faee8f`: `f910dbca2`, sulle misure delle polilinee DWG. Aggiunge strutture CAD derivate (ingombri/locali/unità, da confermare), non definizioni custom. È stato ispezionato senza merge, conservando tutte le modifiche locali del blocco precedente. Queste strutture non vanno convertite indiscriminatamente in campi contatto.

Graphify non dispone di un grafo generale alla radice: la query ha restituito assenza del grafo. Nessuna rigenerazione; analisi dei collegamenti completata direttamente sul codice.

La prova visiva autenticata di questo turno integra e supera il precedente limite di accesso browser; non sostituisce test di scrittura con ruoli diversi, che non sono stati eseguiti.

Ripetuti i test `federatedCustomFields.test.ts` e `customFieldCatalogueAccess.test.tsx`: **80 test superati in 2 file**. Il fallimento reale dell’origine documentale, non intercettato dai mock, resta aperto; l’esito dei test offline non viene presentato come prova del suo funzionamento.
