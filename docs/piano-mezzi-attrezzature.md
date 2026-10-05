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

Resta aperto:
- Dal campo «è rotto» su un attrezzo che non si ha in carico (oggi si segnala dopo averlo preso).
- Prova con la fotocamera vera di un telefono (in locale la fotocamera non c'è) e nell'app iOS:
  lo scanner è lo stesso del magazzino, ma serve una nuova release per averlo nell'app.

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
