

# Piano: Security Hardening Completo

## Analisi delle vulnerabilita' effettive

Ho verificato tutte le 50+ edge functions. Ecco la classificazione:

### Funzioni SENZA autenticazione (CRITICHE)
| Funzione | Rischio |
|----------|---------|
| `create-customer` | Chiunque puo' creare utenti. Nessun auth check. |
| `create-company` | Chiunque puo' creare aziende + admin. Nessun auth check. |

### Funzioni con `Math.random()` per password (4 file)
| Funzione | Note |
|----------|------|
| `create-customer` | `Math.random()` + password in chiaro nella risposta |
| `reset-customer-password` | `Math.random()` + password in chiaro nella risposta |
| `create-company-staff` | `Math.random()` + password in chiaro nella risposta |
| `create-salesperson-user` | Usa `crypto.randomUUID()` (meglio) ma restituisce password |
| `create-employee-user` | Usa `crypto.randomUUID()` (meglio) ma restituisce password |

### Funzioni GIA' protette (nessun intervento necessario)
`maps-proxy`, `manage-super-admins`, `sign-in-as-user`, `delete-company-user`, `create-salesperson-user`, `create-employee-user`, `topup-credits` -- tutte verificano JWT + ruolo.

### Funzioni correttamente pubbliche (webhook/callback)
`stripe-webhook`, `whatsapp-webhook`, `telnyx-webhook`, `meta-webhook`, `email-provider-webhook`, `email-tracking`, `meta-oauth-callback` -- devono restare pubbliche (ricevono callback esterni).

### Fallback XOR in `_shared/encryption.ts`
Il decrypt mantiene un fallback XOR legacy che indebolisce la cifratura.

---

## Implementazione in 4 fasi

### Fase 1 -- Shared Auth Middleware + Secure Password Generator

**File nuovo: `supabase/functions/_shared/auth.ts`**

Middleware condiviso con 2 funzioni:
- `requireAuth(req, corsHeaders)` -- verifica JWT via `getClaims()` con fallback `getUser()`, ritorna `{ userId, supabaseAdmin }` o lancia errore 401
- `requireRole(supabaseAdmin, userId, allowedRoles[], corsHeaders)` -- verifica ruolo in `user_roles`, ritorna il ruolo trovato o lancia 403

**File nuovo: `supabase/functions/_shared/securePassword.ts`**

- `generateSecurePassword(length=12)` -- usa `crypto.getRandomValues()` con charset complesso (maiuscole, minuscole, numeri, simboli). Garantisce almeno 1 char per categoria tramite Fisher-Yates shuffle crittografico.

### Fase 2 -- Proteggere le funzioni critiche

**`create-customer/index.ts`**
- Aggiungere auth check: richiedere JWT valido + ruolo `company_admin` o `super_admin`
- Verificare che il `company_id` del payload corrisponda a quello del caller (tranne super_admin)
- Sostituire `generateSecurePassword` con quella da `_shared/securePassword.ts`

**`create-company/index.ts`**
- Aggiungere auth check: richiedere JWT valido + ruolo `super_admin`
- Solo super admin possono creare nuove aziende

**`create-company-staff/index.ts`**
- Sostituire `generateTemporaryPassword` con `generateSecurePassword` da shared
- (Auth check gia' presente, OK)

**`reset-customer-password/index.ts`**
- Sostituire `generateSecurePassword` con quella da `_shared/securePassword.ts`
- (Auth check gia' presente, OK)

### Fase 3 -- Eliminare fallback XOR + Security Headers

**`_shared/encryption.ts`**
- Rimuovere la funzione `encryptSync` (XOR)
- Nel `decrypt()`, se il testo non ha prefisso `aes:`, loggare warning e lanciare errore invece di decrittare con XOR. I token legacy devono essere migrati.

**Security headers condivisi** -- aggiungere a `corsHeaders` in tutte le funzioni:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

Creare `_shared/headers.ts` con corsHeaders + security headers pre-combinati, da importare ovunque.

### Fase 4 -- Input Validation + Rate Limiting

**`create-customer`** e **`create-company`**: aggiungere validazione:
- Email: regex + max 255 chars
- Nome/cognome: max 100 chars, trim, non vuoti
- Password (create-company): min 8 chars

**Rate limiting** su `create-customer` e `create-company`:
- Max 20 chiamate / 5 minuti per utente autenticato

---

## File da creare/modificare

| File | Fase |
|------|------|
| `supabase/functions/_shared/auth.ts` (nuovo) | 1 |
| `supabase/functions/_shared/securePassword.ts` (nuovo) | 1 |
| `supabase/functions/_shared/headers.ts` (nuovo) | 3 |
| `supabase/functions/create-customer/index.ts` | 2, 4 |
| `supabase/functions/create-company/index.ts` | 2, 4 |
| `supabase/functions/create-company-staff/index.ts` | 2 |
| `supabase/functions/reset-customer-password/index.ts` | 2 |
| `supabase/functions/_shared/encryption.ts` | 3 |

## Note importanti

- **Non tocchiamo `config.toml`**: `verify_jwt = false` deve restare perche' il sistema signing-keys di Lovable Cloud lo richiede. L'autenticazione viene validata in codice.
- **Password in chiaro nelle risposte**: necessario per il workflow attuale (admin crea utente → vede password → la comunica). L'alternativa (invite link) richiederebbe un redesign del flusso UX che va oltre questo hardening. Le password vengono gia' inviate via email quando il provider e' configurato.
- **CORS `*`**: accettabile perche' gli endpoint sono protetti da JWT. Restringere a domini specifici e' possibile ma richiederebbe gestire multi-tenant (ogni azienda ha dominio diverso).

