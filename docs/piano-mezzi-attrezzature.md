# Piano — Mezzi e Attrezzature: divisione, categorie, QR code

> Stato: **FASI A–D FATTE** (2026-10-05), in locale, non ancora pubblicate (push da chiedere).
> Pagina: `Manodopera e Mezzi → Mezzi e attrezzature` (`/azienda/manodopera?tab=mezzi`).
> Valutata dal vivo su **Demo Azienda 2** (9 mezzi + 9 attrezzature).

## Stato al 05/10/2026

Migrazioni **applicate in produzione e riallineate** (registro = file):
`20281005130000_mezzi_classe_attrezzature`, `20281005140000_mezzi_categorie_quantita`,
`20281005150000_mezzi_codice_qr`, `20281005160000_mezzi_inventario`,
`20281005170000_mezzi_trigger_senza_execute` (le funzioni dei trigger senza EXECUTE, come vuole
l'advisor). Collaudate con blocchi
`DO … RAISE EXCEPTION` (tutto annullato): codici automatici e a mano (`att 15` → `ATT-0015`),
doppioni rifiutati, etichette vuote riservate, sovra-montaggio bloccato («Non basta: disponibili
549,5 m²»), rientri parziali, azioni dal campo con i permessi (cantiere non suo → rifiutato,
furgoni non spostabili), smarrito → avviso all'ufficio, inventario (conta, ricconta, chiusura con
segnalazioni e «riporta in magazzino»). `admin_backup_tabelle_scoperte()` resta vuota, nessuna
funzione nuova aperta ad `anon`.

Cosa c'è nell'app:
- **Elenco diviso** Mezzi / Attrezzature (`?vista=attrezzature`) con conteggi e pallino rosso
  sull'altra scheda se ha qualcosa da controllare; mezzi raggruppati per tipo, attrezzature per
  categoria; ricerca anche per codice; «Non visto da N giorni» (solo per chi usa le etichette).
- **Categorie** per azienda (12 predefinite, seminate alla prima apertura; le attrezzature esistenti
  pre-classificate dal nome), gestibili dalla rotella accanto al filtro.
- **Attrezzature a quantità** (m², pezzi, metri, m³, kg): ponteggi, transenne, reti, casseri.
  Montaggi per cantiere, rientri anche parziali, storico; costi per commessa in proporzione alla
  parte montata (vista `v_ordine_costi_mezzi_stimati`), e nella card della commessa.
- **Codici ed etichette QR** (ATT-0001 / MZ-0001): stampa su A4 adesivo 70×37 (24) o 52,5×29,7 (40);
  etichette vuote da collegare dopo. Il QR porta a `/q/<codice>?c=<azienda>` (sottodominio lavori).
- **Scansione**: dall'ufficio apre la scheda (avviso «Letto dal QR» + «È in magazzino»); dal campo
  la pagina `/campo/mezzi/scansione/:codice` con «Lo prendo io / Lo lascio in cantiere / Lo carico
  sul furgone / Riportato in magazzino / Non lo trovo», e per le quantità «Montati / Rientrati».
  Senza accesso: login e ritorno automatico all'attrezzo (`RitornoDopoLogin`).
- **Inventario** (`/azienda/mezzi/inventario`): giri di conta con lo scanner «una dopo l'altra»,
  conta a mano per chi non ha etichetta, quantità contate per i ponteggi, chiusura con segnalazioni
  dei mancanti e aggiornamento della posizione di chi è stato trovato in magazzino.
- Scheda e documenti **adatti alla classe**: per un attrezzo niente libretto/targa/km/bollo; ci
  sono garanzia, taratura, manuale CE, PiMUS, autorizzazione ministeriale; manutenzione ordinaria,
  sostituzione parti, taratura, verifica; segnalazioni «Non si trova» e «Furto».

Dati demo lasciati di proposito: «Ponteggio a telai» ATT-0010, 800 m², 200 m² montati su
ORD-2026-001 (con un rientro parziale di 50 m² nello storico).

