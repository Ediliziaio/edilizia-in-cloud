

# Piano di Pulizia e Stabilizzazione del Progetto

## Analisi completata

Ho analizzato il codebase del Cruscotto Aziendale e i componenti correlati. Il progetto e' complessivamente ben strutturato. Ecco i problemi identificati e le correzioni pianificate.

---

## 1. Codice non utilizzato da rimuovere

| File | Problema |
|------|----------|
| `src/hooks/useCruscottoData.ts` | Import inutilizzato: `formatCurrency` da `@/lib/formatters` (riga 7) |
| `src/hooks/useCruscottoData.ts` | Import tipo inutilizzati: `FunnelStage`, `SalesPerformance`, `SourceAnalysis`, `TrendPoint` (riga 6) — usati solo come `DashboardStats` |
| `src/pages/azienda/CruscottoAziendale.tsx` | Import inutilizzati: `memo`, `lazy`, `Suspense` (riga 1) — `memo` non wrappa il componente, `lazy`/`Suspense` non sono usati |
| `src/pages/azienda/CruscottoAziendale.tsx` | Componente `SectionLoader` (righe 15-21) — definito ma mai usato |
| `src/hooks/useCruscottoData.ts` | Variabile `user` destrutturata da `useAuth()` ma mai usata (riga 63) |
| `src/hooks/useCruscottoData.ts` | Interface `CruscottoData` (righe 41-47) — definita ma mai esportata/usata altrove |

## 2. Bug e problemi tecnici da correggere

| Problema | Soluzione |
|----------|-----------|
| `usePermissions.ts` riga 124: cast `(permissions as any)?.can_view_cruscotto` — fragile, indica che il tipo non include la colonna | Dopo che la migrazione e' attiva, il tipo generato dovrebbe includere `can_view_cruscotto`. Se non e', il cast `as any` e' l'unica opzione ma va documentato con commento |
| `useCruscottoData.ts` riga 108: `q.eq("status_id", filters.statusId)` — la tabella `orders` usa `current_status_id`, non `status_id` | Correggere in `.eq("current_status_id", filters.statusId)` |
| `CruscottoAlerts.tsx` riga 130: `key` prop duplicata — sia su `<Link>` che sul `<div>` interno (content) | Rimuovere `key` dal `<div>` interno (content), lasciare solo sul wrapper |

## 3. Miglioramenti UX

| Miglioramento | Dettaglio |
|---------------|-----------|
| Stato vuoto Cruscotto | Aggiungere un messaggio vuoto quando `isLoading=false` e non ci sono dati marketing, invece di mostrare cards tutte a zero |
| Loading state pagina | Aggiungere un loading skeleton full-page quando `isLoading` e' true al primo caricamento, invece di skeleton sparsi |
| Errore visibile | Mostrare un banner di errore se `error` non e' null (attualmente ignorato nella UI) |
| CruscottoFilters responsive | I preset date su mobile si comprimono male — wrappare con `overflow-x-auto` |

## 4. File da modificare

1. **`src/hooks/useCruscottoData.ts`** — Rimuovere import inutilizzati, variabile `user`, interface `CruscottoData`; fix `status_id` → `current_status_id`
2. **`src/pages/azienda/CruscottoAziendale.tsx`** — Rimuovere import inutilizzati e `SectionLoader`; aggiungere gestione errore e stato vuoto
3. **`src/components/cruscotto/CruscottoAlerts.tsx`** — Fix key prop duplicata
4. **`src/components/cruscotto/CruscottoFilters.tsx`** — Aggiungere `overflow-x-auto` per responsive mobile

## Nessun cambio comportamentale

Tutte le modifiche sono pulizia, fix bug silenziosi e miglioramenti UX. Nessuna funzionalita' viene alterata.

