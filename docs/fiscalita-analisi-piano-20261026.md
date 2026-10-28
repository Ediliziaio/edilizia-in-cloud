# Fiscalità dentro Fatture — analisi e piano operativo

Data: 26 ottobre 2026. Perimetro: `/azienda/documenti?tab=fiscalita`, Registro IVA, Contabilità fiscale/F24, Ritenute garanzia e Archivio. Il documento conserva l’audit iniziale; l’aggiornamento di implementazione è riportato in fondo. Frontend locale e migrazioni autorizzate dopo test isolati; nessuna registrazione fiscale reale, svincolo, chiusura, caricamento, pagamento o trasmissione eseguita per il collaudo.

## Risultato dell'analisi

Il disagio non dipende soltanto dal design. La scheda Fiscalità è un elenco di quattro collegamenti a pagine autonome. Queste non condividono periodo/filtri e diverse letture fallite possono apparire come archivi vuoti o saldi zero. Ci sono inoltre difetti verificati nel contratto dei dati IVA e nel catalogo F24. La priorità è correggere provenienza, qualità e significato fiscale dei dati, poi riunire l'esperienza.

I dati consultati dal browser appartengono a **Demo Azienda 2**, non sono una certificazione dei dati fiscali di aziende operative. Dato presente nel database, documento originale, esito SDI e registrazione fiscalmente validata sono quattro cose distinte.

## Evidenze verificate

| Area | Evidenza | Impatto / priorità |
| --- | --- | --- |
| Navigazione | `FiscalitaPanel` in `DocumentiFiscaliList.tsx` contiene quattro Link. Le destinazioni montano una nuova pagina con `FiscalitaNavigation`; la barra principale di Fatture scompare | Discontinuità reale del flusso. P1 |
| Periodo | Registro IVA ha anno/mese propri; Contabilità ha un altro anno; Liquidazione inizializza un proprio anno e trimestre; Archivio e caricatore hanno anni separati | È possibile consultare/compilare periodi diversi senza accorgersene. P1 |
| Aliquota IVA | Nel campione `DEMO-FT/2026/091`, il JSON sorgente contiene `aliquota_iva: "22"`, imponibile 5.076,60 e imposta 1.116,85. La pagina legge `r.aliquota || "0"` e mostra **0%**. Nel 2026 della demo ci sono 259 elementi di riepilogo con solo `aliquota_iva` e quattro con solo `aliquota` | Errore di lettura riproducibile, non prova che l'XML originale sia errato. Non riscrivere documenti né dedurre l'aliquota dividendo imposta per imponibile. P0 |
| Vuoto / errore | Registro IVA non usa loading/error delle due query. `useF24` e `useArchivioSostitutivo` non espongono gli errori alla pagina; Ritenute ignora `isError` | Errore o caricamento possono produrre zero e «nessun documento». P0 |
| Completezza | Le letture dei quattro moduli non hanno paginazione completa né conteggio/avviso del limite API. Registro legge l'anno e filtra il mese in client; selettore limitato a tre anni | Rischio di omissioni silenziose su archivi grandi e storico non raggiungibile. P0/P1 |
| Calcolo IVA | Registro somma le righe in JavaScript. La funzione SQL `liquidazione_iva_periodo` tratta separatamente split payment, ma la pagina non seleziona l'esigibilità e presenta la somma come debito/credito | Due logiche distinte che possono divergere. P0 |
| Ipotesi nascoste | Il server restituisce `ipotesi`, `escluso`, `documenti`, `esigibilita_differita` e dettaglio aliquote. Il componente Liquidazione usa solo i totali e non mostra tali informazioni | Nasconde l'ipotesi di detrazione piena e il trattamento approssimato dell'IVA per cassa. P0 |
| Ricezione acquisti | A ottobre 2026 la demo ha 22 ricevute nel periodo, tutte senza `data_ricezione_sdi`; il database le colloca con fallback alla data fattura | Il totale non equivale a una liquidazione verificata. La mancanza deve essere visibile e impedire conferme automatiche. P0 |
| Reverse charge | Client e SQL usano 22% quando manca l'aliquota specifica; ricevuta N6 e integrazione TD16–TD19 possono alimentare entrambi i lati | Aliquota non confermata e possibile doppio abbinamento da governare. Non ogni N6 richiede di inventare una TD16: verificare il flusso dell'operazione originale. P0 |
| F24 | `TRIBUTI_PREDEFINITI` etichetta 3918 come IVA, 1040 come lavoro dipendente e 6001 come acconto dicembre | Catalogo errato verificato contro fonti ufficiali: correggere prima di uso operativo. Verificare anche 0601 e 1301 senza sostituirli con altri codici presunti. P0 |
| Composizione F24 | `f24_componi` è una funzione che **scrive** righe, non un'anteprima. Le ritenute cedolini sono selezionate per mese/stato, senza prova del pagamento nel criterio corrente. `ON CONFLICT DO NOTHING` può lasciare importi precedenti mentre il risultato espone importi ricalcolati | Separare anteprima e conferma; impedire dati incompleti/stime e risultati non corrispondenti alle righe salvate. P0 |
| Esiti F24 | Backend può restituire `ok:false` con solo `motivo`; frontend assume `voci` presente. In caso di errore il componente lo assorbe, ma la mutation di composizione non ha il toast promesso nel commento | Possibili errore UI o silenzio. P0 |
| Ritenute | La pagina tratta **garanzie contrattuali**, non ritenute fiscali d'acconto. Lo stato svincolata viene descritto come «tornato in cassa», ma lo svincolo non registra un movimento bancario | Nomenclatura e saldi fuorvianti; separare liberazione della garanzia, credito e incasso riconciliato. P1 |
| Archivio | Legge soltanto `archivio_sostitutivo`, compilata da upload manuale. L'uploader non offre il collegamento `documento_id` pur previsto dal hook | Non è l'archivio unificato delle fatture esistenti; vuoto legittimo ma spiegato male. P1 |
| Conservazione | Hub promette «Archivio sostitutivo / conservazione», mentre la pagina dichiara correttamente che il caricamento con hash non è conservazione a norma | Uniformare il linguaggio; stato «conservato» solo con prova del servizio effettivo. P0/P1 |
| Permessi | Le route hanno permessi/moduli diversi; solo Registro ha l'eccezione commercialista. F24/Archivio usano RLS su azienda del profilo; Ritenute ha anche policy superadmin. I form non distinguono esplicitamente sola lettura | L'incorporamento non deve aggirare guard, moduli o RLS. Possibili elenchi vuoti in contesti delegati da verificare con ruoli autorizzati. P0 |

