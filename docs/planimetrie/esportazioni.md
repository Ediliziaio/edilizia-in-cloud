# Planimetrie — esportazioni 2D (fase 6)

Piano: [`docs/superpowers/specs/2026-10-30-planimetrie-design.md`](../superpowers/specs/2026-10-30-planimetrie-design.md)
(«Scelte» 9, «Decisioni prese dopo la revisione»). Modello: [`modello.md`](modello.md).
Il 3D (glTF/GLB, OBJ) è della fase 5a, in `src/lib/planimetrie/tred`.

## Cosa esce

| Uscita | Funzione | Note |
|---|---|---|
| PDF in scala | `esportaPdf(vista, cartiglio, { formato, orientamento, scala, stile })` | A4/A3, orizzontale/verticale, 1:20…1:500 o `"auto"`; cartiglio, legenda giallo/rosso, tabella dei locali, barra di scala, nord |
| DXF | `esportaDxf(vista, { unita, scala, motore })` · `esportaDxfMigliore(…)` | layer `MURI`, `DEMOLIZIONI`, `NUOVO`, `APERTURE`, `QUOTE`, `TESTI`, `ARREDI`, `LOCALI` (+ `PAVIMENTI` a richiesta) |
| SVG in scala | `esportaSvg(vista, { scala, stile, sfondo })` | `width`/`height` in mm veri |
| PNG | `esportaPng(vista, { scala, dpi, stile, sfondo })` | dal canvas del browser, sfondo bianco o trasparente, lato massimo 12.000 px |
| Pianta da presentazione | `stile: "presentazione"` in tutte le uscite | pavimenti per locale (parquet, gres, piastrelle, cotto, marmo, resina), arredi colorati; disegno vettoriale in scala, non immagine AI |
| Allegato al preventivo | `allegatoPreventivo(vista, cartiglio)` | PDF A4 scala adatta + nome file + descrizione; **solo predisposto**, il preventivo non lo chiama ancora |

Ingresso di tutte: `vistaDaPlanimetria(planimetria, { modo, livelloId?, propostaId? })` con
`modo` = `fatto` | `progetto` (a lavori finiti) | `confronto` (giallo = demolizioni, rosso = nuovo).
Cartiglio: `aziendaDelCartiglio(companies, company_branding, logo)` e `caricaLogo(logo_url)`
(PNG/JPG; WEBP/SVG passano da un canvas; se non arriva, si va senza).

## Come è fatta

```
Planimetria (shared/planimetrie, y in alto)
  └─ adattatore.ts ── VistaPianta (y in basso, stati risolti, superfici dalle quantità)
       └─ scena.ts ── Scena: poligoni, archi, cerchi, testi per layer (cm della pianta)
            ├─ pdf.ts   (pdf-lib, caricato al momento)   ├─ svg.ts ── png.ts (canvas)
            └─ dxf.ts ── MotoreDxf: r12.ts (TypeScript) | cadcraft.ts (WASM)
```

- **Una scena per tutte le uscite**: PDF, SVG, PNG e DXF non possono raccontare piante diverse.
- **Solo `adattatore.ts` conosce il modello.** Se il modello cambia si tocca lì.
- **Scala**: la scena è in cm; spessori, scritte e distanze delle quote sono in mm stampati
  e passano in cm con la scala. Nel PDF un cm della pianta è `10 / scala` mm, cioè
  `10 / scala × 72 / 25,4` punti: a 1:50 un metro = 20 mm (test con i punti veri del PDF).
- **Muri**: pezzi fra i vani; negli angoli si allungano di mezzo spessore dell'altro, nelle T si
  fermano sul suo filo. Si disegna prima il bordo (doppio) e poi il pieno sopra: resta il
  contorno dell'unione senza righe negli angoli.
- **Vani nei confronti**: un'apertura nuova in un muro che resta è un pezzo giallo (si demolisce);
  un'apertura che si chiude è un tamponamento rosso.
- **Quote automatiche**: catena dei vani e totale sui lati esterni (filo esterno), come il
  geometra; quelle del modello si aggiungono, e una catena uguale a una quota del modello non si ripete.
