

# Piano: Potenziamento API Keys — Scopes Granulari e Wizard 2-Step

## Situazione Attuale
La tabella `api_keys` e la pagina `SettingsApiKeys` **esistono già** con funzionalità base (CRUD via edge function `api-gateway`, tab utilizzo, tab documentazione). La pagina attuale usa scopes semplici (`read`, `write`, `orders`, `contacts`, `webhooks`) e non ha: scopes granulari per modulo, wizard a 2 step, campo scadenza, colonna `revoked_at`, sezione chiavi revocate separata.

## Cosa NON serve
- Nuova tabella `api_keys` — esiste già
- Nuova route/sidebar — già presente (`/azienda/impostazioni/api`)
- Edge function `api-gateway` — già funzionante

## Modifiche

### 1. Migrazione DB — Aggiungere `revoked_at`
La tabella `api_keys` non ha la colonna `revoked_at`. Aggiunta con migrazione:
```sql
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
```

### 2. Nuovi file
- **`src/types/apiKeys.ts`**: Costante `API_SCOPE_GROUPS` con 7 gruppi (CRM, Ordini, Calendario, Task, Prodotti, Report, Avanzate) e 13 scopes granulari. Interfacce `ApiKey`, `ApiScopeGroup`, `ApiScope`. Helper `ALL_SCOPE_IDS`.
- **`src/lib/apiKeyUtils.ts`**: Utility `generateApiKey()` (formato `sk_live_...`), `hashApiKey()` (SHA-256), `getKeyPrefix()`, `computeExpiresAt()` con tipo `ExpiryOption`.
- **`src/hooks/useApiKeys.ts`**: Hook `useApiKeys(companyId)` (query diretta su tabella, non più via edge function), `useCreateApiKey` (genera chiave nel browser, salva solo hash), `useRevokeApiKey` (set `is_active=false` + `revoked_at`).

### 3. Riscrittura `SettingsApiKeys.tsx`
Sostituzione completa preservando i tab Usage e Docs esistenti (`ApiUsageChart`, `ApiDocsTab`).

**Tab Chiavi API** rinnovato:
- **Info box** sicurezza (non condividere, variabili d'ambiente, 100 req/min)
- **Sezione chiavi attive**: card per chiave con prefisso mascherato, scope badges (max 4 + "+N"), last used, scadenza, badge "Scaduta" se expired, pulsante revoca con AlertDialog
- **Sezione chiavi revocate**: collassabile, solo nome + prefisso + data revoca
- **Dialog crea** a 2 step:
  - Step 1: nome, scadenza (select: mai/30d/90d/1y), scopes con checkbox raggruppate per modulo + "seleziona/deseleziona tutti"
  - Step 2: mostra chiave generata con warning rosso "non sarà più visibile", pulsante copia, riepilogo (nome, scadenza, scopes)

### File impattati
- Migrazione DB (aggiunta `revoked_at`)
- `src/types/apiKeys.ts` (nuovo)
- `src/lib/apiKeyUtils.ts` (nuovo)
- `src/hooks/useApiKeys.ts` (nuovo)
- `src/pages/azienda/settings/SettingsApiKeys.tsx` (riscrittura)

### Note
- Le query passano da edge function (`api-gateway`) a query dirette su `api_keys` (RLS già presente) — più semplice e veloce
- I tab "Utilizzo" e "Documentazione" vengono mantenuti invariati
- `created_by` è required nella tabella — verrà impostato nel hook con l'ID utente corrente
- `formatRelativeTime` e `formatDate` da `src/lib/formatters.ts`

