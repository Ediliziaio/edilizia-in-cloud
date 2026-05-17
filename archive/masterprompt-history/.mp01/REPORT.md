# MP01 — REPORT FINALE

## Metadata
- Completato il: 2026-04-23
- Branch: feature/mp01-multi-numero-whatsapp
- Base: main @ b0b9804d
- Deploy edge: `whatsapp-webhook`, `whatsapp-connect` su project `rsbrguhkodgnqfomrevo`
- Migrazioni applicate su: remoto (db.rsbrguhkodgnqfomrevo.supabase.co)

## Deliverable check
- [x] Migration schema ai_whatsapp_numbers — `20260423143000_mp01_multi_numero_purpose.sql`
- [x] Migration dati legacy — `20260423143100_mp01_data_migration_legacy.sql`
- [x] types.ts rigenerato — +1372 righe (nuova tabella `wa_routing_errors`, nuovi campi su `ai_whatsapp_numbers` e `whatsapp_messages`)
- [x] whatsapp-webhook refactored — 487 → 123 righe (entry); logica suddivisa in router/parser/errors/handlers
- [x] Nuovi handler stub — 5 handlers (bot_operativo + 4 stub)
- [x] whatsapp-connect aggiornato — accetta `purpose` + upsert su `ai_whatsapp_numbers` con vincolo unicità
- [x] Fixture webhook — 12 fixture JSON + 12 `.expected`
- [x] Test autonomi — 12/12 PASS contro edge deploy prod

## Metriche
- TypeScript: `tsc --noEmit` pulito (no errori su file MP01)
- ESLint: 0 errori introdotti dai file MP01 (progetto ha errori pre-esistenti non correlati)
- Vite build: OK in 4.04s (PWA generata)
- Edge deploy: OK (entrambe le function)
- Test e2e contro edge prod: 12/12 PASS
  - `01_text_bot_operativo` → 200, row in whatsapp_messages
  - `02_image_bot_operativo` → 200, row con message_type=image
  - `03_audio_bot_operativo` → 200
  - `04_text_assistenza` → 200, row persistita da handler stub
  - `05_text_lead` → 200, row persistita
  - `06_unknown_phone_id` → 200, row in wa_routing_errors (error_kind=unknown_phone_number_id)
  - `07_company_disabled` → 200, row in wa_routing_errors (error_kind=company_disabled)
  - `08_hmac_invalid` → 401, row in wa_routing_errors (error_kind=hmac_invalid)
  - `09_malformed_payload` → 200, row in wa_routing_errors (error_kind=payload_malformed)
  - `10_duplicate_message` → 200, deduplica rispettata (stesso wa_message_id skippato)
  - `11_status_update` → 200 (statuses processati, nessun messaggio inbound)
  - `12_multiple_entries` → 200, 3 righe inserite per 3 messaggi

## Smoke test UI localhost + Chrome
- Dev server: `npm run dev` → http://localhost:8080 ✓
- Login con `demo@azienda.srl` / `Demo2026Azienda` → redirect `/azienda` ✓
- Dashboard Demo Azienda carica senza errori correlati a MP01 ✓
- `src/integrations/supabase/types.ts` aggiornato non rompe compilazione TS

## Decisioni di design non specificate nel masterprompt
1. **Parser e tipi estratti in file dedicati** (`parser.ts`, `types.ts`) oltre
   ai 5 handler: riduce l'entry `index.ts` a 123 righe puro routing e abilita
   riuso pulito degli stessi tipi in MP2 (function-calling).
2. **Helper `handlers/_shared.ts`** con `persistInboundMessage()`: 4 handler
   stub condividono lo stesso pattern persist+log senza duplicazione.
3. **Mantenimento comportamento pre-MP01** dentro `bot_operativo.ts`: insert
   in `messaging_conversations`/`messaging_messages` (UI dashboard) + trigger
   `whatsapp_message_received` + sanitize phone + idempotency. Zero regressioni.
4. **whatsapp-connect** mantiene upsert legacy su `messaging_whatsapp_config`
   solo per `purpose='bot_operativo'`. Preserva la vecchia UI messaging
   finché MP4 non deprecates fisicamente.
5. **Test runner REST** (`run-tests-rest.sh`) oltre al `.sh` con psql:
   funziona senza Docker / supabase locale e viene eseguito direttamente
   contro l'edge prod con seed temporaneo (cleanup incluso).
6. **Gestione 4xx vs 5xx a Meta**: 401 solo su HMAC invalido (richiesto da
   Meta), 200 su tutti gli altri errori applicativi (phone_id ignoto,
   payload malformato), 500 solo su eccezione transitoria non catturata dal
   router (DB down → Meta ritenta).

## Known issues / TODO per MP02
- Handler `bot_operativo` legge ancora `bot_enabled`/`ai_auto_process` da
  `messaging_whatsapp_config`. In MP2 questi flag vanno migrati su
  `ai_whatsapp_numbers` (per numero, non per azienda).
- `agent_id` è letto nel router ma non ancora usato dagli handler (serve per
  il function-calling dispatcher di MP2).
- Retro-compat con UI vecchia messaging: finché MP4 non toglie
  `messaging_whatsapp_config`, il codice duale rimane.
- Budget `daily_budget_eur` creato ma enforcement (outbound blocked if over)
  rimane da scrivere in MP3 (handler whatsapp-send).

## Come verificare manualmente in staging/prod
1. Challenge Meta:
   ```
   curl 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=ping'
   # deve rispondere: ping
   ```
2. HMAC invalid:
   ```
   curl -X POST 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/whatsapp-webhook' \
     -H 'x-hub-signature-256: sha256=deadbeef' \
     -H 'Content-Type: application/json' \
     -d '{}'
   # deve rispondere: 401 + riga in wa_routing_errors
   ```
3. Inspect wa_routing_errors dashboard:
   `https://supabase.com/dashboard/project/rsbrguhkodgnqfomrevo/editor` →
   tabella `wa_routing_errors` ordinata per `ts DESC`.

## Firma agent
- Prompt: MP01 v1.0 (masterprompt multi-numero purpose-routing)
- Agent: Claude Code (Sonnet 4.6)
- Sessione: 1
