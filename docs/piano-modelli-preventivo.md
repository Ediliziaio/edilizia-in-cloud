# Piano modelli di preventivo

Scritto il 26/09/2026. Obiettivo: da **70 a 105 modelli** (109 con i Giardini), più il
documento serramenti che si compone da solo, **senza preventivatori nuovi** e col minor
numero di token.

Questo file è la fonte unica. Ogni sessione legge **solo questo file** e, per ogni
modello, il suo **gemello** (il modello esistente da cui si copia). Niente esplorazione
del codice oltre ai punti indicati qui.

## Stato

Ogni sessione aggiorna la sua riga a fine lotto.

| Lotto | Cosa | Modelli | Stato | Commit |
|---|---|---|---|---|
| 0 | Preparazione (aree multiple, impronte, miniature) | – | ✅ fatto | 8dd56d37b |
| 1 | Serramenti: documento che si compone da solo | – | da fare | |
| 2 | Pareti e soffitti (area nuova) | 7 | ✅ fatto | 4aedaa3de |
| 3 | Pergole e tende (area nuova) | 5 | ✅ fatto | eaa1bcf7c |
| 4 | Ristrutturazioni | 5 | ✅ fatto | (in commit) |
| 5 | Tetti | 3 | ✅ fatto | (in commit) |
| 6 | Elettrico | 4 | ✅ fatto | (in commit) |
| 7 | Termoidraulica | 3 | da fare | |
| 8 | Pavimenti | 3 | da fare | |
| 9 | Serramenti | 2 | da fare | |
| 10 | Facciate col preventivatore | 3 + 6 collegati | da fare | |
| 11 | Giardini (solo se Florin conferma) | 4 | in attesa | |

## La regola d'oro: un modello copiato non tocca mai gli altri

Copiare un modello e cambiarlo **non deve cambiare nessun altro modello**, né nel codice,
né nelle foto, né nei preventivi già fatti.

1. **Copia vera, mai riferimento.** Il modello nuovo ha il suo file o la sua voce di
   testi, con i testi scritti per intero. Vietato importare o riusare pezzi di un altro
   modello: niente `...finestreContent.faq`, `IDR_EDITORIAL.caldaia.specs`,
   `import { … } from "./fullRistrutturazioneParziale"`. Se due modelli si somigliano, il
   testo si **ricopia**, non si collega.
2. **Il gemello e i pezzi condivisi non si toccano.** In un lotto di modelli non si
   modificano: il gemello, le fabbriche (`create…Template`, `complete…Edition`,
   `completeModulePhotography`), `modulePhotography.ts`, il documento edile, i PDF in
   `src/components/preventivi/pdf/`. Se un lotto ne avrebbe bisogno, **si ferma e lo dice
   a Florin**: diventa un lavoro a parte, con il confronto dei PDF prima e dopo su ogni
   modello interessato.
3. **Foto: si aggiungono, non si sostituiscono.** Una foto di serie può essere usata da
   più modelli: la si legge, non la si sovrascrive. Per cambiare la foto di un modello si
   crea un **file nuovo** e si cambia il percorso **solo** in quel modello. Mai
   sovrascrivere un file esistente in `public/`.
4. **Database: il vincolo si allarga, mai si stringe.** Nella migrazione di un lotto si
   aggiungono id all'elenco del vincolo del modello; non se ne tolgono né si rinominano (i
   preventivi salvati con quell'id non si aprirebbero più).
5. **Il test delle impronte fa da guardia** (Lotto 0). Tiene un'impronta di ogni modello
   esistente. Se un lotto cambia per sbaglio anche un solo altro modello, il test diventa
   rosso: si annulla la modifica, non si aggiorna l'impronta. Un'impronta esistente si
   aggiorna solo per un cambio voluto su quel modello, scritto nel messaggio del commit.

Il database protegge già il resto: ogni preventivo tiene **congelato** il suo modello
(trigger `preventivo_modello_immutabile`), il modello personalizzato di un'azienda è una
copia sua (`modelli_libreria_azienda`), e installare un modello di area copia i prodotti.
Cambiare un modello della libreria non cambia quindi i preventivi già fatti né le copie
delle aziende.

