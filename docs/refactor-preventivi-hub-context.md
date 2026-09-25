# Refactor Preventivi Hub + Moduli Vendita Verticali — Contesto e Baseline

Branch: `feature/preventivi-hub-moduli-vendita`
Base: `main` @ `105392e5`
Data: 2026-04-27

## Obiettivo

Trasformare `/azienda/marketing/preventivi` nell'unico hub centrale per tutto
l'ecosistema preventivi e moduli di vendita verticali, sfruttando il sistema
di feature flags già esistente, senza creare duplicazioni o rompere il modulo
Fotovoltaico in produzione.

## 5 risposte mandatorie (Step 0.3 masterprompt)

### 1. RPC che risolve il valore di una feature per una company

**`public.resolve_company_feature(p_company_id uuid, p_feature_key text)`**

- Definita in: `supabase/migrations/20260417000005_resolve_company_feature.sql`
- Patch successive:
  - `20260417000010_resolver_uses_plan_feature_defaults.sql` (lettura da plan_feature_defaults)
  - `20260922000001_fix_resolve_company_feature_ambiguous.sql` (fix ambiguità colonne)
- Ordine di precedenza: company override → plan default → platform default → false
- Restituisce JSONB `{ enabled, source, limit, price_override, expires_at }`

### 2. Hook React che usa quella RPC

**`useFeatureAccess(featureKey)`** in `src/hooks/useFeatureAccess.ts`

- Wrappa `supabase.rpc("resolve_company_feature", {...})`
- Bypass per super_admin in impersonation con guard rigorosa
  (richiede contemporaneamente `role==="super_admin"`, `isImpersonationReady`,
  `isImpersonating`, `impersonatedCompanyId`, `impersonationToken`)
- Espone `{ isEnabled, source, limit, priceOverride, expiresAt, isLoading,
  isError, isFetching, errorMessage, refetch }`
- Chiave React Query: `queryKeys.featureAccess(companyId, featureKey)`

Hook complementare: `useFeatureFlags()` in `src/hooks/useFeatureFlags.ts`
per leggere il catalogo `platform_feature_flags`.

La replica client-side `src/lib/featureResolver.ts` (porting della RPC per test
e fallback) è stata tolta il 25/09/2026: non la usava nessuno, la verità è la RPC.

### 3. Voce sidebar "Fotovoltaico"

**File**: `src/lib/sidebarConfig.ts`
**Linea**: 168-169

```ts
// Modulo Fotovoltaico — gated dal feature flag aziendale fv_modulo_attivo
{ title: "Fotovoltaico", url: "/azienda/marketing/fotovoltaico", icon: Sun, featureKey: "fv_modulo_attivo" },
```

Va rimossa nella FASE 5: il punto di ingresso unico diventa l'Hub Preventivi
(tab "Moduli Vendita").

### 4. Categoria di feature flags già usata per addon

**`category = 'addon'`**

Esempi presenti nel catalogo (`platform_feature_flags`):
- `ai_preventivo` (addon AI)
- `agente_vocale` (addon AI voice — seed in `20260415000001`)
- `hr_personale`, `portale_cliente`, `white_label`, `gps_fleet`
  (seed in `20260417000006`)

Categorie attuali individuate: `core`, `addon`, `ai`, `integration`.

**Decisione**: i nuovi flag dei moduli di vendita verticali useranno una
categoria DEDICATA `category = 'modulo_vendita'` per:
- separare visivamente nella UI superadmin gli addon orizzontali (HR, GPS, …)
  dai moduli di business verticale (Fotovoltaico, Serramenti, …)
- permettere filtri dedicati nella sezione `CompanyModuliVendutaSection`
- preservare la semantica esistente di `addon` per gli upsell trasversali

### 5. Default tab di Preventivi.tsx

**File**: `src/pages/azienda/marketing/Preventivi.tsx`
**Linea**: 152

```ts
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get("tab") || "lista";
```

Tab esistenti (linea ~586, `role="tablist"`):
- `lista` (default, tutti)
- `approvazioni` (solo admin)
- `analisi` (solo admin)

Il refactor aggiunge una quarta tab `moduli` visibile a tutti gli utenti
azienda autenticati, **prima** di `approvazioni` per dare evidenza
immediata all'upsell verticale.

## Baseline tecnica

- `npx tsc --noEmit`: PASS (clean)
- `npm run lint`: 3191 errors / 445 warnings — **preesistenti su main**, non
  regressioni del refactor; esclusi da scope STOP CHECK come da policy
  autonomy + memoria utente
- `git status` working tree pulita prima di FASE 1
- Dev server: non avviato (refactor non blocca runtime fino a FASE 8)

## Mappa file impattati (preview)

| Fase | File |
|------|------|
| 1 | `supabase/migrations/20260427120000_moduli_vendita_feature_flags.sql` (new) |
| 2 | `src/lib/moduli-vendita/{config.ts, useModuliVendita.ts, index.ts}` (new) |
| 3 | `src/components/marketing/preventivi/moduli/{ModuliVendutaTab,ModuloCard,ModuloLockedDialog}.tsx` (new) + `src/pages/azienda/marketing/Preventivi.tsx` (edit) |
| 4 | `src/routes/companyRoutes.tsx` (4 sostituzioni `fv_modulo_attivo` → `modulo_fotovoltaico_attivo`) + `src/lib/fotovoltaico/queries.ts` (wrapper deprecato) |
| 5 | `src/lib/sidebarConfig.ts` (rimozione voce Fotovoltaico) |
| 6 | `src/components/admin/company/CompanyModuliVendutaSection.tsx` (new) + integrazione in pagina dettaglio company |
| 7 | `supabase/functions/richiesta-attivazione-modulo/index.ts` (new) + migration `modulo_richieste_attivazione` |

## Vincoli e regole operative

- Mai duplicare logica feature flags: tutto passa da `useFeatureAccess`
- Mai rompere il modulo Fotovoltaico esistente in produzione
  (chiave nuova `modulo_fotovoltaico_attivo`, vecchia `fv_modulo_attivo`
  rimane disponibile come alias deprecato fino al cleanup post-deploy)
- Branding: arancio EiC `#F97316` / `#F97415`
- Stack: React 18 + TS + Vite + Supabase + shadcn/ui + sonner + React Query
- Naming: tsx PascalCase, hooks `use*` camelCase, DB snake_case
- Locale: `it-IT` per tutti i format