### Conteggi letti sul database, non generati

In Demo Azienda 2, anno 2026 al momento dell'audit:

- 268 documenti attivi/non cestinati, **inclusi 47 in bozza**; 115 hanno un numero contenente `DEMO`. Non chiamarli tutti fatture fiscalmente emesse.
- 341 fatture ricevute con data fattura nel 2026; il conteggio non è automaticamente quello del periodo di detrazione.
- Zero righe F24 2026 e zero caricamenti nell'archivio separato 2026: l'assenza in queste due tabelle è reale, non assenza di fatture nel gestionale.
- Una ritenuta di garanzia attiva già svincolata. Dopo caricamento la pagina la mostra; durante caricamento i KPI partono da zero.
- Registro IVA e calcolo informativo, ottobre: stessi totali osservati (1.116,85 vendite; 32.120,30 acquisti). La corrispondenza di questo campione **non dimostra** correttezza fiscale generale, specialmente con ricezioni mancanti.

## Flusso UX proposto

Restare dentro **Fatture → Fiscalità**, con barra principale sempre presente e quattro sezioni interne:

1. **Registro IVA**: Vendite / Acquisti / Controlli, documenti e provenienza apribili in pannello laterale.
2. **Contabilità fiscale**: Prospetti IVA / F24 / Scadenze; Prima Nota resta un collegamento esplicito a una funzione distinta, non una scheda apparentemente vuota.
3. **Ritenute di garanzia**: mantenere nome completo; distinguere attive/passive e incassi. Le ritenute fiscali su compensi saranno una sezione distinta, non ricavate dalle garanzie.
4. **Archivio fiscale**: documenti già presenti, allegati aggiunti e prove di conservazione, distinti per origine e stato reale.

Un solo contesto periodo (anno, mensile/trimestrale/annuale dove pertinente), ricerca e filtri persistiti nell'URL. Aprire una sezione carica solo le query necessarie. Back/forward, refresh e link diretto ripristinano la stessa vista; niente schermo intermedio con sole quattro card.

Esempi di URL previsti dal piano, ora supportati dal workspace:

- `/azienda/documenti?tab=fiscalita&sezione=iva&anno=2026&mese=10&registro=acquisti`
- `/azienda/documenti?tab=fiscalita&sezione=contabilita&vista=f24&anno=2026&mese=10`
- `/azienda/documenti?tab=fiscalita&sezione=ritenute&direzione=attiva&anno=2026`
- `/azienda/documenti?tab=fiscalita&sezione=archivio&anno=2026`