Fatto dopo (05/10/2026, seconda parte):
- **«È rotto o danneggiato» dal QR** anche su un attrezzo che non si ha in carico: chi ne ha letto
  il QR negli ultimi 30 minuti può segnalarlo con le foto (`mezzo_appena_scansionato_da_me`,
  migrazioni `20281005180000_mezzi_segnala_da_scansione` e `20281005190000_mezzi_file_propri_dopo_scansione`).
  I documenti del mezzo restano chiusi. Collaudato: senza scansione segnalazione, foto e file
  vengono rifiutati; dopo la scansione passano e l'ufficio riceve l'avviso.
- **Scanner provato con una fotocamera simulata** (lo stream della pagina sostituito da un'immagine
  col QR): «Scansiona» in «I miei mezzi» legge il QR e apre l'attrezzo giusto.
- **App iOS**: un QR generato dentro l'app porta a `https://lavori.ediliziaincloud.com/q/…` (non a
  localhost); un link che apre l'app conserva la query (`?c=`); permesso fotocamera che cita i
  codici QR. Versione portata a 1.5 build 15 con `mobile:build` + `cap sync`: Archive e invio
  ad App Store li fa l'utente da Xcode.

Collegamenti verificati (05/10/2026, terza parte — migrazione `20281005230000_mezzi_collegamenti`):
- **Commessa**: la card «Mezzi e attrezzature» (vista «Squadra e mezzi») mostra mezzi, periodi, costi
  e ponteggi montati; da «Assegna mezzo o attrezzo» si monta anche un ponteggio, chiedendo i m² o i
  pezzi. «Il cantiere» (`commessa_mezzi_lavoro`) ha la chiave `montati`, e il suo «Porta sul
  cantiere» fa lo stesso. I costi stimati per commessa (vista `v_ordine_costi_mezzi_stimati`)
  contano i montaggi in proporzione.
- **POS**: tra le macchine e attrezzature della commessa ci sono anche i ponteggi montati, con la
  quantità (`_shared/posDatiApp.ts`).
- **Diario della manodopera** (`manodopera_diario`): «Montato» e «Rientrato» per i ponteggi,
  «Non si trova» e «Furto» per le segnalazioni, manutenzioni degli attrezzi con il loro nome.
- **Persone**: la scheda dell'operaio (`manodopera_operaio`) elenca «Mezzi e attrezzi in carico» con
  codice e gli attrezzi a bordo del suo furgone; se non lavora più con voi e ha ancora qualcosa
  in carico, compare l'avviso. La scheda del Personale mostra i mezzi in carico (sola lettura).
- **Scadenze e avvisi**: la vista `mezzi_scadenze` chiama «manutenzione» quella degli attrezzi;
  l'email e la campanella hanno le etichette di garanzia, taratura, manuale CE, PiMUS e
  autorizzazione ministeriale.
- **Registro attività**: montaggi, inventari e categorie entrano nel registro degli utenti.
- **App del cantiere**: fine giornata, «I miei mezzi», pagina dell'attrezzo letto dal QR (già fatti).
- **Silvio** (migrazione `20281005233000`): `dove_sono_mezzi_attrezzi` (per nome, codice
  dell'etichetta, targa, categoria, persona — anche «io» — o filtro: in magazzino, in officina,
  guasti, non si trovano, non letti da 30 giorni; senza niente il quadro del parco) e
  `mezzi_del_cantiere` (mezzi lasciati lì, ponteggi montati, furgoni e attrezzi della squadra).
  Area «mezzi» col permesso `can_view_mezzi`, a bordo con le domande di cantiere
  (`domandeSuiMezzi.ts`) o con `carica_strumenti`; anche nel connettore per Claude/ChatGPT
  (scope `orders:read`). La guida all'app (`guida_a`) porta alla pagina giusta, e la scheda di un
  mezzo aperta dice a Silvio di quale si parla.

Non collegato, di proposito: la pianificazione di Silvio (`cantiere_allocations`, `mezzo_id` senza
legame) è vuota e non usata.

