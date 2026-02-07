
# Piano: Analisi, Ottimizzazione e Pulizia Codice

## Panoramica

Dopo un'analisi approfondita del codebase, ho identificato diversi problemi e aree di miglioramento. Il codice è generalmente ben strutturato, ma ci sono ottimizzazioni da applicare per migliorare performance, manutenibilità e robustezza.

---

## 1. Problemi Identificati

### 1.1 Performance - Query senza caching

Molte query non hanno `staleTime` configurato, causando refetch continui:

| File | Query | Problema |
|------|-------|----------|
| `CompanyDashboard.tsx` | Statistiche dashboard | Usa `useEffect` invece di `useQuery`, nessun caching |
| `OrdersList.tsx` | Lista ordini | Manca `staleTime` |
| `Warehouse.tsx` | Articoli magazzino | Manca `staleTime` |
| `Employees.tsx` | Lista dipendenti | Manca `staleTime` |
| `CashFlowForecast.tsx` | Ordini e pagamenti | Manca `staleTime` |

### 1.2 Dashboard - Usa useState/useEffect invece di useQuery

Il file `CompanyDashboard.tsx` usa un pattern obsoleto con `useState` + `useEffect` per il fetch dati invece del più robusto `useQuery`. Questo causa:
- Nessun caching automatico
- Nessun refetch automatico
- Nessuna gestione errori standardizzata
- Potenziali memory leak

### 1.3 LaborCostsStats - Query multiple sequenziali

Il componente `LaborCostsStats.tsx` esegue 5 query separate in sequenza invece di ottimizzarle:
1. Count employees
2. Count external teams
3. Order employees costs
4. Order external teams costs
5. Orders with labor data

Questo rallenta significativamente il caricamento.

### 1.4 Componente effectiveCompanyId non consistente

In alcuni componenti si usa `effectiveCompany?.id` direttamente, in altri si crea una variabile `effectiveCompanyId`. Standardizzare l'approccio.

### 1.5 Console.error ma nessun feedback utente

In `LaborCostsStats.tsx` non c'è gestione errori visibile all'utente - se una query fallisce, il componente mostra solo lo skeleton.

---

## 2. Ottimizzazioni Proposte

### 2.1 Aggiungere staleTime alle query principali

Configurare `staleTime: 5 * 60 * 1000` (5 minuti) per le query che non cambiano frequentemente:

```typescript
// Esempio pattern
const { data } = useQuery({
  queryKey: ["key", companyId],
  queryFn: async () => { ... },
  enabled: !!companyId,
  staleTime: 5 * 60 * 1000, // 5 minuti cache
});
```

**File da aggiornare:**
- `src/pages/azienda/OrdersList.tsx`
- `src/pages/azienda/Warehouse.tsx`
- `src/pages/azienda/Employees.tsx`
- `src/pages/azienda/CashFlowForecast.tsx`
- `src/pages/azienda/CustomersList.tsx`

### 2.2 Refactor CompanyDashboard con useQuery

Convertire il pattern `useEffect` + `useState` in `useQuery`:

**Prima:**
```typescript
const [stats, setStats] = useState({});
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  async function fetchData() { ... }
  fetchData();
}, [company]);
```

**Dopo:**
```typescript
const { data: dashboardData, isLoading } = useQuery({
  queryKey: ["dashboard-data", companyId],
  queryFn: async () => { ... },
  enabled: !!companyId,
  staleTime: 2 * 60 * 1000, // 2 minuti
});
```

### 2.3 Ottimizzare LaborCostsStats con query aggregate

Ridurre le 5 query a 2-3 usando `Promise.all` e query più efficienti:

```typescript
const { data: stats } = useQuery({
  queryKey: ["labor-stats", companyId],
  queryFn: async () => {
    const [
      { count: employeesCount },
      { count: teamsCount },
      { data: monthlyData }
    ] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true })...,
      supabase.from("external_teams").select("id", { count: "exact", head: true })...,
      // Query combinata per costi mensili
      supabase.from("orders").select(`
        id, total_amount,
        order_employees(total_cost, created_at),
        order_external_teams(total_cost, created_at),
        order_items(purchase_price, quantity)
      `)...
    ]);
    // Elaborazione lato client
  }
});
```

### 2.4 Gestione Errori migliorata

Aggiungere error handling visibile:

```typescript
const { data, isLoading, isError } = useQuery({ ... });

if (isError) {
  return (
    <Card>
      <CardContent className="text-center text-destructive">
        Errore nel caricamento dei dati
      </CardContent>
    </Card>
  );
}
```

---

## 3. Pulizia Codice

### 3.1 Variabili non utilizzate

Verificherò e rimuoverò eventuali:
- Import non utilizzati
- Variabili dichiarate ma mai usate
- Funzioni definite ma mai chiamate

### 3.2 Codice duplicato

Identificati pattern duplicati in:
- Calcolo date (`startOfMonth`, `endOfMonth`) - possibile utility
- Format currency e date - già centralizzato in `formatters.ts`
- Query pattern per company filtering

### 3.3 Type Safety

Alcuni cast `as any` nei componenti potrebbero essere migliorati con types più specifici:
- `LaborCostsStats.tsx` linee 57-59, 72-74, 91
- `CashFlowForecast.tsx` linea 126, 201

---

## 4. File da Modificare

| File | Modifiche | Priorità |
|------|-----------|----------|
| `src/pages/azienda/CompanyDashboard.tsx` | Refactor con useQuery, aggiungere staleTime | Alta |
| `src/components/dashboard/LaborCostsStats.tsx` | Ottimizzare query, error handling | Alta |
| `src/pages/azienda/OrdersList.tsx` | Aggiungere staleTime | Media |
| `src/pages/azienda/Warehouse.tsx` | Aggiungere staleTime | Media |
| `src/pages/azienda/Employees.tsx` | Aggiungere staleTime | Media |
| `src/pages/azienda/CashFlowForecast.tsx` | Aggiungere staleTime | Media |
| `src/pages/azienda/CustomersList.tsx` | Aggiungere staleTime | Media |

---

## 5. Benefici Attesi

| Miglioramento | Impatto |
|---------------|---------|
| **Cache 5 min** | -80% chiamate API su navigazione |
| **useQuery pattern** | Gestione errori automatica, retry built-in |
| **Query ottimizzate** | LaborCostsStats: 5 query → 2 query (-60% latenza) |
| **Error states** | UX migliore in caso di errori di rete |
| **Code cleanup** | Manutenibilità migliorata |

---

## Sezione Tecnica

### Pattern staleTime consigliati:

```typescript
// Dati che cambiano raramente (configurazioni, statuses)
staleTime: 10 * 60 * 1000 // 10 minuti

// Dati moderatamente dinamici (liste, statistiche)
staleTime: 5 * 60 * 1000 // 5 minuti

// Dati più dinamici (dettagli singoli elementi)
staleTime: 2 * 60 * 1000 // 2 minuti

// Dati real-time (chat, notifiche)
staleTime: 0 // sempre fresh
```

### Query optimization in LaborCostsStats:

Invece di filtrare lato client con `.filter((item: any) => item.order?.company_id === companyId)`, spostare il filtro nella query SQL usando join impliciti.
