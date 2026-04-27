# Refactor Preventivi Hub + Moduli Vendita Verticali — STATUS

Branch: `feature/preventivi-hub-moduli-vendita`
Base: `main` @ `105392e5`
Data ultimo aggiornamento: 2026-04-27

## Sintesi

Tutte le 7 fasi implementative sono state completate; testing strutturato (FASE 8)
e documentazione finale (FASE 9) sono questo file. Branch pronto per il merge in
`main` previa validazione manuale dei flussi descritti sotto.

## Stato fasi

| Fase | Descrizione | Stato | Commit |
|------|-------------|-------|--------|
| 0 | Contesto + baseline | ✅ | `d0a7ec5a` |
| 1 | Migration feature flags moduli vendita | ✅ | `59c8ed14` |
| 2 | `src/lib/moduli-vendita/` (config + hook) | ✅ | `0af25cea` |
| 3 | Tab "Moduli Vendita" + 3 componenti | ✅ | `0734b093` |
| 4 | Routing fotovoltaico → nuovo flag | ✅ | `5f50e670` |
| 5 | Rimozione voce sidebar Fotovoltaico | ✅ | `d9937c3c` |
| 6 | `CompanyModuliVendutaSection` SuperAdmin | ✅ | `1558174f` |
| 7 | Edge function + tabella audit | ✅ | `cc66b5d6` |
| 8 | Testing end-to-end + audit DB | 🟡 manuale (vedi sotto) |
| 9 | STATUS.md + push + PR | 🟡 in corso |

## Validazioni automatiche

- **`npx tsc --noEmit`**: ✅ PASS (clean su tutti i commit del branch)
- **ESLint sui file nuovi/toccati direttamente** (`src/lib/moduli-vendita/`,
  `src/components/marketing/preventivi/moduli/`,
  `src/components/admin/company/CompanyModuliVendutaSection.tsx`): ✅ PASS
- **ESLint progetto totale**: 3191 errori / 22 warning **preesistenti su main**,
  nessuna regressione introdotta dal refactor (verificato con eslint mirato).

## Test plan manuale (FASE 8 — da eseguire post-merge)

### A. Smoke test utente azienda

1. Login con `demo@azienda.srl / Demo2026Azienda`
2. Apri `/azienda/marketing/preventivi`
   → la tab "Moduli Vendita" deve essere presente tra Lista e Approvazioni
3. Click su tab "Moduli Vendita"
   → grid 1/2/3 colonne con 6 card; Fotovoltaico mostra stato corretto
4. Click su una card "In arrivo" (es. Bagni)
   → button disabilitato, badge "In arrivo" visibile
5. Click su una card "Premium" (modulo non attivo)
   → si apre `ModuloLockedDialog` con benefici + prezzo €/mese
6. Click "Richiedi attivazione" → toast successo + dialog si chiude
7. Click su card "Attivo" (Fotovoltaico se feature flag true)
   → naviga a `/azienda/marketing/fotovoltaico` (FotovoltaicoIndex)
8. Verifica sidebar: NON deve esserci più la voce "Fotovoltaico"
9. Verifica accesso diretto via URL: `/azienda/marketing/fotovoltaico`
   → se flag attivo → carica modulo; se non attivo → redirect upgrade page

### B. Smoke test SuperAdmin

1. Login come super_admin
2. Vai a Companies → seleziona una company → tab "Subscription"
3. Verifica presenza sezione **"Moduli Vendita Verticali"** sopra
   `CompanyFeatureOverridesCard`
4. Toggle ON un modulo (es. Fotovoltaico)
   → toast successo + badge "Attivo" appare
5. Click "Modifica" sulla card → dialog con scadenza + prezzo + note
6. Compila scadenza tra 30 giorni + prezzo €99 + note "trial commerciale"
   → click "Salva override" → toast successo
7. Verifica persistenza ricaricando pagina
8. Verifica DB: `select * from company_feature_overrides where feature_key = 'modulo_fotovoltaico_attivo'`

### C. Smoke test impersonation super_admin

