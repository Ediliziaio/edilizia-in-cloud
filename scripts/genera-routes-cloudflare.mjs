#!/usr/bin/env node
/**
 * Genera `dist/_routes.json` — chi NON deve passare dalla Pages Function.
 *
 * IL PROBLEMA. `functions/_middleware.js` sta sulla radice. Senza un
 * `_routes.json` Cloudflare instrada OGNI richiesta alla Function: non solo le
 * pagine, ma ogni chunk JS, ogni CSS, ogni immagine, ogni font. Il middleware
 * li riconosce come asset e fa subito `next()`, ma l'invocazione è già stata
 * contata. Con ~2.400 file in `assets-cb3/` e qualche decina di chunk per
 * caricamento, bastano 2.000-3.000 visite al giorno per bruciare le 100.000
 * invocazioni del piano gratuito — che valgono per TUTTO l'account.
 * Successo il 17/08/2026 (85k invocazioni in 3 ore, burst di crawler USA) e di
 * nuovo il 25/11/2026. La Cache API dentro il middleware non aiuta: la Function
 * gira comunque, è lei a leggere la cache (vedi il commento in testa a
 * `functions/_middleware.js`).
 *
 * LA REGOLA. Una cartella di primo livello di `dist/` che non contiene NESSUN
 * `.html` è un contenitore di soli file statici: esce dal routing. Una che
 * contiene anche un solo `.html` è una rotta del sito prerenderizzata
 * (`blog/`, `funzionalita/`, `per/`, le città…) e deve continuare a passare dal
 * middleware, che per i bot serve l'HTML statico con i segnali SEO.
 *
 * PERCHÉ GENERATO E NON SCRITTO A MANO. Il nome della cartella degli asset
 * cambia a ogni giro di cache-bust (assets-v2 → v3 → v4 → cb1 → cb2 → cb3, vedi
 * `public/_headers`) e i file `workbox-<hash>.js` cambiano a ogni build. Un
 * elenco fisso andrebbe fuori sincrono in silenzio, e nessuno se ne
 * accorgerebbe finché non arriva di nuovo l'email di Cloudflare.
 *
 * QUANDO GIRA. DOPO `scripts/prerender.mjs`, perché è il prerender a creare gli
 * `index.html` dentro le cartelle delle rotte: girando prima, quelle cartelle
 * risulterebbero «senza html» e verrebbero escluse per sbaglio — il sito
 * resterebbe in piedi, ma i bot smetterebbero di ricevere l'HTML prerenderizzato.
 * Per questo la guardia qui sotto pretende di trovare le rotte prerenderizzate.
 *
 * ATTENZIONE, EFFETTO COLLATERALE NOTO. Per i path esclusi non gira più la
 * guardia anti cache-poisoning del middleware (quella che trasforma in 404
 * no-store l'HTML servito per un URL di asset durante una race di deploy).
 * Resta la protezione lato browser: `public/_headers` tiene `assets-cb3/*` a
 * `max-age=0, must-revalidate` proprio per questo.
 */

