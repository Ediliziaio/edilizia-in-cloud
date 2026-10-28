# Clienti fiscali, fornitori e fascicoli contrattuali — 27 ottobre 2026

## Risultato e flusso

L’app è aggiornata in locale. L’utente ha autorizzato esplicitamente le modifiche al database condiviso dopo i test isolati: sono state applicate tre migrazioni additive. Nessun push, pubblicazione del frontend, invito, invio, firma o pagamento. Nessuna riconciliazione massiva o creazione di contratti reali eseguita per le prove.

### Clienti fiscali

- La riconciliazione distingue clienti dei cantieri e fornitori operativi.
- I candidati clienti sono profili della stessa azienda con ruolo esclusivamente cliente, non tutti i colleghi del gestionale.
- Il confronto usa P.IVA/CF normalizzati, mantiene i candidati multipli e non propone identificativi discordanti. Un nome coincidente non prova l’identità.
- Collegamento, eventuale completamento dei soli recapiti mancanti e storico avvengono in una transazione. Non si sovrascrivono intestazione fiscale, identificativi, documenti o recapiti già presenti. Il nuovo flusso non attiva sincronizzazioni automatiche future.
- Gli abbinamenti senza un identificativo coincidente richiedono una verifica aggiuntiva esplicita dell’operatore.
- Elenco fiscale completo caricato per pagine stabili, senza il precedente tetto silenzioso di 100 record; visualizzazione di 30 righe per pagina, ricerca anche per email, errori distinti da assenza di risultati. Gli altri utilizzatori dell’autocomplete mantengono il limite leggero di 100 risultati.
- I pulsanti inerti di importazione/creazione sono sostituiti da accessi effettivi ai registri operativi, rispettando i permessi.

### Fornitori fiscali dalle ricevute

Le ricevute risiedono in `fatture_ricevute`, non necessariamente in `anagrafiche_native`. Il pannello legge entrambe le fonti e distingue il loro salvataggio.

I gruppi delle ricevute considerano azienda, paese, P.IVA, CF e collegamento corrente, con massimo 500 documenti per operazione. Senza identificativi le ricevute restano separate: il conteggio è di posizioni fiscali, non di fornitori unici. La conferma mostra numero dei documenti, dati delle due parti e avvertenze. Non cambia XML, importi, stato fiscale o costi storici.

Le future creazioni di costi tramite la contabilizzazione usano il fornitore esplicitamente confermato anche se manca la P.IVA nella ricevuta. Senza collegamento, un identificativo ambiguo non seleziona più il primo fornitore arbitrario: la contabilizzazione si ferma e richiede riconciliazione. La patch mantiene i controlli e la gestione preesistenti di importi, note di credito e ordini; non ricalcola né sposta i costi già contabilizzati.

### Contratti e ruoli

Percorso: Impostazioni → Fornitori → apri fornitore → **Contratti e ruoli**.

La categoria merceologica rimane nel campo esistente. I ruoli sono multipli: materiali, servizi, consulente esterno, professionista/studio tecnico, subappaltatore, altro. Sono presenti suggerimenti di categoria anche per consulenze, servizi professionali, subappalti, noleggi e utenze/software.

Si possono registrare più forniture, consulenze, incarichi o accordi quadro con titolo, stato, stipula, inizio, scadenza, preavviso, rinnovo automatico dichiarato, importo facoltativo e condizioni. L’importo non è interpretato automaticamente come netto/lordo o compenso periodico: IVA e periodicità vanno esplicitate nelle condizioni.

Le date sono validate, il preavviso è calcolato a giorni civili; uno scaduto non viene considerato automaticamente rinnovato. Il sistema mostra le scadenze, non spedisce disdette o promemoria. Le modifiche contrattuali controllano la revisione `updated_at` prima di salvare; i cambi scheda e la navigazione proteggono le bozze non salvate.

Gli allegati PDF/JPG/PNG sono privati, massimo 20 MB, con controllo del formato, firma minima del contenuto e hash per evitare duplicati nello stesso contratto. Non è una scansione antivirus o una certificazione del documento. Le nuove versioni non sovrascrivono quelle confermate. Download con URL firmata di 300 secondi. Se la registrazione dei metadati fallisce, si tenta la pulizia del solo upload non registrato; un errore di pulizia rimane segnalato e non viene presentato come successo.

