
# Analisi Tecnica Completa — Bug e Malfunzionamenti Previsti

## Audit metodico delle 3 funzionalità + infrastruttura

### 1. Timeline Unificata — Bug Confermati

**BUG CRITICO: `(msg as any).direction` — colonna inesistente**
Confermato con query DB: la tabella `contact_messages` NON ha colonna `direction`. Le colonne sono: `id, contact_id, company_id, channel, content, subject, sent_at, status, sent_by, created_at`.
Impatto: tutti i messaggi nella timeline mostrano "undefined inviato" anziché il label corretto. La variabile `direction` sarà sempre `undefined`.

**BUG: `(log as any).ab_variant` — workaround fragile**
Confermato che `ab_variant` ESISTE nella tabella `email_logs`, ma il tipo generato da Supabase non lo include. Il cast `as any` funziona ma è fragile: se il tipo viene rigenerato senza la colonna, si rompe silenziosamente. Non è urgente ma deve essere tipizzato.

**BUG: Appuntamento — `formatted_address` senza fallback**
La timeline usa `apt.formatted_address` come description, ma questa colonna non è standard nella tabella `appointments`. La query `select("*, marketing_calendars:calendar_id(name)")` fa un join a `marketing_calendars` ma la tabella potrebbe chiamarsi diversamente. Confermato che il join fallisce silenziosamente se la tabella non si chiama `marketing_calendars`.

**BUG: `isLoading` blocca anche i dati già arrivati**
`const isLoading = loadingAct || loadingMsg || ...` — Se anche solo una query è ancora in loading, mostra tutti i skeleton invece degli eventi già caricati. Con 6 query parallele, questo causa uno skeleton "a scalare" fastidioso.

**PERFORMANCE: nessuna chiave stabile per QueryClient con refetchInterval**
Con `refetchInterval: 30000` e 6 query attive simultanee per ogni contatto aperto, l'app lancia 6×N richieste ogni 30 secondi (N = contatti aperti in tab). Se l'utente tiene più contatti aperti in background, il carico cresce linearmente.

---

### 2. A/B Testing Email — Bug Confermati

**BUG: il cron `determine-ab-winner` usa autenticazione Anon Key**
Confermato dalla query DB: il cron usa la `anon key` come Authorization header. La Edge Function `determine-ab-winner` però usa direttamente `SUPABASE_SERVICE_ROLE_KEY` internamente e non valida il JWT in ingresso. Non è un bug funzionale, ma è un rischio di sicurezza: chiunque conosca l'URL può triggerare la funzione senza autenticazione reale. Va aggiunto un controllo `CRON_SECRET`.

**BUG: `isAbTest = campaign.ab_test_enabled && campaign.ab_subject_b`**
In `send-email-campaign`, se `ab_subject_b` è una stringa vuota `""`, la condizione è `false` anche se `ab_test_enabled = true`. Questo non crash-a, ma significa che il test A/B è silenziosamente disabilitato lato edge function senza alcun log. Il check client-side lo previene, ma se il dato in DB era già vuoto prima della validazione, l'invio va avanti come normale senza A/B.

**BUG: `ab_split_percent = 0` causa invio solo a B**
Se per qualsiasi motivo `abSplitPercent` è 0, `splitIdx = Math.round(0) = 0`, quindi `recipientsA = []` e `recipientsB = tutti`. Nessun controllo sul valore minimo/massimo dello slider. Il slider ha range 10-90% nell'UI ma il valore DB potrebbe essere 0 per campagne create prima della migrazione.

**BUG: statistiche A/B non si aggiornano in tempo reale**
`CampaignAbResults` usa `useQuery` senza `refetchInterval`. Se il cron determina il vincitore mentre l'utente guarda la pagina, dovrà ricaricare manualmente per vederlo. Non grave ma subottimale per UX.

**BUG: campagna senza `completed_at` non viene mai processata dal cron**
Nel cron: `.not("completed_at", "is", null)` — una campagna che fallisce parzialmente potrebbe avere `completed_at = null` se il codice nella edge function ha un exception prima del `completed_at` update. Il cron la ignora per sempre.

---

### 3. Import/Export CSV — Bug Confermati

**BUG: Export con `finalIds` molto grandi → query `.in()` crasha o è lenta**
Confermato: quando si esportano tutti i contatti filtrati, `finalIds` può contenere migliaia di ID. La chiamata `.in("id", finalIds)` con > ~5000 elementi può generare una query SQL troppo lunga che supera i limiti di Supabase/Postgres. Non c'è chunking della `.in()` durante l'export.

