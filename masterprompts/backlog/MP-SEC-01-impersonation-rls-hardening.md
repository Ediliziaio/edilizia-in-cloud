# MP-SEC-01 — Impersonation RLS Hardening

## 🎯 Obiettivo
Quando super_admin usa "Visualizza come <azienda>" (impersonation), TUTTE le
query devono restituire SOLO i dati di quella azienda, anche per le tabelle
con policy `*_admin` che oggi danno super_admin bypass completo.

## 🐛 Bug ovvio risolto (fix frontend, novembre 2026)
`SilvioBellPopover`, `SilvioActionProposals`, `SilvioAlertsPanel`,
`ActionProposalsBadge`, `ActionProposalsList` ora filtrano esplicitamente
`.eq("company_id", companyId)` con `companyId = effectiveCompany.id`. Il
bug visibile (vedere alerts/proposals di altre aziende quando si impersona
Ke Bei) è risolto a livello UI.

## 🔒 Bug latente (defense-in-depth — backlog)
Le RLS policy `ai_action_proposals_admin` e `silvio_alerts_admin` (oltre
ad altre 30+ tabelle con bypass super_admin) ritornano tutte le righe
quando l'utente è super_admin. In impersonation questo è VOLUTAMENTE
permissivo per il super_admin reale, ma è UN PROBLEMA quando l'utente
opera su contesto aziendale (impersonation) e si aspetta isolamento.

## 📐 Soluzione proposta
1. **`set_impersonation_context(p_company_id uuid)`** RPC che:
   - Setta `set_local app.impersonation_company_id = p_company_id`
   - Validato dalla edge function `secure-impersonation` (esistente)

2. **`get_effective_company_id()`** funzione SQL:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_effective_company_id()
   RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
     SELECT COALESCE(
       NULLIF(current_setting('app.impersonation_company_id', true), '')::uuid,
       public.get_my_company_id()
     )
   $$;
   ```

3. **Refactor RLS** delle ~30 tabelle business critical:
   - Sostituire `has_role(auth.uid(), 'super_admin')` con
     `(has_role(auth.uid(), 'super_admin') AND
       NULLIF(current_setting('app.impersonation_company_id', true),'') IS NULL)
       OR company_id = get_effective_company_id()`
   - Effetto: super_admin SENZA impersonation → vede tutto;
     super_admin CON impersonation → vede solo company target

4. **Audit log** in `super_admin_audit_log` per ogni query che usa il bypass.

## ⚠️ Vincoli
- Backward compat: tutte le query esistenti continuano a funzionare per
  super_admin senza impersonation
- Performance: `current_setting()` è O(1) — zero overhead
- Migration ordine: prima creare `get_effective_company_id`, poi refactor
  RLS in batch (1 commit per dominio)

## 🔗 Riferimenti
- Bug originale: screenshot utente novembre 2026 (Ke Bei vs Mario Rossi)
- Fix UI applicato: SilvioBellPopover.tsx, SilvioActionProposals.tsx,
  SilvioAlertsPanel.tsx, ActionProposalsBadge.tsx, ActionProposalsList.tsx
