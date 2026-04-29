# Edilizia in Cloud

Gestionale cloud per imprese edili italiane. Parte di AEDIX, l'holding di
verticali SaaS per le PMI italiane.

**Stack:** React 18 · TypeScript · Vite · Supabase · Tailwind · shadcn/ui · Capacitor (iOS/Android)

**Documentazione tecnica:** vedi `ARCHITECTURE.md` per stack completo, routing, DB,
edge functions e moduli principali.

## Sviluppo locale

```bash
npm install
cp .env.example .env.local  # popolare con chiavi Supabase
npm run dev                  # http://localhost:5173
```

## Test

```bash
npm run test            # vitest
npm run test:e2e        # playwright
npx tsc --noEmit        # type check
```

## Deploy

Frontend deployato su Cloudflare Pages. Edge functions Supabase deploy via:

```bash
npx supabase functions deploy <nome> --project-ref rsbrguhkodgnqfomrevo
```

Mobile build (Capacitor):

```bash
npm run mobile:build && npm run mobile:sync
npx cap open ios       # o android
```

## Struttura

- `src/pages/azienda/*`       — area aziendale
- `src/pages/admin/*`         — pannello SuperAdmin
- `src/pages/campo/*`         — portale operai/cantiere
- `src/pages/tecnico/*`       — portale tecnici di servizio
- `src/pages/cliente/*`       — portale cliente finale
- `src/pages/partner/*`       — portale referral partner
- `src/pages/venditore/*`     — portale venditori
- `supabase/functions/*`      — edge functions Deno
- `supabase/migrations/*`     — DDL versionato

## Convenzioni

- Zero TypeScript `any`
- Mai `select('*')`
- RLS obbligatoria su ogni tabella
- UX in italiano (toast, errori, empty states)
- Skeleton loaders su tutte le query

## Licenza

Proprietaria — AEDIX SRL. Tutti i diritti riservati.
