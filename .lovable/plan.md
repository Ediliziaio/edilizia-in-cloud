

# Audit Tecnico Completo — Integrazione Google Calendar

## A) REPORT AS-IS

### Moduli e file coinvolti
| Modulo | File |
|--------|------|
| OAuth Auth | `supabase/functions/google-calendar-auth/index.ts` |
| Sync Engine | `supabase/functions/google-calendar-sync/index.ts` (847 righe) |
| Shared utility | `supabase/functions/_shared/getPlatformSetting.ts` |
| Frontend hook | `src/hooks/useGoogleCalendarSync.ts` |
| Impostazioni UI | `src/components/settings/GoogleCalendarConnectionTab.tsx` |
| Sync Prefs Dialog | `src/components/settings/GoogleCalendarSyncPrefsDialog.tsx` |
| Admin Sync Logs | `src/pages/admin/SyncLogs.tsx` |
| Calendario CRM | `src/pages/azienda/Calendar.tsx` |
| Creazione appuntamenti | `src/components/appointments/AppointmentDialog.tsx` |
| Admin Platform config | `src/components/admin/settings/PlatformInfoTab.tsx` |

### Tabelle DB
`google_calendar_connections`, `google_calendar_settings`, `google_calendar_event_map`, `google_calendar_busy_slots`, `google_calendar_sync_log`

### Indici — OK
Tutti gli indici compositi sono presenti e corretti per le query più frequenti.

---

## B) PROBLEMI TROVATI — LISTA TO-DO

### P0 — CRITICI

**1. `google_calendar_sync_log` ha RLS abilitata ma ZERO policy**
- La pagina `SyncLogs.tsx` interroga questa tabella con il client Supabase (anon key) — restituisce **sempre zero righe**.
- Il cron job scrive con service role (bypassa RLS) — i dati ci sono, ma il frontend non li vede.
- **Fix**: Aggiungere policy SELECT per super_admin: `has_role(auth.uid(), 'super_admin'::app_role)`.

**2. Sicurezza `cron-full-sync`: nessuna validazione dell'autenticazione**
- L'action `cron-full-sync` nel main handler (riga 801) viene eseguita senza alcuna verifica. Qualsiasi richiesta POST con un header Authorization (anche un token invalido) può triggerare un full-sync di tutti gli utenti.
- **Fix**: Verificare che il token nell'Authorization header corrisponda all'anon key o al service role key prima di procedere.

**3. `postMessage` con `"*"` nella callback OAuth**
- `buildCallbackHtml` (google-calendar-auth, riga 352) invia `window.opener.postMessage(...)` con target `"*"`. Qualsiasi pagina che apre il popup OAuth può intercettare il messaggio.
- **Fix**: Specificare l'origin del progetto come target del postMessage.
- Sul frontend (`GoogleCalendarConnectionTab.tsx` riga del listener), verificare `event.origin`.

### P1 — IMPORTANTI

**4. `useGoogleCalendarSync` importa `toast` dal path legacy**
- Riga 4: `import { toast } from "@/hooks/use-toast"` — dovrebbe usare `sonner` come il resto del progetto.
- Potenziale incompatibilità o warning.

**5. Duplicazione logica encrypt/decrypt tra auth e sync**
- `getEncryptionKey()`, `encrypt()`, `decrypt()` sono duplicati identicamente in entrambe le edge function.
- **Fix**: Estrarre in `_shared/encryption.ts`.

**6. Nessun timeout/retry sulle chiamate Google API**
- Le fetch verso `googleapis.com` non hanno timeout. In caso di latenza Google, l'edge function può andare in timeout silente (max 150s di Deno) senza gestione esplicita.
- **Fix**: Aggiungere `AbortSignal.timeout(15000)` alle fetch Google.

**7. Stale slot cleanup non filtra per `google_calendar_id`**
- `pullBusySlots()` raccoglie `allGoogleEventIds` da tutti i conflict calendars ma poi cancella gli slot stale senza filtrare per calendar — potrebbe cancellare slot di calendari non inclusi nel pull corrente se l'utente ha cambiato configurazione.

**8. `reconcilePrimary` crea appuntamenti senza `company_id` validation**
- Quando importa eventi Google come appuntamenti CRM (riga 529-546), non verifica che il `company_id` passato sia effettivamente quello dell'utente. Il company_id viene dal body della request — un utente malintenzionato potrebbe passare un company_id arbitrario.
- Le edge function usano `getClaims` per autenticazione, ma il `companyId` viene dal body senza validazione. Tuttavia il service role bypassa RLS nell'edge function, quindi è mitigato dal fatto che il cron-full-sync usa i dati dal DB.