## Regole di lavoro

### Lavoro
1. **Una sessione per lotto, in ordine.** Mai due lotti in parallelo: toccano gli stessi file.
2. **Worktree nuovo da `origin/main`** nella cartella scratchpad della sessione, con
   `node_modules` come link a quello della cartella principale. Mai lavorare nella
   cartella principale, mai toccare `.claude/launch.json` o file di altre sessioni, mai
   `git stash`.
3. **Commit con i soli percorsi del lotto** (`git add -- <file>`), messaggio in italiano
   come i commit precedenti, con la riga `Co-Authored-By` indicata dalla sessione.
4. **Prima del push:** rebase su `origin/main`, test mirati, `npm run test:critical`,
   `npm run typecheck:ci` (in background, circa 20 minuti). Push: `git push origin HEAD:main`.
5. **Dopo il push:** controlli della CI e codice online (il chunk giusto, vedi CLAUDE.md).

### Migrazioni (riassunto di CLAUDE.md)
- Una sola migrazione per lotto: **aggiunge gli id nuovi all'elenco del vincolo del
  modello**. Si copia il corpo dall'ultima migrazione di quel vincolo
  (`grep -l "<vincolo>" supabase/migrations/*.sql | tail -1`) e si cambia solo l'elenco.
- In testa: `set local lock_timeout = '3s'; set local statement_timeout = '60s';`
- Versione libera, dopo l'ultima `2028…`: controllare `ls supabase/migrations/<versione>_*`
  e il registro.
- `apply_migration` via MCP, **subito dopo** il riallineamento:
  `update supabase_migrations.schema_migrations set version = '<versione del file>' where name = '<nome>' and left(version, 4) = '2026';`
  poi il file `<versione>_<nome>.sql` identico.
- Si applica prima di pubblicare i file che la usano, e si pubblica subito dopo: finché il
  file manca, Supabase Preview è rosso per tutte le sessioni.

### Contenuti
- Italiano, del «tu», parole del cantiere. **Nessuna promessa:** risparmi, rese, tempi e
  incentivi sono stime.
- **Nessuna norma o percentuale scritta a memoria.** Se serve (amianto, linea vita,
  incentivi), si legge la fonte ufficiale nella sessione e la si cita; altrimenti si
  resta generici («secondo le norme in vigore»).
- Niente marchi, niente «gratis». Nel PDF il segno meno è il trattino, mai «−».
- Garanzie e «perché sceglierci» scritti per quel lavoro, mai copiati da un altro modello.
- **PDF:** sempre il documento standard del motore. Niente PDF su misura, niente
  calcolatori, niente preventivi d'esempio su Demo Azienda 2 (solo se Florin li chiede).

### Risparmio token
- Leggere solo: questo file, il gemello (una voce o un file), e i punti da modificare
  (`grep -n` + `sed -n`). Mai file interi grandi.
- Modifiche con script mirati sulle ancore (python/sed), non riscritture di file.
- Solo i test elencati; **un** PDF di prova per lotto; typecheck una volta.
- Niente sub-agenti, niente controlli «per sicurezza» fuori dal lotto.
- A Florin: un riassunto breve a fine lotto.

## Ricetta A · Copiare un modello nello stesso preventivatore

Tutti i file sono in `src/lib/moduli-vendita/` salvo dove indicato.

### 1. Il modello: dove si scrive e dove si registra

