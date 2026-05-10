# MP-AIE-02 — Wire 18 Personas con Tool Calling in ai-orchestrator

## 🎯 Obiettivo
Collegare le 18 personas al registry tool unificato di MP-AIE-01, abilitando tool calling
nel main orchestrator (chat web). Parità con il pattern già implementato in
`whatsapp-ai-processor` ma per il canale web.

## 📦 Stato finale
- **Stato**: ✅ COMPLETATO
- **Data chiusura**: 2026-05-09 (audit + chiusura formale)
- **Commit reference**: integrato gradualmente in `main` durante batch 12+13

## ✅ Implementazione effettiva

### 1. Loop agentico in ai-orchestrator
- `supabase/functions/ai-orchestrator/index.ts:65` → `MAX_TOOL_ITERATIONS = 5`
- `index.ts:398` → `getToolsForChannel({ channel: "web", personaKey })` filtra
  i tool dal registry centrale `_shared/silvioTools.ts`
- `index.ts:433-540` → loop while con: chiamata aiRouter, parse `tool_calls`,
  `executeToolsParallel`, append risultati, ripeti fino a `finalContent`
- Decision log `silvio_decision_log` salva ogni iter con `p_tool_calls`

### 2. Population allowed_tools (6 migration cumulative)
| Migration | Versione | Tool count delta |
|-----------|----------|------------------|
| 20260506091100 | phase2  | base personas |
| 20260506092500 | v3      | tool batch 1 |
| 20260506093200 | v4      | tool batch 2 |
| 20260506093800 | v5      | tool batch 3 |
| 20260506095000 | v6      | +51 nuovi tool batch 12+13 |

Personas con allowed_tools attivo (estratto da v6):
silvio (META: tutti), compliance, tecnico, cfo, controller,
commercialista, amministrazione, hr, sales, marketing, operations,
project_manager, plus le 18 personas core seedate da
`20260504230000_ai_personas_seed.sql`.

### 3. Audit log
`tool_execution_log` table (migration 20260506090600) traccia ogni
chiamata tool con: company_id, user_id, persona_key, channel, tool_name,
tool_domain, risk_level, input/output payload, status, duration_ms,
trace_id, session_id.

### 4. Apply pipeline (yellow/red)
Tool con risk_level='yellow'|'red' → registry NON esegue subito ma:
1. Crea `ai_action_proposals` (vedi MP-AIE-03)
2. Logga in tool_execution_log con status='proposed'
3. UI utente conferma → `silvio-execute-action` esegue per davvero
   con contesto preservato

## ✅ Acceptance
- [x] 18+ personas hanno `allowed_tools` popolato e validato
- [x] ai-orchestrator esegue loop agentico con tool calling
- [x] Tool execution loggata in `tool_execution_log`
- [x] TS 0 errori

## 🔗 Riferimenti
Doc: `EiC-Sistema-Masterprompt.md` PARTE 2 SPRINT 0
