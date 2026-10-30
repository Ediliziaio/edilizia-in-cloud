# Planimetrie — il modello (contratto fra le fasi)

Questo documento è il **contratto** su cui lavorano editor (fase 2), generazione AI
(fase 3), computo (fase 4), 3D (fase 5a), render (fase 5b) ed esportazioni (fase 6).
Piano generale: [`docs/superpowers/specs/2026-10-30-planimetrie-design.md`](../superpowers/specs/2026-10-30-planimetrie-design.md).

Chi cambia il modello aggiorna qui, nei test e — se cambia la forma del documento —
`VERSIONE_SCHEMA` (vedi «Cambiare lo schema»).

| File | Cosa fa |
|---|---|
| `shared/planimetrie/modello.ts` | tipi, `validaPlanimetria`, `nuovaPlanimetria`, ambiti, origine delle misure |
| `shared/planimetrie/geometria.ts` | aree, perimetri, `ricostruisciLocali` (dai muri ai locali), `apertureDelLocale` |
| `shared/planimetrie/controllo.ts` | `controllaPlanimetria`: pareti, locali, aperture; messaggi in italiano |
| `shared/planimetrie/quantita.ts` | `calcolaQuantita`: quantità per il computo con chiavi stabili |
| `shared/planimetrie/esempi/*.json` | bilocale e trilocale (con proposta A): banco di prova comune |
| `src/lib/planimetrie/archivio.ts` | lettura e salvataggio dal browser, hook React Query |
| `supabase/migrations/20281030260000_planimetrie_base.sql` | tabelle, versioni, file, colonne nel computo (**non ancora applicata**) |

I file in `shared/` non hanno dipendenze e importano con l'estensione `.ts`: li usano
sia il frontend (Vite) sia le edge function (Deno), come gli altri `shared/`.
Per questo il validatore è scritto a mano e non con zod (le edge non hanno zod).

## Il documento

Una pianta è un JSON di **oggetti che sanno cosa sono** (pareti, porte, locali), non di
linee. Le linee sono un'uscita (DXF, PDF, SVG).

```
Planimetria { schema: 1, unita: "cm", titolo?, scala?, nord?, riferimenti?, livelli[] }
 └─ Livello { id, nome, quota, fatto: StatoPianta, proposte: Proposta[] }
     StatoPianta { muri[], aperture[], locali[], elementi[], quote[], testi[] }
     Proposta = StatoPianta + { id: "A", nome }
```

### Convenzioni (da rispettare tutti)

- **Centimetri** ovunque nel documento. Le quantità escono in m, mq, mc.
- **Coordinate con y verso l'alto** (come il DXF). Chi disegna sullo schermo capovolge y.
- **Muro** = segmento d'**asse** da `p1` a `p2`; lo `spessore` è metà per parte.
  `altezza` dal pavimento al solaio. `tipo`: `esterno` | `portante` | `tramezzo`.
  Due muri sono collegati se il capo dell'uno sta sull'asse dell'altro o dentro il suo
  spessore (angolo, T, croce: non serve spezzarli a mano).
- **Apertura** = vano in un muro (`muroId`). Va da `offset` a `offset + larghezza`,
  misurati **sull'asse dal p1** del muro. `altezza` del vano, `davanzale` (0 per porte,
  portefinestre e varchi). `tipo`: `porta` | `finestra` | `portafinestra` | `varco`.
  `manovra`: `battente` | `scorrevole` | `nessuna`. `verso` (solo battenti):
  `cardine` = verso quale capo del muro stanno le cerniere (`p1` o `p2`);
  `lato` = da che parte si apre l'anta guardando da p1 a p2 (`sinistra` | `destra`).
- **Locale** = poligono al **filo interno** delle pareti (`contorno`, almeno 3 punti,
  verso qualunque), `altezza`, `destinazione` (soggiorno, cucina, camera, bagno,
  ingresso, disimpegno, corridoio, ripostiglio, studio, lavanderia, balcone, terrazzo,
  garage, cantina, altro), `finiture` facoltative (`pavimento`, `pareti`, `soffitto`
  come testo; `rivestimento: { materiale?, altezza }` per bagni e cucine).