import { readdirSync, statSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** File di configurazione di Pages: non sono risorse servite. */
const FILE_DI_SERVIZIO = new Set(["_routes.json", "_headers", "_redirects", "_worker.js"]);

/**
 * Path che devono restare nelle mani del middleware anche se sono file statici.
 * `robots.txt`: sui sottodomini privati il middleware ne serve una versione che
 * blocca tutto (`functions/_middleware.js`, ramo `isPrivateSubdomain`).
 * Escluderlo significherebbe servire il robots.txt pubblico anche lì.
 */
const SEMPRE_DAL_MIDDLEWARE = new Set(["/robots.txt", "/index.html"]);

/** Cloudflare accetta al massimo 100 voci fra include ed exclude. */
export const MAX_VOCI = 100;

function contieneHtml(dir) {
  for (const voce of readdirSync(dir)) {
    const completo = join(dir, voce);
    if (statSync(completo).isDirectory()) {
      if (contieneHtml(completo)) return true;
    } else if (voce.endsWith(".html")) {
      return true;
    }
  }
  return false;
}

/**
 * Decide le esclusioni leggendo la radice del build.
 * `elenco` è il contenuto di `dist/`: [{ nome, cartella, haHtml }].
 * `segmentiDiRotta` sono i primi segmenti delle rotte dichiarate nella SPA.
 * Funzione pura, così il test può verificarla senza un build vero.
 */
export function calcolaEsclusioni(elenco, segmentiDiRotta = new Set()) {
  const esclusi = [];
  for (const { nome, cartella, haHtml } of elenco) {
    if (FILE_DI_SERVIZIO.has(nome)) continue;
    if (SEMPRE_DAL_MIDDLEWARE.has(`/${nome}`)) continue;
    if (cartella && haHtml) continue; // rotta prerenderizzata: passa dal middleware
    if (!cartella && nome.endsWith(".html")) continue;
    // Una cartella di soli file statici che è ANCHE l'inizio di una rotta della
    // SPA resta al middleware. Caso vero: `dist/landing/` contiene solo
    // immagini, ma `/landing/ai-imprenditore-edile` è una pagina, e il
    // middleware le sceglie l'immagine OG (`_middleware.js`, OG_IMAGES.ai).
    // Escluderla spegnerebbe l'anteprima su WhatsApp e Facebook senza un errore.
    if (cartella && segmentiDiRotta.has(nome)) continue;
    esclusi.push(cartella ? `/${nome}/*` : `/${nome}`);
  }
  return esclusi.sort();
}

/**
 * Primi segmenti serviti da una Pages Function (`functions/f.js` → `f`,
 * `functions/oauth/[[path]].js` → `oauth`). Se un giorno nascesse in `dist/`
 * una cartella di soli asset con lo stesso nome, escluderla spegnerebbe la
 * Function: resterebbe servito il file statico e la rotta smetterebbe di
 * funzionare, senza alcun errore in build.
 */
export function segmentiDelleFunction(voci) {
  const segmenti = new Set();
  for (const { nome, cartella } of voci) {
    if (nome.startsWith("_")) continue;
    const base = cartella ? nome : nome.replace(/\.[^.]+$/, "");
    if (base) segmenti.add(base);
  }
  return segmenti;
}

/**
 * Primi segmenti delle rotte dichiarate nella SPA, lette dai sorgenti.
 * Prende solo i `path="/..."` scritti a mano: una rotta costruita da una
 * variabile sfugge, perciò la regola qui sopra è una rete, non una garanzia.
 */
export function segmentiDelleRotte(sorgenti) {
  const segmenti = new Set();
  for (const sorgente of sorgenti) {
    for (const [, path] of sorgente.matchAll(/path="(\/[^"]*)"/g)) {
      const primo = path.split("/")[1];
      if (primo && !primo.startsWith(":") && !primo.startsWith("*")) segmenti.add(primo);
    }
  }
  return segmenti;
}

function leggiDist(dist) {
  return readdirSync(dist).map((nome) => {
    const completo = join(dist, nome);
    const cartella = statSync(completo).isDirectory();
    return { nome, cartella, haHtml: cartella ? contieneHtml(completo) : false };
  });
}

function main() {
  const dist = resolve(process.cwd(), "dist");
  if (!existsSync(dist)) {
    console.error("[routes] dist/ non esiste: lancia prima il build.");
    process.exit(1);
  }

  const elenco = leggiDist(dist);

  // Guardia d'ordine: se il prerender non è ancora passato, le cartelle delle
  // rotte sono vuote di html e finirebbero fra gli esclusi. Meglio fermarsi.
  const rottePrerenderizzate = elenco.filter((v) => v.cartella && v.haHtml).length;
  if (rottePrerenderizzate < 10) {
    console.error(
      `[routes] trovate solo ${rottePrerenderizzate} cartelle con html: il prerender non è passato.\n` +
        "         Questo script va lanciato DOPO scripts/prerender.mjs, altrimenti\n" +
        "         escluderebbe dal middleware le rotte del sito.",
    );
    process.exit(1);
  }

  const sorgentiRotte = ["src/App.tsx"]
    .map((f) => resolve(process.cwd(), f))
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, "utf-8"));
  if (sorgentiRotte.length === 0) {
    console.error("[routes] src/App.tsx non trovato: non so quali sono le rotte della SPA.");
    process.exit(1);
  }

  const functions = resolve(process.cwd(), "functions");
  const vociFunction = existsSync(functions)
    ? readdirSync(functions).map((nome) => ({
        nome,
        cartella: statSync(join(functions, nome)).isDirectory(),
      }))
    : [];

  const intoccabili = new Set([
    ...segmentiDelleRotte(sorgentiRotte),
    ...segmentiDelleFunction(vociFunction),
  ]);

  const exclude = calcolaEsclusioni(elenco, intoccabili);
  const totale = exclude.length + 1; // +1 per l'include "/*"
  if (totale > MAX_VOCI) {
    console.error(`[routes] ${totale} voci: Cloudflare ne accetta ${MAX_VOCI}.`);
    process.exit(1);
  }

  const routes = { version: 1, include: ["/*"], exclude };
  writeFileSync(join(dist, "_routes.json"), `${JSON.stringify(routes, null, 2)}\n`, "utf-8");

  const restano = elenco.filter((v) => v.cartella && v.haHtml).map((v) => v.nome);
  console.log(`[routes] ${exclude.length} esclusioni, ${totale}/${MAX_VOCI} voci.`);
  console.log(`[routes] passano ancora dal middleware: ${restano.length} cartelle di rotte + / e /robots.txt`);
}

// NB: il percorso del progetto contiene uno spazio — serve pathToFileURL,
// un `file://${process.argv[1]}` non combacerebbe mai (lo spazio diventa %20).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