| Motore | Dove sta il testo del gemello | Come si copia | Dove si registra l'id |
|---|---|---|---|
| ristrutturazione | un file per modello: `fullRistrutturazione<Nome>.ts` (export `ristrutturazione<Nome>Content`) | `cp` del file del gemello in un file nuovo, rinomina dell'export, testi riscritti | `fullRstModules.ts`: import, `FULL_RST_MODULES`, `RST_MODULE_TITLES`, mappa `CONTENT` |
| termoidraulico | voce in `IDR_REMAINING_EDITORIAL` (`idrRemainingEditorial.ts`) o in `IDR_EDITORIAL` (`fullIdrModules.ts`) | voce nuova copiata dal gemello, testi riscritti | `fullIdrModules.ts`: `FULL_IDR_MODULES`, `IDR_MODULE_TITLES`; anteprima (`buildIdrModulePreview`) solo se il modello ha dati propri |
| pavimenti | voce in `PAV_EDITORIAL` (`pavEditorialContent.ts`) | voce nuova copiata dal gemello | `fullPavModules.ts`: `FULL_PAV_MODULES` (titoli e copertine si ricavano da soli) |
| elettrico | voce in `ELT_EDITORIAL` (`eltEditorialContent.ts`) | voce nuova copiata dal gemello | `fullEltModules.ts`: `FULL_ELT_MODULES` (titoli e copertine si ricavano da soli) |
| tetti | un file per modello: `full<Nome>Module.ts` | `cp` del file del gemello, rinomina dell'export | `tettiTemplateModules.ts`: voce in `TETTI_TEMPLATE_MODULES`; `fullTettiModules.ts`: `FULL_TETTI_MODULES` e il ramo in `createFullTettiTemplate` come quello del gemello |
| serramenti | un file per modello: `full<Nome>Module.ts` | `cp` del file del gemello, rinomina dell'export | `serramentiTemplateModules.ts`: voce in `SERRAMENTI_TEMPLATE_MODULES`; `fullSerramentiModules.ts`: `FULL_SERRAMENTI_MODULES`; `src/lib/serramenti/quoteModel.ts`: `SR_OPERATIONAL_MODELS`; prodotti suggeriti in `src/lib/serramenti/modelCatalog.ts` |

Eccezione: `persiane` (serramenti) e `ripasso` (tetti) hanno il testo dentro il file del
motore, in un ramo `if (id !== …)`. **Non si usano come gemelli**: si sceglie un gemello
con il suo file.

