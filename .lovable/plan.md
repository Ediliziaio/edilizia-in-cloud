

# Verifica Fase 1 + Piano Implementazione Fase 2 e 3

## Verifica Fase 1 — Revenue Intelligence

**Stato: COMPLETATA e funzionante.** Tutti i componenti sono implementati:

| Componente | Status | Note |
|-----------|--------|------|
| Revenue KPIs (MRR, ARR, NRR, LTV) | OK | Calcoli corretti, fallback sensati |
| MRR Movements chart | OK | expansion/contraction = 0 (serve storico cambi piano — accettabile) |
| Revenue per Settore | OK | Mostra "Nessun dato" perche tutte le aziende sono in trial (corretto) |
| Health Score Tenant | OK | Algoritmo 0-100, 3 livelli, lista at-risk |
| Trial Intelligence | OK | Conversion rate, scoring caldo/freddo, milestones, alert, trend storico |
| get_company_health_data RPC | OK | Query server-side efficiente |

**Nessun bug riscontrato.** I dati vuoti in alcune sezioni (Revenue per Settore, MRR Movements) sono corretti: riflettono il fatto che entrambe le aziende sono in stato "trial" senza piano attivo pagato.

## Verifica Fase 2 — Retention

**Stato: NON IMPLEMENTATA.** Nessun componente esiste per Company Lifecycle, Dunning, o Announcements.

## Piano Implementazione — Fase 2: Retention

### 2A. Company Lifecycle Management
- **Nuova pagina** `/admin/lifecycle` con sidebar nav entry
- **Onboarding Checklist per azienda**: card che mostra per ogni company lo stato dei passi (profilo completo, primo utente staff, primo cliente, primo ordine, logo caricato) — calcolato dalla health data esistente
- **Trial Extension UI**: bottone per estendere trial_ends_at direttamente dalla lista (update su tabella companies, nessuna migrazione necessaria)
- **Win-back list**: filtro aziende con status "expired" + data scadenza + health score, con link al dettaglio

### 2B. Dunning Dashboard
- **Nuovo componente** nella dashboard principale (non serve pagina separata, dato che Stripe non e' integrato per tutti)
- Card con: aziende con trial scaduto (expired), aziende senza piano assegnato, aziende con payment_method = "none"
- **Revenue at risk**: MRR delle aziende at_risk + critical (gia calcolato nel health score)

### 2C. Announcements & Changelog
- **Nuova tabella** `platform_announcements` (id, title, content, type: banner|changelog|maintenance, target_status: all|trial|active, is_active, created_at, expires_at)
- **Pagina admin** `/admin/annunci` per CRUD annunci
- **Banner in-app** nel CompanyLayout che mostra annunci attivi filtrati per status dell'azienda
- RLS: super_admin puo CRUD, authenticated puo leggere annunci attivi

## Piano Implementazione — Fase 3: Scalability

### 3A. Feature Usage Analytics
- Card nella dashboard che mostra per ogni modulo (ordini, calendario, magazzino, marketing, dipendenti) quante aziende lo usano attivamente
- Calcolato dalle tabelle esistenti (count ordini > 0, count appointments > 0, etc.)
- Nessuna nuova tabella necessaria

### 3B. System Health Dashboard
- Card con metriche dagli edge function logs (se disponibili via API)
- Conteggio errori sync log esistenti (tabella google_calendar_sync_log)
- Storage usage placeholder (non disponibile direttamente)

### 3C. Broadcast Communication (semplificato)
- Integrato con Announcements: tipo "broadcast" che viene mostrato come notifica una tantum

## File coinvolti

| Intervento | File nuovi | File modificati |
|-----------|-----------|----------------|
| Lifecycle | `src/pages/admin/CompanyLifecycle.tsx` | `App.tsx`, `AdminLayout.tsx` |
| Dunning | `src/components/admin/dashboard/AdminDunning.tsx` | `AdminDashboard.tsx`, `useAdminRevenueData.ts` |
| Announcements | `src/pages/admin/Announcements.tsx`, `src/components/admin/dashboard/AdminAnnouncements.tsx`, `src/components/company/AnnouncementBanner.tsx` | `App.tsx`, `AdminLayout.tsx`, `CompanyLayout.tsx` |
| Feature Usage | `src/components/admin/dashboard/AdminFeatureUsage.tsx` | `AdminDashboard.tsx`, `useAdminRevenueData.ts` |
| System Health | `src/components/admin/dashboard/AdminSystemHealth.tsx` | `AdminDashboard.tsx` |
| **DB Migration** | 1 migration: `platform_announcements` table + RLS | — |

## Ordine di esecuzione
1. DB migration (tabella announcements)
2. Company Lifecycle page + route
3. Dunning dashboard card
4. Announcements CRUD + banner in-app
5. Feature Usage Analytics card
6. System Health card