- **Elemento** = simbolo o arredo: `tipo` libero (catalogo dei simboli: fase 2;
  negli esempi `wc`, `lavabo`, `doccia`, `vasca`, `letto_matrimoniale`, `letto_singolo`,
  `divano`, `cucina_lineare`), `posizione` = centro, `rotazione` in gradi antiorari,
  `larghezza` × `profondita` (× `altezza` facoltativa), `localeId` facoltativo.
- **Quota** = da `p1` a `p2`, il valore è sempre la distanza (non si scrive a mano);
  `scostamento` = distanza della linea di quota, positiva a sinistra di p1→p2.
- **Testo** = `posizione`, `testo`, `rotazione` facoltativa.
- **Id**: solo lettere, cifre, `-`, `_` (finiscono nelle chiavi delle quantità);
  unici dentro lo stesso stato **su tutti i livelli**. Gli UUID vanno bene.
  Gli id delle proposte sono brevi (`A`, `B`).

### Stato di fatto e proposte

- `livello.fatto` contiene solo oggetti `stato: "esistente"`.
- Ogni proposta è lo **stato di progetto completo**: muri e aperture che restano
  (`esistente`, **con lo stesso id** che hanno nel fatto), quelli `da_demolire` e quelli
  `nuovo`; i locali sono quelli **dopo** i lavori. Così editor, 3D ed esportazioni
  disegnano una proposta come qualunque altro stato, senza ricostruire differenze; il
  confronto fatto/progetto si fa per id. Convenzione dei colori: giallo = da demolire,
  rosso = nuovo.
- `ambitiDi(p)` dà gli stati su cui si lavora: `fatto` e `progetto:<id>`;
  `statoDelLivello(livello, ambito)` dà lo `StatoPianta` di un livello.
- In v1 l'interfaccia mostra una sola proposta, ma lo schema ne regge quante si vuole.

### Origine delle misure

Ogni muro, apertura, locale ed elemento ha `origine`: `rilevata` (scritta o confermata
da una persona), `da_documento` (letta da un disegno in scala), `stimata` (dedotta
dall'AI). `origineMisure` la cambia campo per campo (`lunghezza`, `spessore`, `altezza`,
`contorno`, `offset`, `larghezza`, `davanzale`, `posizione`, `profondita`):

```json
{ "id": "a4", "origine": "rilevata", "origineMisure": { "larghezza": "stimata" } }
```

L'editor mostra diverse le misure stimate; quando una persona scrive o conferma una
misura, l'editor la porta a `rilevata`.

### Esempio minimo

Una camera 4,00 × 3,00 m al filo interno, pareti da 20 cm, una porta:

```json
{
  "schema": 1, "unita": "cm", "titolo": "Camera",
  "livelli": [{
    "id": "pt", "nome": "Piano terra", "quota": 0, "proposte": [],
    "fatto": {
      "muri": [
        { "id": "m1", "p1": {"x": 0,   "y": 0},   "p2": {"x": 420, "y": 0},   "spessore": 20, "altezza": 270, "tipo": "esterno", "stato": "esistente", "origine": "rilevata" },
        { "id": "m2", "p1": {"x": 420, "y": 0},   "p2": {"x": 420, "y": 320}, "spessore": 20, "altezza": 270, "tipo": "esterno", "stato": "esistente", "origine": "rilevata" },
        { "id": "m3", "p1": {"x": 420, "y": 320}, "p2": {"x": 0,   "y": 320}, "spessore": 20, "altezza": 270, "tipo": "esterno", "stato": "esistente", "origine": "rilevata" },
        { "id": "m4", "p1": {"x": 0,   "y": 320}, "p2": {"x": 0,   "y": 0},   "spessore": 20, "altezza": 270, "tipo": "esterno", "stato": "esistente", "origine": "rilevata" }
      ],
      "aperture": [
        { "id": "a1", "muroId": "m1", "tipo": "porta", "offset": 100, "larghezza": 80, "altezza": 210, "davanzale": 0,
          "manovra": "battente", "verso": { "cardine": "p1", "lato": "sinistra" }, "stato": "esistente", "origine": "rilevata" }
      ],
      "locali": [
        { "id": "l1", "nome": "Camera", "destinazione": "camera", "altezza": 270, "origine": "rilevata",
          "contorno": [{"x": 10, "y": 10}, {"x": 410, "y": 10}, {"x": 410, "y": 310}, {"x": 10, "y": 310}] }
      ],
      "elementi": [], "quote": [], "testi": []
    }
  }]
}
```

