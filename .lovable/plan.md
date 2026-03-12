

# White-Label: Audit dello stato attuale

## Gia implementato (nessun intervento necessario)

| Componente | Stato |
|---|---|
| Login page dinamica con branding da dominio | Presente in `LoginForm.tsx` via `useBrandingByDomain` |
| Hook `useBrandingByDomain` con subdomain + custom domain | Presente in `src/hooks/useBrandingByDomain.ts` |
| Settings branding completo (colori, logo, favicon, login BG, nome piattaforma) | Presente in `SettingsBranding.tsx` |
| Subdomain configuration UI | Presente in `SettingsBranding.tsx` |
| Custom domain configuration + verifica CNAME | Presente in `SettingsBranding.tsx` + edge function `verify-custom-domain` |
| Edge function `verify-custom-domain` | Presente |
| CSS vars dinamiche nei layout (CompanyLayout, CustomerLayout) | Presente via `useBrandSettings` |
| Admin toggle white-label per azienda | Presente via `CompanyAddonsSection` (addon a pagamento) |
| Premium gate per aziende senza WL | Presente in `SettingsBranding.tsx` |
| Audit log operazioni addon | Presente via `company_addons_log` |

## Architettura attuale vs prompt

Il prompt suggerisce un campo `includes_whitelabel` sui piani + un `BrandingContext` globale. L'architettura attuale usa un approccio diverso ma equivalente:

- **Gating**: `companies.white_label_enabled` (toggle diretto per azienda, gestito dal super admin via addon) invece di `subscription_plans.includes_whitelabel`
- **CSS vars**: applicati direttamente nei layout via `useBrandSettings` hook, senza un context React separato
- **Admin control**: `CompanyAddonsSection` in `CompanySaaSTab` gestisce attivazione/disattivazione con prezzo e storico

## Conclusione

**Tutto il sistema White-Label richiesto e' gia implementato.** L'architettura e' leggermente diversa da quella proposta nel prompt (addon-based vs plan-based), ma copre tutte le funzionalita: login brandizzato, colori custom, subdomain, custom domain con verifica CNAME, favicon, nome piattaforma, premium gate e admin toggle.

Non ci sono interventi necessari.

