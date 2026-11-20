# Fotovoltaico: bolletta, tetto, posa e scenario energetico

## Stato della consegna

Implementazione nel wizard esistente, collaudata localmente e con tutti i controlli della PR 195 verdi. Migrazione applicata in produzione il 20 novembre 2026 tramite MCP; registro subito allineato al file `supabase/migrations/20290430140000_fv_bollette_mappa_scenari.sql`. L’utente ha autorizzato migrazione, merge e rilascio dopo il verde dei controlli. In corso l’ultima verifica del commit di allineamento prima del merge.

## Audit del percorso precedente

| Passaggio | Situazione trovata | Intervento |
|---|---|---|
| Cliente e immobile | Onboarding cliente e collegamenti CRM già presenti; ricerca indirizzo tramite `maps-proxy`, con HERE e fallback Google | Riutilizzati; l'indirizzo di fornitura viene proposto all'operatore e geocodificato nella fase Immobile |
| Consumi | Totali manuali e profilo generico, senza archivio bollette verificabili | Documenti privati, fonti per pagina, revisione e conferma, separazione POD, periodi e costi |
| Tetto | Stime Solar/PVGIS e editor commerciale 2D/3D già funzionanti; mancava il collegamento fra pin geografico e falde metriche | Pin separato dall'indirizzo, falde sulla mappa e proiezione dal piano inclinato |
| Impianto | Catalogo, righe, prezzi e posa deterministica già presenti | Capacità fisica e tre scenari derivati dagli stessi pannelli, con trasferimento delle quantità |
| Finanza | Percorsi privati e aziende con quote sintetiche e calcoli separati | Un motore orario condiviso per nuovo profilo, simulatore, cassa, sensibilità e PDF |
| Documento e copia | Righe di prezzo salvate e duplicazione atomica già esistenti; nessuno spazio per fonti bollette | Nuovi JSON opzionali, salvataggio atomico compatibile, copia dei riferimenti autorizzati e protezione dei documenti emessi |

## Dove verificare

Archivio: **Marketing e vendita → Preventivi CRM → filtro Fotovoltaico** (`/azienda/marketing/preventivi?tipi=fotovoltaico`). Creazione/modifica: wizard `/azienda/marketing/fotovoltaico/nuovo` oppure `/:id/modifica`.

| Schermata | Azioni e risultati |
|---|---|
| Fase 3 · Consumi | **Carica bolletta**, PDF multipagina e foto; file accanto ai campi, pagina di origine, storico mensile modificabile, conferma per documento e POD selezionato |
| Fase 3 · Consumi | Periodi sovrapposti, file ripetuti e conguagli esclusi dalla somma; storico annuale dichiarato o dodici mesi completi; proiezione parziale da confermare |
| Fase 3 · Consumi | Correzioni conservate per ciascun POD; spesa ricorrente, quote fisse e costi evitabili separati; **Applica al simulatore** obbligatorio quando i dati cambiano |
| Fase 3 · Profilo | Giorni, orari, carico fuori orario, dodici pesi mensili, aumento futuro dei consumi, obiettivo e valore dell'energia immessa |
| Fase 4 · Tetto | Selezione del tetto, pin e coordinate manuali; rettangoli ruotati, poligoni e vertici modificabili anche con campi numerici; inclinazione, azimut, lati, area in pianta e inclinata |
| Fase 4 → 5 | Confermando una nuova geometria si azzera esplicitamente la posa precedente; gli ostacoli si disegnano nell'editor della fase Impianto |
| Fase 5 · Impianto | Dimensioni reali del modulo da confermare; **Calcola disposizione pannelli**, quantità per falda, kWp, area occupata e capacità massima proposta |
| Fase 5 · Scenari | Consigliata, con accumulo e massima potenza; energia prodotta, usata, immessa e acquistata; copertura dei consumi e utilizzo della produzione distinti; risparmio e ricavi separati |
| Fase 5 · Editor | Pannelli sulla mappa o nel piano metrico; aggiunta, spostamento, rotazione, rimozione e ostacoli. Moduli fuori falda, vicini agli ostacoli o sovrapposti impediscono il salvataggio definitivo |
| Fasi 5–8 | Stessi prodotti e quantità nelle righe del preventivo. Prezzi mancanti evidenziati; senza costo di posa o prezzo a corpo completo il confronto non propone un rientro semplice |
| Fase 6 · Finanza | Profilo condiviso nel calcolo privato e aziendale; perdite dell'accumulo separate dalle immissioni; quote fisse conservate nel confronto delle bollette |
| PDF | Riepilogo, flussi, ipotesi numeriche e tavola vettoriale del layout quando la pagina è attiva; nessuna bolletta originale, POD o identificativo fiscale estratto nel PDF cliente |
| Riapertura e duplicazione | Documenti, dati confermati, coordinate, falde, modulo, posa e scenario conservati; i preventivi precedenti mantengono il percorso storico |