Esempi completi: `shared/planimetrie/esempi/bilocale.json` (3 locali, porte su pareti
diverse, rivestimento del bagno, arredi, quote) e `trilocale.json` (6 locali, proposta A:
si demolisce il tramezzo fra cucina e soggiorno e si ricava un ripostiglio con un tramezzo
nuovo). I test in `src/test/logic/planimetrieEsempi.test.ts` ne fissano le quantità.

## Controllo

`validaPlanimetria(dato)` controlla la **forma** (campi, tipi, misure positive, id unici,
versione dello schema) e dà `{ ok: true, planimetria }` o `{ ok: false, errori }`.

`controllaPlanimetria(p)` fa prima la validazione e poi la **geometria**, su ogni livello
e ogni stato. Ogni `Problema` ha `gravita` (`errore` | `avviso`), `codice`, `messaggio`
(italiano semplice, da mostrare così), `livelloId`, `ambito`, `oggettoId` (da evidenziare).

| Codice | Gravità | Quando |
|---|---|---|
| `forma_non_valida` | errore | il documento non rispetta lo schema |
| `parete_senza_lunghezza` | errore | p1 e p2 coincidono |
| `parete_staccata` | avviso | un capo non tocca nessun'altra parete |
| `pareti_sovrapposte` | errore | due pareti sulla stessa retta che si coprono |
| `locale_senza_area` | errore | contorno piatto |
| `locale_contorno_incrociato` | errore | il contorno attraversa sé stesso |
| `locale_non_chiuso` | avviso | ci sono pareti ma nessuna chiude il locale |
| `apertura_senza_parete` | errore | `muroId` inesistente |
| `apertura_fuori_parete` | errore | `offset + larghezza` oltre la lunghezza del muro |
| `aperture_sovrapposte` | errore | due vani che si coprono nella stessa parete |
| `apertura_troppo_alta` | avviso | davanzale + altezza oltre l'altezza della parete |
| `apertura_senza_locale` | avviso | il vano non dà su nessun locale |

**Regola:** una pianta che arriva dall'AI o da un'importazione si salva solo se
`haErrori(controllaPlanimetria(p))` è falso. L'editor può salvare bozze con avvisi.

### Ricostruire i locali dai muri

`ricostruisciLocali(muri)` restituisce i contorni chiusi dai muri (escluse le pareti da
demolire), già al filo interno: grafo degli assi spezzato agli incroci, rami morti tolti,
facce, lati spostati verso l'interno di mezzo spessore. L'editor la usa per «le stanze si
chiudono da sole» quando si disegnano le pareti; il controllo per `locale_non_chiuso`.
Limiti: un pilastro isolato dentro una stanza non si sottrae; due muri allineati di
spessore diverso danno un piccolo gradino nel contorno.

`apertureDelLocale(locale, stato)`: i vani con una faccia sul contorno del locale (entro
2 cm). Una porta fra due stanze appartiene a tutte e due.

## Quantità

`calcolaQuantita(p, opzioni?)` → `Record<chiave, Quantita>`:

```ts
{ chiave, valore, unita: "mq" | "ml" | "mc" | "n", origine, descrizione, ambito, livelloId?, oggettoId? }
```

`descrizione` è pronta per la riga del computo («Pavimento — Bagno», «… (Proposta A)»).
Valori arrotondati a 4 decimali, come le righe di misura del computo.

### Chiavi

Forma: `<ambito>:<soggetto>.<misura>`, ambito `fatto` o `progetto:<id proposta>`.
`leggiChiave(chiave)` la scompone. **Una chiave non cambia mai nome**: i computi salvati
la cercano.

| Soggetto | Misure | Note |
|---|---|---|
| `locale:<id>` | `pavimento_mq`, `perimetro_ml`, `pareti_lorde_mq`, `pareti_nette_mq`, `soffitto_mq`, `volume_mc`, `battiscopa_ml`, `rivestimento_mq` | rivestimento solo se il locale ne ha uno |
| `destinazione:<destinazione>` | come i locali | somma dei locali di quella destinazione |
| `pianta` | come i locali | somma di tutti i locali di tutti i livelli |
| `muro:<id>` | `lunghezza_ml`, `superficie_mq`, `volume_mc` | ogni parete, in ogni stato |
| `demolizioni` | `muri_ml`, `muri_mq`, `muri_mc` | solo nelle proposte: pareti `da_demolire` |
| `costruzioni` | `muri_ml`, `muri_mq`, `muri_mc` | solo nelle proposte: pareti `nuovo` |
| `aperture:<stato>:<tipo>` | `numero` | es. `aperture:nuovo:porta` |
| `aperture:<stato>:<tipo>:<L>x<H>` | `numero` | larghezza × altezza in cm, es. `aperture:esistente:finestra:120x140` |

