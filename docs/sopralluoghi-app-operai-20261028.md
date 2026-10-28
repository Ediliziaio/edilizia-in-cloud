# Sopralluoghi nell’app operai — 28/10/2026

## Flusso realizzato

1. L’ufficio apre un sopralluogo e assegna una persona dell’azienda.
2. L’opzione **Autorizza questo sopralluogo nell’app operai** è separata dall’assegnazione e parte disattivata. Nessun utente esistente viene abilitato dalla migrazione.
3. Operai e subappaltatori vedono **I miei sopralluoghi** nel menu Campo solo quando hanno almeno un incarico autorizzato. Un link diretto richiede nuovamente la verifica server.
4. L’editor tecnico esistente gestisce misure, disegni, foto originali, proposte di posizionamento, annotazioni e PDF. Non è stato creato un archivio parallelo.
5. **Consegna all’ufficio** richiede conferma e almeno un elemento. Le lacune restano visibili, senza essere inventate o considerate automaticamente conformi. La consegna è disabilitata mentre ci sono modifiche non salvate.
6. `completed` significa **Da revisionare**: per l’operatore il rilievo è di sola lettura. L’ufficio approva oppure restituisce con un motivo di almeno cinque caratteri.
7. Esito, motivazione e transizioni sono tracciati sul server. L’ultimo riscontro è distinto dalle note del tecnico e viene riportato anche nel PDF.

## Confini di sicurezza

- Autorizzazione **e** assegnazione controllate da RLS su testata, ambienti, elementi, media, assegnazioni e log.
- Storage privato limitato al percorso azienda/sopralluogo assegnato. Nessun accesso solo perché un UUID è noto.
- Profilo e sopralluogo devono appartenere alla stessa azienda. Il ruolo osservatore è di sola lettura.
- Nessuna creazione autonoma di sopralluoghi, modifica del cliente/commessa, auto-assegnazione, firma o auto-approvazione per i ruoli Campo.
- Le scritture degli elementi prendono un lock sulla testata, serializzando la consegna con le modifiche tecniche.
- Le API di modifica/eliminazione verificano la riga restituita: una revoca RLS non può diventare un falso messaggio di salvataggio riuscito.
- Cache distinta per utente, azienda, commessa e contesto Campo/ufficio. Errore di verifica o revoca non mostrano dettagli precedenti.
- La pagina controlla le capacità ogni 15 secondi; i vincoli di scrittura server non dipendono dal polling.
- I nuovi URL firmati delle foto caricate e quelli emessi dalle letture Campo durano 5 minuti. Un link già emesso o un file già scaricato non è revocabile istantaneamente; eventuali vecchi URL firmati mantengono la scadenza originaria.
- Le funzioni definer di consegna/revisione hanno controlli espliciti su chiamante, ruolo, azienda, assegnazione, stato e motivazione; niente esecuzione anonima e search_path fisso. L’avviso generico del linter sull’esecuzione authenticated di queste funzioni è intenzionale, non un’autorizzazione indiscriminata.

## Database attivato, frontend locale

- Migrazioni approvate e applicate: `20281028052100_sopralluoghi_campo_autorizzati.sql` e `20281028055000_sopralluoghi_revisione_riapertura_motivata.sql`. Registro remoto riallineato alle stesse versioni. Anche il cambio generico di stato richiede una motivazione per riaprire il rilievo consegnato o revisionato.
- Stato iniziale prima del collaudo interattivo: 3 assegnazioni complessive, 0 autorizzazioni Campo attive; SOP-2026-0005 era `in_progress`, senza incaricati. Lo stato finale del collaudo autorizzato è descritto sotto.
- `surveys_assigned_to_me()` ora è security invoker: anche il vecchio elenco rispetta RLS.
- Creazione di progetti da sopralluogo riservata all’ufficio.
- Nessun commit, push main o pubblicazione frontend effettuati in questa attività. Le modifiche concorrenti degli altri terminali sono state preservate.

## Endpoint autorizzato separatamente

