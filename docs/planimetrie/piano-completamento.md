# Planimetrie — piano per arrivare al livello di AutoCAD (Architecture) dove serve a un'impresa

1/11/2026. Base: il confronto con le funzioni di AutoCAD, AutoCAD Architecture e MEP fatto in chat.
Il modello (`docs/planimetrie/modello.md`) regge già quasi tutto: muri, aperture, locali, elementi,
quote, testi, più livelli, più proposte. Quello che manca è soprattutto **interfaccia** e qualche
**uscita** nuova. Ogni fase si pubblica da sola, con test e controllo dei tipi verdi.

Regole di design per tutte le fasi (stesso linguaggio delle pagine Render AI):
- una barra degli strumenti sola, raggruppata (Disegna · Inserisci · Annota · Vista), icone + parola;
- il pannello a destra cambia con la selezione (stanza, parete, apertura, arredo, quota, testo);
- sul telefono si guarda e si corregge, non si disegna (come oggi);
- niente gergo CAD: «Ruota», «Specchia», «Copia», non «MIRROR»/«ARRAY»;
- ogni azione si annulla con Ctrl+Z; le misure si scrivono all'italiana («4,20», «420 cm»).

## Fase 1 — Esportare e allegare (codice pronto, manca il bottone)
- Scheda della pianta → «Esporta»: DXF a layer, PDF in scala (A4/A3, 1:20…1:500 o automatica,
  orizzontale/verticale, tecnico o presentazione), SVG, PNG; stato: com'è oggi / progetto / confronto.
- Cartiglio con i dati e il logo dell'azienda.
- Il file esportato si scarica subito.

## Fase 2 — Abaco dei serramenti e delle stanze (AutoCAD Architecture §11-12)
- Scheda → «Abachi»: elenco porte e finestre (codice P1/F1…, tipo, manovra, larghezza × altezza,
  davanzale, stanza, stato: esistente/nuovo/da demolire), elenco stanze (mq, perimetro, pareti nette,
  altezza, volume, finiture).
- Esportazione in Excel (CSV) e in PDF; codici stabili nel documento.

## Fase 3 — Arredi e sanitari, quote e testi (AutoCAD §4-5)
- Libreria di simboli: bagno (wc, bidet, lavabo, doccia, vasca), cucina (lineare, angolare, piano
  cottura, frigo), camere (letti), soggiorno (divano, tavolo), impianti base (caldaia, split).
- Inserire trascinando, spostare, ruotare (15° o a mano), cambiare misure, eliminare.
- Quote libere: due clic e la quota misura da sola; testi liberi; tutto spostabile.

## Fase 4 — Disegno più libero (AutoCAD §2)
- Stanze di forma qualunque (clic punto per punto, chiude da sola), muri obliqui.
- Copia, ruota, specchia della selezione; selezione multipla con il riquadro.

## Fase 5 — Più piani e più proposte (Architecture §9, §13)
- Piani: aggiungere, rinominare, quota; copiare il piano sotto come base.
- Proposte A/B/C: duplicare il progetto, confrontarle.

## Fase 6 — Prospetti e sezioni (AutoCAD §2, §16)
- Dal 3D: prospetti dei quattro lati e una sezione su una linea scelta, come disegni 2D in scala
  esportabili (PDF/DXF/SVG).

## Fase 7 — Impianti di base (MEP essenziale, §14)
- Punti elettrici (prese, interruttori, luci), punti acqua e scarichi, terminali clima: simboli
  con quantità nel computo per stanza. Niente dimensionamento: si rappresenta e si conta.

## Fase 8 — Tavole e allegato al preventivo (§16)
- Tavola con più viste (pianta, prospetto, dettaglio) e cartiglio; allegato della pianta al preventivo.

## Stato (1/11/2026)

