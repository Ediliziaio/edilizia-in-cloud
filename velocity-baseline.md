# Velocity Baseline — Edilizia in Cloud

> **Data raccolta**: 2026-04-16
> **Branch**: main (commit `617efe24`)
> **Metodo**: analisi statica repo + build di produzione. Lighthouse/Web Vitals reali non disponibili in questa sessione (richiederebbero staging live loggato). Verranno aggiunti nella FASE 5 con `web-vitals` RUM.

---

## 1. Inventario dipendenze velocity-critiche

| Dep | Stato | Versione | Note |
|---|---|---|---|
| `@tanstack/react-query` | ✅ installato | 5.83.0 | QueryClient configurato in `src/App.tsx:115` |
| `@tanstack/react-virtual` | ✅ installato | 3.13.21 | Verificare uso effettivo su liste lunghe |
| `vite-plugin-pwa` | ✅ installato | 0.19.8 | Service worker presente (dist/sw.js 293 KB precached) |
| `web-vitals` | ❌ **MANCANTE** | — | Nessun RUM in produzione → non sappiamo LCP/INP/CLS reali |
| `@sentry/react` | ❌ **MANCANTE** | — | Nessun error/performance monitoring → cecità totale su regressioni |
| `vite-bundle-visualizer` | ❌ installabile on-demand | — | |

**Impatto**: senza `web-vitals` e `@sentry/react` non si può dimostrare l'efficacia degli interventi né rilevare regressioni dopo deploy. Diventa V1 metodologico prima di toccare codice.

---

## 2. Bundle sizes (produzione, post-build Rolldown)

### Totale dist: **17 MB** di asset (293 KB precached dal SW)

### Entry + vendor chunk critici

| File | KB | gzip stimato | In modulepreload? | Note |
|---|---:|---:|:---:|---|
| `index-*.js` (entry) | 316 | ~82 | ✅ | Entry SPA, contiene App.tsx, router, provider, auth |
| `rolldown-runtime-*.js` | ~? | ~? | ✅ | Runtime Vite |
| **`vendor-pdf-*.js`** | **2,280** | **~740** | ✅ **PROBLEMA** | `@react-pdf/renderer` + `jspdf`: serve solo in fatturazione/export |
| **`vendor-charts-*.js`** | **484** | **~127** | ✅ **PROBLEMA** | `recharts`: serve solo in dashboard con grafici |
| `vendor-qr-*.js` | 404 | ~109 | ❓ | `qrcode` + zxing: serve in pochi punti |
| `vendor-flow-*.js` | 252 | ? | ✅ **PROBLEMA** | `@xyflow/react`: serve solo in Marketing Automation Builder |
| `vendor-maps-*.js` | 160 | ? | ❓ | leaflet + react-leaflet |
| `vendor-excel-*.js` | 912 | ~256 | ❓ | `exceljs`: serve solo in export |

### Chunk route più pesanti

| File | KB | Route (inferenza dal nome) |
|---|---:|---|
| `OrderProgressTracker-*.js` | 344 | Tracker commessa |
| `AdminDashboard-*.js` | 114 | Dashboard admin |
| `OrderDetail-*.js` | 224 | Dettaglio commessa |
| `MarketingAutomationBuilder-*.js` | 220 | Builder automazioni |
| `CompanyDetail-*.js` | 212 | Dettaglio azienda |

### Target vs realtà

| Metrica | Target | Attuale | Δ |
|---|---:|---:|---|
| Bundle JS iniziale (gzip) | < 250 KB | **~82 KB (solo entry)** | ✅ OK se modulepreload corretto |
| JS totale downloadato al primo paint | < 400 KB gzip | **~1.0 MB gzip (con PDF+charts+flow preloadati)** | ❌ **Oltre 2.5× il target** |
| PDF chunk preloadato ma non usato al login | 0 | 740 KB gzip | ❌ Spreco di banda mobile |

**Verdetto Fase 0**: l'entry SPA pura è nei limiti. Il problema è il **modulepreload aggressivo** su vendor-pdf / vendor-charts / vendor-flow generato da Rolldown → scarica 1 MB gzip extra che l'utente non userà mai al primo paint.

---

## 3. Cartografia waterfall login → dashboard

Mappa inferita (senza Lighthouse live):

```
1. GET /                       HTML shell              ~5 KB
2. Parse HTML, parte download  parallelo dei preload:
   - index-*.js                 316 KB  [BLOCKING, entry]
   - rolldown-runtime-*.js      ?
   - vendor-pdf-*.js          2,280 KB  [PRELOAD NON NECESSARIO]
   - vendor-charts-*.js         484 KB  [PRELOAD NON NECESSARIO]
   - vendor-flow-*.js           252 KB  [PRELOAD NON NECESSARIO]
   - vendor-dates-*.js            ?
   - (~40 altri modulepreload di piccoli chunks)
3. Unsplash hero image         PRELOAD esterno (~200 KB?) [DIPENDENZA ESTERNA]
4. GTM gtag.js                 ASYNC (non bloccante, ok)
5. React mount → AuthProvider  → supabase.auth.getSession()
6. Se loggato: supabase select  subscription_plans?limit=1  [fetch senza timeout]
7. Route → /azienda            lazy import del chunk home
8. Dashboard data queries      (React Query)
9. Meteo widget                fetch Open-Meteo [NO TIMEOUT, retry:1]
```

