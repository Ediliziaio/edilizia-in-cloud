

# Sistema Partner/Referral Stile GHL — Piano di Implementazione

Questo è un sistema molto complesso con 6 prompt. Lo suddivido in fasi gestibili, partendo dal database e costruendo iterativamente.

---

## Stato Attuale

- Tabelle esistenti: `referrers` (con `user_id`), `referral_companies`, `referral_payouts`
- RLS: referrer self-access via `user_id`, super_admin bypass
- Portale partner base: `/partner` con `PartnerPortal.tsx` (dashboard semplice con stats e tabelle aziende/pagamenti)
- `PartnerLayout.tsx` con sidebar (solo Dashboard e Profilo)
- Ruolo `referrer` già gestito nel routing (`/partner`)
- **Mancante**: tier system, click tracking, commission ledger, materiali, payout workflow, notifiche, URL tracking

---

## Fase 1 — Migrazione Database

Una singola migrazione SQL che crea:

| Oggetto | Descrizione |
|---------|-------------|
| `referral_tiers` | 4 tier default (Bronze/Silver/Gold/Platinum) con soglie e moltiplicatori |
| Colonne su `referrers` | `tier_id`, `partner_type`, `payout_method`, `payout_details`, `has_accepted_terms`, `terms_accepted_at`, `total_clicks`, `total_conversions`, `conversion_rate` |
| `referral_clicks` | Tracking click con IP, user agent, UTM, converted flag |
| `referral_commission_ledger` | Registro commissioni mensili per referrer/company/periodo |
| Colonne su `referral_payouts` | `status`, `requested_by_referrer`, `approved_by`, `approved_at`, `rejection_reason`, `transaction_reference` |
| `partner_materials` | Materiali marketing scaricabili con tier minimo |
| Funzioni SQL | `update_referrer_tier()`, `calculate_monthly_commissions()`, `increment_referrer_clicks()` |
| RLS | Super admin full access su tutte le nuove tabelle; partner self-access su ledger e clicks propri; accesso materiali basato su tier |

---

## Fase 2 — Edge Function + URL Tracking

**Edge function `track-referral-click`**: endpoint pubblico (verify_jwt=false) che riceve `referral_code` + UTM params, registra il click e incrementa `total_clicks`.

**Login page** (`LoginForm.tsx`): cattura `?ref=` dall'URL, salva in `sessionStorage`, invoca la edge function per tracking. Il codice viene passato automaticamente alla creazione company.

---

## Fase 3 — Portale Partner Completo

Espando il portale `/partner` da 1 pagina a 6 pagine:

| Route | Componente | Contenuto |
|-------|-----------|-----------|
| `/partner` | `PartnerDashboard.tsx` | KPI cards, progressi tier, link referral, ultime aziende, grafico click/conversioni |
| `/partner/link` | `PartnerLink.tsx` | Link con UTM builder, QR code, condivisione WhatsApp/Email, stats click per sorgente |
| `/partner/commissioni` | `PartnerCommissions.tsx` | Ledger commissioni filtrato per mese/anno, KPI strip, grafico mensile |
| `/partner/payout` | `PartnerPayout.tsx` | Richiesta pagamento self-service, storico pagamenti con status |
| `/partner/materiali` | `PartnerMaterials.tsx` | Grid materiali scaricabili filtrati per tier, lock su materiali superiori |
| `/partner/profilo` | `PartnerProfile.tsx` | Dati personali, dati pagamento (IBAN/PayPal), tipo partner, termini |

**PartnerLayout.tsx**: sidebar aggiornata con tutte le 6 voci + badge tier + user info.

**Onboarding**: modal obbligatorio al primo accesso se `has_accepted_terms = false`.

---

## Fase 4 — Admin Dashboard Migliorato

Aggiornamenti al `ReferralDashboard.tsx`:

- **Tab "Payout"** con badge: lista richieste pending, azioni Approva/Rifiuta, storico, export CSV
- **Tab "Tier & Materiali"**: gestione tier (visualizzazione), CRUD materiali marketing
- **ReferralTable.tsx**: nuove colonne (tier badge, click, conversion rate), azione ricalcola tier
- **Tab Analytics**: bottone "Calcola Commissioni Mese", leaderboard top partner, export CSV ledger
- **ReferrerDialog.tsx**: campi aggiuntivi (partner_type, payout_method)

---

## Fase 5 — Notifiche Email

**Edge function `send-partner-notification`**: gestisce 5 tipi di notifica (welcome, conversion, commission_calculated, payout_approved, tier_upgrade). Invocata automaticamente nei momenti chiave.

Integrazione nei flussi esistenti:
- Creazione referrer → welcome
- Nuova conversione → conversion
- Calcolo commissioni → commission_calculated
- Approvazione payout → payout_approved
- Cambio tier → tier_upgrade

---

## Fase 6 — Integrazione nel Routing

**App.tsx**: aggiunta route figlie sotto `/partner` per le 6 pagine.

---

## File Creati/Modificati

| File | Azione |
|------|--------|
| Migrazione SQL | Crea tabelle, colonne, funzioni, RLS |
| `supabase/functions/track-referral-click/index.ts` | **Nuovo** |
| `supabase/functions/send-partner-notification/index.ts` | **Nuovo** |
| `supabase/config.toml` | Aggiunta verify_jwt=false per le 2 nuove functions |
| `src/pages/partner/PartnerDashboard.tsx` | **Nuovo** (riscrive PartnerPortal) |
| `src/pages/partner/PartnerLink.tsx` | **Nuovo** |
| `src/pages/partner/PartnerCommissions.tsx` | **Nuovo** |
| `src/pages/partner/PartnerPayout.tsx` | **Nuovo** |
| `src/pages/partner/PartnerMaterials.tsx` | **Nuovo** |
| `src/pages/partner/PartnerProfile.tsx` | **Nuovo** |
| `src/pages/partner/PartnerOnboardingModal.tsx` | **Nuovo** |
| `src/components/layouts/PartnerLayout.tsx` | Aggiorna sidebar con 6 voci + tier badge |
| `src/components/auth/LoginForm.tsx` | Aggiunge cattura `?ref=` e tracking |
| `src/pages/admin/ReferralDashboard.tsx` | Aggiunge tab Payout e Tier & Materiali |
| `src/components/admin/referral/ReferralTable.tsx` | Colonne tier, click, conversion |
| `src/components/admin/referral/ReferralAnalytics.tsx` | Leaderboard + calcolo commissioni + CSV |
| `src/components/admin/referral/PayoutApprovalTab.tsx` | **Nuovo** |
| `src/components/admin/referral/TierMaterialsTab.tsx` | **Nuovo** |
| `src/components/admin/referral/ReferrerDialog.tsx` | Campi aggiuntivi |
| `src/App.tsx` | Route partner figlie |

---

## Note

- Il QR code verrà generato lato client con una libreria leggera (o inline SVG) senza dipendenze aggiuntive pesanti
- L'export CSV usa generazione client-side con `Blob` + download
- I tier si aggiornano automaticamente — nessun intervento manuale admin
- Le commissioni nel ledger partono come `pending` — richiedono approvazione admin
- La edge function `track-referral-click` è pubblica (no JWT) perché viene invocata prima del login