Le vecchie route rimangono compatibili tramite redirect `replace` al workspace, dopo controllo permessi. Il workspace monta componenti contenuto riutilizzabili, non una seconda copia delle pagine con altre query. Usare lazy loading e confini di errore per sezione; impedire import circolari hub/pagine.

## Contratto dei dati: cosa significa «reale»

Ogni importo deve avere azienda, documento/operazione sorgente, periodo, origine e stato di verifica. Distinguere almeno:

- **Originale presente**: XML/P7M, ricevuta SDI, documento contabile/importazione identificata; relativo ID e data di acquisizione.
- **Dato importato/manuale da verificare**: provenienza nota ma campi o prove mancanti; nessun badge di validità fiscale.
- **Prospetto calcolato**: regola/versione, documenti inclusi/esclusi e ipotesi leggibili; non automaticamente liquidato.
- **Registrazione confermata**: validazione umana autorizzata con storico/snapshot; non significa inviata o pagata.
- **Esito esterno provato**: trasmissione/quietanza/conservazione con riferimento e ricevuta effettivi.

L'AI non crea importi, aliquote, protocolli, ricevute o pagamenti. Nessun riempimento della produzione con record dimostrativi. In assenza di prova, mostrare «da verificare / non disponibile», non 0,00 o «tutto regolare». Non usare il nome o il numero `DEMO` come unico criterio automatico per classificare documenti reali.

## Piano di implementazione in ordine

### P0 — Affidabilità, prima dei nuovi automatismi

1. Estrarre normalizzatore tipizzato condiviso del riepilogo IVA: alias storici `aliquota`/`aliquota_iva`, numeri italiani, nulli, esigibilità, natura, arrotondamento. Se i due alias confliggono, segnalare; se manca l'aliquota non inventarla né ricavarla matematicamente. Lettura compatibile senza aggiornare documenti fiscali emessi/XML.
2. Rendere espliciti loading/errore/vuoto/nessuna autorizzazione. Bloccare totali, CSV e conferme quando le letture sono parziali o fallite. Eliminare lo zero iniziale nei KPI e le assunzioni `|| 0` per importi sconosciuti.
3. Paginare sul server con ordinamento stabile e filtri temporali; conto righe/documenti distinti, niente troncamenti a 1.000. Non precaricare gli altri tre moduli.
4. Unificare proiezioni del Registro e calcolo IVA in un contratto server verificabile. Separare elenco documenti da quota a debito/detraibile; mostrare split payment, IVA per cassa/differita, indetraibilità/pro-rata, mancanza data ricezione e aliquota RC. Se il caso non è supportato, impedire la conferma operativa invece di produrre un saldo fiscale definitivo. Verificare crediti precedenti, rettifiche e regime/periodicità prima di proporre un versamento.
5. Correggere catalogo F24 da fonti ufficiali versionate e distinguere tributi erariali, causali contributive e sezioni. Non rietichettare silenziosamente versamenti storici.
6. Separare RPC di anteprima F24 read-only da conferma esplicita di bozze, con stato/motivo strutturati, autorizzazione di scrittura, idempotenza e revisione. Fonti payroll originali verificate e relative date fiscali/pagamenti da validare; non basta `stato <> bozza`. Importi mancanti restano incompleti, non somme parziali presentate come complete. Nessun versamento/Entratel implementato implicitamente.
7. Chiudere i casi `ok:false`, errore di rete e dati cambiati: mostrare motivo e preservare input, senza successi falsi o risultati obsoleti. Su periodo già composto restituire le righe davvero persistite, non un nuovo totale non salvato. Evitare cancellazione indiscriminata delle righe manuali in rigenerazione.
8. Verificare ruoli e RLS con matrice azienda/amministratore/sola lettura/commercialista delegato/superadmin. Preservare billing mode e feature gate durante il refactoring. Nessuna estensione automatica delle deleghe del commercialista a dati payroll o altre aree.

### P1 — Workspace unico e collegamenti reali

