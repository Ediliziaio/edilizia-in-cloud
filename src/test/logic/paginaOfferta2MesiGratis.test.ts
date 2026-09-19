/**
 * /offerta-2-mesi-gratis esiste per tutti (19/09/2026): per chi la apre, per
 * chi scrive l'indirizzo con la maiuscola (così l'ha chiesta Florin), per i
 * motori di ricerca e per le anteprime dei link.
 *
 * Il middleware si prova davvero, non solo leggendone il testo: una rotta che
 * iniziasse con «/offerta» poteva finire tra le pagine noindex, quelle delle
 * offerte firmate via token (/offerta/<token>).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ogImageForPath } from "@/hooks/useSEO";

const ROOT = join(__dirname, "../../..");
const leggi = (file: string) => readFileSync(join(ROOT, file), "utf8");

type Middleware = {
  onRequest: (ctx: {
    request: Request;
    next: () => Promise<Response>;
    env: { ASSETS: { fetch: (r: Request) => Promise<Response> } };
    waitUntil: (p: Promise<unknown>) => void;
  }) => Promise<Response>;
};

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

let middleware: Middleware;

beforeAll(async () => {
  // La Cache API di Cloudflare: qui non c'è, e il redirect non deve dipenderne.
  (globalThis as unknown as { caches: unknown }).caches = {
    default: { match: async (): Promise<undefined> => undefined, put: async (): Promise<undefined> => undefined },
  };
  const percorso = join(ROOT, "functions/_middleware.js");
  middleware = (await import(/* @vite-ignore */ percorso)) as Middleware;
});

async function chiedi(percorso: string, ua: string) {
  return middleware.onRequest({
    request: new Request(`https://www.ediliziaincloud.com${percorso}`, { headers: { "user-agent": ua } }),
    // Per i visitatori: la shell dell'app, come farebbe Cloudflare Pages.
    next: async () => new Response("<!doctype html><div id=root></div>", { headers: { "content-type": "text/html" } }),
    // Nessun prerender nel test: il bot riceve la pagina di riserva del middleware.
    env: { ASSETS: { fetch: async () => new Response("", { status: 404 }) } },
    waitUntil: () => {},
  });
}

describe("/offerta-2-mesi-gratis nel sito", () => {
  it("ha la sua rotta nell'app", () => {
    expect(leggi("src/App.tsx")).toContain('<Route path="/offerta-2-mesi-gratis" element={<Offerta2MesiGratis />} />');
  });

  it("l'indirizzo con la maiuscola porta alla pagina con un solo 301", async () => {
    for (const percorso of ["/Offerta-2-mesi-gratis", "/Offerta-2-mesi-gratis/"]) {
      const risposta = await chiedi(percorso, BROWSER);
      expect(risposta.status).toBe(301);
      expect(risposta.headers.get("location")).toBe("https://www.ediliziaincloud.com/offerta-2-mesi-gratis/");
    }
  });

  it("senza la barra finale: un 301 verso l'indirizzo canonico", async () => {
    const risposta = await chiedi("/offerta-2-mesi-gratis", BROWSER);
    expect(risposta.status).toBe(301);
    expect(risposta.headers.get("location")).toBe("https://www.ediliziaincloud.com/offerta-2-mesi-gratis/");
  });

  it("il visitatore riceve l'app, senza noindex", async () => {
    const risposta = await chiedi("/offerta-2-mesi-gratis/", BROWSER);
    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("x-robots-tag")).toBeNull();
  });

  it("il motore di ricerca riceve la pagina indicizzabile, con l'offerta e le garanzie", async () => {
    const risposta = await chiedi("/offerta-2-mesi-gratis/", GOOGLEBOT);
    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("x-robots-tag")).toBe("index, follow");
    const html = await risposta.text();
    expect(html).toContain("<title>Offerta 2 mesi gratis — Gestionale Edilizia in Cloud</title>");
    expect(html).toContain('rel="canonical" href="https://www.ediliziaincloud.com/offerta-2-mesi-gratis/"');
    expect(html).toContain("<h1>Aumenta i tuoi margini e i tuoi guadagni. Libera tempo dalla gestione.</h1>");
    expect(html).toContain("12 mesi al prezzo di 10");
    expect(html).toContain("Operativo in 30 giorni, o il canone non parte");
    expect(html).toContain("https://www.ediliziaincloud.com/og/eic-demo.png");
  });

  it("le offerte via token restano noindex", async () => {
    const risposta = await chiedi("/offerta/abc123/", GOOGLEBOT);
    expect(risposta.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("sta nella sitemap e tra le pagine prerenderizzate", () => {
    expect(leggi("public/sitemap.xml")).toContain("<loc>https://www.ediliziaincloud.com/offerta-2-mesi-gratis/</loc>");
    expect(leggi("scripts/prerender.mjs")).toContain('"/offerta-2-mesi-gratis",');
  });

  it("anteprima dei link: la stessa immagine nell'app e nel middleware", () => {
    expect(ogImageForPath("/offerta-2-mesi-gratis/")).toBe("https://www.ediliziaincloud.com/og/eic-demo.png");
  });
});
