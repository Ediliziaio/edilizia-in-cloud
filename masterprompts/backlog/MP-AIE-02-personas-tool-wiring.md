# MP-AIE-02 — Wire 18 Personas con Tool Calling in ai-orchestrator

## 🎯 Obiettivo
Collegare le 18 personas al registry tool unificato di MP-AIE-01, abilitando tool calling
nel main orchestrator (chat web). Parità con il pattern già implementato in
`whatsapp-ai-processor` ma per il canale web.

## 📦 Context
- **Branch**: `feat/mp-aie-02-personas-tool-wiring`
- **Dipendenze**: MP-AIE-01 ✅
- **File chiave**: `supabase/functions/ai-orchestrator/index.ts`

## 🛠️ Step principali
1. Loop agentico in `ai-orchestrator` (max 6 iter, parità con silvio-chat)
2. Filter tool per persona via `filterToolsByGrants(role, persona)` da registry
3. Population `ai_personas.allowed_tools` per tutte e 18 personas via migration
4. Decision log `silvio_decision_log` per ogni interazione (already done per Silvio)
5. Test E2E almeno 5 personas

## ✅ Acceptance
- [ ] 18 personas hanno `allowed_tools` popolato e validato
- [ ] ai-orchestrator esegue loop agentico con tool calling
- [ ] Tool execution loggata in `tool_execution_log`
- [ ] TS 0 errori

## 🔗 Riferimenti
Doc: `EiC-Sistema-Masterprompt.md` PARTE 2 SPRINT 0
