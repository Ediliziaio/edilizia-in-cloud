# Preventivi su telefono e tablet — 22 novembre 2026

Quando si compila un preventivo da tablet, la barra delle fasi occupava spazio con numeri e categorie, richiedeva scorrimento laterale e non offriva accesso diretto alle fasi nel fotovoltaico. Il piede FV andava su due righe. Da telefono il PDF vero non era disponibile nel pannello dell'anteprima FV; sui 320 px «Avanti» si stringeva fino a tagliarsi.

## Intervento

- Selettore delle fasi comune, accessibile fino a 1279 px, con nomi completi, stato e blocchi invariati. Usato da FV, Serramenti e dagli otto moduli edili. Area di tocco da 44 px; navigazione corrente evidenziata.
- Piede su una riga da tablet; totale più compatto sui telefoni stretti. Comandi principali da 44 px. Il pulsante flottante Silvio non copre più le azioni dei preventivatori; le aperture contestuali restano disponibili.
- Campi da 16 px e almeno 44 px soltanto negli editor preventivi sotto 1024 px, per leggibilità e per evitare lo zoom automatico di Safari. Non vengono ingranditi il sito o le altre schermate.
- Elenco unificato con ricerca, filtri e righe compatte anche sui tablet in verticale, fino a 1023 px. I configuratori prodotto passano alle due colonne da 1024 px; i pulsanti con etichette lunghe vanno a capo.
- Anteprima mobile più alta, chiusura raggiungibile e area di scorrimento separata. Nel FV si può scegliere anche «PDF vero» senza emettere il preventivo; zoom e adattamento non rigenerano il documento.
- Visore del documento FV a schermo intero su telefono, comandi di zoom e pagina disposti su righe utilizzabili anche a 320 px, rispetto dell'area sicura.
- Hook di misura basato su `useSyncExternalStore`, con soglia configurabile e pulizia degli ascoltatori al cambio di orientamento.

## Collaudo

Anteprima locale IAB con i componenti di produzione, dati sintetici e nessuna chiamata remota: `npx vite --config vite.preventivi-responsive.config.ts`. La fixture è esclusa dall'app di produzione e non contiene chiavi o dati cliente. Dimensioni CSS misurate: 320×710, 390×844 e 820×1180. Verificati cambio fase, blocco delle fasi future, campi, assenza di overflow di pagina, piede, apertura/chiusura e cambio pagina PDF. A 320 px il piede FV conserva tutti i comandi alti 44 px; a 820 px i tre comandi restano sulla stessa riga.

49 test mirati su guscio, anteprima, zoom, selettore e sovrapposizione FAB; 68 regressioni sui wizard degli otto moduli, FV ed elenco; una prova del cambio di orientamento/breakpoint. I controlli globali e la verifica online sono riportati nella PR.

## Verifica FV precedente completata

Solo Demo Azienda 2: FV-2026-0028 resta in bozza. Plenitude è salvata come documento da verificare: 1.963 kWh e 564,95 €/anno letti automaticamente; Enel resta confermata con 2.787 kWh e 1.148,02 €/anno. La lettura è sopravvissuta alla riapertura. I cinque pannelli, il disegno delle quattro falde e il riferimento della mappa coincidono con la bozza d'origine (impronte del JSON identiche).

L'HTML completo della modalità `solo_anteprima` è stato esportato dalla pagina e stampato localmente in PDF A4 (20 pagine), senza emissione, invio o firma. Controllo visivo delle pagine 5 (Google e pannelli), 6 (2D quotato), 7 (3D), verifica dei dati economici nel testo. Nessuna immagine mancante. Le misure da foto restano indicative; la lettura Plenitude non è stata applicata allo scenario economico Enel.

## Limiti

Il collaudo dimensionale usa il browser laterale: non sostituisce una prova della tastiera e dei gesti su iPad/iPhone fisici. Le modifiche non richiedono migrazioni né variazioni dei permessi o dei calcoli. Restano i debiti pregressi registrati dai controlli ratchet: non vengono alzate le soglie.
