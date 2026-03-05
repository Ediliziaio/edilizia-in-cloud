

# Audit 7a Verifica — Analisi modifiche recenti

## Bug P0 attivo (crash in produzione)

La pagina **Clienti** (`/azienda/clienti`) sta crashando con errore **"Invalid time value"**. Il crash e visibile nei console log e viene catturato dall'ErrorBoundary.

**Causa**: alla riga 506 di `CustomersList.tsx`, `format(new Date(customer.created_at), ...)` fallisce quando `created_at` e `null` o `undefined`. Lo stesso problema si presenta alla riga 244 nel sorting (`new Date(a.created_at).getTime()`), e alla riga 264 nell'export CSV.

Alcuni profili nel database possono avere `created_at` nullo (es. profili creati prima della migrazione o importati senza timestamp).

**Fix**: proteggere tutte le occorrenze di `new Date(customer.created_at)` con un fallback:
- Riga 244 (sort): `new Date(a.created_at || 0).getTime()`
- Riga 506 (tabella): `customer.created_at ? format(...) : "—"`
- Riga 264 (CSV export): `c.created_at ? format(...) : ""`

## Bug P1 — `OrderItemAttachments.tsx` incoerenze residue

1. **Riga 117**: il messaggio di errore dice "La dimensione massima e 5MB" ma il limite effettivo e 10MB (`MAX_FILE_SIZE = 10 * 1024 * 1024`).
2. **Riga 292**: il testo helper dice "Max 5MB" ma il limite e 10MB.
3. **Riga 314**: la thumbnail `<img src={att.file_url} .../>` usa il path relativo direttamente come `src` — non funzionera per i nuovi upload che salvano path relativi. Dovrebbe usare `getSignedDownloadUrl`.

## Bug P1 — `CompanyCustomerDetail.tsx` — cast `as any`

Riga 90: `(customer as any).salesperson_id` — il campo `salesperson_id` e stato aggiunto alla migrazione ma il tipo auto-generato non lo riconosce ancora. Il cast `as any` funziona ma e fragile. L'alternativa e aggiungere il campo al select esplicito (gia fatto a riga 55) e accettare il cast temporaneo fino a rigenerazione tipi.

## Checklist modifiche recenti — Conformita

| Area | Stato | Note |
|------|-------|------|
| Signed URLs (OrderAttachments) | OK | `createSignedUrl` 1h, path relativo nel DB |
| Signed URLs (EmployeeAttachments) | OK | Backward-compat con legacy URL |
| Signed URLs (ExternalTeamAttachments) | OK | Stesso pattern |
| Signed URLs (MarketingDocumentsPanel) | OK | Stesso pattern |
| Signed URLs (OrderItemAttachments) | OK con bug P1 | Thumbnail rotta per nuovi upload |
| Drag-and-drop (PendingFilesUpload) | OK | dragCounter pattern corretto |
| Drag-and-drop (OrderAttachments) | OK | Solo quando `editable=true` |
| MIME validation | OK | Whitelist coerente |
| File size limit | OK (con testo errato) | 10MB effettivo, UI dice 5MB in OrderItemAttachments |
| Filtri Clienti | OK (con crash) | Funzionalita corretta ma crash su `created_at` null |
| Venditore inline | OK | Mutazione + invalidazione cache |
| CSV export | OK (con crash) | Include venditore+data ma crash su null |
| Multi-tenancy | OK | `effectiveCompany` usato ovunque |
| RLS | OK | Nessuna modifica alle policy |

## Piano di intervento

### 1. Fix P0: `CustomersList.tsx` — protezione `created_at` null
- Sort: fallback a epoch 0
- Render tabella: conditional format o "—"
- CSV export: conditional format o stringa vuota

### 2. Fix P1: `OrderItemAttachments.tsx` — 3 correzioni
- Riga 117: messaggio "5MB" → "10MB"
- Riga 292: testo "Max 5MB" → "Max 10MB"
- Riga 314: sostituire `<img src={att.file_url}>` con signed URL (stato lazy come in `AttachmentItem`)

### 3. Nessun altro intervento necessario
Tutte le altre modifiche sono conformi agli standard enterprise.

### File modificati

| File | Modifica |
|------|----------|
| `CustomersList.tsx` | Protezione null su `created_at` (3 punti) |
| `OrderItemAttachments.tsx` | Testo 5MB→10MB, thumbnail con signed URL |