Resta aperto:
- Prova con un telefono vero, inquadrando un'etichetta stampata.
- Universal Links: oggi il QR inquadrato con la fotocamera del telefono apre Safari, non l'app.
  Servono il file apple-app-site-association su lavori.ediliziaincloud.com (con un'eccezione nel
  middleware, che ai bot dei sottodomini privati risponde 403) e la capability Associated Domains
  nell'account Apple (team 9UKNJB4PM7).

---

## 0. Valutazione — cosa c'è oggi e cosa non va

**Il modello.** Mezzi e attrezzature stanno nella **stessa tabella `mezzi`**, distinti solo dal campo
`tipo` (enum fisso): `furgone, autocarro, autovettura, macchina_movimento_terra, sollevamento,
rimorchio, attrezzatura, altro`. Le attrezzature sono quindi **un solo valore** ("attrezzatura"), senza
alcuna sottocategoria. Nessun campo per QR/codice. Dati reali: 31 elementi su 3 aziende, 10 attrezzature
(betoniera, tagliapiastrelle, livella laser, avvitatore, demolitore, generatore, miscelatori…); 4 sono
"caricati su" un altro mezzo (`su_mezzo_id`, es. avvitatore sul Ducato).

**Cosa funziona già bene** (da tenere): in carico a una persona, su un cantiere, **caricato su un mezzo**,
foto, segnalazioni dal campo, costi d'acquisto/annui, scadenze con avviso, pannello "Da controllare",
storico, uso per cantiere, fine giornata dal campo.

**I problemi (verificati sul vivo):**
1. **Lista unica mescolata**: avvitatore, betoniera, miscelatori in mezzo a furgoni e camion, in ordine
   alfabetico. Il filtro per tipo compare solo da 6 elementi in su.
2. **I conteggi mentono**: "18 mezzi · valore 84.780 €" conta anche gli attrezzi come mezzi.
3. **Un solo bottone** "Nuovo mezzo" e un form unico ("Nuovo mezzo o attrezzatura") **pensato per i
   veicoli**: "Hai il libretto? Carica una foto…" anche per un trapano.
4. **La scheda di un'attrezzatura è da veicolo**: l'avvitatore Makita mostra **"Km —"**,
   **"telaio/matricola"**, le tab **"Tagliandi"** e **"Cantieri e km"**, e le scadenze dicono
   *"Assicurazione, bollo, revisione… Inizia da assicurazione e revisione"*.
5. **Categorie documento/manutenzione/segnalazione da veicolo**:
   documenti `assicurazione, bollo, revisione, contratto, verifica_periodica, libretto` (mancano
   **garanzia, taratura, manuale/CE**); manutenzioni `tagliando, gomme, carrozzeria…` (mancano
   **manutenzione ordinaria, sostituzione parti, taratura**); segnalazioni `guasto, danno, km`
   (manca **smarrito / rubato** — il caso più frequente per gli attrezzi).
6. **Nessuna categoria** per raggruppare gli attrezzi (elettroutensili, taglio, misura, ponteggi…).
7. **Nessun QR**: per sapere quale attrezzo è "questo" bisogna cercarlo per nome.

**Già pronto da riusare (buona notizia):**
- Librerie installate: **`qrcode`** (genera) e **`@zxing/library`** (scansiona da fotocamera).
- **`src/components/warehouse/BarcodeScanner.tsx`** — dialog scanner con fallback manuale
  (`{ open, onOpenChange, onScan(text) }`), già usato in magazzino.
- Generazione QR già usata in **`src/pages/campo/CampoTesserino.tsx`** (tesserino operaio).
- Il magazzino ha già il flusso completo "scansiona → identifica" (`warehouse_scan_events`,
  `warehouse_scan_lookup`, `SettingsQrCodici`): stesso schema da replicare.

---

## 1. Divisione Mezzi / Attrezzature

