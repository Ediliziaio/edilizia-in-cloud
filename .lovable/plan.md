

# Audit Enterprise — 6a Verifica

## Stato attuale

Il progetto ha superato 5 audit consecutivi ed e stato dichiarato "Pronto per produzione". Console pulita, navigazione fluida, architettura solida. Questa 6a verifica si concentra sugli interventi residui emersi dall'analisi odierna.

## Interventi identificati

### P1 — `getPublicUrl` residui in altri moduli di upload (4 file)

Il refactor a signed URLs e stato applicato correttamente a `OrderAttachments.tsx` e `PendingFilesUpload.tsx`, ma **4 componenti di upload usano ancora `getPublicUrl`**, salvando URL pubblici nel DB. Questi moduli non sono nel bucket `order-attachments` (gia reso privato), ma rappresentano lo stesso anti-pattern di sicurezza:

| File | Bucket | Rischio |
|------|--------|---------|
| `OrderItemAttachments.tsx` | `order-attachments` (privato) | **P0**: usa `getPublicUrl` su bucket privato — i link non funzionano |
| `EmployeeAttachments.tsx` | `personnel-attachments` | P1: link pubblici permanenti |
| `ExternalTeamAttachments.tsx` | `personnel-attachments` | P1: link pubblici permanenti |
| `MarketingDocumentsPanel.tsx` | `marketing-attachments` | P1: link pubblici permanenti |

**`OrderItemAttachments.tsx` e un bug P0**: il bucket `order-attachments` e stato reso privato nella migrazione recente, ma questo componente usa ancora `getPublicUrl`. I link generati non funzioneranno. Inoltre manca la validazione MIME type.

### P1 — Mancata validazione MIME in `OrderItemAttachments.tsx`

Il componente accetta qualsiasi tipo di file senza whitelist MIME, a differenza di `OrderAttachments` e `PendingFilesUpload` che validano correttamente.

### P1 — 474 `as any` nel codebase

Bloccato dalla rigenerazione tipi (file auto-generato `types.ts`). Nessun impatto runtime ma debito tecnico significativo. Non risolvibile senza aggiornamento dello schema.

## Piano di intervento

### 1. Fix P0: `OrderItemAttachments.tsx` — signed URLs + MIME validation
- Sostituire `getPublicUrl` con `createSignedUrl` (1h expiry)
- Salvare il path relativo nel DB invece dell'URL pubblico
- Aggiungere validazione MIME type con la stessa whitelist di `OrderAttachments`
- Aggiungere limite dimensione file (10MB)

### 2. Fix P1: `EmployeeAttachments.tsx` + `ExternalTeamAttachments.tsx` — signed URLs
- Sostituire `getPublicUrl` con `createSignedUrl` per i download
- Salvare path relativi nel DB
- I bucket `personnel-attachments` e `marketing-attachments` rimangono come sono (non toccati dalla migrazione precedente), ma i nuovi upload useranno path relativi

### 3. Fix P1: `MarketingDocumentsPanel.tsx` — signed URLs
- Stessa logica: signed URL per download, path relativo nel DB

### 4. Nessun altro intervento necessario

Tutte le altre aree verificate sono conformi:
- Console: pulita, zero errori
- Lazy loading: attivo su tutte le route
- React.memo/useMemo: implementati su widget pesanti
- ErrorBoundary: globale + per sezione
- staleTime: 2-5min su query
- Multi-tenancy: `effectiveCompany` ovunque, RLS attiva
- Sicurezza: DOMPurify (XSS), RBAC, rate limiting, audit log
- Backup: gestito da Lovable Cloud
- Osservabilita: ErrorBoundary + QueryCache/MutationCache.onError

### File modificati

| File | Modifica |
|------|----------|
| `OrderItemAttachments.tsx` | Signed URLs, MIME validation, path relativo, limite 10MB |
| `EmployeeAttachments.tsx` | Signed URLs, path relativo |
| `ExternalTeamAttachments.tsx` | Signed URLs, path relativo |
| `MarketingDocumentsPanel.tsx` | Signed URLs, path relativo |

### Risultato atteso

- **P0 risolto**: upload allegati articoli ordine funzionante con bucket privato
- **P1 risolto**: tutti i moduli di upload usano signed URLs — nessun link pubblico permanente
- Validazione MIME coerente su tutti i punti di upload
- Nessuna regressione: stessa UX, stesse funzionalita

