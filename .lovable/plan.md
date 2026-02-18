
# Polling stato verifica Meta Business e Quality Rating

## Panoramica

Creare una nuova Edge Function `whatsapp-status` che interroga le API di Meta per recuperare lo stato di verifica del Business Account e il quality rating del numero di telefono, aggiornando la tabella `messaging_whatsapp_config`. Il frontend eseguira' il polling automatico ogni 60 secondi quando il numero e' collegato.

---

## 1. Nuova Edge Function `whatsapp-status`

**File:** `supabase/functions/whatsapp-status/index.ts`

### Logica

1. Riceve `company_id` dal body della richiesta (autenticata via JWT)
2. Recupera la configurazione WhatsApp dalla tabella (usando service role per leggere il token)
3. Chiama due endpoint Meta Graph API:
   - `GET /{waba_id}?fields=account_review_status,business_verification_status` per lo stato di verifica
   - `GET /{phone_number_id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name` per qualita' e limiti
4. Mappa i valori Meta ai valori del nostro schema:
   - `account_review_status: APPROVED` -> `account_status: "verified"`
   - `account_review_status: PENDING` -> `account_status: "pending"`
   - `quality_rating: GREEN/YELLOW/RED` -> `quality_rating: "green"/"yellow"/"red"`
5. Aggiorna la riga nella tabella `messaging_whatsapp_config`
6. Ritorna i dati aggiornati al frontend

### Sicurezza
- Autenticazione JWT verificata in codice (stesso pattern di `whatsapp-connect`)
- Verifica che l'utente appartenga alla company richiesta
- Il token Meta e' letto server-side, mai esposto al frontend

---

## 2. Configurazione

**File:** `supabase/config.toml` - aggiunta:

```toml
[functions.whatsapp-status]
verify_jwt = false
```

---

## 3. Modifica Frontend

**File:** `src/components/messaging/MessagingSettingsTab.tsx`

### Modifiche

- Aggiungere un `useEffect` che, quando `isConnected === true`, chiama `supabase.functions.invoke("whatsapp-status", { body: { company_id } })` ogni 60 secondi
- Al ritorno dei dati, invalidare la query `["whatsapp-config"]` per aggiornare la UI
- Aggiungere un bottone manuale "Aggiorna stato" con icona RefreshCw per forzare il polling
- Mostrare il `messaging_limit_tier` (limite messaggi) nella colonna "Limite" della tabella numeri, attualmente con valore "—"
- Il polling si ferma automaticamente quando il componente viene smontato (cleanup dell'intervallo)

### Nuovi elementi UI
- Icona RefreshCw accanto allo stato dell'account con tooltip "Ultimo aggiornamento: X minuti fa"
- La colonna "Limite" nella tabella numeri mostrera' il tier (es. "1K", "10K", "100K", "Illimitato")

---

## 4. Dettaglio tecnico

### Mapping Meta API -> DB

| Campo Meta API | Valore Meta | Campo DB | Valore DB |
|---------------|-------------|----------|-----------|
| `account_review_status` | `APPROVED` | `account_status` | `verified` |
| `account_review_status` | `PENDING` | `account_status` | `pending` |
| `account_review_status` | altro | `account_status` | `not_verified` |
| `quality_rating` | `GREEN` | `quality_rating` | `green` |
| `quality_rating` | `YELLOW` | `quality_rating` | `yellow` |
| `quality_rating` | `RED` | `quality_rating` | `red` |
| `messaging_limit_tier` | `TIER_*` | (solo frontend) | Mostrato in UI |

### File nuovi

| File | Descrizione |
|------|-------------|
| `supabase/functions/whatsapp-status/index.ts` | Edge function per polling stato Meta |

### File modificati

| File | Modifica |
|------|----------|
| `supabase/config.toml` | Aggiunta config per `whatsapp-status` |
| `src/components/messaging/MessagingSettingsTab.tsx` | Polling automatico 60s, bottone aggiorna, display limite messaggi |

### Nessuna modifica al database

I campi `account_status` e `quality_rating` esistono gia' nella tabella `messaging_whatsapp_config`.