Esempi: `fatto:locale:l3.rivestimento_mq`, `progetto:A:demolizioni.muri_mq`,
`progetto:A:locale:zona_giorno.pavimento_mq`. «Pavimento da demolire» legge il fatto,
«pavimento nuovo» legge il progetto.

### Regole di misura

- Locali al **filo interno**: pavimento = soffitto = area del contorno; perimetro del
  contorno; volume = area × altezza.
- **Pareti lorde** = perimetro × altezza del locale.
- **Pareti nette** = lorde meno i vuoti di superficie **superiore** alla soglia, per
  intero. Soglia predefinita **4 mq**, come nei capitolati e nei prezzari regionali
  («vuoto per pieno, dedotti i vani di superficie superiore a 4 mq»). Opzioni:
  `{ sogliaDeduzioneMq: 0 }` detrae tutto; `{ deduzione: "eccedenza" }` detrae solo la
  parte oltre la soglia, per i capitolati che la chiedono. Del vano conta solo la parte
  dentro l'altezza misurata (una portafinestra alta 3 m in un locale di 2,70 conta 2,70).
- **Rivestimento** = perimetro × altezza del rivestimento, stessa regola dei vuoti sulla
  sola fascia rivestita.
- **Battiscopa** = perimetro meno la larghezza dei vani a filo pavimento (davanzale 0).
- **Pareti (muri)** sull'asse: lunghezza × altezza meno i vuoti oltre soglia; volume =
  superficie × spessore. Negli angoli l'asse conta due volte mezzo spessore: è
  l'approssimazione usuale; per una misura vuoto per pieno al filo esterno serve una
  chiave nuova, non cambiare questa.
- Nei progetti, pareti e vani `da_demolire` non contano per i locali.
- **Origine**: ogni quantità prende la peggiore fra le misure usate (stimata >
  da_documento > rilevata). Il pavimento usa solo il contorno; volume e pareti anche
  l'altezza; pareti nette, rivestimento e battiscopa anche le misure dei vani.
  Il computo avvisa quando usa quantità stimate.

## Archivio e database

Migrazione `20281030260000_planimetrie_base.sql` — **pronta, non applicata**.
Prima di unire questo ramo a `main` va applicata con `apply_migration` e riallineata
(CLAUDE.md): un file in `supabase/migrations/` va in produzione al primo push.
Non è stata eseguita su nessun database: prima di applicarla conviene provarla in una
transazione annullata.

- `planimetrie` — azienda, titolo, descrizione, `stato` (`bozza` | `in_uso` |
  `archiviata`), collegamenti facoltativi (`order_id` commessa, `quote_id` preventivo,
  `computo_upload_id` computo, `survey_id` sopralluogo, `contact_id` contatto),
  `versione_corrente`, `deleted_at` (si cancella così).
- `planimetrie_versioni` — `numero` (1, 2, 3… per pianta), `schema_versione`,
  `documento` (questo JSON, max 5 MB), `quantita` (la mappa di `calcolaQuantita`, cache),
  `origine` (`manuale` | `ai_pdf` | `ai_foto` | `ai_schizzo` | `ai_testo` | `sopralluogo` |
  `importazione`), `nota`. **Non si modifica e non si cancella**: si aggiunge.
- `planimetrie_file` — sorgenti ed esportazioni nel contenitore privato `planimetrie`,
  percorso `<azienda>/<pianta>/<file>`; `ruolo` (`sorgente` | `esportazione` |
  `anteprima`), `formato` (pdf, png, jpg, webp, heic, svg, dxf, dwg, glb, gltf, obj),
  `versione` da cui nasce un'esportazione.
- `computo_voci_misure` — `planimetria_id`, `planimetria_versione`, `planimetria_chiavi`
  (array di chiavi sommate nella riga). Una pianta usata dal computo non si può
  cancellare davvero (si archivia).
