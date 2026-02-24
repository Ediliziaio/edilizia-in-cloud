

# Configurazione API Meta da UI Super Admin

## Obiettivo
Aggiungere una sezione "Integrazioni Piattaforma" nel tab "Piattaforma" delle Impostazioni Super Admin, dove configurare META_APP_ID e META_APP_SECRET direttamente dalla UI invece di gestirli come secrets backend.

## Architettura

I valori vengono salvati in una nuova tabella `platform_settings` (key-value store) accessibile solo ai super admin. Le Edge Functions Meta leggono da questa tabella (con fallback ai secrets di ambiente per retrocompatibilita').

```text
+---------------------------+
|  Super Admin UI           |
|  (PlatformInfoTab.tsx)    |
|  - Meta App ID input      |
|  - Meta App Secret input  |
|  - Salva button           |
+----------+----------------+
           |
           v
+----------+----------------+
|  Edge Function             |
|  manage-super-admins       |
|  action: "get-settings"    |
|  action: "update-settings" |
+----------+-----------------+
           |
           v
+----------+-----------------+
|  DB: platform_settings     |
|  key | value | updated_by  |
+----------------------------+
```

---

## Dettagli Tecnici

### 1. Nuova tabella DB: `platform_settings`

```sql
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Solo super admin possono leggere/scrivere
CREATE POLICY "Super admins can manage platform settings"
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
```

### 2. Edge Function `manage-super-admins` -- nuove azioni

- **`get-settings`**: Legge le chiavi `meta_app_id` e `meta_app_secret` dalla tabella, restituendo il valore mascherato per il secret (solo ultimi 4 char).
- **`update-settings`**: Salva/aggiorna le chiavi. Valida che i valori non siano vuoti. Logga nell'audit trail.

### 3. Edge Functions Meta -- fallback chain

Le 6 Edge Functions Meta (`meta-oauth-start`, `meta-oauth-callback`, `meta-api-proxy`, `meta-webhook`, `meta-process-leads`, `meta-health-check`) verranno aggiornate per:
1. Leggere prima da `platform_settings` (query con service role)
2. Se non trovato, fallback a `Deno.env.get("META_APP_ID")` / `Deno.env.get("META_APP_SECRET")`

Questo garantisce retrocompatibilita' totale.

### 4. UI -- Nuova card in PlatformInfoTab

Aggiungere una card "Integrazioni Meta" sotto le info piattaforma esistenti con:
- Campo `Meta App ID` (input text, visibile)
- Campo `Meta App Secret` (input password, mascherato, mostra ultimi 4 char quando salvato)
- Bottone "Salva configurazione"
- Stato: indicatore se configurato o meno
- Info tooltip: "Queste credenziali vengono usate da tutte le aziende per il collegamento OAuth Meta"

### 5. Sicurezza

- I valori sono salvati in chiaro nella tabella ma protetti da RLS (solo super admin)
- Il secret viene mascherato nella risposta API (solo ultimi 4 caratteri visibili)
- Audit trail su ogni modifica
- Nessun secret esposto nel client oltre alla risposta dell'edge function autenticata

---

## File da creare/modificare

| File | Azione |
|------|--------|
| Migrazione SQL | Crea tabella `platform_settings` con RLS |
| `supabase/functions/manage-super-admins/index.ts` | Aggiungi azioni `get-settings` e `update-settings` |
| `src/components/admin/settings/PlatformInfoTab.tsx` | Aggiungi card "Integrazioni Meta" con form |
| `supabase/functions/meta-oauth-start/index.ts` | Fallback: DB prima, env dopo |
| `supabase/functions/meta-oauth-callback/index.ts` | Fallback: DB prima, env dopo |
| `supabase/functions/meta-api-proxy/index.ts` | Fallback: DB prima, env dopo |
| `supabase/functions/meta-webhook/index.ts` | Fallback: DB prima, env dopo |
| `supabase/functions/meta-process-leads/index.ts` | Fallback: DB prima, env dopo (per page token refresh) |
| `supabase/functions/meta-health-check/index.ts` | Fallback: DB prima, env dopo |

---

## Impatto

- Nessuna rottura: i secrets di ambiente continuano a funzionare come fallback
- Centralizzazione: il Super Admin puo' aggiornare le credenziali Meta senza toccare i secrets backend
- Audit: ogni modifica e' tracciata
- UX: flusso chiaro e coerente con il resto del pannello Piattaforma
