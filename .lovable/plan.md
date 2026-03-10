

# Audit — Marketing WhatsApp (Conversazioni, Broadcast, Template, Impostazioni)

## Bug trovati

### Bug 1 (P0): Invio messaggio da ChatView non invalida conversazioni ne messaggi
**File:** `src/components/messaging/ChatView.tsx`, righe 55-78
`handleSendReply` chiama `supabase.functions.invoke("send-whatsapp-reply")` ma al successo fa solo `setReplyText("")`. Non invalida `["messaging-conversations"]` (la lista non aggiorna `last_message_at` o l'ordine) ne `["messaging-messages", conversationId]` (il messaggio inviato non appare nella chat finche il realtime non scatta). Il realtime ascolta solo `messaging_messages` (riga 263-269 di useMessagingData), ma la conversation list non ha nessun listener realtime — resta stale dopo l'invio.

**Fix:** Dopo invio riuscito, invalidare `["messaging-conversations"]` e `["messaging-messages", conversationId]` nel `ChatView.tsx`. Importare `useQueryClient`.

### Bug 2 (P1): Realtime solo sui messaggi, non sulle conversazioni
**File:** `src/hooks/useMessagingData.ts`, righe 255-276
`useMessagingRealtime` sottoscrive solo `messaging_messages`. Quando arriva un messaggio in entrata (dal webhook), la lista conversazioni non si aggiorna: l'ultimo messaggio, lo stato `da_gestire`, e l'ordine restano stale fino al prossimo refetch (30s staleTime).

**Fix:** Aggiungere un canale realtime per `messaging_conversations` nel hook `useMessagingRealtime` (o un hook dedicato usato da `ConversationList`), che invalidi `["messaging-conversations"]` su evento `UPDATE`.

### Bug 3 (P1): Broadcast non deduplica numeri di telefono
**File:** `supabase/functions/whatsapp-broadcast/index.ts`, righe 95-116
La query contatti non deduplica per telefono. Se due contatti hanno lo stesso numero, ricevono il broadcast due volte. Questo spreca crediti e da un'esperienza negativa al destinatario.

**Fix:** Dopo il fetch dei contatti, aggiungere deduplicazione per numero di telefono normalizzato (`cleanPhone`). Mantenere solo il primo contatto per ogni numero.

### Bug 4 (P1): Broadcast non passa `segment_config` dalla UI
**File:** `src/components/marketing/whatsapp/WhatsAppBroadcastTab.tsx`, riga 51
Il body dell'invocazione passa `segment_config: {}` sempre vuoto. Per i segmenti "tag", "source" e "pipeline" serve un valore (es. `{ tag: "..." }`), altrimenti la Edge Function ignora il filtro e invia a tutti. L'utente seleziona "Per tag" ma il broadcast parte su tutti i contatti.

**Fix:** Aggiungere campi UI condizionali per il `segment_config` (input tag, source, ecc.) e passare il valore reale nel body. Minimo: mostrare un input quando il segmento e "tag" o "source".

### Bug 5 (P1): Query keys inline, non nella factory
Tutti i file WhatsApp usano query keys inline: `["messaging-conversations"]`, `["messaging-messages"]`, `["whatsapp-config"]`, `["whatsapp-broadcasts"]`, `["whatsapp-templates"]`, `["messaging-ai-runs"]`. Non sono nel `queryKeys` factory. Questo impedisce invalidazione centralizzata.

**Fix:** Aggiungere sezione `messaging` e `whatsapp` nella factory `queryKeys.ts` e migrare tutti gli usi.

### Bug 6 (P2): Failed message nella ChatView non mostra delivery_status
**File:** `supabase/functions/send-whatsapp-reply/index.ts`, righe 139-145
Quando Meta API fallisce, il messaggio viene salvato in DB ma SENZA `delivery_status: "failed"`. Il `MessageBubble` mostra il messaggio senza alcuna indicazione di errore (il componente `DeliveryStatusIcon` restituisce `null` se status e' undefined).

**Fix:** Aggiungere `delivery_status: "failed"` all'insert del messaggio fallito nella Edge Function.

### Bug 7 (P2): Broadcast recipients hard-limited a 1000
**File:** `supabase/functions/whatsapp-broadcast/index.ts`, riga 116
`.limit(1000)` sulla query contatti. Aziende con >1000 contatti non inviano a tutti.

**Fix:** Aumentare a `.limit(10000)` o implementare paginazione.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/components/messaging/ChatView.tsx` | Invalidare conversations e messages dopo invio | Cache |
| `src/hooks/useMessagingData.ts` | Aggiungere realtime su `messaging_conversations` | Realtime |
| `supabase/functions/whatsapp-broadcast/index.ts` | Deduplica telefoni + aumentare limit | Dati / Scalabilita |
| `supabase/functions/send-whatsapp-reply/index.ts` | Aggiungere `delivery_status: "failed"` su errore | UX |
| `src/components/marketing/whatsapp/WhatsAppBroadcastTab.tsx` | Passare segment_config reale + UI input condizionale | Dati |
| `src/lib/queryKeys.ts` | Aggiungere sezione messaging/whatsapp | Standard |

6 file, 7 bug. Nessun cambio UX sostanziale. Backward-compatible.

