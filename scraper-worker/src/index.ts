// EiC Scraper Worker — micro-servizio self-host che sostituisce Apify.
// Espone POST /scrape: la edge function `lead-scraper` (fonte "internal") lo
// chiama per scrapare aziende, poi le salva nel DB proprietario scraped_companies.
import Fastify from "fastify";
import { scrapePagineGialle } from "./scrapers/paginegialle.js";
import { scrapeGmaps } from "./scrapers/gmaps.js";
import { startQueue } from "./queue.js";

const SECRET = process.env.SCRAPER_SECRET || "";
const app = Fastify({ logger: true, bodyLimit: 1_000_000 });

app.get("/health", async () => ({ ok: true, ts: Date.now() }));

app.post("/scrape", async (req, reply) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // auth con secret condiviso (deve combaciare con internal_scraper_secret)
  if (SECRET && body.secret !== SECRET) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const engine = String(body.engine || "paginegialle");
  const keyword = String(body.keyword || "").trim();
  const city = String(body.city || "").trim();
  const max = Math.max(1, Math.min(200, Number(body.max) || 40));
  const withEmails = body.withEmails !== false;

  if (!keyword) {
    reply.code(400);
    return { error: "keyword obbligatoria" };
  }

  try {
    const results = engine === "gmaps"
      ? await scrapeGmaps({ keyword, city, max, withEmails })
      : await scrapePagineGialle({ keyword, city, max, withEmails });
    return { engine, count: results.length, results };
  } catch (e) {
    app.log.error(e);
    reply.code(502);
    return { error: (e as Error).message };
  }
});

const port = Number(process.env.PORT || 8080);
app.listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`EiC scraper worker in ascolto su :${port}`);
    // Avvia il processore di coda (job massivi asincroni) se Supabase è configurato.
    startQueue();
  })
  .catch((e) => { app.log.error(e); process.exit(1); });