**Modello (consigliato): una sola tabella, una colonna in più.** Restare su `mezzi` e aggiungere
`classe text not null check (classe in ('mezzo','attrezzatura'))`, valorizzata dal `tipo` per i dati
esistenti (`tipo='attrezzatura'` → attrezzatura, il resto → mezzo). Così **tutto ciò che già funziona
resta valido** (assegnazioni, caricato-su, giornate dal campo, documenti, manutenzioni, segnalazioni,
costi per commessa, RPC `campo_mezzi_*`, `mezzi_in_carico`…). Separare in due tabelle vorrebbe dire
duplicare tutto: sconsigliato.

**Interfaccia:**
- In cima alla tab, due schede: **Mezzi (9)** · **Attrezzature (9)** — ognuna con i suoi conteggi
  ("9 mezzi · valore X" / "9 attrezzature · valore Y"), ricerca, filtri e il suo bottone
  (**+ Nuovo mezzo** / **+ Nuova attrezzatura**).
- Il pannello **"Da controllare"** resta unico (è un avviso), con l'etichetta della classe.
- **Form separato per classe**: per le attrezzature niente libretto/targa/km; i campi giusti sono
  categoria, marca/modello, **matricola / n° di serie**, ore (solo per attrezzi a motore), in carico a,
  dove si trova, **codice QR**.
- **Scheda attrezzatura su misura**: "Km" → "Ore" (o nascosto per attrezzi a mano), "telaio" →
  "n° di serie", tab "Tagliandi" → **"Manutenzioni"**, "Cantieri e km" → **"Dove è stato"**, scadenze
  con testo da attrezzo (*"Garanzia, taratura, verifiche: ti avvisiamo prima che scadano"*).
- **Vista attrezzature centrata sul "dove si trova"**: in carico a · su quale mezzo · in quale
  cantiere · in magazzino — per un attrezzo la domanda è sempre "dov'è?".

**Categorie di supporto (aggiunte, additive):**
- documenti: + `garanzia`, `taratura`, `manuale_ce`
- manutenzioni: + `manutenzione_ordinaria`, `sostituzione_parti`, `taratura` (nascondere
  gomme/carrozzeria/tagliando per le attrezzature)
- segnalazioni: + `smarrito`, `rubato` (nascondere `km` per le attrezzature)

---

## 2. Categorie

**Modello:** tabella **`mezzi_categorie`** per azienda (personalizzabile):
`id, company_id, classe ('mezzo'|'attrezzatura'), nome, icona, ordine, attiva, predefinita` +
`mezzi.categoria_id` (FK, nullable). Il `tipo` resta per il **comportamento** (km/ore, libretto,
verifiche), la **categoria** serve a **raggruppare e filtrare**.

**Categorie predefinite** (seminate per ogni azienda, modificabili/rinominabili/disattivabili):

| Attrezzature | Esempi (dai dati reali) |
|---|---|
| Elettroutensili | avvitatore, trapano, smerigliatrice |
| Macchine da cantiere | betoniera, miscelatore, intonacatrice |
| Taglio | tagliapiastrelle, troncatrice, flessibile |
| Demolizione | demolitore, martello |
| Misura e tracciamento | livella laser, distanziometro *(→ taratura)* |
| Energia | generatore, compressore |
| Ponteggi e accesso | ponteggio, trabattello, scale *(→ verifica)* |
| Sicurezza e DPI | imbracature, linee vita *(→ scadenza)* |
| Pulizia | aspiratore, idropulitrice |
| Altro | |

Per i **mezzi** le categorie di partenza sono gli attuali tipi (Furgoni, Autocarri, Auto,
Movimento terra, Sollevamento, Rimorchi).

**Interfaccia:** filtro per categoria (sempre visibile, non solo da 6 in su), **raggruppamento per
categoria** con gruppi richiudibili e conteggio, gestione categorie (aggiungi/rinomina/ordina) da un
piccolo pannello. Le 10 attrezzature esistenti vengono **pre-classificate** per nome
(betoniera → Macchine da cantiere, ecc.) e l'utente conferma.

---

## 3. QR code per le attrezzature

**Codice:** `mezzi.codice` univoco per azienda, leggibile (es. **`ATT-0042`**, progressivo per
azienda), generato alla creazione; anche per i mezzi se servisse (`MZ-0007`).

