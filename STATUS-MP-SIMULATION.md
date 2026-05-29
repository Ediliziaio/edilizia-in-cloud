# STATUS-MP-SIMULATION.md
## Sessione corrente: 2026-05-29
## Blocco 5 — simulazione what-if conversazionale (read-only)

## Task
- [x] P0  Discovery: tool simulazione esistenti + return shape reali
- [x] P1  RPC silvio_tool_simula_scenario: fonde cashflow_forecast_90d + pipeline + workload + variabili
- [x] P1  Tool simula_scenario_aziendale (safe, sola lettura)
- [x] P2  Verifica: deploy Deno OK + RPC test su Demo + grep tool
- [ ] P3  Commit su feature/mp-silvio-batch

## Decisioni prese
- ZERO nuovo motore: l'RPC riusa silvio_cashflow_forecast_90d (base cassa reale),
  silvio_tool_get_pipeline_forecast e silvio_employees_workload; applica le variabili
  (nuova_commessa_eur, incasso_giorni, costo) come delta. Silvio (LLM) narra.
- riskLevel safe (sola lettura, non scrive nulla). STABLE.
- Leve concrete = rate cliente non pagate con scadenza nell'orizzonte (anticipabili),
  così Silvio può proporre "anticipa l'acconto X".
- Grafico cassa come artefatto: rinviato (dipende dalla UI artifacts del Blocco 4, rinviata).

## Verifica end-to-end (prod, Demo Azienda)
- simula_scenario('commessa Bianchi 80k, incasso 60gg', variabili) → cassa base min -175.418€,
  scenario: impatto netto +28.000€ (costo 65%), min stimato -147.418€, regge:false;
  3 leve anticipabili reali (Franco Neri 7.097€/20-04, Mario Bianchi 5.920€/15-05, ...);
  squadre 17 liberi. Sola lettura, nessuna scrittura.
- Deploy Deno OK (silvio-chat, ai-orchestrator). grep tool = 1.

## Verifica: VERDE (tool safe read-only che fonde cassa+pipeline+squadre+ipotesi). Grafico cassa rinviato (UI Blocco 4).
