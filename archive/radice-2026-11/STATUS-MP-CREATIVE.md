# STATUS-MP-CREATIVE.md
## Sessione corrente: 2026-05-29
## Blocco 4 — artefatti on-demand in chat (grafica/video/documenti)

## Scope concordato col titolare (AskUserQuestion)
BACKBONE SICURO ORA + UI/SCHEMA DOPO. Implemento la coda job + enqueue + tool yellow
(additivo, stesso pattern EXTERNAL/TWINS). Rinvio a step UI dedicato: estrazione
brandCreativeRules dalla fn social LIVE, artifacts[] in structuredOutput, card+polling
in SilvioChatSheet (2142 righe), worker che chiama i motori reali. Niente rischio di
rompere lo schema chat globale o la generazione social in prod.

## Task
- [x] P0  Discovery: motori esistenti (ai-ads-image/video), pattern job, route
- [x] P1  Tabella silvio_generation_jobs (image|video|document) + RLS
- [x] P1  RPC silvio_tool_enqueue_creativita (immagine/video) → {job_id, eta_seconds, queued}
- [x] P1  RPC silvio_tool_genera_documento_router (documento per commessa/pratica) → job
- [x] P1  Tool genera_creativita + genera_documento (yellow) in silvioTools.ts
- [x] P2  Verifica: deploy Deno OK + RPC test + grep tools=2
- [ ] P3  Commit su feature/mp-silvio-batch

## RINVIATO (step UI/integrazione dedicato, per scelta sicurezza)
- _shared/brandCreativeRules.ts estratto da ai-ads-image-generate (single source) + re-deploy social
- artifacts[] in structuredOutput.ts (schema risposta AI) + render card in SilvioChatSheet + polling
- worker silvio-generation-worker che processa i job queued chiamando i motori reali
- check crediti/budget creatività prima dell'accodamento

## Decisioni prese
- I tool sono yellow (costano soldi) → conferma umana via action_proposal, coerente col doc.
- Coda uniforme silvio_generation_jobs come silvio_outbound_messages: thin recorder, processore poi.
## Verifica end-to-end (prod, Demo Azienda)
- enqueue_creativita: 'immagine' → {job_id, queued, eta 25}; 'video' → {eta 90}.
- genera_documento_router: 'pos' → {job_id, queued, doc_tipo:pos, eta 20}.
- Deploy Deno OK (silvio-chat, ai-orchestrator). grep tools = 2. Job di test poi rimossi.

## Verifica: VERDE (backbone: coda + enqueue + tool yellow). UI/schema/worker rinviati per scelta.
