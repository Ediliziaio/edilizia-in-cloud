

# White Label come Addon a Pagamento — Piano di Implementazione

Questa è una feature complessa che tocca database, admin panel, settings azienda e layout. La suddivido in 4 fasi sequenziali.

---

## Fase 1 — Migrazione Database

**SQL Migration** — Aggiunge colonne white-label su `companies`, crea `company_addons_log`, e bucket storage.

Colonne su `companies`:
- `white_label_enabled` (boolean, default false)
- `brand_primary_color`, `brand_secondary_color`, `brand_accent_color`, `brand_text_on_primary` (text con default)
- `brand_platform_name`, `brand_favicon_url`, `brand_login_bg_url` (text nullable)
- `brand_hide_powered_by` (boolean, default false)
- `white_label_enabled_at` (timestamptz), `white_label_enabled_by` (uuid ref auth.users), `white_label_monthly_price` (numeric)

Tabella `company_addons_log`:
- RLS: solo super_admin (tramite `has_role`)
- Colonne: company_id, addon_key, action, performed_by, performed_by_email, old_value, new_value, notes, created_at

Storage bucket `white-label-assets` (public) con policy upload per company members e lettura pubblica.

Funzione helper `is_super_admin()`.

Aggiorno `Company` in `src/types/auth.ts` con i nuovi campi.

---

## Fase 2 — SuperAdmin: Gestione Addon nel CompanyDetail

**Nuovo componente**: `src/components/admin/company/CompanyAddonsSection.tsx`

Nella sezione "SaaS" tab del CompanyDetail, aggiungo SOPRA i moduli una sezione "Addon a Pagamento" con:

1. **Card White Label**: toggle on/off, campo prezzo mensile editabile, stato (attivo/non attivo con data e autore), note interne
2. **Card Messaggistica Beta**: toggle semplice (riusa `messaging_beta_enabled` esistente)
3. **Dialog di conferma** attivazione con input prezzo + note
4. **Dialog di conferma** disattivazione con avviso
5. **Modal storico** attivazioni da `company_addons_log`

Logica: al toggle ON → dialog conferma → update `companies` + insert `company_addons_log`. Al toggle OFF → dialog conferma → update + log.

**Dashboard Admin**: nuovo widget `AdminAddonsSummary` che mostra conteggio aziende con WL attivo e totale ricavi mensili. Aggiunto come widget opzionale nel `DashboardWidgetLayout`.

---

## Fase 3 — Settings Azienda: Configurazione Branding

**Ristruttura**: `src/pages/azienda/settings/SettingsBranding.tsx`

- **Se `white_label_enabled = false`**: banner "Funzione Premium" con CTA "Contatta il Supporto". Il logo rimane editabile (funzione gratuita base).
- **Se `white_label_enabled = true`**: form completo con:
  - Nome piattaforma (input testo)
  - Palette colori con color picker HEX (4 colori: primary, secondary, accent, text-on-primary) + palette predefinite rapide (8 preset)
  - Preview live inline (strip visuale)
  - Upload favicon (32-64px)
  - Upload sfondo login (1920x1080)
  - Toggle "Nascondi Powered by"
  - Bottone Salva → update `companies` + log `branding_updated`

**Nuovo hook**: `src/hooks/useBrandSettings.ts` — legge i campi `brand_*` e `white_label_enabled` dalla tabella `companies` (non più `company_branding`). Espone `effectiveBrand` con fallback ai default.

La pagina `SettingsBranding` esistente verrà riscritta per usare il nuovo hook e i campi su `companies` invece di `company_branding`.

---

## Fase 4 — Applicazione Brand nell'App

**CompanyLayout.tsx**:
- Importa `useBrandSettings` al posto di `useBranding`
- `useEffect` per iniettare CSS variables (`--brand-primary`, etc.) quando WL attivo
- Sidebar header: usa `effectiveBrand.platformName` al posto del nome fisso
- Active menu items: inline style condizionale con colori brand
- Favicon e `document.title` dinamici

**CustomerLayout.tsx**:
- Stesso `useBrandSettings`, applica CSS variables e nome brand

**Footer "Powered by"**:
- In entrambi i layout, mostra "Powered by EdiliziaInCloud" solo se `!effectiveBrand.hidePoweredBy`

L'hook `useBranding` esistente e la tabella `company_branding` rimangono in piedi (non li eliminiamo), ma il nuovo `useBrandSettings` prende precedenza per il white-label. Il vecchio sistema serve come fallback se necessario.

---

## File modificati/creati

| File | Azione |
|------|--------|
| Migrazione SQL | Crea colonne, tabella log, bucket, funzione |
| `src/types/auth.ts` | Aggiunge campi brand su Company |
| `src/hooks/useBrandSettings.ts` | **Nuovo** — hook brand da companies |
| `src/components/admin/company/CompanyAddonsSection.tsx` | **Nuovo** — sezione addon |
| `src/components/admin/company/CompanySaaSTab.tsx` | Integra CompanyAddonsSection |
| `src/components/admin/dashboard/AdminAddonsSummary.tsx` | **Nuovo** — widget dashboard |
| `src/pages/admin/AdminDashboard.tsx` | Aggiunge widget addon |
| `src/pages/azienda/settings/SettingsBranding.tsx` | Riscrittura completa |
| `src/components/layouts/CompanyLayout.tsx` | Applica brand dinamico |
| `src/components/layouts/CustomerLayout.tsx` | Applica brand dinamico |
| `src/hooks/useCompanyDetail.ts` | Espone campi WL del company |

---

## Note tecniche

- Tutti i colori brand applicati via **inline style** (non classi Tailwind dinamiche)
- Fallback ai colori default della piattaforma quando WL è disattivato o dati mancanti
- La sicurezza è garantita: solo super_admin può attivare/disattivare il flag, l'azienda può solo configurare il branding se abilitata
- Non viene modificata la logica di autenticazione o permessi

