# STATUS-MP-SA-INTEL.md
## Sessione corrente: 2026-05-30
## SuperAdmin — Conversation Intelligence & Radar Upsell cross-tenant (READ-ONLY)

## Task
- [x] P0  Discovery: silvio-admin-chat (TOOLS+RPC_MAP), canali Silvio, is_super_admin, tabelle health/usage
- [~] P1  Migration: sa_conversation_signals + sa_company_intel + RLS super_admin
- [~] P1  RPC sa_compute_company_intel (mapping dolore→servizio deterministico)
- [~] P1  3 RPC readonly super_admin: sa_get_upsell_radar / sa_get_company_intel / sa_get_trend_aggregato
- [ ] P1  Edge sa-conversation-intel-daily (cron): classifica msg utente→Silvio via aiRouterComplete, salva SOLO segnale anonimo
- [ ] P1  silvio-admin-chat: +3 tool (get_upsell_radar/get_company_intel/get_trend_aggregato)
- [ ] P2  Cron giornaliero + verifica e2e + privacy spot-check
- [ ] P3  UI tab «Radar Upsell» (ai-monitor) — richiede QA runtime
- [ ] P3  Commit

## Decisioni prese
- Canali Silvio = internal_chat_channels type='dm' AND is_system AND silvio('…002')=ANY(dm_user_ids).
  Msg utente = sender_id <> silvio. 112 msg/30gg (dato reale per test).
- Privacy: l'estrazione salva SOLO {area, intento, peso, esempio_anonimo riassunto senza PII}. Mai il raw.
- servizio_consigliato (enum doc: controllo_gestione|marketing_edile|vendita): mapping inline deterministico
  in sa_compute_company_intel; LLM solo per arricchire la motivazione (template SQL di base).
- Tutti i tool sono READ-ONLY (riskLevel safe non si applica: niente azioni verso persone).

## Verifica end-to-end (prod, Demo)
- Migration applicata: sa_conversation_signals + sa_company_intel + 3 RPC readonly + 2 helper service-role + cron 03:15.
- Extractor invocato → LLM ha classificato i 60 msg reali → segnale anonimo nuovo
  (vendita/richiesta_funzione, "richiesta di funzionalità per la gestione delle email", NO PII) → sa_compute.
- sa_company_intel: dolore=margini, intensita=48, servizio=controllo_gestione, priorita=48, top_aree ordinate.
- silvio-admin-chat: +3 tool (get_upsell_radar/get_company_intel/get_trend_aggregato) → RPC sa_get_*. Deploy OK.
- RLS: tabelle SELECT solo super_admin; RPC con guard is_super_admin (raise forbidden se non super).
- Privacy: salvati SOLO segnali aggregati anonimi (esempio_anonimo parafrasato), mai il raw.

## RINVIATO (step UI, richiede QA runtime)
- Tab «Radar Upsell» in src/components/admin/ai-monitor/ (heatmap aree + tabella per priorità + scheda azienda).

## Verifica: VERDE (backend completo + testato; UI tab rinviata)