`sr-import-da-sopralluogo` aggiornato dalla versione 47 alla 48, JWT obbligatorio conservato.
Letture iniziali con JWT del chiamante e controllo dei permessi `can_view_sopralluoghi` + `can_edit_preventivi`, esclusa sola lettura, prima delle scritture privilegiate.
L’importazione senza righe compatibili non elimina più preventivi esistenti. Non si dichiara che il vecchio motore di importazione sia interamente transazionale: resta un flusso legacy separato dal salvataggio del rilievo.
Le dipendenze condivise pubblicate con l’endpoint sono quelle della versione remota precedente, non le modifiche concorrenti locali. Un import map specifico blocca supabase-js a 2.105.3 tramite npm, evitando il timeout di esm.sh incontrato nel primo tentativo di pubblicazione.

## Collaudo ed evidenze

- 37 verifiche PostgreSQL isolate (PGlite), applicazione ripetuta delle migrazioni inclusa: autorizzazione, assegnazione, isolamento azienda, storage, osservatore, sola lettura, revoca, consegna, restituzione, revisione, RPC legacy, riapertura motivata e chiamante anonimo.
- Verifiche remote effettive in transazioni annullate: nessuna lettura per operatore non autorizzato; ciclo autorizzazione transitoria → modifica di 3 elementi → consegna → scritture bloccate → restituzione → nuova consegna → approvazione. Rollback finale verificato: 0 autorizzazioni, 0 incaricati della bozza e stato originale ripristinato. Nessuna notifica o assegnazione di prova persistente.
- Test UI reali dell’editor: un operatore con autorizzazione al singolo rilievo salva senza permessi generali dell’ufficio; dopo la consegna campi e salvataggio sono disabilitati.
- Nuovi test per invio con conferma, esito obbligatorio, errori di rete, cache separata e salvataggi a zero righe. Suite di regressione comprende foto, posizionamenti, creazione, PDF, copia e navigazione fra elementi.
- Esito finale: 126 test funzionali passati in 14 file; 32 verifiche energia/PDF ripetute con runtime Node nativo, 37 controlli PostgreSQL passati, lint e controlli TypeScript mirati senza errori. Build di produzione locale riuscita, con soli avvisi preesistenti su bundle/import e Browserslist. Una ripetizione parallela ha incontrato spazio disco esaurito: ripetuta con 2 worker dopo la conclusione della build, è passata; nessun file utente eliminato. Restano meno di 1 GB liberi sul disco locale.
- Deno check dell’endpoint e 6 test del controllo permessi. Smoke remoto: POST anonimo 401, OPTIONS 204.
- Browser: pannello reale di assegnazione su Demo Azienda 2, senza concedere accessi. Componente elenco reale verificato con dati fittizi a 390×844 e 820×1180; stato vuoto verificato; viewport ripristinato. Anteprima isolata in `work/sopralluoghi-campo-20261028/mobile.html`.
- PDF SOP-2026-0005 rigenerato dal browser, 7 pagine A4 renderizzate e controllate: dati aziendali, note, originale, proposta e didascalie presenti, nessuna firma inventata. Il logo non è inventato quando non disponibile: resta il nome aziendale.

## Collaudo interattivo con account operaio reale

Autorizzazione esplicita ricevuta per assegnare e abilitare **soltanto SOP-2026-0005** all’operaio indicato. Assegnazione effettuata dal pannello dell’ufficio, nessun ruolo o accesso generale modificato. Sessione reale di Marco Verdi, Demo Azienda 2; nessuna credenziale salvata negli artefatti.

