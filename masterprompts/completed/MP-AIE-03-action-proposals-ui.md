# MP-AIE-03 — Action Proposals UI Completa + Apply Engine

## 🎯 Obiettivo
UI completa per visualizzare, confermare/rifiutare e applicare le `ai_action_proposals`
generate da tool yellow/red. Engine di apply che esegue effettivamente l'azione dopo conferma.

## 📦 Stato finale
- **Stato**: ✅ COMPLETATO
- **Data chiusura**: 2026-05-09
- **Commit reference**: integrato in `main` (vedi sotto)

## ✅ Implementazione effettiva

### 1. Schema (esistente)
- `ai_action_proposals` table con TTL `expires_at`, status enum
  (pending|confirmed|rejected|expired|applied|failed), payload JSONB
- Security patch `20260506104500_ai_action_proposals_security_patch.sql`
  con RLS multi-tenant rigoroso

### 2. Apply engine (esistente)
- Edge function `silvio-execute-action` esegue il tool relativo conservando
  il contesto persona + user + company. Idempotente via proposal_id.
- Tool meta in `silvioTools.ts`: `approve_proposal_with_edits`,
  `batch_approve_proposals`, `undo_executed_action`, `get_proposal_audit_log`

### 3. UI components (esistenti, ora MOUNTATI)
- `ActionProposalsBadge.tsx` — header bell con conteggio realtime
- `ActionProposalCard.tsx` — card singola con preview + conferma/rifiuta + countdown TTL
- `ActionProposalsList.tsx` — Tabs "In attesa" / "Recenti"
- `ActionProposalsAuditLog.tsx` — pagina admin per drill-down storico

### 4. WIRING (chiuso oggi 2026-05-09)
**Era il GAP critico**: i 4 componenti UI erano nel repo ma orphan
(nessun import, nessuna route). Fix:
- `ActionProposalsBadge` montato in `CompanyLayout.tsx` (header globale)
  prima di SilvioBellPopover, icona `Sparkles` viola per distinguere
  da Bell standard delle notifiche
- Sheet header migliorato con descrizione + countdown
- Link "Apri pagina dedicata" verso pagina full-screen

**Nuova pagina `src/pages/azienda/AzioniProposteAi.tsx`**
- Route: `/azienda/azioni-proposte`
- Layout coerente con il resto della /azienda
- Card "Come funzionano" con spiegazione yellow/red + TTL
- Riusa ActionProposalsList per il body

**Route admin audit log**:
- `/azienda/azioni-proposte/audit-log` → `ActionProposalsAuditLog`

### 5. Realtime
Tutti i 3 components (Badge, Card, List) sottoscrivono via
`supabase.channel('action-proposals-*')` con filter `company_id` →
update istantaneo quando una nuova proposta arriva o cambia status.
Tenant isolation garantita dal filter sul channel.

## 📋 Cosa NON è (out of scope)
- Notifiche email/push per nuove proposte high-risk → vive in
  futuro MP-CX-XX (notifiche multi-canale)
- Override completo del payload via form → al momento solo
  approve/reject (ma `approve_proposal_with_edits` tool esiste
  per uso programmatico via persona)

## ✅ Acceptance
- [x] UI lista + dettaglio + apply
- [x] Realtime updates su nuove proposte
- [x] Apply idempotente via proposal_id (no doppi addebiti AI)
- [x] Audit trail completo (proposed → confirmed → applied)
- [x] TS 0 errori

## 🔗 Riferimenti
Doc: `EiC-Sistema-Masterprompt.md` Sprint 0
