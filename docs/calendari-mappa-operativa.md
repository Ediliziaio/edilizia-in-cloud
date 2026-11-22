# Mappa operativa dei calendari

## Verifica del 22 novembre 2026

Il lavoro è nel checkout locale `codex/mappa-operativa-calendari-20261122`, basato su `c25ffb5d8a95ea2ed1d991c260392ef8e7712c5a`. Il checkout principale conteneva modifiche e commit locali ed è rimasto intatto.

| Ambiente | Ora italiana | Controllo | Evidenza |
| --- | --- | --- | --- |
| Produzione pubblica | 15:24 circa | Sito raggiungibile | `curl -L` ha ricevuto HTTP 200 su `www.ediliziaincloud.com`. |
| Produzione gestionale | 15:24 circa | Gestionale e rotta calendario raggiungibili | HTTP 200 su `app.ediliziaincloud.com` e `/azienda/calendario`. Risposta della shell dell’app. |
| Cloudflare Pages | 15:23:06 | Build del riferimento di partenza completata | Check GitHub `Cloudflare Pages` verde per `c25ffb5d8`. Il dominio ha restituito `/assets-cb3/index-Bh40htfF.js`. [Deployment](https://dash.cloudflare.com/?to=/6dbe45e3a0714108638841b2593a7168/pages/view/edilizia-in-cloud/3752bd4a-1803-4bc6-ba5d-da8a1f43d632) |
| Calendari autenticati di produzione | 15:24 circa | Da verificare per amministratore, commerciale, responsabile e operaio | Sessione autorizzata indisponibile. |
| Sviluppo locale | 15:25 circa | Avvio Vite su `127.0.0.1:8176` con URL Supabase locale | La rotta Calendario risponde con la shell Vite. Uso di dati sintetici nel collaudo. |

## Fonti e comportamento

- **Calendario appuntamenti** usa `appointments` con calendario commerciale e `marketing_calendars`. I nomi provengono dalle stesse anagrafiche del calendario. La mappa carica una proiezione limitata, mentre «Apri scheda» apre il dialog esistente. Per il luogo si usano l'indirizzo e le coordinate dell'appuntamento. La data, il commerciale e lo stato si conservano nel cambio di vista.
- **Calendario lavori** usa `useWorkCalendarData`, `orders`, `order_work_phases`, risorse e date di assegnazione esistenti. I pin rappresentano cantieri. La vista personale **I miei lavori** limita il dato alle proprie assegnazioni. Il fuso applicativo già usato per questi calendari è `Europe/Rome`.
- Le timbrature sono eventi di `campo_timbrature`, con ora e fonte. Un'entrata storica resta una registrazione. I viaggi di `mezzi_viaggi` partiti nel giorno selezionato contano una volta per ID. Si usano il contachilometri o una dichiarazione con tutte le tratte e tutti i chilometri registrati. Se il contatore copre un viaggio a cavallo della mezzanotte, il totale resta attribuito al giorno di partenza. Non si ripartisce una misurazione fisica senza letture intermedie.
- Una correzione del pin è consentita a chi modifica la scheda, si conserva nei cambi di data e viene invalidata se luogo o coordinate della scheda cambiano. Lo storico registra autore e ora. L'integrazione separa i punti confermati dalle coordinate Google Places legacy. Gli indirizzi vuoti o non risolti restano nell'elenco.
- Il servizio di prossimità legge disponibilità, permessi, impegni, ferie approvate, qualifiche e sedi dalle fonti esistenti. Per operai senza orario o giorni di lavoro impostati la disponibilità resta indeterminata. Per una squadra serve almeno un'origine comune verificabile. Una timbratura recente è utilizzabile a partire dal suo luogo di cantiere, con limite di 90 minuti. La ricerca per data futura usa solo origini pianificate o di sede. Il risultato indica l'ampiezza della rosa effettivamente valutata.
- Percorsi stradali stimati, senza traffico in tempo reale. La sequenza è cronologica. Se gli orari coincidono si usa un ordinamento stabile. Un mezzo associato univocamente al conducente può usare le sue tappe. Per i chilometri aziendali si usa il totale del registro viaggi, senza sommare itinerari stimati di più risorse.
- API e RLS verificano azienda attiva e permessi. La funzione invia ai servizi esterni coordinate o indirizzo strettamente necessario. I calcoli consumano zero crediti AI.

## Giornata, percorso e dati da completare

- **Giornata** offre righe espandibili con gli assegnati e l’ultima timbratura. L’elenco è sotto la mappa sui telefoni. Toccare un pin apre la riga.
- **Percorso** numera le tappe della risorsa selezionata. Distanza, tempo e ritardo stimato compaiono tra le tappe dopo il calcolo. Un cambio di orario invalida le stime coinvolte.
- In **Percorso**, l’ufficio e chi lavora in campo possono scegliere la sede operativa o una sede con coordinate configurata in Personale, per esempio il magazzino. Il commerciale può usare la base compatibile del suo calendario personale o indicare un punto sulla mappa per il giorno e la sessione. La destinazione di rientro può coincidere con quella di partenza, essere un’altra sede o restare vuota per terminare all’ultima tappa. Cambiare partenza o rientro invalida il calcolo precedente.
- I percorsi accettano un aggancio alla rete stradale entro 500 m. In caso di pin fuori copertura o collegamento assente, il recupero prova prima i blocchi più ampi, con un massimo di 12 richieste aggiuntive per calcolo. I pin identificati restano correggibili e le tratte valide mantengono la loro distanza e geometria. [Documentazione OSRM](https://project-osrm.org/docs/v5.24.0/api/#requests)
- Il calcolo del rientro mantiene la durata delle visite e fa assorbire ai margini disponibili i ritardi tra le tappe. Orari o tratte mancanti rendono l’arrivo da verificare. Il filtro per cantiere o stato indica quante visite compongono il giro e offre un ritorno alla vista completa.
- Le timbrature delle singole visite usano la fascia del cantiere e gli assegnatari noti al calendario. Entrate al confine tra due visite contigue appartengono a quella successiva, uscite a quella precedente. La vista Giornata mantiene il riepilogo giornaliero del cantiere.
- Ogni tratta stradale ha numero e colore. Il rientro è tratteggiato e il riepilogo mostra durata, distanza e ora stimata di arrivo se si conosce la fine dell’ultima attività. Le frecce indicano il verso di marcia. Il clic sulla mappa propone una scelta quando passano più tratte nello stesso punto, mentre il clic nella lista evidenzia direttamente la tratta. Le geometrie delle singole tratte arrivano dalla stessa richiesta OSRM, comprese le strade di ritorno quando differiscono dall’andata. [Documentazione OSRM](https://project-osrm.org/docs/v5.24.0/api/#routeleg-object)
- **Timbrature GPS** mostra le posizioni già registrate in Campo o Personale, comprese quelle presso una sede senza commessa collegata. La vista riporta tipo, ora, fonte, precisione ed esito disponibili. La migrazione `20290507115200_mappa_timbrature_gps.sql` applica RLS e i permessi del calendario e di Personale, e unifica le copie collegate tramite ID della timbratura HR. Aprire la sezione legge i dati del giorno da Supabase. Geocodifica e routing restano a zero per questa azione.
- **Chi è più vicino?** mostra l’arrivo stimato, il margine sul prossimo incarico e i motivi di esclusione stradale. «Rivedi assegnazione» apre la bozza dell’appuntamento o il modulo di assegnazione della commessa. Il luogo proposto resta sulla scheda dell’appuntamento, separato dall’anagrafica del contatto. Nel modulo della commessa la fascia valutata rimane visibile come riferimento per la conferma di lavorazioni, giorni e ore.
- **Da sistemare** mostra indirizzi, coordinate e orari mancanti e apre il registro del mezzo sul giorno e sul viaggio da completare. La migrazione `20290507115100_mappa_viaggi_da_completare.sql` limita la lettura agli stessi perimetri aziendali e personali del registro. Le stime di percorso restano distinte dai chilometri documentati.

Il collaudo locale in Chromium a 1440 e 390 px ha verificato l’elenco sotto la mappa, rinumerazione e ricalcolo delle tappe, ritardo di 8 minuti, bozza CRM con fascia e indirizzo, proposta della squadra alla commessa e link al viaggio nelle viste ufficio e operaio. I 146 test mirati includono l’isolamento dei viaggi incompleti, il salvataggio dell’assegnazione dopo conferma e la conservazione dell’indirizzo del contatto CRM. La migrazione è stata applicata due volte su PostgreSQL 17 locale con dati di prova.

Con la ricerca di prossimità, la fascia iniziale segue l’ora italiana. Se la fascia dell’appuntamento è ancora futura viene riutilizzata. Il modulo offre durate rapide da 30, 60 e 120 minuti e verifica gli orari prima di interrogare il servizio. La conferma CRM conserva la durata effettivamente scelta.

Il percorso usa le fasce di prenotazione delle risorse quando disponibili. Accorpa le lavorazioni consecutive che si toccano o si sovrappongono nello stesso cantiere. Se la squadra visita un altro cantiere in mezzo, il ritorno resta una tappa distinta. Sul pin condiviso si possono scegliere entrambe le visite. Il pulsante delle criticità porta alle tratte mancanti o incompatibili. In **Da sistemare** si può lavorare per posizioni, orari o chilometri.

## Apertura, storico e recupero delle tratte

Il motore vettoriale viene preparato all’apertura della mappa. Le richieste dei tile partono dopo il controllo degli accessi e il primo inquadramento. Nel Calendario appuntamenti, i pin possono usare subito l’agenda già letta per lo stesso intervallo e con gli stessi permessi, mentre la richiesta del giorno aggiorna i dati.

La vista **Cantieri conclusi** richiede al database solo l’anno selezionato. La migrazione `20290507115300_mappa_storico_cantieri_per_anno.sql` va applicata prima di attivare l’interfaccia nell’ambiente di rilascio. La lettura usa la chiusura più recente nel fuso italiano, la fine pianificata quando manca la chiusura, e pagine di 250 righe. Data, filtri, zoom e ultimo giro sono conservati nella memoria della sessione. Il giro viene ripristinato quando tappe, coordinate, orari e profilo coincidono.

Fino a due blocchi stradali indipendenti possono essere calcolati contemporaneamente. La vista mostra le tratte via via disponibili e segnala il totale parziale. Cambiare tappa, data o profilo interrompe il calcolo precedente.

Il preset OpenFreeMap predefinito usa uno stile incluso nell’app. Lo sfondo accede direttamente all’indice delle tessere vettoriali e richiede un solo carattere. La mappa continua a leggere la rete stradale del provider, con le vie locali visibili da vicino. Un URL di stile personalizzato viene applicato come configurato.

Per collaudare in locale la persistenza e il filtro annuale usa `MAPPA_BROWSER_SOLO_STORICO=1`. Il caso fuori copertura e i recuperi simultanei si verificano con `MAPPA_BROWSER_SOLO_CORREZIONI=1` e OSRM locale.

## Mezzi nel Calendario lavori

Apri **Pianificazione team → Mappa → Mezzi** per consultare veicoli stradali e macchine di cantiere. Il pin blu indica il riferimento più recente tra assegnazione e arrivo annotato. Il pin ocra indica il cantiere previsto dal Piano mezzi. Se ci sono più destinazioni senza un ordine univoco, le trovi nell’elenco. Una posizione priva di un punto utilizzabile resta leggibile nell’elenco.

I chilometri registrati e quelli stimati si riferiscono al giorno di partenza e sono mostrati per singolo mezzo. Le stime provengono dai viaggi registrati che non hanno già una misura effettiva. Per le macchine da cantiere si mostra il valore del contatore ore, quando presente. Il percorso stradale usa il giro pianificato e viene calcolato su richiesta.

La funzione dati è nella migrazione `20290507115400_mappa_mezzi_calendario.sql`. La vista richiede il permesso Mezzi e applica l’ambito personale o di squadra del calendario. Per provare il flusso usa la [demo mezzi](http://127.0.0.1:8189/azienda/calendario?mappa=giorno&scenario=flotta). Il test browser si esegue con `MAPPA_BROWSER_SOLO_MEZZI=1`.

**Viaggi e tratte → Storico su mappa** nella scheda del mezzo stradale mostra i viaggi inviati e verificati per data di partenza nel fuso italiano. I totali si riferiscono al periodo intero, con il contachilometri prioritario sulle distanze delle tratte. In sua assenza, un viaggio con distanze complete è dichiarato quando tutte le tratte lo sono, oppure stimato quando contiene almeno una stima.

Il database restituisce 20 viaggi per volta. Le tappe con una posizione nota partono come collegamenti indicativi. **Mostra su strada** ricostruisce il viaggio selezionato con il servizio già configurato e lascia intatti i chilometri originali. Le posizioni derivano dalla sede e dai cantieri riconosciuti secondo i permessi. Le tappe prive di coordinate restano nell’elenco.

La funzione è nella migrazione `20290507115500_mezzi_storico_percorsi.sql`. Il caso del [Furgone Alfa](http://127.0.0.1:8191/azienda/mezzi/flotta-furgone?tab=viaggi&vista=mappa&scenario=flotta) si prova con `MAPPA_BROWSER_SOLO_STORICO_MEZZO=1`.

## Carburante e giro materiali

Nella scheda del mezzo, **Viaggi e tratte → Consumo e prezzo carburante** registra il consumo medio in litri per 100 km e il prezzo aziendale netto per gasolio o benzina. **Salva zona e fonte** configura la zona MIMIT aziendale e la priorità del prezzo dalla decorrenza scelta. La zona segue la provincia della sede operativa o legale quando l’azienda lascia la scelta sulla sede. In mancanza di un prezzo aziendale o se il MIMIT ha priorità, la stima usa la rilevazione della data italiana di partenza, al netto dell’IVA ordinaria. Il prezzo pubblico rimane visibile al lordo. Il listino aziendale è la riserva quando manca la rilevazione della data esatta.

La vista **Percorrenze e carburante** si aggiorna quando cambia un viaggio o una tariffa. Per la commessa include le tratte attribuite a quel cantiere, una volta per mezzo, e distingue km verificati, dichiarati e stimati. Il rientro esplicito al punto di partenza viene incluso automaticamente per un giro con un solo cantiere. Nei giri con più cantieri le tratte generali si possono attribuire dal registro. Nel dialog del viaggio, **Aggiungi rientro** apre la tratta di ritorno e il costo si aggiorna appena si inseriscono i km. La stima nel riepilogo usa la somma delle tratte salvate. Le tratte a tariffa onnicomprensiva hanno un totale separato. Nel conto economico la stima serve al controllo operativo, mentre il consuntivo continua a leggere i documenti di spesa.

Nel **Registro viaggi** della commessa, **Ritiri e consegne** mostra ogni DDT sotto tutti gli ODA collegati. Dopo la conferma col fornitore puoi includere gli ordini aperti con un indirizzo di ritiro. Gli ordini dello stesso fornitore formano una sola tappa. Salva il giro con mezzo, autista, orari, cantieri e rientro facoltativo. Da ogni cantiere del giro autorizzato si può riaprire il piano e compilare la stessa bozza nel registro dopo la partenza. Registro, storico e riepilogo delle percorrenze contano ciascun viaggio alla data di partenza italiana, anche se termina dopo mezzanotte. Sul Calendario appuntamenti, **Copia giro** riusa il percorso già visualizzato e include orari, indirizzi e il totale se calcolato.

La migrazione `20290507115900_carburante_mimit_storico.sql` configura il job `carburante-mimit-giornaliero`, che richiama `carburante-mimit-sync` con il segreto cron già usato dalla piattaforma. I tentativi sono alle 09:23, 12:23, 16:23 e 20:23 in ora italiana. Si conserva la data pubblicata dal Ministero e l’importazione ripetuta aggiorna solo valori cambiati. Dopo il rilascio della funzione, verificare che la prima esecuzione aggiorni lo storico e che la ripetizione restituisca zero aggiornamenti con lo stesso CSV. Il collaudo browser si avvia con `MAPPA_BROWSER_SOLO_CARBURANTE=1`.

## Scelta cartografica

### OpenFreeMap e OSRM

Per la cartografia senza canone, imposta `VITE_MAPPA_OPERATIVA_STYLE_URL=https://tiles.openfreemap.org/styles/liberty`. La vista carica lo strato vettoriale MapLibre quando apri la mappa. È possibile configurare al suo posto il template XYZ già supportato. OpenFreeMap consente l’uso commerciale senza chiave e offre il servizio pubblico senza SLA. La sua disponibilità resta indipendente dal routing. [Guida OpenFreeMap](https://openfreemap.org/quick_start/) · [Condizioni](https://openfreemap.org/tos/)

Il profilo auto di OSRM calcola distanze, tempi e geometria completa sulla rete OpenStreetMap. Le stime usano il profilo stradale e i dati importati. La geocodifica di nuovi indirizzi resta un servizio configurabile a parte. Dove esiste già una macchina per OSRM, si evita la tariffazione per percorso. Spazio, capacità di calcolo e aggiornamenti dei dati vanno dimensionati per l’area servita. [OSRM](https://github.com/Project-OSRM/osrm-backend) · [Dati Nord-Ovest](https://download.geofabrik.de/europe/italy/nord-ovest/)

Per la demo di Milano, prepara un estratto OSRM con questi comandi in una cartella dati. Le dipendenze locali sono Osmium e OSRM, disponibili su Homebrew.

```sh
curl -fL -o nord-ovest.osm.pbf https://download.geofabrik.de/europe/italy/nord-ovest/nord-ovest-latest.osm.pbf
osmium extract --strategy=smart --bbox=8.98,45.35,9.35,45.60 --output=milano.osm.pbf nord-ovest.osm.pbf
osrm-extract --profile "$(brew --prefix osrm-backend)/share/osrm/profiles/car.lua" milano.osm.pbf
osrm-partition milano.osrm
osrm-customize milano.osrm
osrm-routed --algorithm mld --ip 127.0.0.1 --port 5017 milano.osrm
```

Dal repository, avvia la demo su una porta libera e apri **Mappa → Percorso → Calcola percorso** nel Calendario appuntamenti.

```sh
MAPPA_DEMO_OSRM_URL=http://127.0.0.1:5017 MAPPA_BROWSER_PORT=8187 node scripts/mappa-operativa/verifica-browser.mjs --serve
```

Il calendario demo usa un’agenda sintetica e tre tappe su strade pubbliche. Le geometrie provengono dall’OSRM locale. Il browser carica lo sfondo OpenFreeMap. La verifica automatica di questa modalità usa le stesse variabili, omettendo `--serve` e aggiungendo `MAPPA_BROWSER_REUSE_SERVER=1` quando la demo è già avviata.

Il parametro `?scenario=partenze` aggiunge una sede operativa, un magazzino e timbrature sintetiche al [Calendario lavori](http://127.0.0.1:8187/azienda/calendario?scenario=partenze) e una sede di partenza al [Calendario appuntamenti](http://127.0.0.1:8187/azienda/marketing/calendario?scenario=partenze). Prima di abilitare la vista GPS con dati reali, verificare con l’azienda chi è autorizzato alla consultazione e per quanto tempo è previsto conservare le coordinate delle timbrature. [Garante, localizzazione per rilevazione delle presenze](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/5497522)

Per provare partenza e rientro in sedi diverse usa il [giro demo](http://127.0.0.1:8189/azienda/calendario?scenario=giro). Apri **Pianificazione team → Mappa → Percorso** e scegli **Magazzino centrale** come rientro.

La [demo del pin fuori copertura](http://127.0.0.1:8189/azienda/marketing/calendario?scenario=copertura) e la [demo del rientro con ritardo](http://127.0.0.1:8189/azienda/marketing/calendario?scenario=ritardo) aprono i casi sintetici nel Calendario appuntamenti. Nel [giro della squadra](http://127.0.0.1:8189/azienda/calendario?scenario=giro) puoi confrontare le timbrature per visita, applicare un filtro cantiere e cliccare dove si sovrappongono le tratte.

Il collaudo delle partenze e delle timbrature ha verificato in Chromium a 1440 e 390 px l’origine inviata a OSRM, l’annullamento della stima al cambio di partenza, il filtro per persona e giorno e la visibilità personale nell’area Campo. La suite da 150 test verifica anche RLS, deduplicazione e confini del giorno italiano. La migrazione GPS è stata applicata due volte allo schema di prova su PostgreSQL 17.


| Opzione | Riscontro |
| --- | --- |
| Integrazione già esistente | Il frontend ha Leaflet. `geo-router` usa HERE e in alcuni flussi legacy il client ripiega su Nominatim e OSRM pubblici. Per la mappa viene riusato Leaflet. Le API pubbliche dimostrative e la cache globale legacy non vengono usate dalla funzionalità nuova. Per riutilizzare dati HERE storici, verificare condizioni e provenienza con il contratto aziendale. [Termini HERE](https://legal.here.com/us-en/terms/here-platform-terms) |
| MapLibre + raster o vettoriale commerciale | MapLibre è un renderer e richiede una sorgente cartografica. Il perimetro qui richiede punti, geometrie e selezione, coperti da Leaflet già installato. Lo strato raster configurabile può essere MapTiler Flex. Con tile raster si misura la fatturazione per richieste, mentre l'app contabilizza separatamente le aperture per azienda. [MapLibre](https://maplibre.org/maplibre-gl-js/docs/) · [MapTiler](https://www.maptiler.com/cloud/pricing/) |
| OSRM o Valhalla dedicati | Implementato client server OSRM con `route` e `table` a destinazione singola. Valhalla è un'alternativa se servono profili veicolo più articolati. Il dataset Italia è disponibile su Geofabrik. Misurare copertura civici e autostrade, ferry e valichi. Per appuntamenti transfrontalieri aggiungere le aree confinanti. [OSRM](https://project-osrm.org/docs/v5.24.0/api/) · [Valhalla](https://valhalla.github.io/valhalla/) · [Dati Italia](https://download.geofabrik.de/europe/italy.html) |
| Nominatim e OpenStreetMap | Il pubblico Nominatim limita la frequenza, vieta l'autocompletamento e chiede di evitare dati personali o confidenziali. I tile pubblici hanno policy di utilizzo e disponibilità limitata. Il servizio nuovo usa endpoint dedicati. [Policy Nominatim](https://operations.osmfoundation.org/policies/nominatim/) · [Policy tile](https://operations.osmfoundation.org/policies/tiles/) |
| Google Maps Platform | Listino ufficiale per progetti nel SEE con SKU della fascia Essentials. Le unità della matrice sono coppie origine/destinazione. Verificare condizioni SEE per contenuti con mappe, attribuzioni e memorizzazione prima di adottare Google come provider. Le stime sono basate sul listino standard e non includono condizioni contrattuali specifiche dell’account. [Listino](https://developers.google.com/maps/billing-and-pricing/pricing) · [Fatturazione Routes](https://developers.google.com/maps/documentation/routes/usage-and-billing) · [Policy Routes](https://developers.google.com/maps/documentation/routes/policies) · [Condizioni SEE](https://developers.google.com/maps/comms/eea/routes) |

Le presenze mostrano eventi già presenti. La funzionalità non raccoglie una posizione continuativa. Il provvedimento del Garante tratta anche l'associazione indiretta tra localizzazione del veicolo e dipendenti. Un eventuale sistema di rilevamento continuativo richiede una valutazione separata. [Garante, localizzazione dei veicoli](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/2444921) · [Provvedimento 10293888](https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/10293888)

## Simulazione mensile

Scenario per un'azienda, 22 giorni operativi. I valori sono al lordo delle richieste riusate.

| Voce | Ipotesi | Unità |
| --- | --- | --- |
| Aperture mappa | 20 operatori × 2 × 22 | 880 |
| Tile raster | 20 richieste per apertura, ipotesi di lavoro | 17.600 |
| Geocodifiche | 5 nuovi indirizzi confermati × 22 | 110 |
| Percorsi | 8 richieste/giorno × 22, un percorso senza segmenti indisponibili per azione | 176 |
| Matrice, andata | 10 ricerche × 5 persone × 22 | 1.100 |
| Matrice, prossimo impegno | 2 destinazioni aggiuntive medie × 10 × 22 | 440 |
| Matrice totale | Andata più successivo appuntamento, senza ampliamenti | 1.540 |
| Confronto andata senza rosa | 10 ricerche × 20 persone × 22 | 4.400 |

- **MapTiler Flex** costa **30 USD al mese**, IVA esclusa, con 500.000 richieste API incluse e 0,15 USD per 1.000 richieste eccedenti. 17.600 richieste rientrano nella franchigia dell'esempio se l'account le ha ancora disponibili. Le aperture contate dall'app non coincidono con le richieste fatturate e il numero di tile dipende da viewport, zoom, pan e cache. [Listino MapTiler](https://www.maptiler.com/cloud/pricing/)
- **OSRM e Nominatim dedicati** hanno costo infrastrutturale, senza prezzo software per richiesta nello scenario self-hosted. Una VM europea CPX42 è un riferimento di **69,49 €/mese** IVA esclusa, IPv4 escluso. Il dimensionamento va collaudato con import Italia, rebuild contemporaneo, disponibilità disco, RAM e latenza. Backup, storage aggiuntivo e operatività sono separati. Come ipotesi interna, 2 ore al mese a 45 €/ora per aggiornamenti e monitoraggio e 10 €/mese di backup portano l’ordine di grandezza a 169,49 €/mese più 30 USD di cartografia. Ore e backup sono assunzioni di budget. [Hetzner, tariffa UE](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) · [Operazioni Nominatim](https://nominatim.org/release-docs/latest/admin/Update/)
- **Google, confronto di listino** con le quote Essentials ancora libere, 880 Dynamic Maps, 110 Geocoding, 176 Compute Routes e 1.540 elementi Compute Route Matrix rientrano ciascuno nel proprio tetto da 10.000. Esauriti i tetti, nel primo scaglione l'incremento lordo del medesimo volume sarebbe **15,29 USD** (6,16 + 0,55 + 0,88 + 7,70), IVA e conversione escluse. I limiti sono aggregati sull'account di fatturazione per SKU. [Listino Google](https://developers.google.com/maps/billing-and-pricing/pricing)

## Preparazione del rilascio

1. Configurare lo stile vettoriale con `VITE_MAPPA_OPERATIVA_STYLE_URL` oppure lo strato raster con `VITE_MAPPA_OPERATIVA_TILE_URL` e un template XYZ con `{z}/{x}/{y}`. Per un provider che richiede una chiave browser, limitarla alle origini effettive dell’app e usare chiavi distinte per prova e produzione. [Chiavi MapTiler](https://docs.maptiler.com/guides/developer/credentials/api-key/)
2. Configurare nel solo runtime Edge `MAPPA_OPERATIVA_OSRM_URL`, `MAPPA_OPERATIVA_GEOCODING_URL` e i token dedicati `MAPPA_OPERATIVA_OSRM_TOKEN` e `MAPPA_OPERATIVA_GEOCODING_TOKEN` se il proxy richiede Bearer. L'opzione furgone richiede anche `MAPPA_OPERATIVA_OSRM_FURGONE_URL` e `VITE_MAPPA_OPERATIVA_FURGONE=true`. Cambiare `MAPPA_OPERATIVA_DATI_VERSIONE` a ogni sostituzione dei dati cartografici o dei profili di viaggio.
3. Calibrare quote per minuto e mese tramite `MAPPA_OPERATIVA_<VOCE>_MINUTO` e `MAPPA_OPERATIVA_<VOCE>_MESE`, con voci `VISUALIZZAZIONI`, `GEOCODIFICHE`, `PERCORSI` ed `ELEMENTI_MATRICE`. Default mensili 15.000, 2.000, 3.000 e 10.000 nell'ordine. `MAPPA_OPERATIVA_CANDIDATI_MAX` imposta il limite di persone valutabili, default 10. I contatori sono consultabili dagli amministratori. Impostare anche soglie del provider.
4. Sottoporre il ramo e la migrazione a verifica del database completo. Dopo autorizzazione separata pubblicare con il normale flusso GitHub, Supabase e Cloudflare. In ambiente di rilascio verificare gli stessi ruoli e il primo consumo con indirizzi sintetici, oltre al comportamento senza provider.

## Collaudo locale riproducibile

- `node scripts/mappa-operativa/verifica-browser.mjs` apre le pagine reali del prodotto con fonti sintetiche, a 1440 × 1000 e 390 × 844. «Calendario» non carica tile. La mappa vendite mostra tre pin e due righe senza pin, apre la scheda, invalida il percorso quando cambia l'ora, salva manualmente il quarto pin e lo conserva dopo la riapertura. Mostra anche la rosa di 5 su 20 e il ripiego in linea d'aria. «Calendario lavori» mostra due squadre, entrata, uscita e operaio assegnato senza timbratura. La vista Campo mostra solo l'ambito personale. Il file `browser.json` contiene le invocazioni osservate.
- `node scripts/mappa-operativa/verifica-browser.mjs --serve` avvia le stesse pagine di prova su [Calendario appuntamenti](http://127.0.0.1:8181/azienda/marketing/calendario), [Calendario lavori](http://127.0.0.1:8181/azienda/calendario) e [I miei lavori](http://127.0.0.1:8181/campo/calendario). Cartografia di prova a griglia e nessun account necessario.
- `node scripts/mappa-operativa/verifica-servizio.mjs` avvia la Edge Function vera e simula il gateway Supabase e i provider in locale, con il database PostgreSQL della fixture. Osservati un'apertura, una sola geocodifica per due richieste concorrenti, due percorsi (prima richiesta e nuova revisione), 5 elementi per la prima ricerca su 20, zero elementi sulla ripetizione in cache e 5 nell'ulteriore ricerca con provider indisponibile. Risultati e circuiti di errore verificati attraverso HTTP.
- `src/test/logic/mappaOperativaDatabase.test.ts` applica la stessa migrazione due volte e prova ruoli differenti, aziende separate, ore, audit, chilometri, idempotenza, qualifiche, vincoli e quota. La migrazione è stata inoltre eseguita in transazione su PostgreSQL 17 nativo con schema sintetico isolato.
- Alle 16:03 CET anche `/azienda/marketing/calendario`, `/azienda/calendario` e `/campo/calendario` rispondevano HTTP 200 in produzione in modalità pubblica. L'accesso autenticato, il collegamento a provider commerciali reali e la ricostruzione dello schema di produzione restano da collaudare nell’ambiente di rilascio.
- Dopo il collaudo locale, Cloudflare stava compilando un rilascio di `main` indipendente (`04e497a9`), mentre il dominio restituiva ancora lo stesso asset della verifica iniziale. Il ramo della Mappa è rimasto locale.
- Suite pertinente del repository completata con 80 test. Lint completo del repository e verifica mirata sui 21 sorgenti toccati, zero regressioni rispetto alla baseline. Controllo Deno della Edge Function completato.
- Build Vite completata. Prerender ripetuto sulla porta libera 8184 dopo un conflitto sulla porta predefinita. 246 rotte renderizzate e 247 pagine controllate, con due avvisi SEO sulle pagine pubbliche e zero errori. Gli avvisi riguardano la shell dell’app (canonical e Open Graph) e la lunghezza del titolo di un articolo del blog.
- Typecheck completo sullo stesso `tsconfig.app.json` con TypeScript 7.0.2 installato fuori dal repository. Controllo concluso senza errori. Il pacchetto TypeScript del worktree è rimasto quello del lockfile.
