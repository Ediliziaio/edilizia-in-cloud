# MP-AIE-03 — Action Proposals UI Completa + Apply Engine

## 🎯 Obiettivo
UI completa per visualizzare, confermare/rifiutare e applicare le `ai_action_proposals`
generate da tool yellow/red. Engine di apply che esegue effettivamente l'azione dopo conferma.

## 📦 Context
- **Branch**: `feat/mp-aie-03-action-proposals-ui`
- **Dipendenze**: MP-AIE-02 ✅
- **Esistente**: schema `ai_action_proposals` già in DB (con auto-INSERT da silvio-chat per tool laterali)

## 🛠️ Step principali
1. Page `/azienda/azioni-proposte` con lista filtrata
2. Modal dettaglio con preview azione + conferma/rifiuta + override
3. Edge function `apply-action-proposal` che esegue il tool relativo con contesto preservato
4. Hook `useActionProposals` con realtime subscription
5. Notifiche in-app/email per nuove proposte ad alto rischio

## ✅ Acceptance
- [ ] UI lista + dettaglio + apply
- [ ] Realtime updates su nuove proposte
- [ ] Apply idempotente (no doppi addebiti AI)
- [ ] Audit trail completo (proposed → confirmed → applied)
- [ ] TS 0 errori

## 🔗 Riferimenti
Doc: `EiC-Sistema-Masterprompt.md` Sprint 0
