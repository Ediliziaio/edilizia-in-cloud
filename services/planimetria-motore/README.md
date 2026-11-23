# Motore planimetrie online (render Cycles + DWG)

Dal 23/11/2026 il render fotorealistico (Blender Cycles) e la lettura DWG delle
planimetrie, nati come prova locale in `dev/planimetria-editor`, possono girare
online per tutte le aziende. Stessi script, in un container su **Cloudflare
Containers** (lo stesso account del frontend).

## Come funziona

```
browser ──(1) biglietto──▶ funzione Supabase planimetria-motore
           permesso «Render AI», 1 credito render (solo per il render)
browser ──(2) GLB o DWG + biglietto──▶ Worker eic-planimetria-motore ─▶ container
container ──(3) solo se il render fallisce: esito firmato──▶ planimetria-motore ─▶ rimborso
```

- Il container non ha chiavi del database: vale solo il biglietto firmato
  (`shared/planimetrie/bigliettoMotore.ts`, HMAC-SHA256), una volta sola, per
  10 minuti, per una sola operazione.
- Un lavoro alla volta per istanza, fino a 3 istanze. Occupato → 429; l'app
  chiede un biglietto nuovo e riprova (il credito del primo torna indietro).
- Il DWG è gratuito, come `cad-leggi-commessa`.

## Costi (misurati il 23/11/2026)

Lo script limita il campionamento (90 s «rapida», 135 s «alta») e poi applica il
denoiser, quindi il tempo non cresce con una CPU lenta: provato con 2 thread,
1920×1280 «alta» d'interni in 146 s, stesso risultato di 18 core.

| | Durata | Costo Cloudflare (4 vCPU, 12 GB) |
|---|---|---|
| Render «rapida» | ~1,5 min | ~$0,01 |
| Render «alta» | ~2,5 min | ~$0,017 |
| DWG → tavola | 5–20 s | < $0,002 |
| Fermo | — | $0 (si spegne dopo 4 minuti) |

Ogni render scala **1 credito render** dall'azienda, come il Render AI: il
costo vero è una frazione del prezzo del credito.

## Attivazione (una volta)

1. Cloudflare, piano **Workers Paid** (5 $/mese). Token API con permessi
   *Workers Scripts: Edit* e *Containers: Edit*.
2. GitHub → Settings → Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   Il workflow `Planimetria motore` costruisce l'immagine e pubblica.
3. Un segreto comune di 64 caratteri (`openssl rand -hex 32`):
   - Worker: `npx wrangler secret put PLANIMETRIE_MOTORE_SEGRETO` (da `cloudflare/`),
     poi `PLANIMETRIE_MOTORE_ESITO_URL` = `https://<progetto>.supabase.co/functions/v1/planimetria-motore`
     e `PLANIMETRIE_APP_ORIGINS` = `https://app.ediliziaincloud.com`.
   - Supabase, segreti delle funzioni: `PLANIMETRIE_MOTORE_SEGRETO` (lo stesso) e
     `PLANIMETRIE_MOTORE_URL` = l'indirizzo `*.workers.dev` del Worker.
4. Cloudflare Pages: `VITE_PLANIMETRIE_MOTORE_ONLINE=1`, poi un deploy. Da qui
   il render fotorealistico e il DWG compaiono nell'app.

Prima dell'ultimo passo nell'app non cambia niente; prima del terzo la funzione
risponde 503 («non ancora attivo»).

## Prova in locale

```bash
PLANIMETRIE_MOTORE_SEGRETO=$(openssl rand -hex 32) BLENDER_BIN=/percorso/Blender \
PLANIMETRIE_DWG_BIN=/percorso/dwg2dxf PLANIMETRIE_DWG_PYTHON=/venv/bin/python3 \
PORT=8097 node services/planimetria-motore/server.mts
```

`PLANIMETRIE_CYCLES_THREADS` limita i thread di Blender (per simulare il cloud).
