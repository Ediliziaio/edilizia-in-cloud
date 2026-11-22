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

## Scelta cartografica

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

1. Predisporre lo strato raster con piano per uso commerciale e chiave browser limitata alle origini effettive dell'app. Esempio di variabile `VITE_MAPPA_OPERATIVA_TILE_URL`: template XYZ fornito dal provider con `{z}/{x}/{y}`. Usare chiavi distinte per prova e produzione. [Chiavi MapTiler](https://docs.maptiler.com/guides/developer/credentials/api-key/)
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