### P2 — MIGLIORAMENTI

**9. `SyncLogs.tsx` mostra metriche errate nel dettaglio espanso**
- Riga 175: mostra `r.pushed`, `r.pulled`, `r.deleted` ma il payload reale del cron-full-sync (riga 738-744) salva `pull` (oggetto con `pulled` count) e `reconcile` (oggetto con `created/updated/removed`). I dati non matchano le chiavi visualizzate.

**10. `GoogleCalendarConnectionTab` non invalida correttamente le query**
- `invalidateQueries` usa `queryKey: ["google-calendar-connection"]` senza company/userId, potenzialmente invalida query di altri componenti.

**11. `addHour` nel sync engine non gestisce DST**
- L'helper `addHour` (riga 624) manipola ore con `setHours` che è locale e può dare risultati errati con cambio ora legale. Non critico perché il timezone è specificato nell'evento Google.

**12. Manca indice su `google_calendar_sync_log.started_at`**
- La pagina SyncLogs ordina e filtra per `started_at` — senza indice le query rallenteranno con il crescere dei dati.

---

## C) PIANO DI INTERVENTO

### Intervento 1 — Fix RLS `google_calendar_sync_log` (P0)
Migration SQL:
```sql
CREATE POLICY "Super admins can read sync logs"
ON public.google_calendar_sync_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));
```
Aggiungere anche indice su `started_at`:
```sql
CREATE INDEX idx_gcsl_started_at ON public.google_calendar_sync_log (started_at DESC);
```

### Intervento 2 — Validare auth per `cron-full-sync` (P0)
Nel main handler di `google-calendar-sync/index.ts`, verificare che il Bearer token corrisponda all'anon key:
```typescript
if (action === "cron-full-sync") {
  const token = authHeader.replace("Bearer ", "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (token !== anonKey) {
    return json({ error: "Unauthorized for cron" }, 403);
  }
  return cronFullSync();
}
```

### Intervento 3 — Fix postMessage origin (P0)
In `google-calendar-auth/index.ts`, `buildCallbackHtml`:
- Sostituire `"*"` con l'URL del progetto (derivata da env o hardcoded).
In `GoogleCalendarConnectionTab.tsx`:
- Aggiungere check `event.origin` nel message listener.

### Intervento 4 — Fix import toast legacy (P1)
In `useGoogleCalendarSync.ts`, cambiare:
```typescript
import { toast } from "sonner";
// E aggiornare la chiamata toast({ title, description, variant }) → toast.error(message)
```

### Intervento 5 — Estrarre encrypt/decrypt in _shared (P1)
Creare `supabase/functions/_shared/encryption.ts` con `getEncryptionKey()`, `encrypt()`, `decrypt()`.
Importare da entrambe le edge function.

### Intervento 6 — Fix metriche SyncLogs (P2)
In `SyncLogs.tsx` riga 174-176, allineare le chiavi al payload reale:
```
Pull: {r.pull?.pulled ?? 0} | Created: {r.reconcile?.created ?? 0} | Updated: {r.reconcile?.updated ?? 0} | Removed: {r.reconcile?.removed ?? 0}
```

### Intervento 7 — Timeout fetch Google API (P1)
Aggiungere `signal: AbortSignal.timeout(15000)` a tutte le fetch verso googleapis.com nelle edge function.

---

## D) RIEPILOGO SICUREZZA

| Area | Stato |
|------|-------|
| RLS su tabelle dati (connections, settings, busy_slots, event_map) | OK — policy user-scoped + super_admin |
| RLS su sync_log | **KO — nessuna policy** |
| Autenticazione cron-full-sync | **KO — nessuna validazione token** |
| postMessage callback OAuth | **KO — target "*"** |
| Cifratura token | OK (XOR basic, documentato come obfuscation) |
| Multi-tenant isolation nelle edge function | OK (service role + company_id da DB nel cron) |
| companyId validation nelle request utente | Parziale — il companyId viene dal body senza validazione vs profilo utente |
| Indici DB | OK, manca solo su sync_log.started_at |

## E) DICHIARAZIONE

L'integrazione Google Calendar **NON è pronta per produzione** fino alla risoluzione dei 3 interventi P0. I P1 sono fortemente raccomandati prima del go-live.

Vuoi procedere con l'implementazione di tutti gli interventi (P0 + P1 + P2)?

