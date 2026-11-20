# Collaudo Google Maps e lettura bolletta

Prosegue la PR 195 sul progetto Google `edilizia-in-cloud`, indicato dall’utente.
Il progetto Lead Finder non è stato modificato. Nessuna migrazione aggiuntiva.

## Causa verificata e correzione

Google ha restituito un 403 con questa causa, rilevata nei soli log server e
privata di chiavi e URL: «satellite and hybrid map types are not available for
your account and region». Maps Static API risulta già attiva nel progetto.
L’attivazione di Geocoding non risolverebbe questo rifiuto.

La [documentazione Google per gli account SEE](https://developers.google.com/maps/comms/eea/maps-static?hl=en)
conferma il limite e indica Maps JavaScript API come alternativa ufficiale.
Il configuratore usa quindi l’SDK JavaScript ufficiale, sia per il perimetro delle
falde sia per posa di moduli e ostacoli. Non scarica tile, non ricostruisce mappe
e non salva immagini Google nei progetti o nei PDF.

## 📊 BASELINE vs FINALE

| Metrica | Prima | Dopo |
|---|---|---|
| TypeScript applicazione | 0 errori nel rilascio PR 195 | PR 200: 0 errori e CI main verde; seguito pin/falde in corso |
| Test fotovoltaico | 1.002 passati, 12 esclusi preesistenti | 1.038 passati, 12 esclusi preesistenti |
| Deno endpoint modificati | — | Maps proxy, test integrazione e gestione impostazioni: PASS con lock |
| Lint componenti mappa | — | PASS; 2 errori admin preesistenti e invariati |
| Build applicazione | Verde sul rilascio PR 195 | PASS, build:fast |
| Dipendenze/migrazioni nuove | — | 0 |
| File rimossi | — | 0 |
| Vulnerabilità npm e Lighthouse | Non rimisurati in questa correzione | Nessuna dipendenza cambiata |

Il controllo del parser PDF locale resta fermato dal checksum del bundle PDF.js
cambiato sul CDN. Nessun hash è stato aggiornato per aggirare la verifica. Non si
presenta questo risultato come un test della funzione online.

## 🗑️ RIMOSSO

| Tipo | Path esatto | Motivo |
|---|---|---|
| Immagine statica dal percorso FV | `FvMappaTetto.tsx`, `FotoGoogleMappa.tsx` | Non disponibile per l’account SEE verificato |
| Vecchio test Google | `supabase/functions/test-integration/index.ts` | Leggeva la riga vuota del Vault e richiedeva API non necessarie alla mappa interattiva |

Il proxy conserva gli altri servizi e il ramo statico per i chiamanti esistenti.
Il test admin della mappa dichiara espressamente di verificare la configurazione;
non dichiara un collaudo delle immagini se è stata verificata soltanto la chiave.

## 🔒 SECURITY FIX

| Problema | Severità | Fix |
|---|---|---|
| Chiave server utilizzabile anche da altri servizi | P3 | Slot browser separato; nessun fallback alla chiave server; valori uguali rifiutati dalla configurazione pubblicata |
| Lettura e conservazione della nuova chiave | P3 | Vault esistente, mascheramento admin, salvataggio solo super admin; risposta al configuratore autenticato, privata e senza cache |
| Errori provider con dati riservati | P3 | Classificazione costante nel client, diagnostica redatta nei soli log server |
| Falso successo delle impostazioni | P2 | Gestiti gli errori di lettura/upsert prima della risposta di successo |

La chiave browser va limitata in Google Cloud alla **sola Maps JavaScript API** e
ai referrer `https://app.ediliziaincloud.com/*`,
`https://admin.ediliziaincloud.com/*`,
`https://*.edilizia-in-cloud.pages.dev/*`. Non si pubblica la chiave server
esistente. La chiave dedicata è stata creata con entrambe le restrizioni già applicate,
previa autorizzazione dell’utente. Maps JavaScript è attiva nel progetto corretto.
Il salvataggio nel Vault è verificato tramite confronto hash; la chiave server
precedente è conservata e distinta. Nessun valore delle chiavi è registrato qui.

La CSP aggiunge i soli host SDK/servizi ufficiali necessari, senza nuove wildcard
per script o connessioni. I domini immagini HTTPS erano già consentiti.

## 🐛 BUG CORRETTI

| Problema | File | Causa | Correzione |
|---|---|---|---|
| Satellite sempre vuoto | `googleMapsJsFv.ts`, `MappaGoogleFv.tsx` | Maps Static satellite rifiutato per account/regione | SDK ufficiale con mappa satellite interattiva |
| Scala errata ridimensionando il contenitore | `FvMappaTetto.tsx`, `riferimentoMappaGoogle.ts` | Un SDK misura in pixel CSS, non in un’immagine fissa 640×440 | Dimensioni effettive del viewport in tutte le conversioni |
| Posa non disponibile senza immagine statica | `FotoGoogleMappa.tsx`, `FotoTettoReale.tsx` | Rendering subordinato al data URL Static | SDK sotto overlay trasparente e riferimento metrico senza foto salvata |
| Caricamento indefinito | `googleMapsJsFv.ts`, `MappaGoogleFv.tsx` | Nessun termine esplicito per script e immagini | Timeout, errore italiano, riprova, pianta metrica disponibile |
| Errori Maps non identificabili | `_shared/mapsGoogle.ts` | Corpo/stato Google scartati | Categorie e diagnostica redatta; caso SEE riconosciuto |

## ♿ ACCESSIBILITÀ

Comandi nominati, zoom, ritorno al tetto, modalità spostamento distinta dalla
modifica. Errori e caricamento esposti come stato. La fascia inferiore dell’SDK
rimane visibile e cliccabile per logo, copyright e link Google. La pianta metrica
resta disponibile se manca la connessione alla mappa.

## ✨ UX MIGLIORATA

| Area | Comportamento |
|---|---|
| Tetto | Spostamento e zoom nativi, pin e falde conservati in coordinate geografiche/metri |
| Pannelli | Spostamento mappa, ritorno al tetto, selezione, trascinamento e ostacoli sullo stesso riferimento metrico |
| Impostazioni | Campo dedicato alla chiave browser e verifica esplicita della sola configurazione |
| Bolletta | Mantiene il riepilogo automatico e la conferma unica già rilasciati con PR 195; collaudo online ancora necessario |

## ⚡ PERFORMANCE

Una sola promessa di caricamento SDK e una sola istanza per mappa montata;
spostamento, zoom e resize non ricreano l’istanza. Listener, observer e timeout
vengono rimossi allo smontaggio. Nessuna dipendenza aggiunta.

## ✅ CHECKLIST TEST FINALE

- [x] Chiave mancante, malformata o uguale al server: nessuna esposizione/fallback.
- [x] Script unico, errore/retry, timeout e rimozione listener.
- [x] Dimensioni CSS reali, aggiornamento camera senza ricreazione, timeout immagini e errore autorizzazione persistente.
- [x] Coordinate/metri coerenti a 375, 768 e 1280 pixel con pan e zoom.
- [x] Suite FV completa, inclusi i test loader e isolamento storage: 1.038 PASS, 12 esclusi preesistenti.
- [x] Deno dei tre endpoint: PASS.
- [x] PR 200: TypeScript, build e CI main completati con successo.
- [x] PR 200: smoke locale WebKit e Chromium PASS a 375/768/1280/1920 pixel, riapertura e zero errori console; backend simulato.
- [x] PR 200: satellite Google reale, logo, copyright e link visibili in produzione; zero errori/warning console.
- [ ] Interazioni complete e riapertura online: durante il pan reale è emerso il difetto di camera descritto sotto, da correggere nel seguito.
- [ ] PDF reale: caricamento, precompilazione e riapertura online da completare.
- [ ] Lighthouse e audit npm: non ripetuti.

## 🔴 PROBLEMI NON RISOLTI

| Problema | Motivo | Passo successivo |
|---|---|---|
| Pan nativo della mappa | Un trascinamento di 200 px ha mosso il contorno di soli 50 px | Correzione del ritorno della camera nel seguito pin/falde; poi ripetere online |
| Collaudo PDF online | Chrome richiede accesso agli URL dei file | Permesso chiesto all’utente; nessun aggiramento con cookie/token |
| Collaudo PDF locale | Checksum PDF.js sul CDN divergente dal lock | Nessun aggiornamento cieco del lock; non equivale a un errore del reader online |

La copia sintetica di collaudo è `FV-2026-0016`, Demo Azienda 2. I valori manuali
precedenti sono stati salvati localmente e azzerati soltanto in questa bozza:
non possono mascherare una mancata lettura. Nessun invio, firma o emissione di
offerta fa parte del test.

## Rilascio effettivo PR 200 — 20 novembre 2026

La PR 200 è su main al commit `3710ca7295cc4ba240089d9306dc993630310a52`.
Cloudflare produzione `1e87a591-11a5-4d77-b4b8-b1e76a880644` e workflow main
`44807612476` sono riusciti. I tre endpoint `maps-proxy`, `manage-super-admins`
e `test-integration` sono stati pubblicati su Supabase dal sorgente del merge.
Le verifiche JWT esistenti sono conservate; la configurazione browser richiede
l’utente autenticato (sonda senza autenticazione: 401).

Il controllo del registro migrazioni ha rilevato una versione automatica diversa
da quella del file `20290430146000_siti_google_organico.sql`. Nome e SQL erano
identici, verificati con MD5. È stata riallineata solo quella riga del registro,
con protezioni su hash/versione e timeout: nessun SQL di schema rieseguito e
nessun dato aziendale modificato. Nessuna migrazione nuova per questo intervento.

## Seguito richiesto — pin, falde e trascinamento

La camera nativa emette posizioni durante il gesto. Il precedente effetto React
poteva applicare una posizione già superata e interrompere lo spostamento. Un
regression test ha riprodotto il ritorno da B ad A. I comandi esterni di camera
(zoom/ritorno al tetto) ora hanno un contatore esplicito: gli aggiornamenti nativi
non riscrivono la camera. L’istanza SDK resta la stessa.

Il pin diventa l’origine mobile del disegno: tutte le falde lo seguono in
anteprima e la conferma conserva punti in metri, moduli, ostacoli e quantità.
La resa solare della posizione precedente è invalidata. Cambiare indirizzo
continua invece a richiedere un nuovo tetto.

Si può trascinare l’interno della falda selezionata e correggere gli angoli con
bersagli touch da 44 px. Escape/interruzione del gesto ripristinano il contorno;
lo spostamento del pin si può annullare prima della conferma. Frecce da tastiera
spostano pin e falde (0,1 m; Shift: 1 m). La modalità «Falda rettangolare» crea
un 12×8 m nel punto toccato; misure e rotazione restano personalizzabili.
Il disegno non supera i limiti di 12 falde e 400 m dal pin.

La riconferma di contorni invariati conserva i pannelli già disposti. La modifica
effettiva dei contorni prepara una nuova disposizione, come indicato dal comando.

**VERDETTO: PR 200 rilasciata e satellite verificato; seguito pin/falde in collaudo.
Lettura della bolletta online non ancora dimostrata: il selettore file è bloccato
dall’estensione anche dopo le conferme del permesso. La scheda Demo rimane pronta
per il caricamento manuale del PDF sintetico.**