**Cosa contiene il QR (consigliato): un link**, es. `https://lavori.ediliziaincloud.com/q/ATT-0042`.
Così funziona sia con lo **scanner dell'app** sia con la **fotocamera normale del telefono** (apre
l'app direttamente sull'attrezzo, previo login; chi non è dell'azienda non vede nulla — RLS già attiva).

**Etichette:** "**Stampa etichette QR**" — per una o più attrezzature selezionate: PDF A4 con
etichette standard (QR + nome + codice + nome azienda), più la stampa singola. Generazione con
`qrcode` come nel tesserino.

**Scansione** (riuso `BarcodeScanner`):
- **Ufficio**: bottone "Scansiona" nella vista Attrezzature → apre la scheda.
- **Campo (operaio)**: "Scansiona attrezzo" → scheda ridotta con **azioni rapide**:
  *lo prendo io · lo lascio in cantiere X · lo carico sul mezzo Y · segnalo guasto · smarrito*
  (sono movimenti che il sistema già sa registrare: assegnazioni, caricato-su, segnalazioni).
- **Etichetta non ancora associata** (rotolo di etichette prestampate): la scansione propone
  "**Associa questa etichetta a un'attrezzatura**" → form nuova attrezzatura col codice già compilato,
  o scelta di un'attrezzatura esistente senza codice. È il modo più veloce per censire il parco:
  attacchi le etichette, scansioni, compili.

