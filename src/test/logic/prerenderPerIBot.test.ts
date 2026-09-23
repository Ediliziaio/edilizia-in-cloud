/**
 * Ai motori di ricerca va la stessa pagina che vede il browser.
 *
 * 23/09/2026: per /blog/ e /confronto/ Googlebot riceveva la pagina sintetica
 * del middleware (15 KB, i soli titoli) invece di quella prerenderizzata (281 KB,
 * con le schede degli articoli). Il middleware chiedeva /blog/index.html, che
 * in _redirects cade nella regola «/blog/:slug → /blog/:slug/». In produzione
 * Cloudflare segue il redirect fino al fallback SPA e risponde 200 con la
 * shell: il primo tentativo di correzione, che guardava solo lo status, non
 * bastava.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

type Middleware = {
  onRequest: (ctx: {
    request: Request;
    next: () => Promise<Response>;
    env: { ASSETS: { fetch: (r: Request) => Promise<Response> } };
    waitUntil: (p: Promise<unknown>) => void;
  }) => Promise<Response>;
};

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const prerender = (titolo: string) =>
  `<!doctype html><html><head><meta name="x-prerendered" content="2026-09-23"></head><body><h1>${titolo}</h1><h3>Articolo vero</h3></body></html>`;

const SHELL = "<!doctype html><html><head></head><body><div id=root></div></body></html>";

/**
 * Come Cloudflare Pages: /blog/index.html segue il redirect delle regole :slug
 * e finisce nella shell SPA (200); /confronto/index.html qui torna il 301 nudo.
 * Entrambi i casi devono portare alla pagina vera.
 */
async function assetCloudflare(richiesta: Request) {
  const { pathname } = new URL(richiesta.url);
  if (pathname === "/blog/index.html") return new Response(SHELL, { status: 200 });
  if (pathname === "/confronto/index.html") {
    return new Response(null, { status: 301, headers: { location: `${pathname}/` } });
  }
  if (pathname === "/blog/") return new Response(prerender("Blog"), { status: 200 });
  if (pathname === "/confronto/") return new Response(prerender("Confronto"), { status: 200 });
  if (pathname === "/prezzi/index.html") return new Response(prerender("Prezzi"), { status: 200 });
  return new Response("", { status: 404 });
}

let middleware: Middleware;

beforeAll(async () => {
  (globalThis as unknown as { caches: unknown }).caches = {
    default: { match: async (): Promise<undefined> => undefined, put: async (): Promise<undefined> => undefined },
  };
  middleware = (await import(/* @vite-ignore */ join(ROOT, "functions/_middleware.js"))) as Middleware;
});

async function chiediDaBot(percorso: string) {
  return middleware.onRequest({
    request: new Request(`https://www.ediliziaincloud.com${percorso}`, { headers: { "user-agent": GOOGLEBOT } }),
    next: async () => new Response("<!doctype html><div id=root></div>", { headers: { "content-type": "text/html" } }),
    env: { ASSETS: { fetch: assetCloudflare } },
    waitUntil: () => {},
  });
}

describe("pagina prerenderizzata ai motori di ricerca", () => {
  it.each(["/blog/", "/confronto/"])("%s: Googlebot riceve la pagina vera anche se index.html non la dà", async (percorso) => {
    const risposta = await chiediDaBot(percorso);
    expect(risposta.status).toBe(200);
    const corpo = await risposta.text();
    expect(corpo).toContain('name="x-prerendered"');
    expect(corpo).toContain("<h3>Articolo vero</h3>");
  });

  it("le pagine il cui index.html risponde subito restano come prima", async () => {
    const corpo = await (await chiediDaBot("/prezzi/")).text();
    expect(corpo).toContain("<h1>Prezzi</h1>");
  });
});
