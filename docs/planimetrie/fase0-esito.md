# Planimetrie — esito della fase 0 (motore cadcraft in WebAssembly)

Data: 30/10/2026 · Piano: `docs/superpowers/specs/2026-10-30-planimetrie-design.md` (Scelte §2, Fasi)

## In breve

**Funziona.** I crate di cadcraft (`geom`, `doc`, `io`, e tramite `io` anche `dxf`, `render`,
`fonts`) si compilano in WebAssembly senza modifiche e dalla nostra pagina React/Vite:

- scrivono il DXF di una pianta (muri come polilinee chiuse con retino, angoli a 45°, porte con
  arco di apertura, finestre, testi dei locali, quote allineate, layer per stato) che **ezdxf
  apre con audit pulito: 0 errori, 0 correzioni**;
- leggono un DXF di terzi (scritto da ezdxf, con blocchi, MTEXT, quote) e lo restituiscono come
  entità semplici più un SVG di sfondo da ricalcare;
- esportano SVG e **PDF in scala** (1:100 su A3 verificato: 10 m di pianta = 100 mm sulla carta).

Peso: **846 kB in brotli** (1,09 MB gzip, 2,45 MB grezzo) senza PDF; **1,18 MB brotli** col PDF.
Obiettivo < 3 MB compressi: ampiamente rispettato.

**Raccomandazione: usare i crate di cadcraft in WASM** per le esportazioni (DXF, SVG, PDF in
scala) e per leggere il DXF del geometra, caricati solo nella pagina delle planimetrie. La
geometria dell'editor e le quantità restano in TypeScript (fase 1), come già previsto dal piano.
Il ripiego JS non serve; dettagli e limiti sotto.

## Cosa è stato fatto

