# Planimetrie — il render AI dalla pianta (fase 5b)

Piano: [`../superpowers/specs/2026-10-30-planimetrie-design.md`](../superpowers/specs/2026-10-30-planimetrie-design.md)
(«Scelte» 6 e 7). Modello: [`modello.md`](modello.md). 3D e fotogramma: [`3d.md`](3d.md).

## Cosa vede l'utente

```
Render AI ─► Planimetrie ─► elenco piante + «Nuova pianta» (Disegna · Carica PDF o foto · Descrivi a parole)
                 └─► una pianta ─► stanze (pianta della stanza, misure, «Misure stimate»)
                         │         «Guarda in 3D», «Modifica la pianta», render già fatti
                         └─► «Fai il render di questa stanza»
                               1. Da dove parti: vista 3D (dentro la stanza, si sceglie l'inquadratura) o foto
                               2. Stile e materiali (StanzaConfigForm, come il render stanza)
                               3. Attesa  4. Risultato: prima/dopo, scarica, salva in galleria, altra variante
```

| Indirizzo | Pagina |
|---|---|
| `/azienda/render/planimetrie` | `RenderPlanimetrieHub` |
| `/azienda/render/planimetrie/:id` | `RenderPlanimetriaScheda` |
| `/azienda/render/planimetrie/:id/stanza/:localeId?livello=&ambito=` | `RenderPlanimetriaStanza` |
| `/azienda/render/planimetrie/nuova?da=disegno\|documento\|testo` | `RenderPlanimetriaNuova` (editor vuoto, o pianta dall'AI da controllare) |
| `/azienda/render/planimetrie/:id/modifica` | `RenderPlanimetriaModifica` (editor sulla versione corrente) |

Gli indirizzi stanno tutti in `src/lib/planimetrie/render/percorsi.ts`.

### Editor e generazione con l'AI (fasi 2 e 3)

- **Disegna** (`nuova?da=disegno`): editor vuoto; al primo «Salva» si chiede il nome e si
  crea la pianta (`planimetria_crea`), poi si va alla scheda.
- **Carica PDF o foto / Descrivi a parole** (`nuova?da=documento|testo`): il file (o il
  testo) va a `planimetria-genera`; la pianta torna già controllata e si apre nell'editor
  con le misure stimate in viola e gli avvisi della funzione. Se la scala è da confermare
  (disegno senza quote) si scrive una misura vera di una stanza e tutta la pianta si
  adegua. Si salva con l'origine indicata dalla funzione (`ai_pdf`, `ai_foto`,
  `ai_schizzo`, `ai_testo`). Crediti finiti o funzione che non risponde: una frase
  semplice e «Disegnala a mano».
- **Modifica la pianta** (`/:id/modifica`): editor sulla versione corrente; «Salva»
  aggiunge una versione con `planimetria_salva_versione` e la versione attesa. Se
  qualcun altro ha salvato nel frattempo, niente sovrascrittura: un avviso e «Ricarica».

Logica in `src/components/planimetrie/editor/salvataggio.ts` e `generazione.ts`, provata
in `src/test/logic/planimetrieEditorSalvataggio.test.ts`.

## Come funziona il render

Il render è una normale sessione **render stanza** (`render_stanza_sessions`,
`generate-room-render`): crediti, rimborsi, galleria e QA sono quelli di sempre.
La pianta entra da `config.planimetria`:

```json
{ "planimetria_id": "…", "versione": 3, "livello_id": "pt", "ambito": "fatto", "locale_id": "l1",
  "locale_nome": "Soggiorno", "partenza": "vista_3d",
  "inquadrate": [{ "id": "a1", "posizione": "sinistra", "riquadro": { "x0": 0.05, "y0": 0.2, "x1": 0.25, "y1": 0.8 } }],
  "pianta_path": "<azienda>/<ora>_pianta.png" }
```

`generate-room-render` (`pianta.ts`), **prima di scalare il credito**:
1. rilegge la pianta e la versione dal database (service role) e controlla che sia
   dell'azienda della sessione — le misure non arrivano dal browser;
2. calcola i vincoli della stanza con `shared/render-planimetria/vincoli.ts`: misure,
   pareti numerate (antiorarie dal lato più in basso), porte e finestre con nome stabile
   («Door 1», «Window 2»), parete e distanza dall'inizio parete, `stimata`;
3. tiene delle `inquadrate` solo le aperture che appartengono davvero alla stanza.

Poi nel prompt (`shared/render-planimetria/prompt.ts`):
- **partenza dal 3D**: in testa, «Image 1 non è una foto, è un modello grigio: fanne una
  foto della stessa stanza, stessa telecamera, porte e finestre dove sono i buchi»;
- **misure e aperture** in fondo; per la vista 3D anche *dove* sta ogni apertura
  nell'immagine (frazioni del fotogramma della fase 5a). Le misure stimate sono dette
  «approximately»: non si presentano come vere;
- **pianta della stanza** (`piantaStanza.ts`, SVG → PNG nel browser) come immagine di
  riferimento, se c'è posto (massimo 4 riferimenti: il catalogo dell'azienda ha la
  precedenza, uno slot è tolto ai riferimenti condivisi).

Il **QA visivo** (`callVisionQa`) riceve in più `plan_openings_mismatch`: quante aperture
ha la stanza, quali devono vedersi e dove (vista 3D); con la partenza 3D sa che i materiali
cambiano del tutto e giudica solo pareti, soffitto, telecamera e aperture. Se boccia, il
secondo tentativo riceve anche «porte e finestre come nella pianta».

`segnalaErroreAI`: nessun punto nuovo che chiama un provider; i provider passano da
`editImage` (`logImageError`) e `callOpenRouter`, già agganciati.

## Al push su main

- **Edge function deployate dalla CI**: solo `generate-room-render` (modificata: `index.ts`
  e il nuovo `pianta.ts`). Le modifiche sotto `shared/render-planimetria/` arrivano con lei
  perché `index.ts` è toccato. Senza `config.planimetria` il render stanza resta quello di prima.
- **Migrazione**: `20281030291000_render_stanza_dalla_pianta.sql` va applicata e
  riallineata (CLAUDE.md) prima del push, oppure tolta dalla cartella: un file lì entra in
  produzione al primo push.

## Database

`supabase/migrations/20281030291000_render_stanza_dalla_pianta.sql` (**non applicata**):
tre colonne su `render_stanza_sessions` (`planimetria_id`, `planimetria_versione`,
`planimetria_locale_id`) riempite da un trigger a partire da `config.planimetria`, con il
controllo che la pianta sia della stessa azienda. Pagine e funzione **non** ne hanno
bisogno (leggono il config): serve per cercare con un indice e per non perdere il legame
se la pianta viene cancellata.

## Prove

- `src/test/logic/planimetrieRender.test.ts`: vincoli sugli esempi della fase 1, prompt,
  QA, SVG; in `generate-room-render` la pianta si rilegge prima del credito.
- `src/test/logic/planimetrieRenderBrowser.test.ts`: indirizzi e tipo di stanza.
- Build, controllo dei tipi e prova nel browser: da fare sul ramo unito (non lanciati qui
  per la memoria della macchina). Controllo dei tipi Deno di `generate-room-render`: passato.
- Render veri: **non ancora provati** (nessuna chiave OpenRouter locale). Da fare dopo il
  deploy di `generate-room-render`: una stanza del bilocale di prova dalla vista 3D e una
  da foto, controllando nel log `qa_passed_first_attempt` / `qa_failed_retry_corrective`
  e in `config_snapshot.planimetria` cosa è stato mandato.