**3 fragilità individuate nel path critico**:

### F1 — Preload immagine hero Unsplash
L'`index.html` ha `<link rel="preload" as="image" href="https://images.unsplash.com/...">` → 1 RTT verso dominio esterno prima ancora del primo pixel. Se Unsplash è lento o down, il LCP ne soffre.

### F2 — fetch `subscription_plans` in AuthContext senza timeout
`src/contexts/AuthContext.tsx:618` — `fetch(...)` senza AbortController né signal:timeout. Su rete 4G degradata può bloccare auth per 30s+.

### F3 — Widget meteo (useWeatherForecast.ts:55)
Usa React Query (✅ staleTime 30min, retry:1) ma:
- ❌ **NO timeout** sul fetch (rete lenta → hang)
- ❌ **NO AbortController** (leak su navigate away)
- ❌ Swallow silenzioso dell'errore senza osservabilità

---

## 4. Inventario API esterne e fragilità TRCFO

| Fonte | Timeout | Retry | Cache | Fallback UI | Osservabilità | Score |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Open-Meteo (widget meteo) | ❌ | ✅ 1x | ✅ 30min | ⚠️ empty map | ❌ | 2/5 |
| Unsplash (hero preload) | n/a | n/a | ❌ | ❌ | ❌ | 0/5 |
| Supabase Edge functions | ❌ (default) | ❓ | ❓ | ❓ | ⚠️ logs server | varia |
| SDI/Aruba fatturazione | — | — | — | — | — | da mappare |
| Geocoding (se presente) | — | — | — | — | — | da mappare |

Nessuna di queste integrazioni ha un **error budget** definito. Se l'API meteo Open-Meteo ha un outage di 6h, non ce ne accorgiamo.

---

## 5. Configurazione React Query

`src/App.tsx:115` definisce `new QueryClient({...})`. Devo verificare nel dettaglio:

```
[ ] staleTime default ragionevole?
[ ] refetchOnWindowFocus sensato per il contesto cantiere?
[ ] retry policy differenziata per mutation vs query?
[ ] onError globale via QueryCache per loggare in Sentry (quando ci sarà)?
```

---

## 6. Matrice impatto / sforzo (pre-intervento)

| # | Intervento | Priorità | Impatto | Sforzo | Numero atteso |
|---|---|:---:|:---:|:---:|---|
| A | **Rimuovere modulepreload di vendor-pdf/charts/flow** (Vite config) | V3 | **ALTO** | **BASSO** | -1 MB gzip al first paint mobile |
| B | Installare `web-vitals` + edge function RUM + tabella `web_vitals_events` | V4 metodologica | ALTO lungo termine | MEDIO | Abilitante tutto il resto |
| C | Installare `@sentry/react` + performance tracing | V2/V4 metodologica | ALTO lungo termine | BASSO | Abilitante osservabilità |
| D | `useWeatherForecast`: aggiungere `AbortSignal.timeout(5000)` + log errore verso Sentry | V2 | MEDIO | BASSO | Meteo 99% < 5s deterministico |
| E | `AuthContext` fetch subscription_plans con timeout | V2 | MEDIO | BASSO | Auth non blocca >3s |
| F | Rimuovere preload Unsplash se non above-the-fold critical | V3 | MEDIO | BASSO | Risparmio RTT esterno |
| G | Audit QueryClient defaults (staleTime, retry, refetchOnWindowFocus) | V4 | MEDIO | BASSO | Coerenza cache, meno refetch inutili |
| H | Code-split route `/azienda/fatturazione` forzato (se non già lazy) | V3 | MEDIO | BASSO | Conferma che vendor-pdf non parte al login |
| I | Virtualizzare liste > 100 righe non ancora virtualizzate | V5 | MEDIO | MEDIO | Dipende da audit effettivo liste |
| J | Service Worker strategia cache per dashboard (stale-while-revalidate) | V6 | BASSO-MEDIO | MEDIO | Resume offline dopo mobile |

---

## 7. Raccomandazione di sequenza (da concordare)

**Sprint 1 (impatto alto + sforzo basso, 1 giornata)**:
- A → rimozione modulepreload aggressivo
- C → Sentry setup
- B → web-vitals RUM
- D → meteo resilience
- E → AuthContext timeout

Dopo Sprint 1, rimisuriamo LCP/INP/TTFB. Se i numeri non si spostano di almeno -30% sul LCP mobile, fermarsi e investigare root cause prima di procedere.

**Sprint 2** (condizionato a risultati Sprint 1): F, G, H, I.
**Sprint 3** (solo se servono davvero): J + ottimizzazioni fine.

---

## 8. Dati ancora MANCANTI per chiudere Fase 0

Questi servono prima di dichiarare la baseline completa, ma richiedono accesso live:

- [ ] Lighthouse report mobile (throttling Slow 4G) su portale loggato
- [ ] Lighthouse report desktop su portale loggato
- [ ] Supabase Query Performance top 10 (richiede SQL read)
- [ ] Web Vitals reali p75 ultimi 7gg (richiede web-vitals installato, 7gg di traffico)
- [ ] Screenshot Network waterfall devtools dashboard home
- [ ] Test rete 3G simulata: tempo totale login → dashboard utilizzabile
