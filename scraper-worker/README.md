# EiC Scraper Worker — scraper interno self-host (sostituisce Apify)

Micro-servizio che fa lo scraping **in casa** invece di pagare Apify/ScrapingBee.
La edge function `lead-scraper` (fonte **"internal"**) lo chiama, salva i
risultati nel **database proprietario** `scraped_companies` e li riusa per sempre.

## Cosa fa
- `POST /scrape` → scrapa aziende per `keyword` + `city`.
- 2 motori:
  - **`paginegialle`** (default): HTTP + cheerio, **niente browser** → economicissimo e veloce. Estrae nome, telefono, indirizzo, sito + **email dal sito**.
  - **`gmaps`**: Playwright (browser headless) come Apify. ⚠️ Viola i ToS di Google: usalo a volumi bassi e a tuo rischio.

## Costo
- Fly.io con `auto_stop_machines` → la macchina si spegne da sola quando inattiva: **~$2-5/mese** reali.
- Oppure qualsiasi VPS Docker (Hetzner ~€4/mese), Railway, Render.

## Deploy rapido (Fly.io)
```bash
cd scraper-worker
fly launch --no-deploy          # crea l'app (usa il fly.toml esistente)
fly secrets set SCRAPER_SECRET="<una-stringa-lunga-a-caso>"
# Per i job MASSIVI asincroni (coda) servono anche questi due:
fly secrets set SUPABASE_URL="https://rsbrguhkodgnqfomrevo.supabase.co"
fly secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key-supabase>"
fly deploy
fly status                       # prendi l'URL: https://eic-scraper-worker.fly.dev
```

> Lo `/scrape` sincrono funziona col solo `SCRAPER_SECRET`. La **coda massiva**
> (migliaia di contatti in background) richiede `SUPABASE_URL` +
> `SUPABASE_SERVICE_ROLE_KEY`: il worker pesca i job da `lead_scraper_jobs`,
> scrapa a pagine, fa bulk-upsert in `scraped_companies` e aggiorna il progresso.
> Per scalare oltre, alza `min_machines_running` nel fly.toml o avvia più
> istanze: il claim è atomico (`FOR UPDATE SKIP LOCKED`) → niente doppioni.

## Deploy su VPS (Docker)
```bash
docker build -t eic-scraper .
docker run -d -p 8080:8080 -e SCRAPER_SECRET="<segreto>" --restart unless-stopped eic-scraper
```

## Collega EiC al worker
In Supabase → **platform_settings** (o secret) imposta:
- `internal_scraper_url` = `https://eic-scraper-worker.fly.dev`
- `internal_scraper_secret` = lo stesso `SCRAPER_SECRET`

Poi nel Lead Scraper scegli la fonte **"Interno"** e cerca. La prima volta
scrapa; dalle volte successive **riusa dal DB gratis**.

## Test locale
```bash
npm install
SCRAPER_SECRET=test npm start
# in un altro terminale:
curl -s -X POST localhost:8080/scrape \
  -H 'content-type: application/json' \
  -d '{"secret":"test","engine":"paginegialle","keyword":"impresa edile","city":"Milano","max":20}' | jq
```

## Manutenzione
I portali cambiano l'HTML: se Pagine Gialle/Google Maps smettono di restituire
risultati, vanno **ritoccati i selettori CSS** in `src/scrapers/*.ts` (cerca i
commenti `selettori difensivi`). È normale per ogni scraper.

## Anti-ban (quando scali) — proxy a rotazione
Per scrapare **migliaia di contatti** senza farsi bannare l'IP, imposta
`SCRAPER_PROXIES` con una lista CSV di proxy (residenziali consigliati). Il
worker li ruota in **round-robin** su ogni richiesta HTTP (cheerio/email via
`undici` `ProxyAgent`) e su ogni `newContext` di Playwright (Google Maps).

```bash
fly secrets set SCRAPER_PROXIES="http://user:pass@ip1:porta,http://user:pass@ip2:porta,http://user:pass@ip3:porta"
```

- Formato per proxy: `http://utente:password@host:porta` (o `https://`/`socks5://` per undici).
- **Vuoto/non impostato** → nessun proxy (va bene per volumi bassi).
- Rallenta (`setTimeout` già presente nei loop) e usa User-Agent realistico (già impostato).
- Più proxy = più throughput e meno rischio ban. Combinalo con più istanze del worker
  (`min_machines_running` / istanze multiple) per scalare in orizzontale.
