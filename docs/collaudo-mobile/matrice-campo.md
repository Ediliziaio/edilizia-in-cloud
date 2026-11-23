# Collaudo area operai `/campo` — matrice

23/11/2026, tutto **in locale** (niente commit, push, deploy o `supabase db push`). Tenant: **Demo Azienda 2 S.r.l.**
(`d2000000-…-002`). Utente: `operaio@azienda.srl` = Marco Verdi, dipendente. È capocantiere su un solo cantiere
(`a7486aa6…`), non su ORD-2026-001 usato per lo scenario. Accesso fatto dal founder nel browser integrato.

## Come è stato provato

- **Browser**: pannello browser dell'app Claude (Chromium) con **finestra ridimensionata e emulazione**
  (`resize_window`): 390×844 (user agent Android, tocco emulato), 768×1024, 1280×800. **Nessun telefono vero,
  nessun emulatore iOS/Android.**
- **Server**: vite dev locale su **porta 8081** (la 8080 è dell'altra sessione: un indirizzo diverso tiene separati
  gli accessi). Database di produzione, solo dati finti di Demo 2. I tempi sono del server di sviluppo.
- **Rete lenta e caduta, simulate così**: nella pagina ho sostituito `window.fetch` con un involucro (il client
  Supabase chiama il `fetch` della pagina a ogni richiesta, `src/integrations/supabase/client.ts`). Ogni richiesta
  verso `*.supabase.co` aspetta **2.500 ms**; con «caduta» attiva, dopo l'attesa lancia
  `TypeError("Failed to fetch")`, lo stesso errore di un telefono senza campo. `navigator.onLine` resta `true`: è il
  caso peggiore e il più comune in cantiere, col telefono «connesso» ma senza internet. La ricarica della pagina
  toglie l'involucro, cioè «rete normale».
- **Foto**: un JPEG 1200×900 (220 kB) creato con un canvas nella pagina e passato al campo «Galleria» con
  `DataTransfer`, come farebbe il telefono.
- **Finestre di conferma native** (`window.confirm`): nel pannello si chiudono da sole. Le ho sostituite con una
  funzione che registra il testo e risponde «Annulla» o «OK».
- **Misure**: uno script nella pagina legge la grandezza di ogni testo visibile, i titoli, i pulsanti blu pieni in
  vista, l'altezza dei comandi, lo scorrimento di lato, le parole tecniche e (a richiesta del founder durante il
  collaudo) il rientro dei riquadri principali dal bordo.

Legenda: ✅ ok · ❌ difetto · 🔧 corretto · ↻ riprovato dopo la correzione · 👁 solo aperta e misurata · ⛔ fuori dai
miei file (vedi «Richieste per l'altra sessione») · — non provato.

## Scenario obbligatorio: rapportino 3,5 ore + 1 foto, rete lenta, connessione persa, nuovo tentativo

> Sono **operaio**: apro il rapportino per dire all'ufficio cosa ho fatto oggi e quante ore. So di aver finito quando
> il rapportino è nell'elenco del cantiere, con le mie ore e la foto, e so che l'ufficio l'ha ricevuto.

| Passo | Esito | Misura |
|---|---|---|
| Compilo descrizione, **3,5** ore, 1 foto | ✅ | riepilogo «3h 30 ordinarie · 1 foto allegata» |
| «Indietro» col modulo pieno → Annulla | ✅ | resta nel modulo; testo: «La bozza e le foto restano sul telefono» |
| «Indietro» → OK, poi rientro | ✅ | propone «Riprendi la bozza»: testo, 3,5 ore e foto tornano |
| Rete lenta + caduta, **doppio tocco** su Invia (2 click nello stesso istante) | ✅ | **1 sola voce in coda** (chiave per cantiere+giorno) |
| Avviso all'invio con telefono «connesso» ma senza internet | ❌→🔧↻✅ | prima **nessun avviso**; ora «Rapportino salvato sul telefono. Lo sto inviando all'ufficio.» |
| Pagina del cantiere subito dopo, rete giù | ❌→🔧↻✅ | prima **«Impossibile caricare il lavoro — Connessione lenta: verifica assegnazione non completata»** e nessuna traccia del rapportino; ora c'è la scheda «Rapportino del 22 nov · sul telefono, da inviare · 3h 30 · 1 foto · Parte da solo…» (anche sulla pagina d'errore e su «caricamento lento»). Con dati già in pagina, una rilettura fallita non toglie più la pagina |
| Banner della coda | ❌→🔧↻✅ | prima «Operazioni in attesa di sincronizzazione… · 1 in coda»; ora «Da inviare: restano sul telefono e partono da soli · 1 da inviare» |
| Rete torna (lenta), nessun tocco | ✅ | 1° giro: partito da solo in **25 s**; 2° giro (dopo le correzioni): pagina in **6 s**, rapportino in **22 s** (timer di 30 s della coda). Un solo avviso, che diventa «Rapportino inviato» (stesso id) |
| Database dopo l'invio | ✅ | **1 riga** per giorno (23/11 e 22/11), 3,50 ore, 1 foto, stato `inviato`; 1 caricamento foto, 1 inserimento, nessun doppione |
| Ricarica della pagina | ✅ | i due rapportini restano in elenco con ore e foto |
| Ore nell'elenco | ❌→🔧↻✅ | prima «3.5h lavorate» (punto all'inglese); ora «3h 30 lavorate» |
| Due azioni principali in vista | ❌→🔧↻✅ | «Scrivi il rapportino» e «Aggiungi la tua firma» entrambi blu pieni; ora la firma è a contorno, 44 px |
| «Modifica»: riapro il rapportino del giorno già inviato | ❌→🔧↻✅ | prima avviso + **modulo vuoto scrivibile** (Invia spento): si scriveva per niente. Ora restano l'avviso, la scelta della giornata e «Già inviato»; si passa a «Ieri» e si compila |
| PDF del rapportino | ❌ ⛔ | **«Genera PDF» risponde 403 «Rapportino non disponibile o non autorizzato» all'autore stesso** — vedi richieste, punto 1 |

## Pagine dell'area (telefono 390, poi tablet 768 e desktop 1280 sulle principali)

