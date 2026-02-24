

# Risultato Scansione Completa — Componenti, Funzioni e Import Inutilizzati

## Metodologia

Ho scansionato sistematicamente tutti gli export in `src/components/`, `src/lib/`, `src/hooks/`, `src/types/`, `src/pages/`, e `src/assets/`, verificando per ciascuno se esistono import o riferimenti altrove nel codebase.

## Elementi inutilizzati trovati

| # | Elemento | Tipo | Dettaglio |
|---|----------|------|-----------|
| 1 | `src/assets/hero-dashboard-mockup.png` | Asset | Non importato da nessun file. Nessun riferimento nel codebase. |
| 2 | `public/placeholder.svg` | Asset pubblico | Non referenziato da nessun componente o pagina. |
| 3 | `src/test/example.test.ts` | File test | Test placeholder (`expect(true).toBe(true)`) — non testa nulla di reale. |
| 4 | `getEndOfMonth()` in `src/lib/urgencyUtils.ts` | Export funzione | Usata solo internamente da `getTimeLeft()` nello stesso file. Non importata altrove. Non e un problema ma l'export e superfluo — potrebbe essere una semplice funzione locale. |

## Elementi verificati e tutti in uso

Tutti gli altri componenti, hook, utility, tipi e pagine sono correttamente importati e utilizzati:

- **Componenti**: tutti i 245+ componenti esportati hanno almeno un import attivo
- **Hook**: tutti i 21 hook custom (`usePermissions`, `useCardFieldPreferences`, `useTagSync`, ecc.) sono importati
- **Lib/Utils**: `vatUtils`, `csvExport`, `contactUtils`, `orderUtils`, `adminConstants`, `formatters`, `documentTypes`, `notificationSound`, `sidebarConfig`, `calendarUtils` — tutti con import multipli
- **Landing**: `AIImage`, tutte le sezioni landing — usate
- **Integrations**: `ActivationStep`, `MetaIntegrationWizard` — usati
- **Layouts**: tutti i 5 layout + `SettingsLayout` — usati in `App.tsx`
- **`MARKETING_SECTIONS`** in `SalespeopleConfig.tsx` e `Employees.tsx` — entrambi usati nel rendering

## Piano di intervento

### Azioni consigliate

| Azione | File | Tipo |
|--------|------|------|
| Eliminare | `src/assets/hero-dashboard-mockup.png` | Asset non referenziato |
| Eliminare | `public/placeholder.svg` | Asset non referenziato |
| Eliminare | `src/test/example.test.ts` | Test placeholder senza valore |
| Rendere locale (rimuovere `export`) | `getEndOfMonth()` in `src/lib/urgencyUtils.ts` | Export superfluo (usata solo internamente) |

### Impatto

- Nessun rischio di regressione: nessuno dei 4 elementi e referenziato altrove
- Riduzione minima del bundle (l'asset PNG e il piu significativo)
- Nessuna migrazione DB, nessuna modifica backend

### Nota

Il codebase e complessivamente pulito. Su 245+ componenti e 21 hook, solo 2 asset orfani e 1 test placeholder risultano inutilizzati. Non ci sono funzioni morte, import fantasma, o componenti zombie significativi.

