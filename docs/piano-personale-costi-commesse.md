# Personale HR e costo della manodopera nelle commesse

## Obiettivo e fonti dei dati

Il dipendente si gestisce in Personale e HR. Manodopera mostra lo stesso operaio per assegnarlo alle squadre e ai cantieri, senza creare una seconda anagrafica. Il collegamento è `hr_profili.employee_id → employees.id`; l'account dell'app è collegato per ID, non per somiglianza del nome. Subappaltatori, collaboratori e dipendenti non devono diventare indistintamente personale a costo orario.

Le timbrature servono alla presenza HR; i rapportini approvati attribuiscono lavoro e costo ai cantieri. Non sono due costi da sommare. Se il capo compila le presenze di squadra, esse sostituiscono le ore dell'autore. Un operaio può lavorare su più commesse nello stesso giorno, mantenendo una ripartizione delle sue ore-persona verificabile.

## Distinzione tra cedolino e costo aziendale

Il netto corrisposto al dipendente, i contributi a suo carico e le ritenute non sono tre costi aggiuntivi da sommare al lordo. Il costo aziendale parte dalla retribuzione lorda e aggiunge gli oneri del datore. La [guida INPS sulle aliquote contributive](https://www.inps.it/it/it/inps-comunica/diritti-e-obblighi-in-materia-di-sicurezza-sociale-nell-unione-e/per-le-imprese/aliquote-contributive.html) distingue le quote del datore e del lavoratore e segnala che le aliquote dipendono dall'inquadramento dell'azienda.

TFR, Cassa Edile, mensilità aggiuntive, malattia, recuperi e integrazioni dipendono dal rapporto di lavoro e dal prospetto paghe. La prima integrazione utilizza importi aziendali forniti dall'ufficio/consulente, non aliquote normative presunte. Le assenze non diventano automaticamente ore di una commessa.

## Piano operativo

### 1 Anagrafica unica e tariffa applicata

Mantenere la creazione HR e la scheda dipendente esistenti. Mostrare in HR la tariffa applicata ai prossimi rapportini e consentire una stima del costo pieno: lordo annuo comprensivo delle mensilità aggiuntive, oneri del datore, TFR, Cassa Edile, altri costi, recuperi e ore realmente produttive. Nessun costo negativo, dato non numerico o denominatore nullo è applicabile.

La stima può essere trasferita nel campo tariffa manuale e salvata dall'ufficio con l'RPC esistente. In questa prima fase si conserva la tariffa, non il prospetto completo della simulazione annuale. La simulazione non è un cedolino, un saldo TFR o una registrazione contabile. Non modifica i costi storici delle commesse.

### 2 Riconciliazione mensile per persona

Affiancare in HR ore registrate, straordinario già incluso nelle ore HR, giorni di assenza e anomalie. Mostrare per commessa ore e costo dello snapshot di approvazione del dipendente, oltre alle dichiarazioni in attesa. Il totale del caposquadra non sostituisce il costo di ogni partecipante.

Le righe senza snapshot, con presenze duplicate o costi non validi sono da verificare: un totale parziale non deve essere presentato come costo completo. Il confronto con HR distingue ore ancora da attribuire, ore superiori a quelle rilevate e giornate HR mancanti. Un rapporto cliente firmato non genera un secondo costo solo perché è firmato.

La lettura avviene per una persona e un mese selezionati, senza interrogare tutto lo storico aziendale o aprire un polling per ciascun operaio. La visibilità delle commesse richiede anche i relativi permessi. I motivi sanitari, certificati e dati fiscali privati non servono a questo confronto e non vengono caricati.

### 3 Prospetti e tariffe storicizzati

Introdurre, con una migrazione dedicata da collaudare prima del rilascio, versioni del prospetto di costo per dipendente con validità temporale, periodo di competenza, origine e approvazione. Conservare gli input annuali e la tariffa risultante, senza incorporare strutture JSON nelle note libere del profilo. Una rettifica deve creare una nuova versione e non riscrivere gli snapshot approvati.

Definire per azienda se usare tariffa di riferimento, costo pieno annuo o costo effettivo periodico. Se il costo periodico dei cedolini viene allocato sulle commesse, registrare lo scostamento rispetto ai costi orari già imputati: non aggiungere nuovamente l'intero cedolino. Le ore non attribuite restano evidenti; non distribuire ferie e malattia proporzionalmente senza una scelta aziendale esplicita.

### 4 Payroll e assenze

Consolidare gli identificativi dei cedolini, eliminando l'associazione mediante nome libero; mantenere le bozze separate dai documenti emessi e verificati. Archiviare TFR maturato, versato, anticipato e saldo come voci distinte. Gestire ferie, ROL, permessi, malattia, infortunio e recuperi con competenza e regole CCNL validate dal consulente. Il calcolo attuale del cedolino dichiara ipotesi e non è un motore paghe completo.

Per straordinari, trasferte e viaggi conservare regola applicata, quantità, aliquota e periodo. Separare ore di lavoro, tempo di viaggio, rimborsi chilometrici e costo stimato del mezzo. Ogni voce deve avere una fonte unica per evitare duplicazioni.

### 5 Protezioni e verifica

Riservare costo e prospetti HR ai ruoli autorizzati; sola lettura senza salvataggi. Impedire sul server la rettifica o cancellazione diretta delle righe economiche legate a snapshot approvati, mantenendo gli storni transazionali. Completare il ponte atomico rapportino/evento/commessa descritto nel piano Campo.

Collaudare anagrafiche mancanti o duplicate, più cantieri al giorno, autore/capo/squadra, assenze parziali, straordinari, tariffa cambiata, budget assente, rete instabile, cambi di azienda durante una richiesta, mancati permessi e risposte incomplete. I test SQL devono usare fixture locali, senza creare cedolini o rapportini fittizi online.

## Confini del primo incremento

L'implementazione locale comprende simulazione del costo pieno, proposta della tariffa, miglioramenti al salvataggio/aggiornamento della tariffa e riconciliazione mensile in HR. Le fasi 3–5 richiedono ulteriori modifiche server e dati contrattuali; non sono dichiarate già operative. Nessuna migrazione, emissione di cedolini, modifica di costi online o deploy è implicita in questo piano.

## Stato del collaudo locale — 13 ottobre 2026

Il primo incremento è implementato. Il salvataggio invia soltanto i campi modificati e rilegge la tariffa prima di confermare il successo; un aggiornamento ricevuto mentre si scrive conserva la bozza e richiede una rilettura. Le cache sono isolate per azienda. Le statistiche gestionali riconoscono le presenze di squadra per ID dipendente, anche senza account, escludono le bozze e distinguono la stima corrente dai costi storici approvati.

- 2.723 test superati in 128 file mirati a Campo, HR, cedolini, costi e commesse; includono 100 nuovi test del primo incremento e 16 confronti di arrotondamento con Postgres locale (PGlite).
- Nessun errore TypeScript nei 17 file selezionati per questo incremento; lint mirato e `git diff --check` superati. Non è una certificazione dell'intero repository: il controllo globale aveva errori preesistenti e non è stata eseguita una build completa, anche per lo spazio disco limitato.
- Nell'interfaccia locale, una scheda demo ha caricato la tariffa esistente e il confronto mensile con 56 ore HR, tre giornate con stato di assenza e nessun rapportino pertinente nel mese. Il calcolatore si apre e dichiara i confini della simulazione. Non sono stati salvati costi, cedolini o rapportini online.
- Il confronto carica solo il dipendente e il mese aperti, senza timer per persona; costi in attesa, dati incompleti, anomalie e permessi insufficienti non vengono trasformati in consuntivi completi.

La verifica visuale effettiva è desktop: l'override mobile richiesto al browser non ha cambiato il viewport (rimasto 1280 × 720). È stata rimossa l'esclusione mobile del riquadro HR, ma il collaudo visuale su un vero viewport stretto resta da completare.

Restano da implementare i prospetti annuali persistenti e versionati, i saldi TFR, le regole paghe/CCNL validate, la riconciliazione con cedolini effettivi e le protezioni server del registro economico. L'RPC preesistente `personale_salva_costo` controlla l'accesso HR ma non contiene un controllo esplicito della sola lettura: il blocco frontend introdotto non basta a proteggere chiamate dirette. Questa protezione server è un requisito del rilascio, non un risultato già ottenuto.

L'allocazione del costo approvato per commessa non costituisce un punteggio automatico di rendimento dell'operaio. Un confronto produttività richiede quantità lavorate, obiettivi, condizioni del cantiere e regole aziendali esplicite; non va dedotto dai giorni di malattia o dalle sole timbrature.
