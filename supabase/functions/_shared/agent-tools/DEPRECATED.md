# ⚠️ DEPRECATED — `_shared/agent-tools/`

**Status**: deprecato a partire da MP-AIE-01 v2 (6 maggio 2026).

## Perché

Questa cartella era un primo tentativo di estrarre un registry tool unificato in
una libreria condivisa parallela. **Era un errore di framing**: il vero registry
centrale di EiC è già `_shared/silvioTools.ts` (1008 righe, 30 tool RPC SECURITY
DEFINER battle-tested).

MP-AIE-01 v2 corregge il framing:
- `silvioTools.ts` diventa la **fonte di verità** per tutti i canali
- È stato esteso con multi-canale (`Channel`, `RiskLevel`, `domain`, ecc.)
- Helper di esecuzione: `_shared/silvioToolExecution.ts`

## Cosa fare

- **Non importare** da `_shared/agent-tools/` in nuovo codice
- **Importare** da:
  - `_shared/silvioTools.ts` per tool definitions + `getToolsForChannel` + `toolsToOpenAISpec`
  - `_shared/silvioToolExecution.ts` per `executeToolWithRouting` + `executeToolsParallel`
- I 5 file in `domains/` di questa cartella sono scaffolding di esempio. I tool
  reali (35+) vivono in `silvioTools.ts` come entry del Record `SILVIO_TOOLS`.

## Roadmap

Questa cartella verrà **rimossa** quando:
1. Tutti i consumer (silvio-chat, ai-orchestrator, whatsapp-ai-processor,
   internal-agent-tools, telegram-bot-processor) usano `silvioToolExecution`
2. Il `tool_execution_log` schema è completamente migrato (già fatto in MP-AIE-01)

## Riferimenti

- MP-AIE-01 v2: `masterprompts/in_progress/MP-AIE-01-tool-registry.md`
- Registry centrale: `_shared/silvioTools.ts`
- Helper esecuzione: `_shared/silvioToolExecution.ts`
