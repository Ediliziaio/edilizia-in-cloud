# Convenzioni auth — Edge Functions

## Quando usare `verify_jwt = true` / `false`

- **`verify_jwt = true`** (preferito): Supabase gateway blocca chi non ha JWT valido prima ancora che la function venga invocata. Costo: zero righe di auth check inline.
- **`verify_jwt = false`**: serve solo se la function deve essere invocabile da:
  - cron (pg_cron) interno → proteggi con `CRON_SECRET` nell'header
  - webhook esterni (Stripe, Aruba, Meta) → proteggi con HMAC signature
  - chiamate pubbliche (signup, accept-invite, ecc.) → proteggi con altre logiche (token, email verification)

## Pattern standard — funzioni privileged (admin-*, manage-*, sign-in-as-*)

Anche se `verify_jwt = false`, **DEVI** sempre fare auth check inline. Pattern obbligatorio:

```typescript
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    // … business logic …

    return jsonResponse({ ok: true }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;  // requireAuth/requireRole throw Response
    console.error("[<function-name>]", e);
    return errorResponse("Internal error", 500, corsH);
  }
});
```

## Funzioni per il cron o chiamate da un'altra funzione

Con `verify_jwt = false` il gateway lascia passare chiunque, e `verify_jwt = true`
da solo non difende: la chiave anon è un JWT valido ed è pubblica. Il controllo
va nel codice, **prima** di creare il client con la chiave di servizio:

```typescript
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";

Deno.serve(async (req) => {
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();
  // … lavoro …
});
```

Passa chi manda il segreto del cron (`x-cron-secret` / `x-internal-cron-secret`)
o `Authorization: Bearer <chiave di servizio>`. Mai fidarsi del ruolo letto da un
JWT di cui non si è verificata la firma.

Il test `src/test/logic/funzioniSenzaJwtConControllo.test.ts` (in CI con
`test:critical`) ferma una voce `verify_jwt = false` senza controllo nel codice.
Una funzione pubblica di proposito — modulo, pixel, firma via token — va scritta
lì in `PUBBLICHE_DI_PROPOSITO`, col motivo.

## Anti-pattern da evitare

- ❌ Auth check inline duplicato (copia-incolla di `auth.getUser`) — usa gli helper condivisi.
- ❌ Skip dell'auth check perché "tanto è cron" — se la function è privileged, **doppio check**: `CRON_SECRET` + (se chiamabile da user) `requireRole`.
- ❌ `verify_jwt = false` senza un motivo documentato in commento sopra la sezione `[functions.<name>]` in `config.toml`.

## Come aggiungere una nuova function privileged

1. Crea `supabase/functions/<name>/index.ts` usando il pattern standard.
2. In `supabase/config.toml`:
   ```toml
   # admin-X richiede super_admin: auth check fatto inline via requireAuth + requireRole
   [functions.admin-X]
   verify_jwt = false
   ```
3. Esegui `node scripts/check-edge-fn-auth.mjs` localmente prima di pushare. Il CI ricontrolla.

## Helpers disponibili in `_shared/auth.ts`

- `requireAuth(req, corsHeaders) → { userId, supabaseAdmin }` — valida JWT, restituisce service-role client.
- `requireRole(supabaseAdmin, userId, allowedRoles[], corsHeaders) → string` — verifica role, throw `Response(403)` se manca.
- `requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders, opts?)` — tenant boundary check.
- `requireInternalSecret(req)` — verifica `x-internal-secret` per chiamate cron/webhook interni.

Tutti gli helper **throwano una `Response`** in caso di errore: il catch del Deno.serve deve gestirla con `if (e instanceof Response) return e`.