1. SuperAdmin: impersona la company del punto B
2. Vai a `/azienda/marketing/preventivi?tab=moduli`
3. Tutte le card devono apparire come "Attivo" per via del bypass
   `useFeatureAccess` (source: "bypass")

### D. Verifica zero regressioni Fotovoltaico produzione

1. Verifica via SQL il backfill della migration FASE 1:
   ```sql
   -- Tutte le company con fv_modulo_attivo=true devono avere
   -- override modulo_fotovoltaico_attivo=true
   SELECT c.id, c.name, c.fv_modulo_attivo, o.is_enabled
   FROM public.companies c
   LEFT JOIN public.company_feature_overrides o
     ON o.company_id = c.id
    AND o.feature_key = 'modulo_fotovoltaico_attivo'
   WHERE c.fv_modulo_attivo = TRUE;
   ```
2. Tutte devono avere `o.is_enabled = TRUE`
3. Verifica bidirezionale: nessuna company con override su
   `modulo_fotovoltaico_attivo` ma `fv_modulo_attivo = FALSE` non documentato.

## Audit DB queries (post-deploy)

```sql
-- 1. Catalogo nuovi flag presente
SELECT key, name, category, default_value, is_beta, sort_order
FROM public.platform_feature_flags
WHERE category = 'modulo_vendita'
ORDER BY sort_order;
-- Atteso: 6 righe

-- 2. Override migrati correttamente
SELECT COUNT(*) AS legacy_overrides
FROM public.company_feature_overrides WHERE feature_key = 'fv_modulo_attivo';
SELECT COUNT(*) AS new_overrides
FROM public.company_feature_overrides WHERE feature_key = 'modulo_fotovoltaico_attivo';
-- Atteso: new_overrides ≥ legacy_overrides (più i backfill da colonna boolean)

-- 3. Tabella audit attiva
SELECT COUNT(*) AS total_richieste, status
FROM public.modulo_richieste_attivazione
GROUP BY status;

-- 4. RLS attiva su modulo_richieste_attivazione
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'modulo_richieste_attivazione';
-- Atteso: relrowsecurity = TRUE
```

## Cleanup posticipato (post-validation produzione)

- `companies.fv_modulo_attivo`: marcata DEPRECATED via COMMENT, rimozione fisica
  pianificata in una migration successiva (≥ 30 giorni dal deploy) per consentire
  rollback senza perdita dati.
- `useFvModuloAttivo`: hook deprecato, da rimuovere dopo refactor delle pagine
  Fotovoltaico per usare `useFeatureAccess("modulo_fotovoltaico_attivo")` invece
  della query diretta sulla colonna.

## Variabili d'ambiente edge function (FASE 7)

L'edge function `richiesta-attivazione-modulo` legge:
- `RESEND_API_KEY` — API key Resend (opzionale; se assente skip email)
- `STAFF_NOTIFY_EMAIL` — destinatario notifiche staff (default: info@ediliziaincloud.it)
- `RESEND_FROM_EMAIL` — mittente (default: noreply@ediliziaincloud.it)

Da configurare in Supabase Project Settings → Edge Functions → Environment.

## Apertura PR

Title: `Refactor preventivi hub: tab Moduli Vendita + sezione SuperAdmin dedicata`

Body suggerito:
```
## Summary
- Aggiunge la quarta tab "Moduli Vendita" all'Hub Preventivi con catalogo
  dei 6 moduli verticali (1 attivo + 5 coming soon)
- Migra il modulo Fotovoltaico al nuovo feature flag `modulo_fotovoltaico_attivo`
  preservando lo stato in produzione (zero regressioni)
- Introduce sezione dedicata `CompanyModuliVendutaSection` nel pannello SuperAdmin

## Test plan
- [ ] Smoke test utente azienda (vedi docs/refactor-status.md sez. A)
- [ ] Smoke test SuperAdmin (sez. B)
- [ ] Verifica bypass impersonation (sez. C)
- [ ] Audit DB queries post-deploy (sez. Audit)
```
