/**
 * Il logo si cambia in un posto solo, e arriva dappertutto (24/09/2026).
 *
 * Il logo aziendale (Impostazioni → Branding o Profilo aziendale) andava nel
 * menu e nel portale, ma email e PDF lo leggevano ognuno da un campo suo:
 * preferenze email vuote per tutte e 21 le aziende, modello PDF del
 * fotovoltaico mai aperto da nessuna azienda vera (al posto del logo usciva ☀),
 * e il preventivo generale cercava l'indirizzo del logo come se fosse un
 * percorso nei bucket dei modelli. Ora il campo del documento vince ancora, e
 * se è vuoto vale il logo aziendale.
 *
 * Nello stesso giro: un sottodominio white label (innovasol.ediliziaincloud.com)
 * è un'area dell'app, non il sito pubblico.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  formatoImmagine,
  leggiLogo,
  logoDiRiserva,
} from "../../../supabase/functions/_shared/logoAzienda";

const ROOT = join(__dirname, "../../..");
const leggi = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PROGETTO = "https://progetto.supabase.co";
const LOGO_AZIENDALE = `${PROGETTO}/storage/v1/object/public/company-logos/azienda-1/logo.png?t=1727190000000`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("quale logo", () => {
  it("quello del documento vince, se c'è", () => {
    expect(logoDiRiserva("modelli/azienda-1/logo-preventivi.png", LOGO_AZIENDALE)).toBe("modelli/azienda-1/logo-preventivi.png");
  });

  it("vuoto, spazi o assente: vale quello aziendale", () => {
    for (const vuoto of [null, undefined, "", "   "]) {
      expect(logoDiRiserva(vuoto, LOGO_AZIENDALE)).toBe(LOGO_AZIENDALE);
    }
  });

  it("senza nessuno dei due, niente logo", () => {
    expect(logoDiRiserva(null, "")).toBeNull();
    expect(logoDiRiserva(undefined, null)).toBeNull();
  });
});

describe("il formato si legge dai byte, non dall'estensione", () => {
  it("PNG e JPEG sì, anche con ?t=… in coda all'indirizzo", () => {
    expect(formatoImmagine(PNG)).toBe("png");
    expect(formatoImmagine(JPG)).toBe("jpg");
  });

  it("WebP, SVG o file troncati no: pdf-lib non li incorpora", () => {
    expect(formatoImmagine(WEBP)).toBeNull();
    expect(formatoImmagine(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    expect(formatoImmagine(new Uint8Array([0x89]))).toBeNull();
  });
});

describe("scaricare il logo per un PDF", () => {
  const storageFinto = (contenuti: Record<string, Uint8Array>) => {
    const chiesti: string[] = [];
    return {
      chiesti,
      client: {
        storage: {
          from: (bucket: string) => ({
            download: async (percorso: string) => {
              chiesti.push(`${bucket}:${percorso}`);
              const byte = contenuti[`${bucket}:${percorso}`];
              if (!byte) throw new Error("Object not found");
              return { data: new Blob([new Uint8Array(byte)]) };
            },
          }),
        },
      },
    };
  };
  const opzioni = (scarica?: typeof fetch) => ({
    supabaseUrl: PROGETTO,
    bucket: ["quote-template-assets", "company-assets"],
    scarica,
  });

  it("il logo aziendale (indirizzo dello storage pubblico) si scarica, non si cerca nei bucket", async () => {
    const { client, chiesti } = storageFinto({});
    const scarica = vi.fn(async () => new Response(PNG, { status: 200 })) as unknown as typeof fetch;
    const byte = await leggiLogo(client, LOGO_AZIENDALE, opzioni(scarica));

    expect(byte).toEqual(PNG);
    expect(scarica).toHaveBeenCalledWith(LOGO_AZIENDALE);
    expect(chiesti).toEqual([]);
  });

  it("un indirizzo fuori dallo storage del progetto non si scarica: l'indirizzo lo scrive l'azienda", async () => {
    const { client } = storageFinto({});
    const scarica = vi.fn() as unknown as typeof fetch;
    for (const altrove of [
      "https://sito-qualunque.it/logo.png",
      "https://altro-progetto.supabase.co/storage/v1/object/public/company-logos/x.png",
      `${PROGETTO}/rest/v1/companies`,
    ]) {
      expect(await leggiLogo(client, altrove, opzioni(scarica))).toBeNull();
    }
    expect(scarica).not.toHaveBeenCalled();
  });

  it("una risposta in errore vale niente logo, non un'eccezione", async () => {
    const { client } = storageFinto({});
    const scarica = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await leggiLogo(client, LOGO_AZIENDALE, opzioni(scarica))).toBeNull();
  });

  it("il logo del modello (un percorso) si legge ancora dai bucket dei modelli", async () => {
    const { client, chiesti } = storageFinto({ "company-assets:azienda-1/logo.jpg": JPG });
    const byte = await leggiLogo(client, "azienda-1/logo.jpg", opzioni());

    expect(byte).toEqual(JPG);
    expect(chiesti).toEqual(["quote-template-assets:azienda-1/logo.jpg", "company-assets:azienda-1/logo.jpg"]);
  });
});

describe("chi usa il logo aziendale come riserva", () => {
  it("email: il logo delle preferenze email, altrimenti quello aziendale", () => {
    const sorgente = leggi("supabase/functions/_shared/renderTemplate.ts");
    expect(sorgente).toContain('.select("name, logo_url")');
    expect(sorgente).toContain("logoUrl: logoDiRiserva(prefs?.logo_url as string | undefined, company?.logo_url),");
  });

  it("preventivo fotovoltaico: il logo del modello, altrimenti quello aziendale", () => {
    const sorgente = leggi("supabase/functions/fv-genera-pdf/index.ts");
    expect(sorgente).toMatch(/\.select\("name, vat_number, pec, phone, email, website, brand_primary_color, recensioni_online, logo_url"\)/);
    expect(sorgente).toMatch(/logo_url: logoDiRiserva\(\s*template\.logo_url as string \| null \| undefined,\s*\(company as \{ logo_url\?: string \| null \}\)\.logo_url,\s*\)/);
  });

  it("preventivo generale: l'indirizzo del logo aziendale si scarica, il formato si legge dai byte", () => {
    const sorgente = leggi("supabase/functions/generate-quote-pdf/index.ts");
    // Il logo del modello (se è un percorso, solo dalla cartella dell'azienda), altrimenti quello aziendale.
    expect(sorgente).toContain("const logoPath = logoDiRiserva(logoDelModello(t.logo_url, aziendaDeiFile), logoDelModello(company?.logo_url, aziendaDeiFile));");
    expect(sorgente).toContain("await leggiLogo(supabaseAdmin, logoPath, {");
    expect(sorgente).not.toContain('logoPath.endsWith(".png")');
  });

  it.each(["generate-sal-pdf", "generate-giornale-pdf", "generate-native-pdf"])(
    "%s: il logo dell'anagrafica, altrimenti quello aziendale",
    (funzione) => {
      const sorgente = leggi(`supabase/functions/${funzione}/index.ts`);
      expect(sorgente).toContain("azienda.logo_url = logoDiRiserva(azienda.logo_url, profiloAzienda?.logo_url);");
    },
  );

  it("l'anteprima del modello fotovoltaico mostra lo stesso logo del PDF", () => {
    const editor = leggi("src/components/fotovoltaico/FotovoltaicoTemplateEditor.tsx");
    expect(editor).toContain("const logoAnteprima = (form.logo_url as string | null) || effectiveCompany?.logo_url || null;");
    expect(editor).not.toContain("logoUrl={(form.logo_url as string | null) ?? null}");
  });

  it("la pagina di login white label riceve il logo nuovo da qualunque pagina lo si cambi", () => {
    const sql = leggi("supabase/migrations/20280924235920_logo_azienda_nel_branding.sql");
    expect(sql).toContain("AFTER UPDATE OF logo_url ON public.companies");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.logo_azienda_nel_branding() FROM PUBLIC, anon, authenticated;");
    // Solo righe già esistenti: nessuna azienda diventa leggibile da fuori.
    expect(sql).not.toMatch(/INSERT INTO public\.company_branding/i);
  });
});

// ── Il sottodominio white label è un'area dell'app ─────────────────────────────

type Middleware = {
  onRequest: (ctx: {
    request: Request;
    next: () => Promise<Response>;
    env: { ASSETS: { fetch: (r: Request) => Promise<Response> } };
    waitUntil: (p: Promise<unknown>) => void;
  }) => Promise<Response>;
};

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const SHELL = "<!doctype html><html><head></head><body><div id=root></div></body></html>";
const HOME = `<!doctype html><html><head><meta name="x-prerendered" content="2026-09-24"></head><body><h1>EdiliziaInCloud</h1></body></html>`;

let middleware: Middleware;

beforeAll(async () => {
  (globalThis as unknown as { caches: unknown }).caches = {
    default: { match: async (): Promise<undefined> => undefined, put: async (): Promise<undefined> => undefined },
  };
  middleware = (await import(/* @vite-ignore */ join(ROOT, "functions/_middleware.js"))) as Middleware;
});