## Regole di calcolo

- Esempio verificato: 6.000 kWh, 1.800 €/anno, 360 € fissi e 1.440 € evitabili confermati → **0,24 €/kWh**; 3.000 kWh autoconsumati → **720 €** sugli acquisti. I ricavi delle immissioni sono separati.
- Posa verificata: **18 moduli × 450 Wp = 8,10 kWp**, conteggiati dal disegno effettivo.
- PVGIS per inclinazione e azimut di ogni falda, ponderato sui moduli effettivi; distribuzione mensile conservata. Una risposta dimostrativa `_mock` non viene accettata come stima del nuovo tetto cartografico.
- Anno orario convenzionale 2025, profilo di utilizzo modificabile e curva solare sintetica normalizzata sui dati mensili. Non è una previsione oraria meteorologica né una misura dei prelievi. Ombre ravvicinate e limiti elettrici richiedono verifica.
- Accumulo: capacità utile 90%, rendimento di ciclo 90%; bilancio conserva anche perdite e carica residua finale.
- Obiettivo spesa: taglia minima che raggiunge il 98% degli acquisti evitabili ottenibili con la massima posa e lo stesso profilo, senza accumulo. Non è una ricerca del miglior VAN.
- Obiettivo autoconsumo: taglia massima con almeno il 70% della produzione utilizzata sul posto. Copertura: taglia minima che raggiunge l'obiettivo orario, oppure segnalazione che lo spazio/profilo non bastano.
- Il massimo è una proposta deterministica a griglie, con orientamenti verticale/orizzontale e più offset, entro i limiti dell'editor. Non certifica l'ottimo geometrico assoluto o l'idoneità strutturale/elettrica.

## Dati, permessi e servizi

I file sono destinati al bucket privato `fv-bollette`, massimo 20 MB ciascuno, con percorso azienda/progetto/hash. Lettura con JWT dell'operatore, RLS del progetto e visibilità staff; elaborazione nuova consentita solo con modifica preventivi. File immutabili e nessuna sovrascrittura. Le copie autorizzate conservano accesso alle fonti; non consentono di collegare file di aziende o progetti nascosti.

`fv-leggi-bolletta` usa il lettore PDF condiviso: prima testo nativo, poi OCR delle pagine che lo richiedono e interpretazione strutturata tramite `aiRouterComplete`, task `pdf_vision_extract`. Costi, idempotenza, cache e blocchi credito/provider passano dal sistema esistente. Risposte troncate, JSON invalido, pagine non lette e credito esaurito richiedono revisione o compilazione manuale. Nessuna istruzione contenuta nei documenti viene eseguita.

