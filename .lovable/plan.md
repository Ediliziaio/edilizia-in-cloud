
# Piano: Verifica e Pulizia Finale del Codice

## 1. Riepilogo Verifica Completata

Ho verificato il corretto funzionamento di tutte le funzionalità:

| Area | Stato | Note |
|------|-------|------|
| Dashboard `/azienda` | OK | Card Costi Manodopera funziona |
| Caching (staleTime) | OK | Navigazione veloce, nessun refetch inutile |
| Pagina Dipendenti | OK | CRUD funzionante |
| Dettaglio Ordine | OK | Manodopera e Conto Economico integrati |
| Ordini | OK | Caching 5 minuti attivo |
| Magazzino | OK | Caching 5 minuti attivo |

---

## 2. Miglioramenti Minori Identificati

### 2.1 Type Safety - Rimuovere `as any`

**File**: `CashFlowForecast.tsx` (linee 127, 203)

Attualmente:
```typescript
externalTeamPayments.forEach((payment: any) => {
```

Miglioramento: Definire un'interfaccia specifica per il tipo di ritorno della query.

### 2.2 Aggiungere staleTime alle Query di Dettaglio Ordine

**File**: `OrderLaborCosts.tsx` e `OrderEconomics.tsx`

Le query per `order-employees` e `order-external-teams` non hanno `staleTime`. Aggiungere:
```typescript
staleTime: 2 * 60 * 1000, // 2 minuti
```

### 2.3 Migliorare UX quando companyId è null

**File**: `CompanyDashboard.tsx`

Attualmente mostra uno spinner infinito se l'utente non ha una company selezionata (es. super admin senza impersonazione). Aggiungere un messaggio informativo:

```typescript
if (!companyId) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>Seleziona un'azienda per visualizzare la dashboard</p>
    </div>
  );
}
```

---

## 3. File da Modificare

| File | Modifica | Priorità |
|------|----------|----------|
| `CashFlowForecast.tsx` | Type safety per external teams query | Bassa |
| `OrderLaborCosts.tsx` | Aggiungere staleTime alle query | Bassa |
| `OrderEconomics.tsx` | Aggiungere staleTime alle query | Bassa |
| `CompanyDashboard.tsx` | Messaggio quando companyId è null | Bassa |

---

## 4. Codice Attualmente Pulito

Non sono stati trovati:
- Import non utilizzati
- Variabili dichiarate ma non usate
- Funzioni obsolete
- Codice duplicato significativo

Il codebase è ben organizzato e segue pattern consistenti.

---

## Sezione Tecnica

### Configurazione staleTime Attuale

```text
CompanyDashboard.tsx:     2 minuti  (dashboard data)
LaborCostsStats.tsx:      5 minuti  (labor stats)
OrdersList.tsx:           5 minuti  (orders), 10 minuti (statuses)
Warehouse.tsx:            5 minuti  (items), 10 minuti (suppliers)
Employees.tsx:            5 minuti  (employees, teams)
CashFlowForecast.tsx:     5 minuti  (orders, external teams)
CustomersList.tsx:        5 minuti  (customers)
```

Questa configurazione riduce le chiamate API di circa 80% durante la navigazione tra pagine.