Scala misurata dopo le correzioni, su tutte: titolo pagina **17**, titoli dei riquadri **15**, minimo **11**, nessuno
scorrimento di lato, riquadri a **12 px** dal bordo. Tablet e desktop: tutte si aprono, niente scorrimento di lato.
Lì i titoli restano grandi (24–30 px): la scala 17/15 vale solo per il telefono, come nel resto dell'app.

| # | Pagina | Ruolo · «apro per… / so di aver finito quando…» | Tel | Tab | Desk | Difetto | Modifica |
|---|---|---|---|---|---|---|---|
| 1 | `/campo` Home | Operaio · vedo cosa devo fare oggi e timbro / la giornata è iniziata | ❌→🔧↻✅ | ✅ | ✅ | titolo 20 px, riquadri 16 | scala campo (riga 30) |
| 2 | `/campo/timbratura` | Operaio · inizio, pausa, fine giornata / l'entrata compare in alto con l'ora | ❌→🔧↻✅ | ✅ | ✅ | **doppio tocco nello stesso istante = 2 entrate** a 1 ms (provato sul database); «0.0 h nella giornata»; storico «7.5h»; riquadri a 28 px; «GPS non disponibile — timbratura senza posizione» | blocco immediato del secondo tocco (`useUnaVolta` + `mutateAsync`); «0h», «7h 30»; margine 12; «Posizione non disponibile: la timbratura vale lo stesso.» A 150 ms il pulsante era già spento: il doppione nasce solo coi tocchi simultanei |
| 3 | `/campo/calendario` | Operaio · dove vado oggi e in settimana / so il cantiere e l'indirizzo | ❌→🔧↻✅ | ✅ | ✅ | titolo 24, «Oggi» 20, **27 testi a 10 px**; km «12.3 km» | scala campo; km all'italiana; etichetta «Area campo» nascosta sul telefono |
| 4 | `/campo/cantieri` | Capocantiere · scheda dei cantieri da seguire / apro quello giusto | ❌→🔧↻✅ | — | — | titolo 20 | scala campo |
| 5 | `/campo/cantieri/:id` | Capocantiere · scheda cantiere / vedo piano e documenti | 👁 | — | — | (Marco non è capo qui: messaggio chiaro) | — |
| 6 | `/campo/lavoro/:id` (Info, Rapportini) | Operaio · i miei rapportini del cantiere / vedo stato, ore, foto | ❌→🔧↻✅ | ✅ | ✅ | vedi scenario; schede rientrate a 24 px; «Rileggi il ruolo» | margine 12; «Non riesco a caricare i rapportini: la rete è lenta o assente. Riprova» |
| 7 | `…/rapportino` | Operaio · vedi scenario | ❌→🔧↻✅ | ✅ | ✅ | titolo 18, «Cosa hai fatto oggi?» 16, «Foto cantiere» 14 | 17/15/15 |
| 8 | `…/rapporto-fine-lavori` | Capocantiere · collaudo firmato dal cliente / firma raccolta e inviata | 👁 | — | — | — | — |
| 9 | `…/verbale` | Capocantiere · verbale di collaudo / verbale firmato | ❌→🔧↻✅ | — | — | **pagina bianca** sotto «Collaudo»: nessun caricamento, errore o vuoto. Sotto c'era un 403 nascosto (corretto: non è capo qui) | caricamento, errore («Il collaudo di questo cantiere lo fa il capocantiere…») e vuoto |
| 10 | `…/foto` | Operaio · foto del cantiere / la foto è nell'elenco | ❌→🔧↻✅ | — | — | riquadri a 24 px | margine 12 |
| 11 | `…/rapportino-vocale` | → apre il rapportino («Compila parlando» è dentro) | ✅ | — | — | — | — |
| 12 | `/campo/rapportino-vocale` | Operaio · scelgo il cantiere e detto / il modulo si riempie | 👁 | — | — | — (vocale verificato fino in fondo il 09/08, non riprovato: costa credito AI) | — |
| 13 | `/campo/sicurezza` | Operaio · checklist prima di iniziare / checklist inviata | ❌→🔧↻✅ | — | ✅ | riquadri a 28 px | margine 12 |
| 14 | `/campo/squadra/:id` | Capocantiere · chi c'è oggi / so chi manca e chi non ha mandato il rapportino | ❌→🔧↻✅ | — | — | «**0 in cantiere su 0** · 0 rapportini» sopra «Non riesco a leggere la squadra»: l'errore del database (oggetto, non `Error`) non veniva riconosciuto e il motivo vero («solo il capocantiere…») non usciva mai | messaggio giusto; niente «0 su 0» con errore |
| 15 | `/campo/presenze` | Operaio · i miei giorni e le mie ore / so le ore del mese | 👁 | — | — | mostra 0 giorni/0 h con 7 h di rapportini: conta le timbrature (scelta voluta, segnalata) | sottotitolo semplice |
| 16 | `/campo/ferie` | Operaio · chiedo ferie / la richiesta è «In attesa» | 👁 | — | — | — | sottotitolo semplice |
| 17 | `/campo/cedolini` | Operaio · la busta paga / la apro | ❌→🔧 | — | — | importi «1234.50», ore «7.5h» (codice) | euro e ore all'italiana |
| 18 | `/campo/magazzino` | Operaio · scorte del furgone / so cosa riordinare | ✅ | ✅ | — | — | — |
| 19 | `/campo/ddt` | Operaio · fotografo la bolla / bolla inviata | ❌→🔧↻✅ | — | — | titoli riquadri 14 e 16 | 15 |
| 20 | `/campo/invii` | Operaio · cosa è partito dal telefono / tutto inviato | ❌→🔧↻✅ | — | — | titolo 14 | 15 |
| 21 | `/campo/merce` | Operaio · merce presa in negozio / foto inviata | ❌→🔧↻✅ | — | ✅ | titoli 14; riquadri a 24 px | 15; margine 12 |
| 22 | `/campo/merce/arrivo/:oda` | Operaio · spunto l'arrivo / righe confermate | 👁 | — | — | «Non riesco ad aprire questo ordine» (ordine di un altro cantiere) | — |
| 23 | `/campo/mezzi`, `…/scansione/:codice` | Operaio · prendo o lascio un attrezzo / risulta a me | ✅ | — | — | — | — |
| 24 | `/campo/chat` | Operaio · scrivo all'ufficio / messaggio inviato | ❌ ⛔ | — | — | più di 4 s ad aprirsi; canali col nome tecnico «cantiere-ord-2026-001»; «Nessun messaggio» accanto a 1 e 3 non letti | file condiviso, punto 4 |
| 25 | `/campo/documenti`, `/campo/sub/documenti` | Operaio · i miei documenti / li apro | ✅ | — | — | — | — |
| 26 | `/campo/tesserino` | Operaio · mostro il tesserino al controllo / si vede nome, ditta, matricola | ❌→🔧↻✅ | — | ✅ | «ID: 1dbe6ceb-6b04-4d…» (codice dell'account) a schermo e nell'immagine; margine 28 | tolto; margine 12 |
| 27 | `/campo/ticket/nuovo(/:id)` | Operaio · segnalo un problema / segnalazione inviata | ✅ | — | — | — | — |
| 28 | `/campo/avanzamento` (+ `/sal` → qui) | Capocantiere · spunto le fasi finite / la fase risulta fatta | ❌→🔧↻✅ | ✅ | — | testi da ufficio («operazioni consentite al tuo ruolo», «non è un SAL economico…»); margine 24 | «I tuoi cantieri: spunta le fasi finite e aggiungi le foto.» · «Serve all'ufficio per sapere a che punto siete. Non conta per i pagamenti.»; margine 12. Caselle 16 px ma riga intera toccabile a 44 px ✅ |
| 29 | `/campo/profilo` | Operaio · i miei dati / li controllo | ❌→🔧↻✅ | — | — | margine 28 | 12 |
| 30 | `/campo/impostazioni` | Operaio · notifiche e profilo / salvate | ❌ ⛔ | — | — | «Cambia foto» blu pieno alto 24 px + «Salva modifiche» blu pieno | file condiviso, punto 5 |
| 31 | `/campo/attivita` | Operaio · cosa devo fare / attività chiusa | ❌→🔧↻✅ | — | — | etichetta «Task operative» (inglese) | «Attività di lavoro», nascosta sul telefono; «Cosa devi fare, entro quando e in quale cantiere.» |
| 32 | `/campo/sopralluoghi`, `/:id` | Tecnico/operaio · misure e foto / consegnato | ❌→🔧↻✅ | — | — | titolo scheda 16 | 15 |
| 33 | `/campo/menu` | Operaio · trovo le voci occasionali / apro quella giusta | ✅ | ✅ | — | — | — |
| 34 | `/campo/qualunque-cosa` | → torna alla Home | ✅ | — | — | — | — |
| 35 | **Tutta l'area** | scala testi del telefono | ❌→🔧↻✅ | invariato | invariato | le regole 17/15/11 di `index.css` valgono in `#main-content`, ma il `<main>` di `CampoLayout` non ha quell'id: l'area campo ne restava fuori | `src/components/campo/scalaTelefonoCampo.css`, agganciato alla campanella (presente in ogni pagina campo, sorella del `<main>`). Da cancellare se il `<main>` del campo prende `id="main-content"` (punto 3) |
| 36 | Rapportino | finestre di conferma | 👁 | — | — | «Vuoi uscire…?» è un `window.confirm` nativo, non una pagina come le altre finestre | non toccato (segnalato) |

## Test

- Nuovi: `campoRapportiniInCoda` (4), `campoUnaVolta` (3), `campoNumeriItaliani` (3), 2 in `rapportinoCardCampo`
  (ore «3.50» → «3h 30», firma secondaria), 1 riga in `campoRapportinoRegole` (modulo già inviato non scrivibile).
- Aggiornati: `campoTimbraturaContext` → «7h 30», `mutateAsync` nella simulazione. **5 prove erano già rosse prima
  di me** (verificato rimettendo per un attimo le versioni originali dei file): cercavano la tendina «Da dove
  parti?» per nome, ma `UniformSelect` (18/11) ora disegna un pulsante e tiene la tendina vera nascosta
  (`<id>--native`). Test aggiornato: 25/25 verdi. `campoRapportiSeparati`: nuovo testo dell'errore.
- **Esito finale: 66 file di test dell'area campo, 1.940 test, tutti verdi.** Controllo dei tipi sui 33 file
  toccati (tsconfig temporaneo, poi cancellato): **0 errori**.

## Richieste per l'altra sessione / file condivisi (non toccati)

1. ~~**PDF dei rapportini rotto per tutti gli operai (server)**~~ → corretto nel secondo giro, vedi sotto. — `supabase/functions/genera-pdf-rapportino/index.ts:33`
   controlla l'accesso con `caller.from("campo_rapportini").select("id")`. Dal 12/11 (migrazione
   `20290314000002_protezione_economia_collaboratori_ufficio`) la regola restrittiva `office_financial_select`
   nasconde la tabella grezza a chi non ha diritti d'ufficio: provato con l'utente di Marco, **tabella 0 righe,
   vista `campo_rapportini_visibili` 1 riga**. Risposta della funzione: 403. In Demo 2, 14 rapportini su 24 degli
   ultimi 30 giorni non hanno PDF. Correzione di una riga: leggere da `campo_rapportini_visibili`. Da verificare
   anche gli strumenti WhatsApp (`whatsapp-ai-processor/tools/...`) se usano il token dell'utente.
