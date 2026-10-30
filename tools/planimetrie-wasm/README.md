# planimetrie-wasm — motore di prova (fase 0)

Crate Rust che mette i crate di [cadcraft](https://github.com/storytold/cadcraft) dietro poche
funzioni chiamabili dal browser. Serve alla **fase 0** del piano Planimetrie
(`docs/superpowers/specs/2026-10-30-planimetrie-design.md`); l'esito è in
`docs/planimetrie/fase0-esito.md`.

## Funzioni (wasm-bindgen)

| Funzione | Ingresso | Uscita |
|---|---|---|
| `scrivi_dxf(json)` | pianta (sotto) | DXF R2000 ASCII, unità cm |
| `esporta_svg(json)` | pianta | SVG disegnato dal renderer di cadcraft |
| `leggi_dxf(testo)` | un DXF qualsiasi | JSON `{unita, limiti, layer, conteggi, entita, svg}` |
| `esporta_pdf(json, opzioni)` | pianta + opzioni di stampa | PDF in scala (solo con `--features pdf`) |

`entita` di `leggi_dxf`: `{tipo:"linea", layer, punti:[[x,y]…]}` per linee, polilinee, archi,
cerchi, spline (archi spezzati con tolleranza 1 unità); `{tipo:"testo", layer, p, testo, altezza}`
per TEXT/MTEXT. Blocchi, quote e retini restano solo nello `svg` (che li disegna tutti).

## La pianta (modello PROVVISORIO)

Solo per questa prova: il modello vero lo definisce la fase 1. Misure in **cm**, y verso l'alto.

```jsonc
{
  "titolo": "…",
  "scala": 50,                     // scala di stampa: decide l'altezza delle quote (1:50 → testo 12,5 cm)
  "muri": [
    { "id": "m1", "p1": [0, 0], "p2": [1000, 0], "spessore": 30,
      "stato": "esistente" }       // esistente | da_demolire (giallo) | nuovo (rosso)
  ],
  "aperture": [
    { "muro": "m1", "tipo": "porta", // porta | finestra | portafinestra
      "distanza": 450,             // da p1 del muro all'inizio dell'apertura, lungo l'asse
      "larghezza": 90,
      "apre_verso": "sinistra",    // lato (guardando da p1 a p2) in cui ruota l'anta
      "cerniera_fine": false }     // cerniera sul lato p2 invece che sul lato p1
  ],
  "testi": [ { "p": [650, 225], "testo": "Soggiorno", "altezza": 20 } ],
  "quote": [ { "p1": [0, 0], "p2": [1000, 0], "distanza": -80 } ]  // + a sinistra di p1→p2
}
```

Nel DXF: layer `MURI`, `MURI-DA-DEMOLIRE`, `MURI-NUOVI`, `PORTE`, `FINESTRE`, `TESTI-LOCALI`,
`QUOTE`; ogni tratto di muro è una polilinea chiusa più un retino pieno; gli angoli fra due muri
sono tagliati a 45°, le teste a T restano dritte (si sovrappongono); quote allineate con lo stile
`EIC-CM` (decimali 0, virgola). Esempio completo: `esempi/trilocale.json`.

## Compilare e misurare

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --target wasm32-unknown-unknown
curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh
tools/planimetrie-wasm/build.sh                      # → dev/planimetria-motore/wasm/ (non versionato)
node tools/planimetrie-wasm/misura.mjs               # pesi e tempi
cargo run --release --example genera -- esempi/trilocale.json uscita/trilocale   # nativo: dxf, svg, pdf
```

La pagina di prova è `/dev/planimetria-motore/` col server di sviluppo (`bun run dev`).