| Fase | Stato | Dove |
|---|---|---|
| 1 Esportare | fatta | `src/components/planimetrie/EsportaPiantaDialog.tsx` |
| 2 Abachi | fatta | `src/lib/planimetrie/abachi.ts`, `AbachiPianta.tsx` |
| 3 Arredi, quote, testi | fatta | editor: `catalogo.ts`, `SimboloArredo.tsx`, comandi `aggiungiElemento`… |
| 4 Disegno libero | fatta | «Stanza libera», pareti a 45°; Maiusc+clic e Maiusc+trascina per più arredi, quote e testi: sposta, Ruota 90° (R), Specchia (M), Copia (Ctrl+D), Elimina (`comandi.ts`, «più oggetti insieme») |
| 5 Piani e proposte | fatta | piani (aggiungi dal perimetro, copia, vuoto; nome, quota, togli); in «Progetto» le alternative B, C… (duplica, rinomina, togli: `adattatore.ts`) |
| 6 Prospetti e sezioni | fatta | `src/lib/planimetrie/prospetti.ts`, `ProspettiDialog.tsx` (SVG, DXF, stampa PDF) |
| 7 Impianti di base | fatta | prese, interruttori, punti luce, quadro, punti acqua, scarichi, termosifoni, split; contati nel computo (`elementi:<stato>:<tipo>.numero`) |
| 8 Tavole e allegato | fatta (allegato per i preventivi standard) | «Tavola completa» nell'esportazione PDF: pianta + 4 prospetti + sezione in scala (`src/lib/planimetrie/tavole.ts`). Allegato: | «Allega a un preventivo» nell'esportazione; migrazione `20281105360000` (apre solo `<azienda>/planimetrie/`) |

## Fuori scopo
Calcoli strutturali ed energetici, importazione DWG (formato chiuso; il DXF si valuta dopo la fase 8).

---

# Seconda parte (1/11/2026): completare il piano e usare l'AI per le stanze

## A. Quel che resta del piano
- **A1 Proposte B, C…** (fase 5): duplicare il progetto in un'alternativa, passare dall'una all'altra
  nell'editor, rinominarle, toglierle; scheda, abachi, 3D ed esportazioni le vedono già.
- **A2 Selezione multipla** (fase 4): Maiusc+clic e riquadro trascinato; sposta, copia, ruota di 90°,
  specchia, elimina di arredi, quote e testi insieme. (Pareti e stanze restano una per volta: muoverle
  in gruppo rompe stanze e aperture.)
- **A3 Tavole** (fase 8): un PDF solo con pianta, i quattro prospetti e la sezione, vettoriale e in
  scala, con titolo per foglio.

## B. AI per le stanze
- **B1 Arreda con un clic**: dal pannello della stanza, gli arredi tipici di quella destinazione
  (bagno, cucina, camera, soggiorno…) disposti lungo le pareti, lontano da porte e finestre. Il 3D
  e il render li usano: i mobili finiscono dove li hai messi.
- **B2 Idee pronte e richieste a parole**: nel passo «Stile» del render della stanza, idee con un
  clic (Scandinavo caldo, Industriale, Japandi, Lusso, Rustico moderno…) che impostano stile,
  materiali e una richiesta scritta; la casella «Cosa vuoi vedere» per scrivere liberamente.
- **B3 Render di tutte le stanze**: dalla scheda, un clic fa il render di ogni stanza dalla vista
  3D interna, con lo stesso stile; avanzamento stanza per stanza, costo in crediti detto prima.
- **B4 Più varianti**: per una stanza, due o tre stili diversi in una volta sola, da confrontare.

## Stato della seconda parte (1/11/2026)

| Punto | Stato | Dove |
|---|---|---|
| A1 Proposte B, C… | fatto | `adattatore.ts` (`duplicaProposta`, `rinominaProposta`, `eliminaProposta`), barra «Alternative» nell'editor |
| A2 Selezione multipla | fatto | `comandi.ts` (`spostaGruppo`, `ruotaGruppo`, `specchiaGruppo`, `duplicaGruppo`, `eliminaGruppo`), `PannelloGruppo` |
| A3 Tavole | fatto | `src/lib/planimetrie/tavole.ts`, interruttore «Tavola completa» in `EsportaPiantaDialog` |
| B1 Arreda con un clic | fatto | `editor/arreda.ts`; bottone nel pannello della stanza (bagno, cucina, camera, soggiorno, studio, lavanderia) |
| B2 Idee pronte | fatto | `src/modules/render-stanza/lib/ideePronte.ts`; nel modulo di ogni render stanza, con «Cosa vuoi vedere» |
| B3 Render di tutte le stanze | fatto | `RenderInSerieDialog`, `src/lib/planimetrie/render/renderInSerie.ts` (due alla volta, costo detto prima) |
| B4 Più varianti | fatto | stesso dialogo da «Più stili insieme» sulla scheda della stanza: fino a 3 stili |