2. `src/App.tsx:394` — avviso globale «Aggiornamento dati non riuscito. Riprova.» che compare sopra le schermate
   campo con la rete debole, mentre la coda sta già lavorando: sul campo crea allarme inutile.
3. `src/components/layouts/CampoLayout.tsx:344` — dare al `<main>` `id="main-content"`: l'area campo entrerebbe
   nelle regole di scala di `index.css` e nel ritorno alla posizione di `ScrollToTop`. Attenzione alla regola chat
   di `index.css:907`. Fatto questo, si cancella `scalaTelefonoCampo.css` (e l'import in `CampanellaCampo`).
4. Chat (`pages/azienda/InternalChat`, usata dal campo): nomi tecnici dei canali, «Nessun messaggio» con contatore
   non letti, più di 4 s ad aprirsi.
5. `pages/azienda/impostazioni/MioProfilo` (usata da `/campo/impostazioni`): «Cambia foto» pieno e alto 24 px
   accanto a «Salva modifiche».

## Secondo giro (23/11, richiesta del founder: «correggi le cose da sistemare, controlla bene i testi, flusso più semplice»)

**Cose da sistemare chiuse:**
1. **PDF rapportini (403 agli operai)** — `genera-pdf-rapportino/index.ts`: il controllo d'accesso legge
   `campo_rapportini_visibili`. Test `campoPdfAccessoVista`. **Va online solo col push** (job CI delle funzioni).
   Gli strumenti WhatsApp lavorano con la chiave di servizio: non hanno il problema.
2. **Avviso rosso «Aggiornamento dati non riuscito»** con la rete persa — `App.tsx:394`: non parte più per gli
   errori di rete (dati a schermo, banner di rete già acceso, code del campo che riprovano). Gli errori veri restano.
   Vale per tutta l'app.
3. **Chat** (`InternalChat`): «cantiere-ord-2026-001» si legge «Cantiere ORD-2026-001»
   (`lib/chat/nomeCanale.ts`, test); con non letti si scrive «Nuovi messaggi», non «Nessun messaggio».
4. `CampoLayout` senza `id="main-content"`: **lasciato così di proposito**. Con l'id scatterebbe la regola chat di
   `index.css:907`, che azzera lo spazio in fondo: la barra di scrittura finirebbe sotto la barra del campo. La scala
   la fa `scalaTelefonoCampo.css`.
5. «Cambia foto» in Impostazioni: falso allarme della misura (è il cerchietto sull'avatar, tocco già allargato a 44
   px).

**Testi, giro completo a 390 px su tutte le route, regole in `scalaTelefonoCampo.css` (solo telefono, solo campo):**

| Prima (misurato) | Dopo |
|---|---|
| testo senza classe a 16 px (eredità del browser): nomi fase, «Prossimo impegno», «Nessuna attività» | 14 |
| `text-base` non titolo a 16 (nome cantiere in Home) | 15 se in grassetto (titolo riquadro), altrimenti 14 |
| pulsanti, scelte e tendine a 16 (Merce, Bolle, Segnala, «Oggi ▾», cantieri del vocale) | 14 |
| pulsante principale a tutta larghezza (Fine giornata, Conferma checklist, Invia la bolla, Invia all'ufficio) | 15 |
| numeri e testi grandi: «0h» 36, contatori di Presenze/Ferie/Cedolini/Attività 24, profilo 30, calendario 18 | 17 |
| campi in cui si scrive | 16 fissi (Safari su iPhone ingrandisce la pagina sotto i 16) |

Esito del secondo giro: in tutte le pagine fuori scala restano solo, voluti, il pulsante principale a 15, i numeri
del calendario a 17 e le schede-scelta di Merce col titolo a 15.

**Flusso più semplice:**
- **Rapportino** (operaio con capo): un titolo solo («Cosa hai fatto oggi?», la «Descrizione dei lavori» resta per i
  lettori di schermo) con «Compila parlando» sulla stessa riga; un microfono solo (via «Detta il testo» quando c'è
  «Compila parlando»); il **trasporto al cantiere** spostato in «Altro da segnalare» (resta in vista solo se si
  corregge un rapportino che lo aveva); il «+» delle ore a contorno. A 390 px stanno in una schermata giornata,
  descrizione, ore e foto, con un solo pulsante pieno: «Invia rapportino».
- **Timbratura in pausa**: il pulsante pieno è «FINE PAUSA» (prima era «FINE GIORNATA» rosso pieno, a un tocco dal
  chiudere la giornata per sbaglio); «Fine giornata» a contorno sotto. Testi: «Cerco la posizione…»,
  «Posizione trovata (±N m)».
- **Home, scheda «Oggi»**: da 7 pulsanti in 3 righe a 2 grandi (Rapportino, Portami lì, a contorno) + 3 piccoli
  (Foto, Bolla, Segnala; Prelievo per chi può); il nome/indirizzo apre il cantiere (via «Apri il cantiere»); niente
  nome ripetuto sotto la tendina; niente data ripetuta sotto «Oggi»; «Chiama» e «Chi c'è oggi» a 44 px.

**Verifiche:** 90 file di test (area campo, chat, trasporti, dettatura), **2.048 test verdi**. Tipi dei file toccati
in questo giro: 0 errori miei (restano un errore già presente in `lib/silvio/replyDelivery.ts`, non toccato, e
`node:fs` nei test, che il tsconfig temporaneo non conosce, come per gli altri test che leggono i sorgenti).
`App.tsx` non passato al controllo tipi (trascina tutta l'app, sul Mac da 8 GB non finisce): modifica di una
condizione con una funzione già importata.

**Aggiornamento (dopo il secondo giro):** l'altra sessione ha dato al `<main>` di `CampoLayout` `id="main-content"`.
Verificato a 390: la chat del campo funziona lo stesso. La conversazione si apre a tutto schermo con la barra di
scrittura visibile; `InternalChat` nel campo non mette `.chat-mobile-conv-open`, quindi `index.css:907` non scatta.
Da `scalaTelefonoCampo.css` ho tolto le regole doppie (titoli e minimo 11, ora da `index.css`) e ho tenuto quelle solo
del campo. Misurato: h1 17, h2 15, grandezze 11–17 su Home, Calendario, Timbratura, Presenze, Bolle. In chat:
«1 partecipanti» → «1 partecipante». L'errore in console «postgres_changes… finanza-live» (`useFinancialLive`)
compare solo durante il ricaricamento a caldo del server di sviluppo e non si ripete dopo una ricarica pulita.
Server 8081 spento a fine lavoro.

## Terzo giro (23/11): dati di prova cancellati, «cosa manca» corretto

- **Dati di prova cancellati** (su richiesta del founder): 2 rapportini «COLLAUDO» e 3 timbrature di Marco del 23/11.
  Le 3 copie nel registro del Personale le ha tolte il trigger `propaga_correzione_campo_timbratura`. Verificato:
  0 righe rimaste, nessuna riga collegata in mezzi, buoni pasto, rimborsi km, rendiconti o notifiche.
  **Restano 2 foto** nello spazio file `campo-rapportini`: il database vieta di cancellarle direttamente, e
  l'operaio non ha il permesso di cancellare i propri file. Serve la chiave di servizio dal portachiavi.
- **Magazzino da telefono**: in Demo 2 era spento per tutti (`private.campo_magazzino_livello` = «nessuno»: nessun
  `staff_permissions.magazzino_campo`, nessun permesso magazzino, nessun magazzino assegnato), con 2 magazzini e 52
  articoli disponibili. Attivato «prelievi» per il capocantiere `operaio2@azienda.srl`. Il default per l'azienda
  NON l'ho cambiato (regola «ogni azienda sceglie il suo flusso, di partenza come oggi»): si attiva da Utenti → Permessi.
- **Presenze con le ore dei rapportini** — `lib/campo/presenzeDaRapportini.ts` (test, 4 casi): nei giorni senza
  timbrature con ore valgono le ore dei rapportini inviati/approvati, sommate per cantiere, con «dal rapportino (non
  hai timbrato)» nel dettaglio del giorno. Bozze, respinti e annullati non contano; le ferie approvate non vengono
  coperte. Ore totali «0h»/«7h 30» invece di «0 h».
- **«Chiedi una correzione»** per il rapportino già inviato: nel modulo bloccato e sulla scheda del rapportino nel
  cantiere. Apre la segnalazione all'ufficio sul cantiere con «Correzione del rapportino del gg/mm/aaaa: » già
  scritto (`lib/campo/chiediCorrezione.ts`; `CampoTicketNuovo` legge `?testo=`). Test sulla scheda e sul link.
- **Senza rete**: correzione della mia analisi. «Oggi» (indirizzo, fasi, contatti, Portami lì), cantieri, sedi e
  timbrature sono già tra i dati salvati sul telefono (`queryPersister`: `campo-mia-giornata`, `campo-assignments`,
  `campo-time-day`…). Manca solo la scheda completa del cantiere (`campo-lavoro`), non necessaria per arrivare e
  lavorare.
- **QR del tesserino**: «Scansiona per verifica» → «Codice personale». Nessuna pagina verifica il codice (il QR
  contiene un testo con nome, azienda e codice interno). La verifica vera è una funzione nuova con pagina pubblica:
  da decidere.
- **Chat lenta**: misurata nel quarto giro, 0,5 s. Non è un difetto.

Test: 71 file, 1.953 test; i 2 rossi dopo la modifica (`Link` non presente nelle simulazioni del router) sono
corretti usando `navigate`: 73/73 sui due file. Tipi dei file toccati: 0 errori.

## Quarto giro (23/11): capocantiere `operaio2@azienda.srl` su ORD-DEM-RIS01, telefono 390

> Sono **capocantiere**: apro il rapportino di squadra per segnare chi c'era, le ore di ciascuno, fasi e materiali;
> so di aver finito quando il riepilogo mostra le presenze giuste e l'invio parte. Apro «Squadra di oggi» per vedere
> chi manca; il magazzino per prelevare materiale per il cantiere; il collaudo per farlo firmare al cliente.

| Pagina | Esito | Difetto | Modifica |
|---|---|---|---|
| Home capo | ✅ | — (0,5 s; una sola azione piena «Inizia la giornata»; «Cantieri assegnati» con «Squadra di oggi») | — |
| Rapportino di squadra, passo 1 | ❌→🔧↻✅ | sotto l'etichetta «DITTA» comparivano anche le persone (gruppo vuoto disegnato senza titolo) | prima «PERSONE» (con «tu»), poi «DITTE». Verificato: Marco Operaio (tu), Marco Verdi · 5 ditte. «Stesse ore per tutti: 8 h» ok; selezionate le persone il campo delle ore personali sparisce (niente doppia via, dubbio iniziale infondato) |
| Rapportino di squadra, passo 2 | ❌→🔧↻✅ | riquadri chiusi alti 70 px con vuoto sotto il titolo (`min-h-11` sul titolo); riga «Ore personali ordinarie · Vedi presenze squadra» doppione, attaccata | titoli centrati, riquadri da 50 px (anche «Dal magazzino al cantiere», «Articoli da verificare», «Straordinario» e «Hai dimenticato di timbrare?»); riga nascosta con le presenze, altrimenti «Le tue ore ordinarie» all'italiana. **Non inviato**: niente nuovi dati di prova |
| Squadra di oggi | ❌→🔧↻✅ | «3 · Ore da verificare» (sono 3 persone); «0/0 · Mezzi segnati» senza mezzi | «Persone con ore da verificare»; riquadro mezzi solo se ci sono mezzi, «1 di 2» |
| Magazzino · Inventario | ❌→🔧↻✅ | cantiere del prelievo senza etichetta, 2 righe in grassetto. Numeri senza unità («7 · Disponibili»): **dati della vetrina** senza `unita_misura`, il codice la mostra quando c'è | «Prelevi per il cantiere», una riga a 14 |
| Magazzino · prelievo | ❌→🔧 | Aggiungi → quantità nella riga → «Rivedi · 1 materiale» → riepilogo a pagina intera «Il magazzino conferma prima dello scarico», un solo pulsante pieno «Invia richiesta» ✅. Tolto l'ultimo materiale il riepilogo restava aperto su «Nessun materiale selezionato» | si chiude da solo. **Non inviato** |
| Magazzino · I miei prelievi, Furgone | ❌→🔧 | «Nessun prelievo registrato.» / «Nessuna scorta assegnata.» senza dire a cosa servono | titolo + una riga di spiegazione |
| Collaudo col cliente (verbale) | ❌→🔧 ⛔ | **il capocantiere riceve 403 «Commessa non disponibile o non autorizzata»** sulla propria commessa: `collaudo-commessa` legge `orders` col token dell'utente, nascosta dalle regole restrittive (tabella 0 righe, `orders_visibili` 1) | legge `orders_visibili` (test `campoCollaudoAccessoVista`). **Online solo col push.** `verbale_capo_assegnato` = sì; `verbale_capo_autorizzato` = no (nessun modello di collaudo per l'azienda): dopo il push vedrà la scheda vuota col testo corretto |
| Chat | ✅ | 0,5 s ad aprire l'elenco (6 canali). Le «più di 4 s» del primo giro erano il primo caricamento del server di sviluppo | — |

Altre funzioni del server con lo stesso schema (token utente + tabella protetta): controllate le 15 che creano un client
col token dell'utente; tutte le altre leggono quelle tabelle con la chiave di servizio. Restano corrette solo
`genera-pdf-rapportino` e `collaudo-commessa`.

Test: 73 file, 1.960 verdi (aggiornati `campoSquadraAzioni` e `campoRapportinoMaterials` ai nuovi testi). Tipi: 0 errori.

## Unità di misura in Demo 2 (23/11, richiesta del founder)

Solo Demo 2, solo righe senza unità, commesse non cestinate. Con `lock_timeout` 3 s.
- **Magazzino** (`warehouse_stock`): 120 articoli su 121 senza unità (l'unico presente era «mq»). L'unità è ricavata
  dal nome: sacchi 18, barre 11, rotoli 9, kit 5, lastre/bobine/conf./scatole/secchi 4, ml 2, box/bombole/set/
  cartucce 1, pz 51. A telefono ora si legge «13 sacchi», «38 ml», «8 barre», «62 bobine» invece di «13 · Disponibili».
- **Materiali delle commesse** (`order_items`, natura «materiale»): 1.028 righe su 1.208 senza unità. Il codice in quel
  caso scriveva «pz», quindi «Cementi, malte e rasanti · 1» si leggeva «1 pz». Righe riassuntive con quantità 1 →
  «a corpo» (911, mostrate come «a corpo» da `quantitaLeggibile`); le altre dal nome: pz 59, mq 19, ore 9
  (manodopera registrata come materiale), kit 7, ml 6, sacchi 6, secchi 3, latte 2, mc/rotoli/moduli/coppie/lastre/
  conf. 1. Verificato a telefono su ORD-DEM-RIS01: «90 ml», «15 latte», «95 mq», «60 sacchi», «7 pz».
- Scorte del furgone: avevano già tutte l'unità.
- Titolo dei materiali del cantiere: «(9)· 1 arrivati» → «(9) · 1 arrivato».

## Quinto giro (23/11): miglioramenti, sempre da capocantiere a 390

| Cosa | Prima | Dopo |
|---|---|---|
| Conferme del rapportino (uscita, cambio giornata) e del verbale | finestrella nativa del browser (`window.confirm`), diversa dal resto dell'app, e chiusa da sola nel pannello | finestra dell'app (`useConfirm`): «Uscire dal rapportino? · Resta / Esci», «Cambiare giornata? · Resta / Cambia giornata», «Uscire senza salvare? · Resta / Esci senza salvare» (rossa). Provati entrambi i pulsanti. Senza provider ricade sulla nativa |
| Scheda cantiere, scheda Fasi | **nessun ritardo visibile**: su ORD-DEM-RIS01 6 fasi su 10 scadute (giugno–agosto), solo il Cronoprogramma lo diceva | in cima «4 di 10 concluse · 6 in ritardo»; fase scaduta con bordo rosso e «In ritardo · doveva finire l'8 giu 2026»; filtro «In ritardo». `faseInRitardo` + `conArticolo` (l'8, l'11), test `campoFasiRitardo` |
| Avanzamento lavori (dove il capo spunta) | nessuna scadenza, la data di fine non veniva letta | legge `end_date`; «In ritardo · doveva finire …» sulle 6 fasi |
| Titolo della scheda cantiere | 3 righe a 17 px (la descrizione contiene già l'indirizzo, ripetuto sotto) | massimo 2 righe sul telefono, testo intero al passaggio |

Verifiche: 76 file di test, 1.979 verdi; tipi dei file toccati, 0 errori.

## Sesto giro (23/11): ritardi ovunque e pagina del lavoro più snella

| Cosa | Prima | Dopo |
|---|---|---|
| Pagina del lavoro, riga delle date | «Dal 2 giu · fine prevista 16 ago 2026» su un cantiere al 45% | «… · **in ritardo di 99 giorni**» in rosso (commessa non chiusa) |
| Home, «Cantieri assegnati» | solo «45%» | «45% · in ritardo di 99 giorni»; «Squadra di oggi» da 36 a 44 px |
| Pagina del lavoro, «Fase attuale» | nessuna scadenza | «In ritardo · doveva finire l'8 giu 2026» |
| Riquadro «Il tuo ruolo» | mezzo schermo in apertura: spiegazione, 3 pulsanti a tutta riga, nota | ruolo su una riga, «Fasi · Rapportini · Squadra» su una riga (nomi completi per i lettori di schermo), spiegazione in «Cosa fa il tuo ruolo». «Con chi lavori» ora è nella prima schermata |
| Lettura delle fasi | due copie della stessa lettura con la stessa chiave di cache (rapportino e pagina del lavoro) | una sola, `lib/campo/fasiCommessa.ts`, con `end_date` |

Funzioni condivise: `giorniRitardoCantiere` / `testoRitardoCantiere` (`lib/campo/ritardoCantiere.ts`, test),
`faseInRitardo` / `testoRitardo` / `conArticolo` (`PianoSchedaCantiere`). Test dell’area campo: 72 file, 1.944 verdi; tipi 0 errori.

## Settimo giro (23/11): calendario, notifiche, documenti (capocantiere, 390)

| Cosa | Prima | Dopo |
|---|---|---|
| Calendario, cantiere oltre la fine | **«Giorno 175 di 76»** | «In ritardo di 99 giorni» in rosso; prima dell'inizio «Inizia tra N giorni» |
| Calendario, testata | titolo dentro un riquadro + 4 contatori (Oggi, Settimana, Cantieri, «Appunt.») che ripetevano la barra dei giorni e l'agenda | sul telefono solo il titolo «I miei lavori»; tablet/desktop invariati |
| Calendario, etichette | «VISTA CALENDARIO», «AGENDA GIORNO» sopra mese e giorno; pillola «0 appuntamenti» | nascoste sul telefono; pillole solo se il numero è > 0 |
| Calendario, «Prossimo impegno» | ripeteva il cantiere di oggi già primo nell'agenda sotto | nascosto quando è oggi e si guarda oggi |
| Notifiche vuote | «Nessuna notifica» | + «Qui arrivano i cantieri assegnati, l'esito dei tuoi rapportini e i messaggi dell'ufficio.» |
| Scheda cantiere → Documenti vuota | «Nessun documento operativo disponibile.» | «Nessun documento per questo cantiere» + cosa ci si trova (disegni, piani di sicurezza, schede tecniche) |

Effetto misurato: il cantiere di oggi nel calendario è nella prima schermata a 390 (prima sotto i contatori e il prossimo
impegno). Test area campo 72 file, 1.944 verdi; tipi 0 errori.

## Ottavo giro (23/11): moduli usati davvero (capocantiere, 390)

| Pagina | Prima | Dopo |
|---|---|---|
| Ferie e permessi | col modulo aperto due pulsanti pieni («Nuova» in alto e «Invia richiesta»); tre contatori tutti a 0; titolo «Ferie e Permessi» | «Nuova» sparisce a modulo aperto; contatori solo se c'è almeno una richiesta; «Ferie e permessi» |
| Segnala un problema (dal cantiere) | non diceva per quale cantiere | sotto il titolo «ORD-DEM-RIS01 · …»; da «Chiedi una correzione» il testo arriva già scritto (verificato) |
| Bolle e DDT | ✅ (dove va la merce → foto → un solo invio, attivo solo con la foto) | — |

## Nono giro (23/11): scadenze personali in Home e analisi «cosa manca»

- **Avviso scadenze personali in Home** (`AvvisoScadenzePersonali`, `lib/campo/scadenzePersonali.ts`): visita medica,
  corsi, patentini scaduti o in scadenza, solo se ci sono, rosso se qualcosa è scaduto, tocco → Documenti. Stessa
  regola dell'ufficio e del cron (`calcStato`, soglia `alert_giorni_prima`). Test logico + test UI (avviso e assenza).
  In Demo 2 né operaio2 né Marco Verdi hanno documenti personali: nel browser l'avviso non compare (Home verificata
  senza errori).
- **Correzione dell'analisi precedente**: i rimborsi delle spese l'operaio li vede già («Merce presa»: in verifica,
  rimborso in programma, rimborsata); le scadenze personali esistevano già in Documenti.

**Cosa manca ancora** (verificato nel codice dell'area campo, non fatto: sono funzioni nuove da decidere):
1. **Lingua**: tutto solo in italiano, nessuna traduzione nell'area campo.
2. **Presa visione dei documenti di sicurezza** (POS, procedure) per i dipendenti: c'è solo per le ditte subappaltatrici
   (`PosDellaDitta`).
3. **Infortunio o quasi-incidente**: nessun flusso dedicato, solo la segnalazione generica.
4. **Buoni pasto**: calcolati dai rapportini (`hr_buoni_pasto`), l'operaio non li vede.
5. **Verifica del tesserino**: il QR non ha una pagina che lo verifichi.
6. **Giro da subappaltatore**: non provato (serve l'accesso con `esterno@azienda.srl`).

## Dati di prova lasciati in Demo 2 (cancellati nel terzo giro, tranne 2 foto)

Rapportini «COLLAUDO …» di Marco Verdi su ORD-2026-001 per il 22/11 e il 23/11 (3,5 h, 1 foto). Timbrature di
Marco del 23/11: **2 entrate alle 14:54 a 1 ms l'una dall'altra** (il difetto, prima della correzione), un inizio
pausa. Non li ho cancellati: si tolgono dall'ufficio o con una riga SQL, se il founder vuole.

## Punto di ripresa

- Riprovare il PDF dopo il punto 1 (rapportino `fa351351-9310-450c-baca-380bf7c0a405`).
- Ripetere lo scenario con `operaio2@azienda.srl` (capocantiere di ORD-DEM-RIS01): passo 2 del rapportino (fasi,
  squadra, materiali, firma), squadra di oggi piena, verbale e collaudo col cliente.
- Subappaltatore (`esterno@azienda.srl`): non provato.
- Tablet e desktop: provate 8 pagine principali ciascuno, le altre no.

## Lingue dell'area operai (23/11/2026)
- 10 lingue oltre all'italiano: rumeno, albanese, arabo marocchino, arabo egiziano, tedesco, francese, inglese, spagnolo, spagnolo argentino, spagnolo peruviano (`src/lib/campo/lingua/`). L'arabo si legge da destra a sinistra.
- La scelta sta in Impostazioni → scheda «Lingua» (menu a tendina), raggiungibile anche da Altro → Lingua. Senza scelta si parte in italiano (regola del founder).
- Provato nel browser a 390 px: rumeno e arabo marocchino su Home e barra in basso, nessuno scorrimento laterale. Test `campoLingua.test.ts` 5/5.
- Non tradotti ancora: le schede del profilo (Profilo, Sicurezza…) e le pagine secondarie; i nomi dei cantieri restano come li scrive l'ufficio.

### Secondo giro lingue (23/11/2026)
- Tradotta quasi tutta l'area operai: circa 80 file (pagine e componenti del campo, menu laterale, chat interna, profilo, calendario e mappa «I miei lavori», notifiche del dispositivo). Ogni dizionario ha 1.826 frasi; argentino 580 e peruviano 108 differenze sullo spagnolo.
- `campoLingua.test.ts` ora controlla da solo ogni file che usa la lingua: una frase nuova senza traduzione fa fallire il test.
- Restano in italiano: nomi di mesi e giorni e formati delle date (li fa la sessione lingua-piattaforma), i dati scritti dall'ufficio, gli errori che arrivano dal server.
- Traduzioni generate, da far rivedere a un madrelingua prima di darle ai clienti (soprattutto le due varianti di arabo).

### Documenti del QR anche nell'app (23/11/2026)
- Funzione `campo_qr_cantiere_token` applicata sul database (migrazione 20290523100000, registro riallineato): il codice del QR solo a chi lavora su quel cantiere, mai senza accesso.
- Nel lavoro → scheda Descrizione compare «Documenti del cantiere», con gli stessi documenti del cartello e i pulsanti Apri e Scarica. Senza QR non compare niente.
- Provato: operaio assegnato riceve il codice, operaio di un altro cantiere no (prova in transazione annullata). Test `campoDocumentiQr.test.tsx` 2/2. Nella Demo 2 non ci sono ancora documenti di cantiere né QR: per vederlo dal vivo l'ufficio deve caricarne uno e creare il QR.

## Infortuni e quasi-incidenti (23/11/2026)
- Registro nuovo `sicurezza_eventi` (migrazione 20290523110000, applicata e riallineata): infortunio, quasi incidente, situazione pericolosa. Chi segnala vede le sue; chi ha «Sicurezza cantiere» (e il titolare) le vede tutte, le prende in carico e le chiude con le azioni correttive. Niente si cancella. Foto nel bucket privato `sicurezza-eventi`. Entra nel backup settimanale.
- Avviso subito in campanella e sul telefono a titolare e responsabili sicurezza («URGENTE · Infortunio segnalato · <cantiere>»).
- App operaio: /campo/sicurezza/segnala (menu laterale, Altro, riquadro rosso in «Segnala»). In cima «Ferito grave? Chiama il 112». Cantiere già scelto se è uno solo. Doppio tocco: una riga sola (id nato sul telefono).
- Ufficio: Sicurezza cantiere → scheda «Infortuni», con promemoria INAIL per gli infortuni.
- Provato: permessi con 3 utenti veri (transazione annullata); invio vero dal browser come operaio2 con foto e doppio tocco → 1 riga, 1 foto, 1 avviso. Test `sicurezzaEventi.test.tsx` 3/3. Tradotto in 10 lingue.
- Dato di prova rimasto: «PROVA COLLAUDO — tavola del ponteggio…» (quasi incidente su RIS01), per vedere la scheda dell'ufficio. Da cancellare dopo.

## Buoni pasto visibili all'operaio (23/11/2026)
- Pagina /campo/buoni-pasto («I miei buoni pasto»): regola in chiaro («un buono ogni giorno con almeno N ore»), mese con buoni, totale e già ricevuti, elenco dei giorni con stato (Maturato, In arrivo, Ricevuto, Annullato). Voce in Altro → HR solo per chi li ha.
- Nessuna modifica al database: le regole RLS danno già all'operaio solo i suoi buoni. Il profilo lo sceglie `hr_profilo_da_user`, la stessa funzione delle regole.
- Se l'azienda non li usa o la persona non è abilitata, la pagina lo dice invece di mostrare zero.
- Provato in transazione annullata: con i buoni accesi nella Demo 2 (8 €, soglia 6 h) Marco Verdi matura 73 buoni (584 €), li legge e non vede quelli degli altri. Test 7/7. Tradotto in 10 lingue.
- Nessuna azienda li usa ancora; nella Demo 2 sono spenti e operaio2 non ha una scheda del personale, quindi lì la pagina dice «la tua azienda non gestisce i buoni pasto».
- Non fatto: caricare lo scontrino dal telefono (modalità «ricevuta»).

## Tesserino verificabile dal QR (23/11/2026)
- Migrazione 20290523120000 (applicata e riallineata): tabella `tesserini_codici` (un codice per scheda del personale, nessuno la legge direttamente), `campo_mio_tesserino()` per l'operaio, `tesserino_rigenera()` per l'ufficio (il QR vecchio smette di funzionare), `verifica_tesserino()` pubblica di proposito (classificata in `funzioni_pubbliche_di_proposito`).
- Il QR del tesserino ora porta a /tesserino#<codice>: pagina pubblica senza login. Esiti: «In regola» (in forza + corso sicurezza + visita/idoneità valide, nessun documento personale scaduto), «Da verificare» (manca o è scaduto qualcosa), «Tesserino non valido» (scheda non attiva o cessata), «Tesserino non riconosciuto» (codice falso o rigenerato). Mostra foto, nome, impresa, P. IVA, mansione, data di assunzione; mai i documenti né quale documento personale è scaduto.
- Provato nel browser a 375 px: verde (scheda demo di Florin con corso e visita di prova), rosso (Marco Verdi, scheda non attiva), codice inventato. Test 5/5. Pagina del tesserino tradotta in 10 lingue; la pagina di verifica è in italiano (per chi controlla).
- Dati di prova aggiunti in Demo 2: 2 documenti «DEMO ·» sulla scheda di Florin, codici tesserino per Florin e Marco Verdi. Buoni pasto accesi in Demo 2 (8 €, soglia 6 h) con Marco Verdi abilitato: 73 buoni.
- Non fatto: pulsante «Rigenera QR» nella scheda del dipendente (la funzione c'è); operaio2 non ha scheda del personale, quindi il suo tesserino non ha QR.

## Unione in locale (23/11/2026, ok del founder)
- Ramo `campo-lingua-23nov` nel worktree `~/edilizia-campo-lingua` (la cartella principale, con lavoro non salvato di altre sessioni, resta su main). Commit: collaudo area operai, pacchetto della sessione lingua, traduzioni delle frasi arrivate da main, test fasi, «Rigenera QR». Rebase su origin/main fatto (61 conflitti risolti tenendo main + traduzioni). Non pubblicato.
- Tipi: puliti su tutti i file cambiati (controllo a lotti). Test dell'area operai: 2.807/2.809; i 2 rossi (rapportinoFirmaFineLavori, rapportinoTrasportiDatabase) e orderCampoManagement falliscono già su main; anche indirizziUnaRicerca (PosizioneOperativa:66) è rosso su main.
- Scheda dipendente → Documenti: riquadro «Tesserino di cantiere» con «Rigenera QR» (solo per chi lavora in cantiere).
- Demo 2: Marco Verdi riattivato; scheda del personale «Marco Operaio» collegata a operaio2; corso e visita «DEMO ·» su entrambi: i tesserini risultano «In regola».