async function chiedi(url: string, ua: string) {
  return middleware.onRequest({
    request: new Request(url, { headers: { "user-agent": ua } }),
    next: async () => new Response(SHELL, { headers: { "content-type": "text/html" } }),
    env: { ASSETS: { fetch: async () => new Response(HOME, { status: 200, headers: { "content-type": "text/html" } }) } },
    waitUntil: () => {},
  });
}

describe("innovasol.ediliziaincloud.com", () => {
  it("chi la apre riceve l'app, non la home di EdiliziaInCloud, e i motori non la indicizzano", async () => {
    const risposta = await chiedi("https://innovasol.ediliziaincloud.com/", BROWSER);
    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(await risposta.text()).toBe(SHELL);
  });

  it("ai motori niente contenuto, come su app.", async () => {
    for (const host of ["innovasol.ediliziaincloud.com", "innovasol.ediliziaincloud.it", "app.ediliziaincloud.com"]) {
      const risposta = await chiedi(`https://${host}/`, GOOGLEBOT);
      expect(risposta.status, host).toBe(403);
      expect(risposta.headers.get("X-Robots-Tag"), host).toContain("noindex");
    }
  });

  it("il sito pubblico resta pubblico: www e le anteprime di Cloudflare", async () => {
    for (const host of ["www.ediliziaincloud.com", "edilizia-in-cloud.pages.dev", "abc123.edilizia-in-cloud.pages.dev"]) {
      const risposta = await chiedi(`https://${host}/`, GOOGLEBOT);
      expect(risposta.status, host).not.toBe(403);
    }
  });
});