- Browser responsive 390×844: elenco reale, apertura, modifica scheda tecnica, salvataggio note, caricamento di un originale illustrativo e relativa proposta di posizionamento, con spostamento del componente e didascalia dedicata. Nessuna immagine fittizia spacciata per targhetta o documento tecnico.
- Riapertura dal server: note e riferimento del collaudo presenti, 5 allegati complessivi (3 precedenti + 2 nuovi), collegamento proposta/originale conservato. Entrambi i nuovi media riportano l’utente operaio come autore.
- Originale scaricato dall’app: SHA-256 `270a7a036270cbe44b9b7b0e8277462416aa8308419e083721d0cf771b6701f3`, identico al file caricato.
- PDF scaricato prima e dopo consegna; copia finale A4 di 8 pagine, tutte renderizzate e controllate. Originali, proposte, note, dati aziendali e 7 foto tecniche ancora mancanti riportati correttamente; nessuna firma inventata. Nome aziendale usato quando non è disponibile un logo.
- Consegna con conferma esplicita al 75%: SOP-2026-0005 ora è **completed / Da revisionare**, non approvato. L’operaio conserva lettura e PDF, ma non vede Compila, Duplica, modifica o caricamento. Verificato anche accesso diretto con `?modifica=1`.
- Controllo server con identità operaio, confinato in transazione annullata: `can_view=true`, `can_edit=false`; tentativo di aggiornamento dell’elemento restituisce 0 righe. Nessuna riapertura effettuata.
- SOP-2026-0004 non assegnato: accesso diretto negato nel browser operaio. Nessuna autorizzazione concessa al subappaltatore o ad altri sopralluoghi.
- Filtri reali: il consegnato scompare da **Da fare** e resta in **In ufficio**; conteggi 3 elementi / 5 allegati. Verificata anche impaginazione tablet 820×1180.

Miglioramenti locali: ricerca e filtri compatti, schede con stato e conteggi reali, un solo accesso PDF su telefono, consegna compatta con nome accessibile completo, meno navigazione duplicata nel riepilogo Campo, testo coerente con sola lettura. Data di aggiornamento di report e riepilogo calcolata anche su ambienti, elementi e nuovi media, non soltanto sulla testata.

Regressione aggiornata: 67 test passati in 8 file, 32 controlli energia/PDF in runtime Node nativo e 37 controlli PostgreSQL isolati passati; lint mirato pulito. Build di produzione locale riuscita (`build:fast`), con avvisi sui bundle/import e Browserslist. Corrette anche opzioni `exact` non previste dai tipi di Testing Library nei test di creazione e nei nuovi test UI (la corrispondenza esatta del nome è già il comportamento predefinito).

Il primo controllo TypeScript globale senza aumento heap è terminato per limite memoria Node di 4 GB. Ripetuto con heap di 12 GB, il controllo termina con 814 errori in altre aree del progetto condiviso, nessuno nei file di sopralluoghi/campo e relativi test verificati qui. Non si dichiara il typecheck globale riuscito né la piena validazione delle aree esterne al modulo. Log finale locale: `/tmp/campo-mobile-20261028-types-final.log`.

Evidenze aggiuntive: `work/sopralluoghi-campo-20261028/app-operaio-lista-reale.png`, `app-operaio-consegnato-lista.png`, `app-operaio-sola-lettura.png`, `app-operaio-fotoinserimento.png`, `app-operaio-non-assegnato.png`, `app-operaio-tablet.png`; PDF finale `output/pdf/Collaudo-app-operaio-SOP-2026-0005.pdf`, rendering in `work/sopralluoghi-campo-20261028/pdf-operatore/`.

## Limiti dichiarati attuali

Login, caricamento e consegna ora sono collaudati interattivamente con l’account operaio reale, in un browser a dimensioni telefono/tablet. La fotocamera di un dispositivo fisico non è stata provata. Non viene promessa sincronizzazione offline automatica. Il PDF dimostrativo segnala ancora 7 foto tecniche mancanti, intenzionalmente non sostituite con fotografie finte. Nessun commit, push o pubblicazione frontend eseguito in questo collaudo.

Evidenze: `work/sopralluoghi-campo-20261028/autorizzazione-ufficio.png`, `elenco-telefono.png`, `elenco-tablet.png`, `pdf-1.png`…`pdf-7.png`; PDF finale in `output/pdf/Collaudo-campo-Demo2-SOP-2026-0005.pdf`.
