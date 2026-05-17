# Matrice Piani EiC — Edilizia in Cloud

> **Source of truth** per: sales engineering, onboarding, customer success,
> e logica di gating nel codice (`subscription_plans`, `plan_features`,
> `permission_templates`).
>
> Ultimo allineamento: 2026-05-17 · MP-IMP-001 Fase 6
> Verifica programmatica: `node scripts/audit-plans-matrix.mjs`

---

## 1. Piani base

| Piano | Prezzo/mese | Utenti | Target |
|---|---:|---:|---|
| **Starter** | €127 | fino a 3 | ditta individuale, primo cliente |
| **Professional** | €247 | fino a 10 | impresa media (15–50 dipendenti) |
| **Enterprise** | €547 | illimitati | impresa strutturata, fatturato >€1M |

---

## 2. Add-on (acquistabili separatamente, indipendenti dal piano base)

| Add-on | Prezzo/mese | Feature flag DB |
|---|---:|---|
| HR & Personale | €97 | `hr_personale` |
| Controllo di Gestione | €147 | `controllo_gestione_v1` |
| Render AI (100 generazioni/mese incluse) | €197 | `render_ai` |
| Modulo Fotovoltaico | €77 | `modulo_fotovoltaico_attivo` |
| Listini Serramenti Avanzati | €97 | `listini_serramenti_avanzati` |
| Firma Elettronica FEA | €47 | `firma_fea` |
| WhatsApp Business | €87 | `whatsapp` |
| Email Marketing | €57 | `email_marketing` |
| SMS Marketing | €37 | `sms_marketing` |
| Agenti AI custom | €197 | `ai_agents` |
| Dashboard Builder | €37 | `dashboard_builder_v1` |

---

## 3. Feature flag per piano (base, senza add-on)

| Feature flag | Starter | Professional | Enterprise |
|---|:---:|:---:|:---:|
| `documenti` (fatturazione nativa) | ✅ | ✅ | ✅ |
| `fatturazione` (provider esterno) | ✅ | ✅ | ✅ |
| `tesoreria` | ✅ | ✅ | ✅ |
| `orders` (commesse) | ✅ | ✅ | ✅ |
| `customers` | ✅ | ✅ | ✅ |
| `warehouse` (magazzino base) | ✅ | ✅ | ✅ |
| `quotes` (preventivi base) | ✅ | ✅ | ✅ |
| `marketing` (CRM base + pipeline) | — | ✅ | ✅ |
| `cantieri_avanzati` | — | ✅ | ✅ |
| `surveys_module` (sopralluoghi) | — | ✅ | ✅ |
| `email_client` | — | ✅ | ✅ |
| `dashboards_v1` | — | ✅ | ✅ |
| `appaltatore_module` | — | — | ✅ |
| `multi_company_access` | — | — | ✅ |
| `automazioni_advanced` | — | — | ✅ |

Note:
- ✅ = incluso nel piano (nessun add-on richiesto)
- — = non disponibile (richiede upgrade piano o add-on dedicato)
- Una company può attivare un add-on **indipendentemente dal piano base**

---

## 4. Permission key — gating UI

Le 37 `CompanyPermissionKey` definite in `usePermissions.ts` controllano la
visibilità di route, sidebar voices e azioni in pagina. Default per ruolo:

| Ruolo | Permessi di default |
|---|---|
| `company_admin` | tutti i `canView*` + tutti i `canEdit*` |
| `company_staff` | tutti i `canView*` per le aree assegnate (vedi `visibleAreas`) |
| `company_collaborator` | solo le aree esplicitamente assegnate via `staff_permissions` |
| `super_admin` | bypass — vede tutto in ogni company |

### Permission key per area