I file `…InterventionCopy.ts` (scelte dell'editor dei modelli) si ricavano dai testi: non
si toccano.

### 2. Le registrazioni comuni (ogni motore)
1. **Area:** in `areas.ts`, una riga `intervention(id, titolo, riassunto, 4 campi)`.
2. **Copertina del catalogo:** in `fullModuleCatalog.ts`, `"<area>/<id>": "<foto>"`.
3. **Documenti:** in `moduleDocuments.ts`, la voce `"<area>/<id>"` in `INTERVENTION_LIMITS`.
4. **Tipo intervento** (solo motori edili: bagni, climatizzazione, elettrico,
   termoidraulico, pavimenti, piscine, ristrutturazione): in `src/lib/moduli/modelloPreventivo.ts`,
   `TIPO_INTERVENTO_DEL_MODELLO[<motore>][<id>]` con un valore **già usato** da quel motore.
5. **Audit:** in `src/test/audits/module68ContentAudit.ts`, l'id nell'elenco dell'area.
6. **Miniatura del selettore:** vedi Ricetta C.
7. **Migrazione:** il vincolo del modello coi nuovi id (tabella sotto).
8. **Impronte:** si aggiungono le impronte dei soli modelli nuovi
   (`IMPRONTE_NUOVE=1 npx vitest run src/test/logic/impronteModelli.test.ts`).
9. **Conteggi nei test:** `fullModuleCatalog`, `salesAreas`, `module68ContentAssetsAudit`,
   `moduleDocuments` (totale e `INTERVENTION_LIMITS`), `newQuoteDialog` (modelli per
   area), `tetQuoteModel` (preventivatori collegati), `modelliPreventivoModuliEdili`
   (legge l'ultima migrazione). Il test fallito dice il numero nuovo: si aggiorna **dopo**
   aver verificato che la differenza è quella del lotto.
10. **Prova:** i test del punto 9, `impronteModelli`, `contoTermico` e `fullElectric` se si
    tocca il termoidraulico, poi un PDF del modello più diverso dal gemello.

### 3. Tabelle e vincoli

| Motore (modulo) | Tabella | Vincolo del modello |
|---|---|---|
| ristrutturazione | `rst_progetti` | `rst_progetti_modello_valido` |
| termoidraulico | `idr_progetti` | `idr_progetti_modello_valido` |
| pavimenti | `pav_progetti` | `pav_progetti_modello_valido` |
| elettrico | `ele_progetti` | `ele_progetti_modello_valido` |
| tetti | `tet_progetti` | `tet_quote_model_snapshot_valid` |
| serramenti | `sr_progetti` | `sr_quote_model_snapshot_valid` |
| cappotto (Facciate) | nessuna: oggi senza preventivatore | – |

### 4. Il testo del modello
**Gli stessi campi del gemello, tutti riempiti.** Di solito sono:
- titolo (max 30 caratteri), riassunto di una frase e i 4 campi della scheda;
- copertina: titolo su due righe con una parte in *evidenza*, sottotitolo di una frase;
- perimetro: cosa è compreso e cosa no;
- «come funziona» e fasi: 4 voci ciascuno, titolo più una frase;
- 8 domande con risposta, tutte diverse, sui dubbi veri del cliente;
- 3 righe d'esempio del computo, con prezzi tondi verosimili;
- 3 «perché sceglierci» e 4 garanzie;
- foto di copertina, dettaglio e contesto (vedi Ricetta C).

## Ricetta B · Collegare un modello (o un'area) a un altro preventivatore

Serve per le aree nuove (Pareti e soffitti, Pergole e tende, Giardini) e per le Facciate.

1. **Area nuova:** in `areas.ts` una nuova area con `sourceModule` uguale al modulo del
   preventivatore che la ospita (per esempio `"ristrutturazione"`). Funziona dopo il Lotto
   0, che fa vedere a un preventivatore **tutte** le aree col suo modulo.
2. **Id unici nel preventivatore:** l'id non deve esistere in nessun'altra area dello
   stesso modulo (per esempio `tinteggiatura-interna`, non `tinteggiatura`, che è già delle
   Facciate).
3. **Il testo si scrive nel formato del preventivatore che ospita**: il gemello è un
   modello di quel preventivatore. Il modello di un'altra area serve solo come spunto per
   i contenuti, da **ricopiare**, mai da collegare (regola d'oro, punto 1).
4. Poi tutte le registrazioni della Ricetta A per quel preventivatore.
5. **Accesso:** il modello lo vede chi ha il modulo del preventivatore che lo ospita (piano
   o add-on). Va scritto nel riassunto a Florin.

## Ricetta C · Le immagini

### Di un modello nuovo
- **Miniatura del selettore:** `public/quote-picker/<area>-<id>.webp`, 480×720, sotto i
  90 KB. Si ritaglia da una foto esistente, senza toccare l'originale:
  ```python
  from PIL import Image
  im = Image.open(sorgente).convert("RGB"); w, h = im.size; nw = round(h * 2 / 3)
  x = (w - nw) // 2 + spostamento  # spostamento: 0, o i pixel per centrare il soggetto
  im.crop((x, 0, x + nw, h)).resize((480, 720), Image.LANCZOS).save(destinazione, "WEBP", quality=72, method=6)
  ```
  Poi si guarda una volta la miniatura prima di pubblicarla.
- **Copertina del catalogo:** il percorso in `fullModuleCatalog.ts`.
- **Foto dentro il documento:** i campi foto della voce del modello (copertina, dettaglio,
  contesto, foto dei blocchi) puntano a file già esistenti in `public/pdf-stock/<area>/`,
  `public/module-art/` o `public/cover-stock/`.
- **Foto nuove:** a fine lotto si aggiungono i prompt alla pagina «Immagini listino
  standard» (https://claude.ai/artifact/21XGqPakhasvDHFRPuz5EB: la si legge con Artifact
  `read` e la si ripubblica allo stesso URL), nel formato delle sezioni Conto Termico e
  Casa Full Electric. Quando Florin le manda: si controllano (vedi sotto), si salvano come
  file **nuovi** in `public/pdf-stock/<area>/<nome>.jpg` (lato lungo 1600 px, JPEG
  qualità 80) e si cambia il percorso **solo** nel modello nuovo.

### Del listino (prodotti e tipologie)
Procedura collaudata il 26/09/2026 su Demo Azienda 2.
- **Controllo:** ogni file si apre per intero (`Image.open(p).load()`). Gli zip possono
  passare il controllo CRC e contenere foto tagliate: quelle si rimandano a Florin.
- **Conversione:** prodotti 800×800 su fondo bianco, WebP qualità 80; tipologie 1600×900,
  WebP qualità 72. Nome: lo slug del nome (minuscolo, senza accenti, trattini),
  `tipologia-<slug>` per le tipologie.
- **Cartella:** `public/templates/<area>/products/`. Stando nel progetto, le copie dei
  modelli di area non perdono le foto se l'azienda d'origine le cancella.
- **Ordine:** prima il push delle foto e il controllo che rispondano online, poi il
  database.
- **Database:** abbinamento per slug del nome dentro la tipologia giusta; si scrive
  `article_families.immagine_url` / `listino_macrocategorie.immagine_url` **solo dove è
  vuoto**, in un'unica transazione. Prima una prova a vuoto che conta abbinati e non
  abbinati.

## Lotti

### Lotto 0 · Preparazione (mezza sessione, nessuna migrazione)
1. **Aree nuove sopra un motore esistente.** Oggi `interventiDelModulo`
   (`src/lib/moduli/modelloPreventivo.ts`) usa `SALES_AREAS.find` sul `sourceModule`, quindi
   vede una sola area per modulo. Deve prendere tutte le aree di quel modulo. Stesso
   controllo sugli altri `find` per `sourceModule` (`NewQuoteDialog.tsx`,
   `ModuleTemplateLibrary.tsx`, `quoteBuilders.ts`, `modulePhotography.ts`). Test: un'area
   di prova sul modulo `ristrutturazione` compare nel selettore e apre il preventivatore
   Ristrutturazioni col modello giusto.
2. **Impronte dei modelli:** `src/test/logic/impronteModelli.test.ts` con
   `src/test/fixtures/impronteModelli.json`. Per ogni modello `"<area>/<id>"` l'impronta è
   il `contentSha256` di `inspectModule68(area, id)` (`src/test/audits/module68ContentAudit.ts`).
   Il test confronta tutte le impronte salvate; con `IMPRONTE_NUOVE=1` **aggiunge solo
   quelle mancanti**, mai cambia quelle esistenti. Prova: cambiare per finta un testo del
   gemello fa diventare rosso il test.
3. **Verifica delle tabelle** di questo file (motori, file, vincoli) e correzione se serve.

### Lotto 1 · Serramenti: il documento che si compone da solo (nessun testo nuovo)
- Chi vende sceglie il modello principale e aggiunge i prodotti come oggi. Il PDF legge le
  righe (`SrSerramentoRow.tipologia`) e gli accessori (`SrAccessorioRow.tipo`). Per ogni
  famiglia presente oltre al modello principale aggiunge **il suo capitolo**, preso dai
  testi di quel modello **in sola lettura**: cosa è, le scelte, una foto, 2-3 domande, la
  garanzia. Le pagine comuni restano una volta sola. Il titolo si compone: «Finestre,
  persiane e zanzariere».
- Famiglie → modelli: finestre e portefinestre → `finestre`; persiane e scuri →
  `persiane`; tapparelle, cassonetti e motori → `avvolgibili`; zanzariere → `zanzariere`;
  porte d'ingresso e blindate → `porte-ingresso`; porte interne → `porte-interne`. Una sola
  funzione pura (`famiglieDelPreventivo`) con i suoi test.
- Nel passo PDF un interruttore per ogni capitolo, acceso di serie; se possibile va
  salvato in un campo JSON già esistente del preventivo.
- Tocca il PDF serramenti, che è condiviso: si confronta il testo del PDF di un preventivo
  **senza** prodotti aggiunti prima e dopo, e deve restare identico.
- Prova su 3 combinazioni: finestre + tapparelle; finestre + persiane + zanzariere; solo
  porta d'ingresso.

### Lotto 2 · Pareti e soffitti (area nuova `pareti-soffitti`, motore ristrutturazione)
Titolo dell'area: «Pareti e soffitti», riassunto: «Pittura, carta da parati, cartongesso e
risanamento delle pareti.»

| id | Titolo | Gemello | Spunti da ricopiare da |
|---|---|---|---|
| `tinteggiatura-interna` | Tinteggiatura interna | ristrutturazione/parziale | facciate/tinteggiatura |
| `carta-da-parati` | Carta da parati | ristrutturazione/parziale | pavimenti/pareti |
| `cartongesso` | Pareti in cartongesso | ristrutturazione/spazi | – |
| `controsoffitti` | Controsoffitti e velette | ristrutturazione/spazi | – |
| `decorativi` | Finiture decorative | ristrutturazione/parziale | pavimenti/resina |
| `umidita` | Umidità e muffa | ristrutturazione/parziale | facciate/riparazioni |
| `acustica` | Isolamento acustico | ristrutturazione/parziale | facciate/interno |

### Lotto 3 · Pergole e tende (area nuova `pergole`, motore ristrutturazione)
Per usarli serve il modulo Ristrutturazioni. Le foto di serie si prendono da
`public/pdf-stock/pergole/`.

| id | Titolo | Gemello |
|---|---|---|
| `pergola-bioclimatica` | Pergola bioclimatica | ristrutturazione/parziale |
| `pergola-telo` | Pergola con telo | ristrutturazione/parziale |
| `tende-sole` | Tende da sole | ristrutturazione/parziale |
| `vetrate` | Vetrate e chiusure balcone | ristrutturazione/parziale |
| `carport` | Carport e tettoie | ristrutturazione/parziale |

### Lotto 4 · Ristrutturazioni (+5, motore ristrutturazione)
| id | Titolo | Gemello | Spunti da ricopiare da |
|---|---|---|---|
| `cucina` | Rifacimento cucina | ristrutturazione/parziale | – |
| `sottotetto` | Mansarda e sottotetto | ristrutturazione/completa | tetti/isolamento |
| `aperture-portanti` | Aperture nei muri portanti | ristrutturazione/spazi | – |
| `condominio` | Parti comuni del condominio | ristrutturazione/commerciale | – |
| `montascale` | Montascale e piattaforme | ristrutturazione/parziale | bagni/accessibilita |

### Lotto 5 · Tetti (+3, motore tetti)
Per l'amianto gli obblighi (piano di lavoro, ditta abilitata) si scrivono solo dalla fonte
ufficiale letta nella sessione.

| id | Titolo | Gemello |
|---|---|---|
| `amianto` | Bonifica amianto | tetti/rifacimento |
| `linea-vita` | Linea vita | tetti/riparazioni |
| `lucernari` | Lucernari e finestre per tetti | tetti/isolamento |

### Lotto 6 · Elettrico (+4, motore elettrico)
| id | Titolo | Gemello |
|---|---|---|
| `antifurto` | Antifurto e videosorveglianza | elettrico/videocitofonia |
| `illuminazione` | Illuminazione | elettrico/punti |
| `automazioni` | Cancelli e portoni automatici | elettrico/domotica |
| `rete-dati` | Rete dati e antenna | elettrico/punti |

### Lotto 7 · Termoidraulica (+3, motore termoidraulico)
| id | Titolo | Gemello |
|---|---|---|
| `pellet` | Stufe e caldaie a pellet | termoidraulica/caldaia |
| `solare-termico` | Solare termico | termoidraulica/acqua-calda |
| `trattamento-acqua` | Trattamento dell'acqua | termoidraulica/idrico |

### Lotto 8 · Pavimenti (+3, motore pavimenti)
| id | Titolo | Gemello |
|---|---|---|
| `posa-parquet` | Posa parquet | pavimenti/sovrapposizione |
| `scale` | Rivestimento scale | pavimenti/pareti |
| `levigatura` | Levigatura marmo e cotto | pavimenti/parquet |

### Lotto 9 · Serramenti (+2, motore serramenti; prima un modello solo di prova)
Le due famiglie nuove vanno aggiunte anche alla mappa del Lotto 1.

| id | Titolo | Gemello |
|---|---|---|
| `portoni-garage` | Portoni garage | serramenti/porte-ingresso |
| `grate` | Grate e inferriate | serramenti/zanzariere |

### Lotto 10 · Facciate col preventivatore (motore ristrutturazione; prima una prova)
1. **Prova:** l'area Facciate si collega al motore Ristrutturazioni con la Ricetta B,
   portando il modello `cappotto` nel formato di `fullRstModules.ts`. I testi si
   **ricopiano** da `fullFacModules.ts`, che non si tocca: i documenti delle Facciate di
   oggi devono restare identici. Se il documento Ristrutturazioni non regge le pagine delle
   Facciate, **ci si ferma e si riferisce a Florin**: l'alternativa è clonare un
   preventivatore, che costa molto di più.
2. Se la prova regge si portano gli altri 5 modelli (`rifacimento`, `balconi`,
   `tinteggiatura`, `interno`, `riparazioni`) e si aggiungono i 3 nuovi:

| id | Titolo | Gemello |
|---|---|---|
| `ventilata` | Facciata ventilata | facciate/cappotto |
| `pietra` | Rivestimenti in pietra e listelli | facciate/rifacimento |
| `pulizia` | Pulizia e protezione facciate | facciate/riparazioni |

3. Onboarding: il settore `facciatisti` oggi punta al modulo `cappotto`
   (`OnboardingVertical.tsx`): va allineato al nuovo motore.

### Lotto 11 · Giardini (area nuova `giardini`, motore pavimenti; solo se Florin conferma)
| id | Titolo | Gemello |
|---|---|---|
| `giardino` | Realizzazione giardino | pavimenti/esterni |
| `verde` | Manutenzione del verde | pavimenti/esterni |
| `irrigazione` | Impianto di irrigazione | pavimenti/esterni |
| `recinzioni` | Recinzioni e cancelli | pavimenti/esterni |

## Prompt pronti

Da incollare in una sessione nuova, uno per volta.

**Lotto 0**
```
Esegui il Lotto 0 del piano in "/Users/florinandriciuc/Edilizia in Cloud/docs/piano-modelli-preventivo.md". Leggi solo quel file (Regola d'oro, Regole, Lotto 0) e i punti da modificare. Worktree da origin/main. Alla fine: test mirati, test:critical, typecheck:ci, push su main, aggiorna la tabella Stato del piano. Riassunto finale in 5 righe.
```

**Lotto 1**
```
Esegui il Lotto 1 del piano in "/Users/florinandriciuc/Edilizia in Cloud/docs/piano-modelli-preventivo.md". Leggi solo quel file e i punti da modificare del PDF serramenti. Nessun testo nuovo: il capitolo di ogni famiglia viene dai testi del suo modello, in sola lettura. Confronta il PDF senza prodotti aggiunti prima e dopo, poi prova le 3 combinazioni del lotto. Test, impronte, typecheck, push, tabella Stato. Riassunto finale in 5 righe.
```

**Lotti 2-11** (sostituire N)
```
Esegui il Lotto N del piano in "/Users/florinandriciuc/Edilizia in Cloud/docs/piano-modelli-preventivo.md". Leggi solo quel file e, per ogni modello, il suo gemello. Rispetta la Regola d'oro: ogni modello nuovo è una copia a sé, gemello e pezzi condivisi non si toccano. Segui la Ricetta A (e la B per le aree nuove), le immagini con la Ricetta C: una migrazione, test, impronte, un PDF di prova, typecheck, push. Aggiungi i prompt delle foto nuove alla pagina immagini e aggiorna la tabella Stato. Riassunto finale in 5 righe.
```

**Ripresa** (sessione interrotta)
```
Riprendi il Lotto N del piano in "/Users/florinandriciuc/Edilizia in Cloud/docs/piano-modelli-preventivo.md". Guarda la tabella Stato, `git log origin/main` e il registro delle migrazioni per capire cosa è già fatto, poi continua dalla ricetta dal punto mancante.
```

## Fatto, per ogni lotto
- [ ] Modelli nel selettore con miniatura e copertina.
- [ ] Nessun altro modello cambiato: `impronteModelli` verde senza aver toccato impronte esistenti.
- [ ] PDF di prova senza `NaN`/`undefined`/`null`, con la firma e i testi del modello.
- [ ] Migrazione applicata, riallineata e col suo file pubblicato; Supabase Preview verde.
- [ ] Test mirati, `test:critical` e `typecheck:ci` verdi; CI verde; codice online.
- [ ] Prompt delle foto nella pagina immagini; tabella Stato aggiornata.