**Registro scansioni** (opzionale ma utile): `mezzi_scansioni` (chi, quando, dove/GPS, azione) sul
modello di `warehouse_scan_events` — dà lo storico "chi l'ha avuto" e abilita l'**inventario a
scansione** (giro in magazzino/furgone: scansioni tutto ciò che c'è, il sistema segnala cosa manca).

---

## 4. Elementi da creare

**DB (migrazioni additive, via `apply_migration` + riallineo versione):**
1. `mezzi.classe` (+ backfill da `tipo`), `mezzi.categoria_id`, `mezzi.codice` (+ indice univoco
   per azienda, + generatore progressivo per azienda).
2. `mezzi_categorie` (+ RLS, + seme categorie predefinite per azienda).
3. Estensione CHECK: documenti (garanzia, taratura, manuale_ce), manutenzioni (manutenzione_ordinaria,
   sostituzione_parti, taratura), segnalazioni (smarrito, rubato).
4. RPC `mezzo_da_codice(codice)` (risoluzione scansione, rispetta l'azienda) e, se si fa il registro,
   `mezzi_scansioni` + RPC per l'azione rapida.

**Frontend:**
- `src/types/mezzi.ts` (classe, categoria, codice; etichette per classe).
- `src/pages/azienda/MezziList.tsx` → schede Mezzi/Attrezzature, raggruppamento per categoria, conteggi
  separati, "Scansiona", "Stampa etichette".
- `src/components/mezzi/MezzoFormDialog.tsx` → form per classe (niente libretto/targa/km per gli attrezzi).
- `src/pages/azienda/MezzoDetail.tsx` + sezioni → testi e tab da attrezzo.
- `src/pages/campo/CampoMezzi.tsx` → "Scansiona attrezzo" + azioni rapide.
- Nuovi: pannello categorie, generatore etichette QR (PDF), pagina deep-link `/q/:codice`.

**Riuso:** `BarcodeScanner`, `qrcode` (come `CampoTesserino`), schema `warehouse_scan_events`.

---

## 5. Decisioni (con raccomandazione)

1. **Una tabella + `classe`**, non due tabelle. *Consigliato* (tutto l'esistente continua a funzionare).
2. **Categorie personalizzabili per azienda** con predefinite seminate. *Consigliato.*
3. **Il QR contiene un link** (funziona anche con la fotocamera normale), non solo il codice. *Consigliato.*
4. **Codice leggibile progressivo** (`ATT-0042`) stampato sotto il QR, per chi lo detta a voce. *Consigliato.*
5. **Etichette prestampate associabili alla scansione**. *Consigliato* (censimento veloce).
6. QR anche sui **mezzi**? Opzionale (per i mezzi c'è già la targa): lo predisporrei ma partirei dagli attrezzi.

---

## 6. Fasi consigliate

- **Fase A — Divisione + scheda attrezzatura su misura** (massimo valore, rischio basso):
  `classe`, schede Mezzi/Attrezzature con conteggi separati, form e scheda da attrezzo, categorie
  documenti/manutenzioni/segnalazioni estese.
- **Fase B — Categorie**: tabella, predefinite, filtro e raggruppamento, pre-classificazione delle
  attrezzature esistenti.
- **Fase C — QR**: codice, etichette stampabili, deep link `/q/…`, scansione ufficio + campo, azioni
  rapide, associazione etichette prestampate.
- **Fase D (opzionale) — Inventario a scansione** e registro "chi l'ha avuto", con allarme per gli
  attrezzi non visti da N giorni.

---

## 7. Rischi / attenzioni

- Molte parti leggono `mezzi`/`tipo` (costi per commessa, giornate dal campo, `campo_mezzi_*`,
  `mezzi_in_carico`, card commessa e operaio, 2 test UI): le modifiche sono **additive** e il `tipo`
  resta invariato → nessuna rottura attesa, ma vanno ripassati i test `mezziFineGiornata` e
  `mezziTelefonoECommessa`.
- Il bottone **"carica libretto"** (OCR) va nascosto per le attrezzature.
- **Riclassificazioni**: alcuni elementi oggi sono "mezzi" ma per l'officina sono attrezzi (es. un
  ponteggio mobile catalogato come sollevamento): in Fase B l'utente può spostarli.
- **Deep link e accessi**: chi scansiona senza essere loggato → login e poi ritorno all'attrezzo; chi è
  di un'altra azienda non vede nulla (RLS esistente).
- **Etichette**: i formati variano — partire da A4 standard + etichetta singola; il codice leggibile
  sotto il QR copre il caso "etichetta rovinata".
- **Telefono** (regole mobile): da campo solo scansione + azioni rapide, niente gestione categorie o
  stampa etichette (quelle restano in ufficio).
- Dati demo: le tre coppie "DEMO CFO · int/mix/sub" sono dati di prova duplicati, da ignorare/pulire.

## 28 ottobre 2026 — Pianificazione nella commessa e popup delle fasi

Implementato `PianoMezziCantiere`, usato nella commessa e nel popup della lavorazione. Sostituito il vecchio collegamento `#section-mezzi`, che spostava la pagina. La riga della tabella apre il dettaglio, con un pulsante accessibile da tastiera sul nome. Filtri Mezzi / Attrezzature / Noleggi, stato temporale e storico di terminati/annullati.

- Anagrafica unica del parco: tipo e proprietà/leasing/noleggio rimangono nella scheda esistente. Dal popup si possono registrare mezzo o attrezzatura, senza uscire dalla commessa.
- Assegnazione pianificata: tutta la commessa oppure una o più fasi, date iniziale/finale incluse, quantità per risorse gestite a quantità, note. Apertura dalla fase con selezione già compilata. Comando per copiare le date del cantiere o delle fasi, quando presenti; successive ripianificazioni non cambiano silenziosamente gli accordi di noleggio.
- Tariffa per intera assegnazione (quantità inclusa): totale concordato, giorno, settimana di 7 giorni, mese convenzionale di 30 giorni. Periodici pro rata su giorni di calendario; extra trasporto/montaggio aggiunti una sola volta. Senza fine il costo periodico resta indeterminato; importo fisso utilizzabile anche con fine aperta. Valori netti IVA.
- Presenza fisica, montaggi, rientri e viaggi esistenti conservati in un pannello secondario. Una prenotazione futura non sposta fisicamente il mezzo, non genera rapportini e non altera POS.
- Costi previsti separati dai costi annui stimati del parco e dalle fatture: nessuna registrazione contabile automatica e nessun doppio addebito alla scelta della fase. Il nuovo totale non è ancora aggregato nell'Economia delle fasi o nel margine generale: queste viste mantengono le fonti precedenti.

Database: migrazione **20281028023000_mezzi_piano_cantiere**, applicata e registro riallineato. Tabelle `mezzi_piani_cantiere` e `mezzi_piani_costi` separate per non trasmettere importi a chi legge solo l'organizzazione. Scritture dirette client revocate; RPC atomica `salva_piano_mezzo`, con controllo utente, blocco, sola lettura, permessi mezzi/commessa, visibilità commessa e costo. SECURITY DEFINER intenzionale per validare conflitti fra prenotazioni anche su commesse non visibili al chiamante senza rivelarne nomi/dati; advisory segnala questa esposizione autenticata, prevista e verificata. Nessun accesso anon. Lock sulla risorsa e sull'identificativo del piano; rifiuto sovrapposizioni per singole risorse e picchi oltre la quantità totale per quelle frazionabili. Le fasi e la risorsa devono appartenere alla stessa commessa/azienda. Nessuna tabella nuova scoperta dal controllo backup.

Verifiche:

- **58 test, 6 file**, calcolo importi/durate, confini date, filtri fase, precompilazione e riuso date, assenza costi nel payload senza permesso, errore costi che non cancella valori, lettura sola e regressioni mezzi precedenti.
- **13 prove SQL reali tutte positive**, script `scripts/sql/mezzi-piano-cantiere-collaudo.sql`, transazione annullata: salvataggio atomico, fasi estranee, conflitti, date, rollback costo invalido, annullamento, quantità e negazioni operaio/anon/scrittura diretta.
- Tipi: 5 file di produzione controllati, zero errori; lint dei tre file nuovi senza errori o avvisi; diff check pulito. Nessuna build completa o pubblicazione frontend in questo incremento.
- Browser reale **Demo Azienda 2**, commessa `DEMO-APP-2810-A`: login separato su `mezzi.localhost`, apertura dalla fase, inserimento e riapertura/modifica, costo 5 × 100 + 70 = **570 €**, assegnazione generale e attrezzatura propria su fase. Due piani dimostrativi conservati con note `COLLAUDO DEMO UX mezzi 28/10`; nessun noleggio, fattura o movimento fisico reale. Screenshot in `outputs/mezzi-cantiere-2810/popup-risorse.png` della workspace della chat.

Limiti espliciti: la disponibilità pianificata e quella fisica sono registri distinti; la riconciliazione all'arrivo/rientro resta un'azione dell'operatore. Non aggiunti ordini al noleggiatore, fatturazione automatica o alert di rientro. Nessun push/deploy frontend eseguito.

## 28 ottobre 2026 — Economia, fornitori e responsabili delle risorse

Superato il limite del precedente incremento sull'integrazione nel riepilogo economico. Il nuovo riquadro **Mezzi e noleggi della commessa** confronta il preventivo con le quote riconosciute nei costi già registrati. Non somma il preventivo al consuntivo e non crea costi/fatture/pagamenti. Rimane la stessa fonte canonica `v_ordine_marginalita` per costi e margine: il collegamento è una classificazione, non una seconda spesa. Rimossa dal riquadro storico la sottrazione automatica della stima annua dal margine, che poteva sovrapporsi a spese effettive.

Il dettaglio della risorsa permette di collegare costi/fatture già attribuiti alla commessa oppure OdA emessi. Un OdA con costo/fattura usa un'unica fonte: somma dei `company_costs` associati, altrimenti imponibile OdA, come `marginalita_costo_oda`. Il costo diretto collegato a quell'OdA è escluso dall'elenco delle fonti dirette. Supportate quote parziali dello stesso documento su più risorse e costi ripartiti tra commesse, nei limiti delle attribuzioni canoniche. Nessun abbinamento automatico per semplice nome fornitore/importo: l'operatore riconosce la fonte. OdA in bozza/annullati esclusi. Fonti modificate, spostate, eliminate o ridotte da note di credito rendono esplicita la necessità di riconciliazione; il riepilogo non spaccia quote obsolete per importi validi.

UX:

- Menu risorsa, ambito, tariffa, fornitore e referente con ricerca e stile del gestionale: eliminati i menu nativi del sistema operativo. Ricerca letterale per termini sulle etichette, non sugli UUID, per evitare risultati estranei.
- Fornitore da anagrafica condivisa; creazione nel popup con l'editor esistente, selezione immediata e invalidazione delle liste. Il pulsante di creazione segue i permessi; nessun duplicato anagrafico costruito solo per il noleggio. Conservati eventuali riferimenti testuali precedenti.
- Referente operativo `responsabile_hr_id` per assegnazione: persone attive dell'azienda, con persone del cantiere evidenziate e comando **Usa il capocantiere**. Nessuna modifica automatica ad accessi, squadra, nomine sicurezza, patenti o abilitazioni; non è una certificazione all'uso della macchina.
- **Gestisci risorse e spese** dal conto economico apre il popup, mantenendo la commessa. Le spese si collegano dal dettaglio dell'assegnazione. Le quote si possono scollegare senza eliminare il documento o il costo.

Migrazione **20281028024000_mezzi_piani_economia_referenti**, applicata e versione riallineata: referente e fornitore con FK, tabella RLS `mezzi_piani_spese` (solo SELECT client), RPC atomiche di scrittura con controlli azienda/commessa/permessi/sola lettura e lock sulla fonte di costo. Quote fino a due decimali, non oltre il documento né la quota della commessa; nessuna scrittura diretta client o chiamata anon. Il contesto persone espone solo nomi, ID e appartenenza operativa, senza campi personali HR. SECURITY DEFINER delle tre RPC intenzionale, segnalato dagli advisor come esposizione autenticata: permessi e ambito verificati prima della lettura/scrittura. Nessuna nuova tabella senza RLS o scoperta dal backup.

Letture di piani e prezzi paginate e ordinate stabilmente; cache prezzi dipendente dagli ID del piano. Fonti economiche aggiornate ogni 30 secondi con invalidazione del consuntivo quando cambiano; i collegamenti salvati aggiornano subito il riepilogo.

Collaudo:

- Test automatici su calcolo, attribuzioni, fonti aggiornate, annullamenti, quote parziali, composizione commessa, fascia finanziaria, selezione referente e regressioni fornitori.
- **17 prove SQL nuove tutte positive**, `scripts/sql/mezzi-economia-referenti-collaudo.sql`, interamente annullate al termine: budget/referente/fornitore, negazioni altra azienda/commessa/operaio/anon, costi diretti e fatture ripartite, quote, fonte unica OdA/fattura, consuntivo invariato prima/dopo collegamento, annullamento e scollegamento. Ripetute anche le **13 prove precedenti** senza regressioni.
- Browser Demo Azienda 2: ricerca risorse/fornitore, assegnazione del capocantiere, salvataggio e riapertura, apertura/annullamento creazione fornitore, collegamento costo, gestione dal riquadro economico senza navigazione. Nessuna nuova anagrafica fornitore necessaria al collaudo reale.
- Nella sola commessa di prova `DEMO-APP-2810-A`, conservato un costo **simulato** da 570 € (`1bb12fb2-b7d7-4294-8b40-6cfc6f1ae627`), collegato al noleggio DEMO. Nome e note dichiarano il collaudo, nessuna fattura o pagamento reale, scadenza convenzionale nel 2210 per escludere solleciti attuali. Verifica database: consuntivo 570 €, quota mezzi 570 €, **una registrazione**, non 1.140 €. Fornitore esistente e capocantiere collegati al piano dimostrativo.
- Evidenze e log nella workspace della chat `outputs/mezzi-economia-2810/`. Interfaccia verificata localmente; nessun push/deploy frontend o build completa in questo incremento.

Rimangono distinti: preventivo, classificazione delle spese registrate, stima annua del parco e presenza fisica. Un importo senza fine o tariffa non viene inventato; la copertura incompleta è segnalata. Non introdotti ordini automatici al noleggiatore, approvazioni di spesa o avvisi di rientro.