| Area | View | Edit | Note |
|---|---|---|---|
| Dashboard | `canViewDashboard` | — | sempre on per `company_admin` |
| Cruscotto KPI | `canViewCruscotto` | — | feature `dashboards_v1` |
| Controllo Gestione | `canViewControlloGestione` | — | add-on `controllo_gestione_v1` |
| Ordini / Commesse | `canViewOrders` | `canEditOrders` | feature base `orders` |
| Magazzino | `canViewWarehouse` | `canEditWarehouse` | feature `warehouse` |
| Clienti | `canViewCustomers` | `canEditCustomers` | feature base `customers` |
| Preventivi | `canViewQuotes` | `canEditQuotes` | feature `quotes` |
| Fatturazione | `canViewDocuments` | `canEditDocuments` | feature `documenti` |
| Tesoreria | `canViewTesoreria` | `canEditTesoreria` | |
| Marketing (campagne) | `canViewMarketingAutomations` | `canEditMarketingAutomations` | feature `marketing` |
| Render AI | `canViewRenderAi` | — | add-on `render_ai` |
| Costi azienda | `canViewCosts` | `canEditCosts` | |
| HR / Personale | `canViewHR` | `canEditHR` | add-on `hr_personale` |
| Sopralluoghi | `canViewSurveys` | `canEditSurveys` | feature `surveys_module` |
| Impostazioni: Customization | `canViewSettingsCustomization` | `canEditSettingsCustomization` | tag, campi, pipeline, calendari, listini |
| Impostazioni: Security | `canViewSettingsSecurity` | `canEditSettingsSecurity` | audit log, API, integrazioni |
| Impostazioni: Orders | `canViewSettingsOrders` | `canEditSettingsOrders` | stati ordine, automazioni |
| Impostazioni: People | `canViewSettingsPeople` | `canEditSettingsPeople` | gestione team |

---

## 5. Mapping wrapper Settings → Permission (post MP-IMP-001 Fase 2)

| Pagina settings | Permission key route | Note refactor |
|---|---|---|
| `/impostazioni/tag` | `canViewSettingsCustomization` | wrapper uniformato (3 righe) |
| `/impostazioni/campi-personalizzati` | `canViewSettingsCustomization` | wrapper uniformato |
| `/impostazioni/sequenze` | `canViewSettingsCustomization` | wrapper uniformato |
| `/impostazioni/calendari` | `canViewSettingsCustomization` | già minimo |
| `/impostazioni/automazioni-finanza` | `canViewCosts` | wrapper uniformato |
| `/impostazioni/stati-ordine` | `canViewSettingsOrders` | wrapper uniformato |
| `/impostazioni/listino/import` | `canEditSettingsCustomization` | già minimo |
| `/impostazioni/listino/famiglie/:id` | `canViewSettingsCustomization` | guard view/edit semantico |
| `/impostazioni/sicurezza-privacy` | `canViewSettingsSecurity` | SettingsSecurityHub (4 tab) |
| `/impostazioni/persone` | `canViewSettingsPeople` | SettingsPeople (5 tab) |

---

## 6. Operatività

- **Disattivazione piano**: rimuove i feature flag inclusi nel piano; gli add-on
  attivi separatamente restano.
- **Add-on**: attivabili in qualunque ordine, anche su piano Starter.
- **Credits AI** (Render, Email, SMS): sono separati dal piano/add-on. Si
  ricaricano dal pannello "Crediti" o tramite top-up automatico.
- **Multi-company access**: solo Enterprise. Permette a un utente di switchare
  fra più company senza re-login.
- **Super admin bypass**: i `super_admin` vedono tutte le feature di tutte
  le company senza vincoli di piano.

---

## 7. Riferimenti tecnici

- Tabelle DB: `subscription_plans`, `plan_features`, `company_subscriptions`,
  `company_feature_overrides`, `super_admin_permissions`
- Hook frontend: `usePermissions()` in `src/hooks/usePermissions.ts`
- Guard route: `RequireCompanyPermission` in `src/components/auth/RequireCompanyPermission.tsx`
- Type union: `CompanyPermissionKey` (37 chiavi)
- Sidebar gating: `permissionKey` + `moduleKey` in `src/lib/sidebarConfig.ts`
- Script audit allineamento: `scripts/audit-plans-matrix.mjs` (legge DB)

## 8. Modifiche & versioning

Ogni modifica a questo documento deve essere accompagnata da:

1. Aggiornamento delle tabelle DB corrispondenti (`subscription_plans`,
   `plan_features`) con migration dedicata.
2. Run di `scripts/audit-plans-matrix.mjs` per verificare allineamento.
3. Aggiornamento di `usePermissions()` se nuove chiavi.
4. Commit con messaggio `docs(plans): <changeset>`.
