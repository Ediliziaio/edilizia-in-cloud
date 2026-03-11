

# Caricamento progressivo opportunità con `useInfiniteQuery`

## Problema attuale
La query carica TUTTE le opportunità in un colpo (fino a 10.000) con enrichment completo (profili, note, documenti, appuntamenti). Con migliaia di record, il caricamento iniziale è lento e pesante.

## Soluzione

### 1. `src/hooks/useOpportunitiesData.ts` — Convertire a `useInfiniteQuery`
- Sostituire `useQuery` con `useInfiniteQuery` in `useOpportunities`
- Pagine da 500 record, caricamento con `.range(from, to)`
- Enrichment (profili, note, docs, appointments) eseguito per ogni pagina
- `getNextPageParam`: se la pagina ha 500 risultati → c'è un'altra pagina
- Flatten delle pagine in un singolo array nel return
- Auto-fetch delle pagine successive in background con `useEffect` che chiama `fetchNextPage` quando `hasNextPage` è true
- Il risultato esposto resta un singolo array — filtri/sort client-side funzionano identicamente

### 2. `src/pages/azienda/marketing/MarketingOpportunities.tsx` — Adattare il consumo
- Destrutturare `data.pages.flat()` invece di `data` diretto
- Aggiungere indicatore di caricamento progressivo: piccolo spinner + testo "Caricamento X di ~Y opportunità..." sotto la toolbar quando `isFetchingNextPage`
- Il badge conteggio mostra il totale parziale che cresce man mano che le pagine arrivano

### 3. `src/lib/queryKeys.ts` — Nessuna modifica necessaria
La chiave `opportunities.list(companyId, pipelineId)` funziona identicamente con `useInfiniteQuery`.

```text
Flusso:
Pagina 1 (0-499)  → render immediato + enrichment
Pagina 2 (500-999) → background fetch → merge
Pagina 3 (1000-1499) → background fetch → merge
...fino a pagina con < 500 risultati → stop
```

## File da modificare
1. `src/hooks/useOpportunitiesData.ts` — `useInfiniteQuery` + paginazione + enrichment per pagina
2. `src/pages/azienda/marketing/MarketingOpportunities.tsx` — flatten pages + indicatore caricamento progressivo

Due file, l'architettura di filtro/sort/virtualizzazione resta invariata.