9. Incorporare i quattro contenuti nel workspace descritto sopra; URL e contesto condivisi, compatibilità delle vecchie route. Nessuna perdita di filtri al ritorno dal documento.
10. Ritenute: documento/SAL/contratto collegati, importo e percentuale da fonte, svincolo separato dall'incasso effettivamente riconciliato. Azioni confermate con motivo e storico; nessun «soldi incassati» dal solo cambio stato. Eliminare probabilità 70%, durata 6 mesi e percentuale 5% come consigli/default universali non legati al contratto.
11. Archivio: catalogo federato di riferimenti agli originali già presenti in fatture attive, ricevute, SDI e upload manuali. Non duplicare file per riempire la vista. Chiave stabile di origine e deduplicazione per ID/hash (non solo numero fattura). Ricerca per numero/controparte/tipo/anno e indicatore file disponibile/mancante.
12. Upload aggiuntivi con collegamento al documento, controllo azienda/permessi/tipo/dimensione, gestione errore storage/database e recupero dei file orfani. Anno del form coerente col periodo selezionato; nessun reset a quello corrente dopo aver scelto un altro anno. Download fallito segnalato, nessuna apertura silenziosa senza file.
13. Conservazione: rinominare coerentemente «Archivio fiscale». Mostrare «conservato a norma» solo con attestazione/esito verificato del servizio; adesione dichiarata o hash locale non bastano. Se servizio non collegato: stato esplicito, nessuna promessa di conformità.

### P2 — Chiusura e validazione operativa

14. Prospetto di riconciliazione per commercialista: inclusi/esclusi, provenienza, errori, totali per aliquota/natura/esigibilità, quota supportata/non supportata e collegamenti alle prove. Esportazione coerente con filtri e dati a video, CSV protetto da formule. Importi in centesimi/decimali esatti.
15. Snapshot con approvazione/rettifica tracciata per periodi verificati. Ricalcolo di dati aperti non cambia silenziosamente periodi già validati. Pagato solo con registrazione esplicita della prova esterna; nessun ordine bancario durante il collaudo.
16. Collaudo isolato e poi browser su Demo Azienda 2; prove reali solo con dati e autorizzazione specifici. Modifiche database fiscali da proporre separatamente dopo test, non dedotte dalle precedenti autorizzazioni HR. Pubblicazione solo dopo verifica e richiesta.

## Matrice minima di accettazione

- UX: quattro sezioni nello stesso hub; vecchie route, link diretto, back/forward, refresh; desktop/mobile; periodo unico coerente con form e prospetti.
- Dati: vuoto vero distinto da HTTP/RLS/timeout; null diverso da zero; oltre 1.000 righe; errori su una sola fonte; cambio azienda senza dati del tenant precedente.
- IVA: alias entrambi/assenti/confliggenti; più aliquote; esenti/non imponibili; note credito/debito; arrotondamenti; bollo/cassa/ritenute non confusi con imponibile+IVA o totale da pagare.
- SDI: bozza, scarto, inviata/in attesa, consegna/mancata consegna; originali esterni; rettifiche. Validare l'ammissibilità fiscale caso per caso, non equiparare semplice invio a validità.
- Periodi acquisti: ricezione sconosciuta, entro/dopo il 15, cambio anno, registrazione e detrazione differita. Nessun diritto alla detrazione presunto dal solo importo.
- Split payment/IVA per cassa/indetraibilità/pro-rata: quota corretta o blocco motivato se mancano dati.
- RC: aliquota non confermata, integrazione originale collegata, ricevuta N6 e TD16/TD17/TD18/TD19, nessuna doppia contabilizzazione; esiti per entrambi i registri.
- F24: codici/sezioni corretti, anteprima senza scritture, doppio clic/concorrenza, periodo già pagato, conflitto revisione, importi mancanti, errore dopo calcolo, righe manuali preservate, assenza invio/pagamento automatico.
- Ritenute: fiscale vs garanzia, attiva/passiva, SAL/contratto, svincolo parziale se supportato o esplicitamente non disponibile, incasso separato, permessi e audit.
- Archivio: esistenti senza reupload, zero file manuali con fatture presenti, file assente, duplicato, hash/prova esterna, storage fallito/database fallito, download negato, retention e contenzioso da validare; nessuna cancellazione automatica alla semplice scadenza dei dieci anni.

**Criterio di completamento:** ogni importo è tracciabile al suo documento/operazione originale; nessuna schermata trasforma mancata lettura o campo ignoto in saldo fiscale valido. I casi non supportati sono evidenti e non confermabili automaticamente. La validazione del consulente rimane distinta dal collaudo software.

## Verifiche eseguite in questa analisi