- RPC `planimetria_crea(...)` e `planimetria_salva_versione(p_planimetria_id, p_documento,
  p_quantita, p_origine, p_nota, p_versione_attesa)`: numero di versione e versione
  corrente insieme. Con `p_versione_attesa` un salvataggio non sovrascrive quello di un
  altro (errore `40001`). `SECURITY INVOKER`: valgono le regole delle tabelle.
- Accesso: tutta l'azienda; niente clienti esterni, niente utenti bloccati, niente
  scritture per chi è in sola lettura; niente ad anon. Ogni collegamento deve essere
  della stessa azienda (trigger).

Dal browser (`src/lib/planimetrie/archivio.ts`):

| Funzione / hook | Chiave React Query |
|---|---|
| `elencaPlanimetrie(companyId, filtro)` / `useElencoPlanimetrie` | `["planimetrie","elenco",companyId,filtro]` |
| `caricaPlanimetria(id)` → `{ riga, versione }` / `usePlanimetria` | `["planimetrie","dettaglio",id]` |
| `elencaVersioni(id)` / `useVersioniPlanimetria` | `["planimetrie","versioni",id]` |
| `caricaVersione(id, numero)` / `useVersionePlanimetria` | `["planimetrie","versione",id,numero]` |
| `creaPlanimetria` / `useCreaPlanimetria` | invalida l'elenco |
| `salvaNuovaVersione` / `useSalvaVersionePlanimetria` | invalida dettaglio, versioni, elenco |
| `aggiornaDatiPlanimetria` / `useAggiornaDatiPlanimetria` | invalida dettaglio ed elenco |

Creazione e salvataggio validano il documento e ricalcolano le quantità prima di
scrivere; la lettura valida il documento prima di darlo all'editor. Gli errori escono già
in italiano (`messaggioErrorePlanimetria`).

## Come lo usa ogni fase

- **Editor (fase 2, `src/components/planimetrie/editor`)**: tiene in memoria una
  `Planimetria`, la modifica, mostra `controllaPlanimetria` evidenziando `oggettoId`,
  chiude le stanze con `ricostruisciLocali`, salva con `useSalvaVersionePlanimetria`
  passando `versioneAttesa`. Capovolge y per lo schermo.
- **Generazione AI (fase 3, `supabase/functions/planimetria-genera`)**: chiede al modello
  un JSON di questo schema, segna `stimata` ciò che deduce e `da_documento` ciò che legge
  in scala, poi `controllaPlanimetria` e salva solo senza errori (`origine: ai_pdf` …).
  Import: `../../../shared/planimetrie/controllo.ts`.
- **Computo (fase 4)**: «Prendi dalla pianta» crea righe di `computo_voci_misure` con
  `quantita = Σ valore` delle chiavi, `descrizione` dalla quantità, e le tre colonne della
  pianta. Se `versione_corrente` > `planimetria_versione` ricalcola le stesse chiavi sulla
  versione nuova e mostra il confronto. Computo contrattuale: perizia di variante, non
  aggiornamento. Da fare in quella fase: la copia delle righe in variante
  (`20281023053000_computo_contrattuale_bloccato_e_varianti.sql`) non copia ancora le tre
  colonne nuove.
- **3D (fase 5a, `src/lib/planimetrie/tred`)**: ogni muro è un prisma lungo l'asse
  (spessore, altezza) con i vani da `offset/larghezza/davanzale/altezza`; pavimenti dai
  contorni dei locali alla `quota` del livello; elementi come blocchi
  `larghezza × profondita × altezza`.
- **Render (fase 5b)**: misure del locale da `calcolaQuantita`, vani da
  `apertureDelLocale` con il muro e il lato.
- **Esportazioni (fase 6, `src/lib/planimetrie/esporta`)**: disegnano lo stato scelto;
  layer per muri / aperture / quote / testi; colori giallo (da demolire) e rosso (nuovo);
  tabella dei locali dalle quantità. File in `planimetrie_file` con `ruolo: esportazione`.

## Cambiare lo schema

`VERSIONE_SCHEMA` è `1`. Un campo **facoltativo** nuovo non cambia la versione (il
validatore lascia passare i campi che non conosce). Un cambio che rompe i documenti
salvati (un campo che cambia significato, un'unità diversa) porta la versione a 2 e
aggiunge in `modello.ts` una funzione che porta un documento v1 a v2 prima della
validazione; le versioni vecchie nel database non si riscrivono. Un documento con una
versione più nuova di quella del programma viene rifiutato con «ricarica la pagina».
