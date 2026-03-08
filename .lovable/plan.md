

# Piano: SMS Log UI + Inbound Call Routing

## 3 deliverable in un'unica sessione

---

### FIX 1 — Componente `ContactSmsLog.tsx` (nuovo)

Nuovo pannello nel right sidebar della pagina contatto che mostra tutti gli SMS dalla tabella `sms_logs`.

- Query `sms_logs` filtrata per `contact_id` e `company_id`, ordinata per `created_at DESC`
- Realtime subscription su `sms_logs` per aggiornamenti di stato live (delivered, failed)
- Per ogni SMS: direzione (↑ outbound / ↓ inbound), corpo troncato, stato con badge colorato, timestamp
- Badge stato: `queued` grigio, `sent` blu, `delivered` verde, `failed` rosso, `received` viola

### FIX 2 — Integrazione in `MarketingContactDetail.tsx`

- Aggiungere `"sms_log"` al type `RightTab` e alla lista `RIGHT_TABS` con icona `Smartphone` e label "Log SMS"
- Aggiungere il render condizionale `{rightTab === "sms_log" && <ContactSmsLog contactId={id} companyId={companyId} />}`

### FIX 3 — Realtime su `sms_logs`

- Migration SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_logs;`
- Permette aggiornamenti live dello stato delivery nel pannello SMS

### FIX 4 — Inbound Call Routing nel `telnyx-webhook`

Quando Telnyx invia un evento `call.initiated` con direction `incoming`:

1. Identifica il numero chiamato (`to`) → lookup in `ai_agent_phone_numbers` per trovare `agent_id` e `company_id`
2. Carica l'agente → ottiene `elevenlabs_agent_id`
3. Carica `elevenlabs_phone_number_id` dalla riga del numero
4. Usa Telnyx Call Control API per:
   - `answer` la chiamata
   - `transfer` via SIP a ElevenLabs usando l'endpoint SIP `{agent_id}@sip.elevenlabs.io` con header custom per il phone_number_id
5. Log della conversazione inbound in `ai_agent_conversations`
6. Credit check prima di rispondere (se crediti insufficienti, hangup con messaggio)

**Alternativa semplificata**: Se il numero è già registrato su ElevenLabs via `link_phone_number`, ElevenLabs gestisce automaticamente l'inbound routing. In quel caso il webhook Telnyx serve solo per logging. Implemento la versione logging + fallback answer.

---

### File da creare/modificare

| File | Fix |
|------|-----|
| `src/components/marketing/ContactSmsLog.tsx` (nuovo) | 1 |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | 2 |
| Migration SQL | 3 |
| `supabase/functions/telnyx-webhook/index.ts` | 4 |