- Browser locale: tutte e quattro le destinazioni, caricamento ritenuta esistente, archivio manuale vuoto, F24 vuoto, calcolo informativo ottobre senza scritture. Non premuti Componi F24, Nuovo/Salva, Svincola, Archivia o Pagato.
- Prova visiva del campione con aliquota 0% errata: `output/personale-quality-20261026/fiscalita-audit-iva.png`. Al termine ripristinata la scheda Fiscalità di partenza.
- Database remoto: sole SELECT di conteggi, schema, JSON campione, definizioni funzioni, RLS/policy. Verificate RLS sulle tre tabelle, vista acquisti `security_invoker=true`, RPC IVA/F24 non eseguibili da anonimi. Queste verifiche non sostituiscono prove di accesso con tutti i ruoli.
- Suite esistente: **43 test superati, tre saltati, quattro file** (`/tmp/fiscalita-audit-tests.log`). Molti controlli sono statici sul sorgente; non coprono il bug dell'alias riprodotto nel browser né certificano i dati fiscali. Nessun test live opt-in eseguito.
- Nessun file applicativo fiscale modificato, nessuna migrazione o pubblicazione. Il checkout contiene modifiche parallele di altre aree, lasciate intatte.

## Fonti fiscali ufficiali consultate

- [Agenzia Entrate, codici ricorrenti: 3918 è IMU altri fabbricati, non IVA](https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/Ricorrenti.php).
- [Agenzia Entrate, codice 1040: ritenute lavoro autonomo](https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/SezioneErario.php?CT=1040).
- [Agenzia Entrate, codice 6001: versamento IVA mensile gennaio](https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/SezioneErario.php?CT=6001).
- [Agenzia Entrate, ritenute su compensi corrisposti: scadenza e condizioni](https://www1.agenziaentrate.gov.it/servizi/scadenzario/main.php?chi=1&come=515&cosa=10878&entroil=16-02-2026&op=4&vista=0).
- [Agenzia Entrate, conservazione a norma distinta dalla semplice memorizzazione](https://agenziaentrate.gov.it/portale/web/guest/aree-tematiche/fatturazione-elettronica/guida-fatturazione-elettronica/come-predisporre-inviare-ricevere-fe/come-si-conservano-fe).

Le fonti guidano la correzione del catalogo e del linguaggio; non autorizzano a ricostruire debiti fiscali o eseguire versamenti senza dati e verifica professionale.

## Aggiornamento implementazione — 26 ottobre 2026, collaudo finale

### Completato in questa fase

- Quattro sezioni incorporate in Fiscalità senza abbandonare Fatture. Caricamento lazy della sola sezione attiva, error boundary, anno e mese/trimestre condivisi, URL persistenti per registro, ricerche e direzione garanzie. Fiscalità raggiungibile anche nel menu mobile.
- Vecchie route compatibili dopo i loro controlli originali. Se fatture native, permesso billing o relativa feature non sono disponibili, contabilità/garanzie/archivio mantengono la vista autonoma autorizzata: nessuna estensione dei permessi per accedere al nuovo hub. La delega del commercialista resta limitata al perimetro originario.
- Letture complete a pagine e ordinamento stabile; distinzione tra caricamento, errore e archivio effettivamente vuoto. Nessuna sostituzione dei campi ignoti con importi zero. Paginazione visiva di registro e catalogo federato.
- Normalizzatore IVA per alias storici, conflitti, nulli, note di credito, centesimi con arrotondamento esplicito. Il campione che mostrava 0% ora mostra 22%, senza modificare il documento o il suo XML. Le proiezioni RC sono separate e non entrano nei totali documentali; nessuna aliquota 22% presunta.
- Registro documentale distinto dal prospetto server preliminare. Fonti, ipotesi ed esclusioni consultabili; ricezioni SDI mancanti in evidenza; differenza aritmetica col segno originale. Nessuna liquidazione definitiva dichiarata.
- Catalogo F24 corretto per i codici erariali supportati. Nuova anteprima read-only e conferma separata di importi esplicitamente riferiti al prospetto del consulente. Revisione delle righe del mese, blocco delle sovrascritture/duplicati, rollback atomico in caso di errore, coerenza mese/codice IVA. Modificare i dati invalida l’anteprima; annullare o cambiare azienda non conserva una conferma pronta di un altro contesto.
- Il vecchio compositore automatico F24 è disabilitato anche lato server: non può più trasformare cedolini o ipotesi IVA in debiti confermati. Nessun F24 telematico o pagamento è implementato da questi nuovi controlli.
- Garanzie: svincolo con anteprima della versione corrente, data e riferimento documentato, controllo concorrenza e storico prima/dopo. Svincolato non significa incassato. Lo storico precedente all’attivazione non viene inventato.
- Chiusura amministrativa mensile con motivo, revisione, attore, snapshot F24 e storico. Solo mesi conclusi con registrazioni F24; rettifiche finanziarie nel mese chiuso bloccate anche sulle fonti attive/passive. Riapertura autorizzata e motivata; aggiornamenti puramente operativi dello stato SDI rimangono possibili. Non è una certificazione della liquidazione IVA.
- Archivio federato delle fatture già presenti e degli allegati manuali, fonti consultabili in dialogo. Originali non disponibili e conservazione non verificata dichiarati esplicitamente; nessun reupload o generazione di prove fittizie per riempire la pagina.
- Upload manuali con anno coerente, limiti di tipo/dimensione, nome storage univoco, duplicati hash controllati e pulizia del solo nuovo file in caso di errore DB. Nessun upload reale eseguito nel collaudo.

### Database applicato dopo i test isolati

Migrazioni condivise applicate, con file locali riallineati alla versione registrata sul server:

- `20261026220848_fiscalita_conferme_tracciate.sql` — conferme, storico, guardie dei periodi e sospensione del compositore non verificato.
- `20261026221710_fiscalita_rls_initplan.sql` e `20261026221859_fiscalita_rls_auth_uid_cache.sql` — controlli di sessione valutati tramite subquery scalari, mantenendo le verifiche correlate all’azienda.

Hash dei file SQL confrontati con il registro delle migrazioni. RLS abilitate; RPC pubbliche SECURITY INVOKER, non eseguibili da anonimi; nessuna concessione di USAGE sullo schema privato. Gli advisor successivi non segnalano rilievi sulle nuove entità fiscali; restano segnalazioni pregresse di altre aree, non modificate.

Verifica successiva alle prove browser: F24 **0**, periodi amministrativi **0**, eventi nel nuovo storico **0**, garanzie **1** già esistente prima della modifica. Nessuna riga fiscale creata per test nel database condiviso.

### Collaudo eseguito

- **82 test superati, 3 saltati, 10 file**. I tre saltati sono sonde live opt-in della suite storica, non equivalgono a verifiche eseguite. Sei casi di database PGlite isolato esercitano gli SQL effettivi, conferma/stale version, atomicità, permessi/azienda/sola lettura, mesi chiusi, ricevute e svincoli. Test UI e logica coprono errori/nulli, aliquote, segno, form F24, navigazione, gate, compatibilità delle vecchie route e paginazione completa. Il fallback conserva anche i controlli del periodo e la sezione corretta per chi non può accedere all’hub delle fatture native.
- Build di produzione verificata localmente. Lint dei file fiscali senza errori. Controllo tipi mirato senza diagnostiche. Il typecheck globale rimane bloccato da nove nuove diagnostiche in test Sicurezza/Acquisti modificati in parallelo; nessuna nuova diagnostica nei file fiscali verificati, nessun aggiornamento della baseline per nasconderle.
- Browser Demo Azienda 2: quattro sezioni; campione 22% corretto; 22 date ricezione mancanti evidenziate a ottobre; archivio con **562 documenti esistenti**, nessun allegato manuale; fonte consultabile senza uscire dal workspace; periodo mensile/trimestrale; prospetto preliminare ricalcolato in sola lettura.
- Anteprima F24 reale via browser con importo fittizio esplicitamente etichettato e **annullata prima della conferma**. Nessuna riga scritta. Dettaglio/storico della garanzia preesistente consultati senza modificarla. Le transizioni che scrivono sono provate soltanto nel database isolato.
- Nessun commit, push o pubblicazione dell’app effettuati in questa fase. Le modifiche parallele estranee alla Fiscalità non sono state incluse o ripristinate.

### Limiti residui e prossima fase professionale

Non è ancora un motore fiscale completo: periodicità/regime, crediti precedenti, indetraibilità/pro-rata, IVA per cassa, associazioni RC originali e pagamenti payroll devono essere validati con dati/prove effettivi. Il prospetto SQL storico mantiene ipotesi dichiarate e non è usato per comporre automaticamente F24. Non sono stati inventati causali/sezioni INPS, flussi Entratel o quietanze.

Da completare separatamente con fonti reali: collegamento strutturato di ogni upload al documento, acquisizione delle ricevute del conservatore effettivo, svincoli parziali/rettifiche dedicate, riconciliazione della quietanza F24 e prospetto ministeriale/statutario approvato dal consulente. Non chiamare «conservato» un documento perché presente nel catalogo o dotato di hash.