- **Arredi**: rotazione del modello antioraria con il retro in basso a 0°, la stessa lettura del
  3D (`tred/adattatore.ts`). Tipi sconosciuti → riquadro con la diagonale.
- **Misure stimate**: «*» nella tabella e nell'etichetta del locale, nota sotto la tabella; quote stimate con «~».

## DXF: due motori dietro la stessa interfaccia

`MotoreDxf` (`dxf/motore.ts`): layer, linea, polilinea, arco, cerchio, testo, pieno, conteggio.

| Motore | Formato | Dove gira |
|---|---|---|
| `MotoreDxfR12` (TypeScript, zero dipendenze) | R12 / AC1009, SOLID per i pieni, testo in Windows-1252 | ovunque: è quello di serie |
| `MotoreDxfCadcraft` (crate di cadcraft in WASM, fase 0) | R2000 / AC1015, `$INSUNITS`, LWPOLYLINE, HATCH | dove c'è il .wasm |

La fase 0 consiglia cadcraft ([`fase0-esito.md`](fase0-esito.md)). Il wrapper aveva solo la sua
pianta provvisoria; qui gli è stata aggiunta `scrivi_entita(json)` (`tools/planimetrie-wasm/src/lib.rs`,
in fondo) che scrive le entità della nostra scena: stessa geometria, stesso conteggio per layer.
`caricaMotoreCadcraft()` importa il modulo da `/dev/planimetria-motore/wasm/` (lo crea
`tools/planimetrie-wasm/build.sh`, non versionato): **in produzione oggi non c'è**, e
`esportaDxfMigliore` ripiega sul motore TypeScript. Decisione aperta (dalla fase 0): compilare il
wasm in CI o versionarlo in `public/`; quando sarà deciso basta cambiare `URL_MOTORE_CADCRAFT`.
cadcraft scrive i caratteri non ASCII come `\U+XXXX`; il motore li riporta in Windows-1252 come
dichiara il file (ezdxf e LibreCAD non decodificano `\U+` nei TEXT).

## Prove

- `src/test/logic/planimetrieEsporta.test.ts` (30 test): validità dell'esempio per il modello,
  y e rotazioni, stati, superfici dalle quantità, giunti dei muri, texture dentro il locale,
  dimensioni dei fogli, scala automatica ed errore con consiglio, **punti dei muri nel PDF alla
  scala esatta**, allegato, **entità DXF per layer** (contate da un parser indipendente e
  ricavate dalla pianta: 2 per pezzo di muro, 3 testi per locale…), codifica, motore sostituibile,
  SVG in mm, dimensioni PNG.
- Validazione indipendente: `python -I scripts/planimetrie/valida-dxf.py file.dxf [disegno.png]`
  (venv con `ezdxf`, `matplotlib`). Esito sugli esempi: R12 e R2000 entrambi **audit 0 errori,
  0 correzioni**, stessi conteggi per layer. Nessuno dei due è stato aperto in AutoCAD vero.
- Esempi: `bun scripts/planimetrie/esempi-esportazione.ts` → `docs/planimetrie/esempi-esportazione/`
  (PDF A3 1:50 comparativo e presentazione, A4 verticale adattato, allegato, DXF R12 e cadcraft,
  SVG, PNG 200 dpi bianco e trasparente). Il PNG passa dal canvas di Chromium (Playwright).
- Pagina di prova: `bun run dev`, poi `/dev/planimetria-esporta/` (un pulsante per formato,
  scelta di pianta, stato, stile, foglio, scala, unità e motore del DXF, logo).

## Da fare dopo (non in questa fase)

- Collegare `allegatoPreventivo` al PDF del preventivo (opzione «allega la pianta», come i render)
  e salvare le esportazioni in `planimetrie_file` (`ruolo: esportazione`).
- Pulsanti di esportazione nell'editor (fase 2) quando c'è la pagina vera.
- Quote come entità DIMENSION nel DXF (oggi linee e testi sul layer `QUOTE`): servirebbe un
  metodo `quota` in `MotoreDxf`, che cadcraft sa già scrivere.
- Prova di stampa vera col righello e apertura dei DXF in AutoCAD da chi ce l'ha.
