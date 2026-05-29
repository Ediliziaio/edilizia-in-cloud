# STATUS-MP-COPILOT.md
## Sessione corrente: 2026-05-29
## Blocco 6 — riduzione attrito: (A) copilota app + deep-link, (B) memoria regole decisionali

## Task
- [x] P0  Discovery: rendering tool-result nella chat Silvio + route reali (credito/preventivo/incasso)
- [x] P1  PART A: RPC silvio_tool_guida_a (catalogo how-to → {spiegazione, route_path, query_params}) + tool guida_a
- [~] P1  PART A: UI chat «Apri» — RINVIATA a step UI separato (scelta titolare: backend ora, bottone dopo)
- [x] P1  PART B: tabella silvio_decision_rules + RLS
- [x] P1  PART B: hook matchDecisionRule in executeToolWithRouting (SOLO yellow, MAI red) — INERTE (flag OFF)
- [x] P1  PART B: tool salva_regola_decisionale (origine esplicito)
- [x] P2  Verifica: RPC testati + grep tools=2 + deploy Deno OK + safety red verificata
- [ ] P3  Commit su feature/mp-silvio-batch

## Decisioni prese (con il titolare, via AskUserQuestion)
- PART B auto-esegui: NON attivo. Costruito motore (silvio_decision_rules + match RPC +
  save tool) e punto di aggancio nel routing, ma DECISION_RULES_AUTOEXEC_ENABLED=false →
  nessuna esecuzione automatica reale. Per accendere: mettere il flag a true (vale solo
  yellow, mai red, loggato + annullabile). DoD "salta la conferma" rinviata di proposito.
- PART A bottone «Apri» nella chat (SilvioChatSheet 2142 righe): rinviato a step UI dedicato
  per non rischiare regressioni. Il tool guida_a è completo e Silvio risponde con
  spiegazione + percorso esatto + (se precompila) query_params.
- guida_a usa action_type=cta convenzione route reali verificate (fatturazione, preventivi/nuovo,
  prima-nota, clienti/nuovo, ordini/nuovo, ordini-acquisto, magazzino).

## Verifica end-to-end (prod, Demo Azienda)
- silvio_tool_guida_a: 'nota di credito' → /azienda/fatturazione {action:nota-credito, fattura_id}
  con precompila; 'preventivo' → /azienda/marketing/preventivi/nuovo; 'incasso' → /azienda/prima-nota.
- salva_regola_decisionale + silvio_match_decision_rule: regola importo<5000 → match 3200 (auto_approva),
  no-match 9000. Regola di test poi rimossa.
- Sicurezza: branch auto-esegui SOLO dentro ramo 'yellow' (red ritorna prima, riga 143) + flag OFF.
- Deploy Deno OK (silvio-chat, ai-orchestrator, silvio-execute-action). grep tools = 2.

## Verifica: VERDE (scope concordato: backend completo + motore regole inerte; UI «Apri» e auto-esegui rinviati per scelta)
