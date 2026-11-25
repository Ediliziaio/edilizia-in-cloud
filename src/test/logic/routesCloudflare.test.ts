/**
 * `dist/_routes.json` decide chi NON passa dalla Pages Function.
 *
 * È il file che tiene il sito dentro le 100.000 invocazioni al giorno del piano
 * gratuito di Cloudflare: senza, il middleware sulla radice gira anche per ogni
 * chunk JS e ogni immagine (25/11/2026, ed era già successo il 17/08/2026).
 * Sbagliare dall'altra parte però non dà errore: una cartella esclusa per
 * sbaglio smette solo di ricevere l'HTML per i bot, e la SEO cala in silenzio.
 * Qui si fissano le due direzioni.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Script di build in JavaScript, senza tipi: la direttiva deve stare sulla riga
// dello specifier, che è dove tsc segnala il TS7016. Spezzando l'import su più
// righe la direttiva finisce sulla riga sbagliata e diventa inutilizzata.
// @ts-expect-error — modulo .mjs senza dichiarazioni di tipo
import { calcolaEsclusioni, segmentiDelleRotte, segmentiDelleFunction, MAX_VOCI } from "../../../scripts/genera-routes-cloudflare.mjs";

const cartella = (nome: string, haHtml = false) => ({ nome, cartella: true, haHtml });
const file = (nome: string) => ({ nome, cartella: false, haHtml: false });

describe("_routes.json di Cloudflare", () => {
  it("toglie dal middleware le cartelle di soli asset", () => {
    const esclusi = calcolaEsclusioni([cartella("assets-cb3"), cartella("images"), cartella("fonts")]);
    expect(esclusi).toEqual(["/assets-cb3/*", "/fonts/*", "/images/*"]);
  });

  it("lascia al middleware le cartelle con pagine prerenderizzate", () => {
    const esclusi = calcolaEsclusioni([cartella("blog", true), cartella("funzionalita", true), cartella("per", true)]);
    expect(esclusi).toEqual([]);
  });

  it("lascia al middleware una cartella di soli asset se ci passa una rotta della SPA", () => {
    // `dist/landing/` ha solo immagini, ma /landing/ai-imprenditore-edile è una
    // pagina: il middleware le dà l'immagine OG per WhatsApp e Facebook.
    const elenco = [cartella("landing"), cartella("images")];
    expect(calcolaEsclusioni(elenco, new Set(["landing"]))).toEqual(["/images/*"]);
  });

  it("non tocca robots.txt, che sui sottodomini privati lo scrive il middleware", () => {
    expect(calcolaEsclusioni([file("robots.txt"), file("favicon.ico")])).toEqual(["/favicon.ico"]);
  });

  it("non tocca index.html né i file di configurazione di Pages", () => {
    const elenco = [file("index.html"), file("_headers"), file("_redirects"), file("_routes.json"), file("sw.js")];
    expect(calcolaEsclusioni(elenco)).toEqual(["/sw.js"]);
  });

  it("legge i primi segmenti delle rotte scritte a mano, saltando i parametri", () => {
    const sorgente = `<Route path="/landing/ai-imprenditore-edile" /><Route path="/blog/:slug" /><Route path="/*" />`;
    expect(segmentiDelleRotte([sorgente])).toEqual(new Set(["landing", "blog"]));
  });

  it("le rotte vere della SPA non finiscono mai fra gli esclusi", () => {
    const app = readFileSync(resolve("src/App.tsx"), "utf-8");
    const segmenti = segmentiDelleRotte([app]);
    expect(segmenti.has("landing")).toBe(true);
    // Ogni segmento di rotta, anche se la sua cartella non ha html, resta dentro.
    const elenco = [...segmenti].map((nome) => cartella(nome as string));
    expect(calcolaEsclusioni(elenco, segmenti)).toEqual([]);
  });

  it("conosce i segmenti serviti dalle Function, saltando i file con underscore", () => {
    const voci = [
      { nome: "_middleware.js", cartella: false },
      { nome: "_blog-meta.js", cartella: false },
      { nome: "f.js", cartella: false },
      { nome: "l", cartella: true },
      { nome: "oauth", cartella: true },
      { nome: "api", cartella: true },
    ];
    expect(segmentiDelleFunction(voci)).toEqual(new Set(["f", "l", "oauth", "api"]));
  });

  it("una cartella di asset omonima di una Function non la spegne", () => {
    // Se domani `dist/oauth/` contenesse solo immagini, escluderla farebbe
    // servire il file statico al posto di functions/oauth/[[path]].js.
    const esclusi = calcolaEsclusioni([cartella("oauth"), cartella("images")], new Set(["oauth"]));
    expect(esclusi).toEqual(["/images/*"]);
  });

  it("il tetto delle voci è quello che accetta Cloudflare", () => {
    expect(MAX_VOCI).toBe(100);
  });
});