### Scheda subappaltatore dedicata

Il ruolo non crea account o contratti di cantiere. Si può scegliere una scheda `subappaltatori_sicurezza` esistente oppure confermarne la creazione con i dati anagrafici del fornitore. Creazione e collegamento sono atomici; identificativi/nome già presenti bloccano la nuova scheda. Nessun account, invito o accesso all’app cantiere viene creato.

Sono presenti collegamenti di navigazione nei due sensi. I contratti per commessa, SAL, DURC e documenti specialistici rimangono nel modulo Subappaltatori, non vengono copiati nei contratti generali del fornitore.

## Database e sicurezza

Migrazioni applicate e versioni allineate alla sequenza del repository:

- `20281027063432_anagrafiche_fornitori_contratti_collegamenti.sql`
- `20281027065510_fornitori_fatture_ricevute_collegamento.sql`
- `20281027071634_contabilizzazione_fornitore_confermato.sql`

Il registro remoto inizialmente generava timestamp 2026: sono state allineate soltanto queste tre nuove voci alle versioni dei file, evitando una successiva riapplicazione delle DDL. Nessuna modifica delle migrazioni storiche degli altri interventi.

Nuove tabelle con RLS e grant espliciti, verifica dei record padre e dell’azienda, blocco delle scritture in sola lettura, funzioni nuove SECURITY INVOKER. Il bucket `supplier-contracts` è privato e i documenti registrati non possono essere rimossi dal percorso di pulizia degli upload falliti. Indici su collegamenti, record padre e chiavi esterne.

Graphify ha supportato la lettura delle dipendenze degli helper; le skill Supabase hanno guidato l’isolamento per azienda, i controlli sui file privati, gli indici e i test transazionali. Nessuna nuova dipendenza dell’app.

Il controllo advisor prima/dopo non mostra aumenti dei rilievi né nuovi rilievi relativi alle nuove strutture. Il progetto mantiene problemi preesistenti fuori ambito, tra cui viste SECURITY DEFINER e funzioni con privilegi da rivedere: questo intervento non è un’attestazione di sicurezza globale. Riferimento: [controlli Supabase sulle viste](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Verifiche

- 7 file, **92 test applicativi superati**.
- **53 verifiche PostgreSQL isolate** in PGlite: multi-azienda, sola lettura/blocco utente, transazioni con storico, rollback di batch parziali, identificativi discordanti, scheda subappaltatore senza duplicati, date/importi, file registrati e non registrati, contabilizzazione col fornitore scelto e rispetto dei costi storici.
- Typecheck mirato: zero diagnostiche in 13 file. Non è una dichiarazione sul typecheck globale del repository.
- Lint mirato e controllo diff eseguiti. Build di produzione verificata separatamente; log in `output/anagrafiche-fornitori-20261027/`.
- Browser Demo Azienda 2: 178 posizioni clienti già collegate, 46 fornitori operativi, 1023 posizioni da ricevute (molte senza identificativi, quindi non equivalenti a 1023 aziende). Ruoli multipli, scelta subappaltatore, apertura/annullamento contratto e conferma di riconciliazione provati senza salvare dati di business. Suggerimenti senza identificativi mostrano conferma disabilitata finché non viene attestata la verifica manuale.
- Upload e salvataggi verificati con test isolati; non è stato caricato un contratto reale nel servizio storage per la prova.

## Limiti espliciti

Nessuna fusione automatica delle anagrafiche, nessuna attribuzione di P.IVA/CF mancanti. I nuovi riferimenti sono protetti da FK e dai controlli dell’interfaccia contro cancellazioni o unioni che non sanno trasferirli. Il vecchio motore di unione fornitori resta una procedura multi-scrittura: non viene presentato come un trasferimento atomico universale dei nuovi fascicoli.

Le condizioni vengono registrate dall’operatore; non sono estratte automaticamente dal PDF né validate come parere legale. I file conservati in questo fascicolo non sono per ciò solo documenti in conservazione fiscale a norma o contratti firmati elettronicamente.