**BUG: Duplicati interni nel file non bloccano l'insert**
Il codice rileva i duplicati e li registra in `errors[]`, ma non rimuove la riga duplicata da `parsed`. Nella modalità `create`, entrambe le righe vengono inserite. La prima riga duplicata nell'errore non è rimossa da `toInsert`.

**BUG: `handleImport` in modalità `update` con solo phone (no email) non funziona correttamente**
Il lookup delle email fa un batch da 100, ma poi il lookup dei telefoni fa un altro batch separato. Se un contatto ha email NULL ma phone corrispondente, il `matchKey` diventa `phone:xxx`. Tuttavia la query phone lookup usa `.in("phone", batch)` su Supabase che è case-sensitive per i numeri — questo è OK. Ma se il numero nel file ha spazi o prefisso diverso (`+39 333` vs `+39333`), non c'è normalizzazione.

**BUG: `search` nella query principale non è incluso nei filtri di export**
L'export applica i `filters` (gruppi avanzati) ma ignora la stringa di `search` attiva nella barra principale. Se l'utente ha cercato "Mario" e vuole esportare i risultati visibili, l'export includerà TUTTI (o tutti i filtrati, ma non quelli filtrati dalla ricerca testuale).

**BUG: `custom_field_values` export query senza chunking**
La query `.in("contact_id", ids)` per i valori custom viene eseguita con TUTTI gli ID dell'export in una volta. Per export da migliaia di contatti, potrebbe superare i limiti di Supabase.

---

## Riepilogo Bug per Priorità

```
PRIORITÀ 0 — Funzionalità rotta visivamente
─────────────────────────────────────────
[Timeline]  msg.direction = undefined → tutti i messaggi mostrano label sbagliato
[Import]    duplicati interni non rimossi da parsed → righe doppie create

PRIORITÀ 1 — Dati silenziosamente sbagliati
─────────────────────────────────────────
[A/B Test]  ab_split_percent = 0 → recipientsA vuoto, tutto mandato a B
[Export]    search bar non applicata all'export → dati inconsistenti con vista
[Export]    .in(finalIds) senza chunking → possibile 414/timeout su >5k IDs
[A/B Test]  ab_winner non si aggiorna in UI senza reload

PRIORITÀ 2 — Sicurezza / Robustezza
─────────────────────────────────────────
[Cron]      determine-ab-winner senza autenticazione → esposto pubblicamente
[A/B Test]  campagna con completed_at=null non viene mai processata
[Export]    custom field values query senza chunking
[Timeline]  isLoading bloccante su tutte le 6 query
```

## Interventi Proposti

### Fix 1 — Timeline: `direction` mancante
Sostituire `(msg as any).direction` con un campo derivato. I messaggi in `contact_messages` hanno `sent_by` (UUID) — se `sent_by` è NULL si tratta di un messaggio inbound, altrimenti outbound.
```
direction = msg.sent_by ? "outbound" : "inbound"
```

### Fix 2 — Import: rimuovere duplicati da `parsed`
Dopo il loop di rilevamento duplicati, filtrare `parsed` per rimuovere le righe con email già vista. Prima occorrenza = mantenuta, successive = saltate + errore.

### Fix 3 — Export: applicare `search` ai filtri
Passare `search` come parametro a `doExport` e applicarlo alla query principale come il filtro testuale della vista.

### Fix 4 — Export/Import: chunking `.in(ids)`
Aggiungere loop di chunking a blocchi di 2000 per qualsiasi query che usa `.in("id", largeArray)` o `.in("contact_id", largeArray)`.

### Fix 5 — A/B Split: validare range `abSplitPercent`
Aggiungere `Math.max(10, Math.min(90, abSplitPercent))` nella edge function prima del calcolo di `splitIdx`.

### Fix 6 — A/B Winner UI: refetch automatico
Aggiungere `refetchInterval: 60000` e `refetchIntervalInBackground: false` alla query di `CampaignAbResults`.

### Fix 7 — Cron sicurezza: CRON_SECRET
Aggiungere header `x-cron-secret` al cron job e verifica lato edge function.

## File da modificare

- `src/components/marketing/UnifiedContactTimeline.tsx` — Fix `direction`, `isLoading` parziale
- `src/pages/azienda/marketing/MarketingContacts.tsx` — Fix duplicati import, search in export, chunking
- `src/components/email-marketing/CampaignAbResults.tsx` — refetchInterval
- `supabase/functions/send-email-campaign/index.ts` — Fix split percent clamp
- `supabase/functions/determine-ab-winner/index.ts` — Fix completed_at=null e sicurezza