| Dipendenza | Evidenza e funzione coinvolta |
|---|---|
| Migrazione SQL | Applicata via MCP il 20 novembre 2026 e subito riallineata alla versione `20290430140000`; colonne e bucket privato verificati prima del push |
| Google Maps Static API | `GOOGLE_MAPS_API_KEY` risulta presente fra le variabili server; non è stata letta la chiave. `maps-proxy` ha 860 risposte HTTP 200 nei sette giorni osservati, ma il conteggio non distingue Google dal fallback HERE: non prova l'abilitazione positiva di Google Static Maps. Verificare il provider nella nuova schermata dopo il rilascio; il flusso manuale è collaudato |
| Cartografia | Riutilizza `maps-proxy`; `solo_google` esclude il fallback a scala diversa. Nessuna chiave pubblica e nessuna dipendenza dalla libreria Google Drawing. Le immagini non vengono salvate nella bozza né aggiunte al nuovo PDF: si esporta la geometria vettoriale |
| PVGIS | Endpoint esistente `fv-pvgis-fetch`; nuove falde inviate con coordinate del tetto, inclinazione e azimut. Indisponibilità esplicita e dato manuale alternativi |
| Lettura AI | Router e crediti aziendali esistenti. Nessuna lettura a pagamento di bollette reali eseguita durante il collaudo; l'accuratezza visiva sui formati dei singoli fornitori va campionata dopo l'attivazione |
| Listino | Modulo, inverter, accumulo, lavorazioni e prezzi della singola azienda. Nessun nuovo prezzo commerciale universale |

## Prove riproducibili

`bun run test:fotovoltaico` include le nuove verifiche di logica, UI, endpoint e SQL. La migrazione SQL viene eseguita due volte in PostgreSQL PGlite e con policy permissive preesistenti, per verificare anche i guard restrittivi. I test non usano record dei clienti.

| Caso richiesto | Prova |
|---|---|
| Residenziale con annuale | PDF sintetico reale di due pagine: lettore effettivo, 6.000 kWh a pagina 2, 1.800 € e 360 € fissi; zero chiamate OCR/AI |
| Scansione e foto aziendali | Test dell'endpoint con OCR di pagina e immagine: instradamento, attribuzione aziendale, fonte, POD separati e avvisi. Provider AI simulato, accuratezza visiva non misurata |
| Periodi/POD distinti | Somme senza sovrapposizione, rettifiche, dodici mesi e storico parziale; correzioni isolate per POD |
| Edifici vicini/pin | Coordinate cercate separate dal tetto confermato; trasformazioni geografiche reversibili e salvataggio/riapertura |
| Due falde e lucernario | Superficie inclinata, distacchi, ostacoli, posa fisica e rivalidazione dopo modifica del modulo; rifiuto di falde duplicate, bordo condiviso ammesso |
| Configurazione con accumulo | Confronto e trasferimento quantità nella schermata; stesso bilancio nel simulatore, nella finanza privata/aziendale e nel PDF |
| Mappa/bolletta indisponibili | Percorso manuale attivo, errori leggibili, blocco credito senza bloccare l'inserimento dei consumi |
| Preventivo precedente | Test legacy del wizard, duplicazione e salvataggio compatibile; consultato anche un documento demo già emesso |
| UI e riapertura | Chromium e WebKit, larghezze 375/768/1280/1920, nessun overflow o errore console; 26 pannelli, 11,7 kWp, 5 kWh ritrovati dopo reload |
| Documento | HTML del template reale stampato in A4 e controllato con Poppler; bolletta prima/dopo, quote fisse, perdite accumulo e tavola vettoriale |

Anteprima isolata: `bun x vite --config vite.fv-bolletta-qa.config.ts` su `127.0.0.1:5193`. Usa le vere fasi 3/4/5 con backend e catalogo sintetici, senza sessioni di produzione. Non misura l'accuratezza del provider AI.

Firefox locale non si avvia (errore sandbox/compositore del browser installato); WebKit non equivale a una verifica su iPhone fisico. Il prerender SEO completo ha raggiunto il limite locale di 15 minuti; la compilazione dell’applicazione e la build di produzione sono invece passate sia localmente sia in CI. Il lint globale presenta debito preesistente: 872 errori/3.119 warning nella scansione iniziale di questa attività; nel wizard 11 errori già presenti nel codice di base. Nessuna modifica a questo debito è compresa nel flusso fotovoltaico.