| Cosa | Dove |
|---|---|
| Crate wrapper (Rust, wasm-bindgen) con `scrivi_dxf`, `esporta_svg`, `leggi_dxf`, `esporta_pdf` | `tools/planimetrie-wasm/` (formato d'ingresso nel README) |
| Pianta di esempio: trilocale 10×7,5 m, 10 muri (uno da demolire, uno nuovo), 11 aperture, 6 locali, 4 quote | `tools/planimetrie-wasm/esempi/trilocale.json` |
| DXF prodotto e suo disegno fatto da ezdxf | `docs/planimetrie/fase0-trilocale.dxf`, `fase0-trilocale-ezdxf.png` |
| Script di misura (node) e di controllo indipendente (ezdxf) | `tools/planimetrie-wasm/misura.mjs`, `verifica_ezdxf.py` |
| Pagina di prova: carica il wasm con un import dinamico, disegna la pianta, scarica DXF/SVG, apre un DXF come sfondo | `dev/planimetria-motore/` (solo server di sviluppo, fuori dal menu e dal bundle) |

cadcraft fissato al commit `f536bf406f01541006c81deec47ec842acc83158` (v0.14.0, 30/10/2026)
come dipendenza git in `Cargo.toml`, con la stessa patch di `krilla` del repository di cadcraft
(Cargo ignora le patch delle dipendenze). Toolchain: Rust 1.99.1, wasm-pack 0.13.1.

## Misure

Macchina: Mac Apple Silicon. Build `opt-level = "z"`, LTO, `wasm-opt -Oz`.

### Peso del .wasm

| Variante | Grezzo | gzip -9 | brotli 11 |
|---|---|---|---|
| DXF + SVG + lettura (quella della pagina) | 2.446 kB | 1.092 kB | **846 kB** |
| idem + PDF in scala (`--features pdf`, krilla) | 3.754 kB | 1.558 kB | **1.177 kB** |

Del primo: 2.045 kB di codice, 392 kB di dati (font di disegno, tabelle). Il JS di collegamento
generato da wasm-bindgen è di pochi kB. Cloudflare Pages serve in brotli: su 4G (≈10 Mbit/s)
sono circa 0,7 s la prima volta, poi in cache.

### Tempi

| Operazione | node 24 (media su 50) | browser (pagina di prova, prima chiamata) |
|---|---|---|
| Caricamento (fetch + compilazione + istanza) | compila 4–6 ms | **40–94 ms** dal server locale |
| `scrivi_dxf` trilocale (42 kB di DXF) | 1,4 ms | 14 ms |
| `esporta_svg` trilocale | 0,8 ms | 9 ms |
| `leggi_dxf` trilocale (124 entità + SVG di sfondo) | 4,2 ms | 103 ms |
| `esporta_pdf` A3 1:100 | 1,3 ms | — |
| `scrivi_dxf` 100 appartamenti (2,5 MB di DXF) | 200–210 ms | — |
| `leggi_dxf` 100 appartamenti | 160–220 ms | — |

La prima chiamata nel browser è più lenta perché il codice gira ancora nel compilatore di base
(Liftoff); dalle successive i tempi scendono verso quelli di node. Per un appartamento tutto
sta sotto i 100 ms: non serve un web worker. Per un condominio intero (DXF del geometra da
qualche MB) conviene leggere il DXF in un worker per non bloccare la pagina.

### Validità del DXF

Controllato con **ezdxf 1.4.2** (Python, libreria indipendente, `verifica_ezdxf.py`):
versione AC1015 (R2000), `$INSUNITS = 5` (cm), **audit: 0 errori, 0 correzioni**; 21 HATCH,
21 LWPOLYLINE, 27 LINE, 7 ARC, 6 TEXT, 4 DIMENSION; layer `MURI`, `MURI-DA-DEMOLIRE`,
`MURI-NUOVI`, `PORTE`, `FINESTRE`, `TESTI-LOCALI`, `QUOTE`; stile di quota `EIC-CM`. Il
disegno fatto da ezdxf (`fase0-trilocale-ezdxf.png`) coincide con quello del renderer di
cadcraft: muri retinati, giallo per le demolizioni, rosso per il nuovo, porte con arco, quote
400 / 600 / 750 / 1000. Il DXF scritto dal wasm è identico byte per byte a quello scritto
dalla versione nativa. **Non è stato aperto in AutoCAD** (non disponibile qui): R2000 ASCII con
blocchi `*D` delle quote generati è il formato che AutoCAD apre da sempre, ma la prova vera va
fatta da chi ha AutoCAD (o un geometra) sul file di esempio.

## Cosa usiamo dei crate

- `cadcraft-doc`: il modello del disegno (`Drawing`, layer, stili di quota, entità LINE, ARC,
  LWPOLYLINE, HATCH, TEXT, DIMENSION). La nostra pianta si traduce in questo, solo all'uscita.
- `cadcraft-io`: `write_dxf` (scrittura, compresi i blocchi grafici delle quote che AutoCAD
  vuole), `read_dxf` (lettura ASCII e binario, blocchi, codepage), `svg::export`, `plot` (PDF in
  scala su formato carta, con layer PDF).
- `cadcraft-geom`: vettori e `line_line_infinite` per i giunti a 45° dei muri; tassellazione di
  archi, cerchi e spline nella lettura.
- `cadcraft-render` e `cadcraft-fonts` entrano da soli (SVG, PDF, testo delle quote).

Non usati: `engine` (comandi CAD), `ui-egui`, `mcp`, `constraints`, l'app `cadcraft-web`.
La lettura DWG (`cadcraft-dwg`, crate `acadrust`) è nel grafo delle dipendenze ma la prova non
la chiama; si può aggiungere con `cadcraft_io::read` quando servirà (fase 7), misurandone il peso.

## Cosa resta da fare (nelle fasi giuste, non qui)

- **Giunti a T e incroci** dei muri: oggi solo l'angolo fra due muri è tagliato a 45°; un
  tramezzo che arriva a metà di un muro si sovrappone (retino pieno, si vede appena). Con il
  contorno dei locali della fase 1 si potrà unire i muri in un unico contorno.
- **Testi** con il font di disegno di cadcraft (stile AutoCAD «txt»): leggibili ma tecnici; per
  la pianta da presentazione (fase 6) si potrà caricare un font nostro (`CRAFT_FONTS_DIR`).
- **Cartiglio** del PDF (logo, cliente, scala, versione): da disegnare in uno spazio carta
  (layout) di cadcraft o come pagina nostra sopra il PDF; fase 6.
- **DXF in mm** se il geometra lo vuole: oggi cm (`$INSUNITS = 5`), è un fattore all'uscita.
- Il `.wasm` non è versionato (`dev/planimetria-motore/.gitignore`): si rigenera con
  `tools/planimetrie-wasm/build.sh` (40 s la prima volta dopo il download delle dipendenze).
  Per la produzione (fase 6) va deciso se compilarlo in CI (serve Rust nella build di
  Cloudflare Pages o un job a parte) o versionare il binario in `public/`.
- Il `wasm-opt` di wasm-pack 0.13 va avvisato delle funzioni wasm che Rust ≥ 1.87 usa di
  default (`--enable-bulk-memory` e affini, già in `Cargo.toml`).

## Il ripiego TypeScript (non necessario, misurato per confronto)

| Libreria (npm) | Cosa fa | min | gzip | Licenza |
|---|---|---|---|---|
| `dxf-writer` 1.18.4 | scrive linee, polilinee, archi, testi, layer | 16 kB | 5 kB | MIT |
| `@tarikjabiri/dxf` 2.10.0 | scrive anche HATCH, blocchi e quote | 105 kB | 25 kB | MIT |
| `dxf-parser` 1.1.2 | legge in JSON (senza disegnarlo) | 26 kB | 8 kB | MIT |

Pesano 30–40 volte meno, ma: le quote andrebbero disegnate a mano (AutoCAD le vuole con il
blocco grafico), la lettura dà solo dati grezzi (blocchi annidati, MTEXT, retini, unità e
codepage da gestire noi per disegnare lo sfondo), e il PDF in scala andrebbe costruito con
un'altra libreria (pdf-lib/jsPDF) e i calcoli di scala nostri. Con cadcraft tutto questo c'è
già ed è provato; 846 kB caricati solo nella pagina delle planimetrie sono un prezzo giusto.
Se un giorno il peso desse problemi sul telefono (dove la pianta si guarda e basta), il
telefono può fare a meno del motore: il disegno a schermo lo fa l'editor React, il motore
serve solo per esportare e per aprire un DXF.

## Licenza e attribuzione

cadcraft è **MIT OR Apache-2.0** (a scelta): si può usare in un prodotto commerciale chiuso
citando la fonte. Abbiamo messo `tools/planimetrie-wasm/NOTICE` con copyright, licenza, commit
usato e le dipendenze con licenze particolari: `acadrust` (MPL-2.0, usato senza modifiche come
libreria separata, va bene anche per software chiuso) e i profili ICC CC0 di krilla. Quando il
motore andrà in produzione, il NOTICE va reso visibile (pagina «Licenze» o crediti dell'app).
Il nome e il logo ArtCraft sono marchi, **non** coperti dalla licenza: niente «cadcraft» o
«ArtCraft» nelle schermate.

## Come rifare le prove

```bash
tools/planimetrie-wasm/build.sh
node tools/planimetrie-wasm/misura.mjs
(cd tools/planimetrie-wasm && cargo run --release --example genera -- esempi/trilocale.json uscita/trilocale)
python verifica_ezdxf.py tools/planimetrie-wasm/uscita/trilocale.dxf /tmp/trilocale.png   # in un venv con ezdxf
```

Pagina di prova: `bun run dev`, poi `/dev/planimetria-motore/`.
