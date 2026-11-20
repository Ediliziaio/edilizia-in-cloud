# Motore DWG del backend

Distribuzione originale: `@mlightcad/libredwg-web` **0.9.0**, progetto
[mlightcad/libredwg-web](https://github.com/mlightcad/libredwg-web), basato su
[GNU LibreDWG](https://www.gnu.org/software/libredwg/). Licenza **GPL-3.0**,
testo incluso in `COPYING`. Copyright e autori originari rimangono quelli dei
progetti upstream. Questi artefatti sono usati esclusivamente nella funzione
backend `cad-leggi-commessa`, non nel JavaScript distribuito al browser.

Tarball originale: https://registry.npmjs.org/@mlightcad/libredwg-web/-/libredwg-web-0.9.0.tgz

- SHA-256 tarball: `afa92ed91391408482f0aa9791fc1c2fabe17ba049b2924c83c0b85ab63c3e3a`
- SHA-256 WASM originale: `aa4347f80dd0aa4606b4268d112e04d3e47c3bf5f0d119a49cddf5b7d289e093`
- SHA-256 WASM adattato: `9ec3c7d41e83ce637fe127440a1551279af197d4e843c2197dd2a0b6db5838b3`

Modifiche del 20 novembre 2026: dichiarazione della memoria WebAssembly ridotta
da 1 GB iniziale / 4 GB massimi a **64 MB / 128 MB**; `import("module")` nel glue
Emscripten reso esplicito come `import("node:module")` per Deno. Nessuna istruzione
del parser è modificata. Il WASM viene compresso gzip e codificato nel modulo
TypeScript per il trasporto del deploy; il backend ne verifica l’hash prima
di compilarlo. Il limite di memoria può far rifiutare disegni complessi: l’errore
non viene presentato come una lettura riuscita.

Rigenerazione: `node scripts/cad/prepara-wasm.mjs /percorso/al/tarball.tgz`.
Il tarball e i sorgenti upstream sono identificati sopra; lo script controlla
checksum iniziale, struttura della sezione modificata e checksum finale.
`COPYING` deve accompagnare gli artefatti. Le eventuali distribuzioni successive
del motore devono conservare licenza, avvisi, modifiche e sorgenti corrispondenti
secondo i termini della GPL.
