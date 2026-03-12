

# White-Label Completo: Piano di Implementazione

## Stato attuale

Il sistema white-label è **già ampiamente implementato**:

| Componente | Stato |
|---|---|
| `companies.white_label_enabled` + brand_* fields | Presente |
| `company_branding` table in DB | Presente (custom_domain, login_bg_color, login_logo_url, etc.) |
| `useBrandSettings` hook (reads from companies) | Presente |
| `useBranding` hook (reads from company_branding) | Presente |
| `SettingsBranding.tsx` — colori, nome, favicon, logo, sfondo login | Presente |
| `CompanyAddonsSection.tsx` — admin toggle + prezzo + storico | Presente |
| CompanyLayout/CustomerLayout — CSS vars dinamiche | Presente |
| `CompanyLayout` branding logo nella sidebar | Presente |

## Cosa manca (da implementare)

### 1. Login page dinamica (BUG: branding hardcodato)
`LoginForm.tsx` mostra sempre il logo "Edilizia in Cloud" hardcodato. Deve:
- Rilevare il dominio corrente (`window.location.hostname`)
- Cercare nella tabella `company_branding` un record con `custom_domain` corrispondente
- Se trovato e attivo: mostrare logo, nome piattaforma e colore sfondo dell'azienda
- Se non trovato: mostrare il branding di default

### 2. Subdomain e custom domain (DB + UI)
La tabella `company_branding` ha già `custom_domain` ma manca:
- Colonne `subdomain`, `custom_domain_verified`, `custom_domain_cname`, `custom_domain_verified_at`
- UI per configurare subdomain e custom domain in `SettingsBranding.tsx`
- Migrazione DB per le colonne mancanti

### 3. Edge function `verify-custom-domain`
Non esiste. Serve per verificare che il CNAME DNS sia configurato correttamente.

### 4. Hook `useBrandingByDomain`
Non esiste. Serve per la login page per caricare il branding dal dominio.

## Piano implementazione

### Fase 1 — DB Migration
- Aggiungere colonne a `company_branding`: `subdomain` (UNIQUE), `custom_domain_verified`, `custom_domain_cname`, `custom_domain_verified_at`, `platform_name`, `is_active`
- Aggiungere policy di lettura pubblica per branding attivi (necessaria per login non autenticata)

### Fase 2 — Hook `useBrandingByDomain`
- Nuovo hook in `src/hooks/useCompanyBranding.ts` che cerca branding per custom_domain o subdomain
- Mutations per salvare subdomain/custom domain e richiedere verifica

### Fase 3 — Login page dinamica
- Modificare `LoginForm.tsx` per usare `useBrandingByDomain` basato su hostname
- Pannello sinistro: logo, nome e colore sfondo dinamici

### Fase 4 — Sezione domini in SettingsBranding
- Aggiungere sezione "Subdomain" e "Dominio Personalizzato" nel form `SettingsBranding.tsx`
- UI per configurazione DNS con istruzioni CNAME e pulsante "Verifica"

### Fase 5 — Edge function verify-custom-domain
- Crea `supabase/functions/verify-custom-domain/index.ts`
- Verifica CNAME via DNS-over-HTTPS (Cloudflare)
- Aggiorna `custom_domain_verified` nel DB

### File impattati
- `company_branding` table — migrazione nuove colonne
- `src/hooks/useCompanyBranding.ts` — nuovo file con hook domain-based
- `src/components/auth/LoginForm.tsx` — branding dinamico
- `src/pages/azienda/settings/SettingsBranding.tsx` — sezioni subdomain/domain
- `supabase/functions/verify-custom-domain/index.ts` — nuovo edge function

