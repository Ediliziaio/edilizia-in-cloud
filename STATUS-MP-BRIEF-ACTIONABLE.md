# STATUS-MP-BRIEF-ACTIONABLE.md
## Sessione corrente: 2026-05-29
## Blocco 3 — proattività (buco n.2): da «lista alert» a «azioni pronte da approvare»

## Task
- [x] P0  Discovery: catena detection→proposta→brief, schemi reali
- [x] P1  Migration: RPC service-role-safe `silvio_brief_promote_alert` + colonna `actions`
- [x] P1  Edge fn silvio-morning-brief: pre-crea proposte per alert critici + le elenca
- [x] P2  Frontend: «Approva tutte» in SilvioActionProposals (esegue batch reale)
- [x] P2  Verifica: trigger reale (silvio_invoke_edge) → 6 proposte + brief con actions
- [ ] P3  Commit su feature/mp-silvio-batch

## Verifica end-to-end (prod, Demo Azienda)
- RPC silvio_brief_promote_alert: crea proposta pending (send_overdue_reminder),
  idempotente (2ª chiamata → stesso id). Solo cta_action operative (no open_*).
- Trigger reale via silvio_invoke_edge('silvio-morning-brief', {mode:user,...}):
  → 6 ai_action_proposals pending (auto_generated, signal_type='morning_brief',
    action_type send_overdue_reminder/create_purchase_order) — rese come ActionProposalCard.
  → briefing 2026-05-29 severity=urgent, actions[6], content:
    "…Ho già preparato 6 azioni: ti basta approvarle qui…".
- Edge fn deploy: Deno compile OK. Frontend tsc --noEmit: 0 errori.
- DoD: ✓ brief con azioni proposte, ✓ card Approva/Ignora su proposta reale,
  ✓ «Approva tutte» (N invocazioni silvio-execute-action), ✓ niente esegue senza conferma.

## Decisioni prese (verificate sul DB/codice reale, NON sul pseudocodice del doc)
- Il pseudocodice del doc mappava `alert.type` (overdue_payment, stockout_imminent, ...)
  a tool TWINS. REALTÀ: alert_type reali sono `payment_overdue`/`low_stock`/`quote_aging`/
  `hr_request_pending`/`cashflow_critical_forecast`. Mappare per `alert.type` sarebbe
  fragile e sbagliato.
- USO INVECE `cta_action` (già presente sull'alert) come action_type della proposta:
  è la convenzione MATURA che l'applier `silvio-execute-action` esegue davvero
  (send_overdue_reminder→email reale, send_quote_followup→email, create_purchase_order→bozza ODA).
  I tool TWINS (invia_*) accodano solo in silvio_outbound_messages (nessun processore ancora):
  approvarli non manderebbe nulla. Quindi per il brief la via cta_action è quella che FUNZIONA.
- Gate operativo: promuovo SOLO alert con cta_action in un whitelist di handler reali.
  Le cta_action di navigazione (open_cashflow_forecast, open_hr_request) NON diventano
  proposte (l'applier non ha handler → fallirebbero all'approvazione): restano alert/CTA.
- `silvio_promote_alert_to_proposal` esistente usa auth.uid()+get_my_company_id() → NON
  utilizzabile dal cron service-role. Creo gemello service-role-safe con id espliciti + idempotenza.
- «Approva tutte»: `silvio_tool_batch_approve_proposals` NON esegue (raggruppa solo in batch_id).
  Quindi la UI itera `silvio-execute-action` per ogni proposta (come fa ActionProposalCard).
  Salto le azioni a conferma-forte (vanno confermate singolarmente).

## Blocchi / domande aperte
- Nessuno. Tutti i pezzi esistono; collegati senza nuovi sistemi.

## Verifica: VERDE (RPC + edge fn + frontend, testati end-to-end in prod)
