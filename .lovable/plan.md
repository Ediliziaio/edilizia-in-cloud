

# Aggiungere SITE_URL nelle Impostazioni Super Admin

## Cosa fare
Aggiungere un campo "URL Applicazione" (site_url) nella pagina Impostazioni Piattaforma del Super Admin, salvato in `platform_settings` tramite lo stesso meccanismo `saveMutation` già esistente. Le edge functions leggeranno il valore da `platform_settings` prima di usare il fallback hardcoded.

## Modifiche

### 1. `src/components/admin/settings/PlatformInfoTab.tsx`
Aggiungere una card "URL Applicazione" nella sezione principale, prima delle card API esistenti. Usa il pattern `ApiKeyCard` già presente ma semplificato:
- Campo: `site_url` con label "URL Applicazione"
- Non è un secret (`isSecret: false`)
- Placeholder: `https://edilizia-in-cloud.lovable.app`
- Tooltip: "URL pubblico dell'applicazione, usato per generare link inviti e notifiche email"
- Mostra il valore attuale da `settings?.["site_url"]`

Posizione: subito dopo la card Maintenance e prima di Stripe.

### 2. `supabase/functions/invite-admin/index.ts`
Leggere `site_url` da `platform_settings` (via `getPlatformSetting`) come prima scelta, con fallback a `SITE_URL` env e poi al valore hardcoded.

### 3. `supabase/functions/send-quote-signature/index.ts`
Stesso pattern: leggere `site_url` da `platform_settings` prima di env/hardcoded.

### Dettagli tecnici
- Nessuna migrazione DB necessaria: `platform_settings` è già una tabella key-value generica
- Il `saveMutation` esistente in PlatformInfoTab gestisce già l'upsert tramite `manage-super-admins` → `update-settings`
- Le edge functions useranno `getPlatformSetting("site_url", "SITE_URL")` che già fa query su `platform_settings` con fallback a env

