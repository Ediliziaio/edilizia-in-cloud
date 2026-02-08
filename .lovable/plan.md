
# Piano: Miglioramento Previsionale e Sistema Timesheet Dipendenti

## Panoramica

Questo piano implementa tre macro-funzionalita richieste:
1. **Miglioramento Previsionale Cassa** - Aggiunta dei costi articoli in sospeso
2. **Tracciamento Stato Articoli nel Previsionale** - Mostrare cosa deve ancora essere acquistato
3. **Sistema Timesheet Dipendenti** - Permettere ai dipendenti di registrare le proprie ore di lavoro giorno per giorno

---

## 1. Miglioramento Previsionale Cassa

### Problema Attuale
Il previsionale mostra solo:
- Entrate: pagamenti clienti (acconti/saldi)
- Uscite: pagamenti squadre esterne

**Mancano:**
- Costi articoli da ordinare (spese future per materiali)
- Vista complessiva di tutte le uscite previste

### Soluzione
Aggiungere una nuova sezione nel previsionale che mostri:
- Articoli "Da Ordinare" con costo stimato
- Articoli "Ordinati" (in attesa di consegna) con costo impegnato
- Raggruppamento per fornitore o per ordine

### Layout Proposto

```text
+--------------------------------------------------+
|  Previsionale Cassa                              |
+--------------------------------------------------+
| [Questo Mese] [Prossimo Mese] [3 Mesi] [Totale]  |
+--------------------------------------------------+

+--------------------------------------------------+
|  Uscite Materiali Previste                       |
+--------------------------------------------------+
| Da Ordinare          €12.500    (45 articoli)    |
| Ordinati (in arrivo) €8.300     (28 articoli)    |
| -------------------------------------------------|
| Totale Impegni       €20.800                     |
+--------------------------------------------------+
```

---

## 2. Sistema Timesheet Dipendenti

### Problema Attuale
- Solo admin/staff azienda possono assegnare ore ai dipendenti
- I dipendenti non hanno accesso al sistema
- Non esiste tracciamento giornaliero del lavoro svolto

### Soluzione
Creare un sistema completo di rapportini:

1. **Nuova tabella database**: `work_logs` per i rapportini giornalieri
2. **Collegamento dipendenti-utenti**: Associare dipendenti a un account utente
3. **Nuovo ruolo**: `employee` con accesso limitato
4. **Nuova pagina**: Dashboard dipendente per inserire ore
5. **Vista admin**: Riepilogo rapportini per approvazione

### Schema Database - Nuova Tabella `work_logs`

```sql
CREATE TABLE public.work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    hours_worked NUMERIC NOT NULL DEFAULT 0,
    description TEXT,
    activity_type TEXT DEFAULT 'lavoro',
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indice per ricerche veloci
CREATE INDEX idx_work_logs_employee_date ON work_logs(employee_id, work_date);
CREATE INDEX idx_work_logs_order ON work_logs(order_id);

-- RLS Policies
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can manage their own work logs"
ON work_logs FOR ALL
USING (
    employee_id IN (
        SELECT id FROM employees WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Company admins can manage all work logs"
ON work_logs FOR ALL
USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = work_logs.employee_id
        AND e.company_id = get_user_company_id(auth.uid())
    )
);
```

### Modifiche Tabella `employees`

```sql
-- Aggiungere collegamento a utente
ALTER TABLE employees ADD COLUMN user_id UUID REFERENCES auth.users(id);
```

### Nuove Pagine e Componenti

| Componente | Descrizione |
|------------|-------------|
| `src/pages/dipendente/EmployeeDashboard.tsx` | Dashboard principale dipendente |
| `src/pages/dipendente/TimeEntry.tsx` | Inserimento ore giornaliere |
| `src/pages/dipendente/MyWorkLogs.tsx` | Storico rapportini personali |
| `src/components/employees/WorkLogDialog.tsx` | Dialog per inserire/modificare rapportino |
| `src/components/employees/WorkLogsTable.tsx` | Tabella rapportini con filtri |
| `src/components/layouts/EmployeeLayout.tsx` | Layout per area dipendente |

### Flusso Utente - Dipendente

```text
1. Dipendente accede con credenziali
2. Visualizza dashboard con calendario mese
3. Clicca su un giorno per inserire ore
4. Seleziona ordine (opzionale) e inserisce:
   - Ore lavorate
   - Descrizione attivita
   - Tipo attivita (lavoro, trasferta, ecc.)
5. Salva rapportino
6. Admin puo approvare o richiedere modifiche
```

---

## 3. Vista Admin - Gestione Rapportini

### Nella Pagina Dipendenti

Aggiungere una nuova tab "Rapportini" con:
- Filtri per dipendente, periodo, stato approvazione
- Tabella con tutti i rapportini
- Azioni: Approva, Richiedi modifiche, Visualizza dettaglio

### Nel Dettaglio Ordine

Mostrare le ore inserite dai dipendenti (rapportini) oltre a quelle assegnate manualmente.

---

## 4. File da Creare/Modificare

### Nuovi File

| File | Descrizione |
|------|-------------|
| `src/pages/dipendente/EmployeeDashboard.tsx` | Dashboard dipendente |
| `src/pages/dipendente/TimeEntry.tsx` | Inserimento ore |
| `src/components/layouts/EmployeeLayout.tsx` | Layout area dipendente |
| `src/components/employees/WorkLogDialog.tsx` | Form inserimento rapportino |
| `src/components/employees/WorkLogsTable.tsx` | Tabella rapportini |
| `src/components/employees/WorkLogCalendar.tsx` | Calendario visuale ore |

### File da Modificare

| File | Modifica |
|------|----------|
| `src/App.tsx` | Aggiungere rotte per area dipendente |
| `src/types/auth.ts` | Aggiungere ruolo `employee` |
| `src/pages/azienda/CashFlowForecast.tsx` | Aggiungere sezione costi articoli |
| `src/pages/azienda/Employees.tsx` | Aggiungere tab Rapportini |
| `src/components/orders/OrderLaborCosts.tsx` | Mostrare rapportini oltre a ore assegnate |
| `supabase/functions/create-employee-user/index.ts` | Edge function per creare utente dipendente |

---

## Sezione Tecnica

### 5.1 Modifica CashFlowForecast.tsx

Aggiungere query per articoli in sospeso:

```typescript
// Query articoli da ordinare/ordinati
const { data: pendingItems = [] } = useQuery({
  queryKey: ["forecast-pending-items", companyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("order_items")
      .select(`
        id, name, quantity, purchase_price, status,
        supplier:suppliers(name),
        order:orders!inner(id, order_code, company_id, expected_date)
      `)
      .in("status", ["da_ordinare", "ordinato"])
      .eq("order.company_id", companyId!);
    
    if (error) throw error;
    return data;
  },
  enabled: !!companyId,
  staleTime: 5 * 60 * 1000,
});

// Calcola totali
const pendingItemsCosts = useMemo(() => {
  const daOrdinare = pendingItems.filter(i => i.status === "da_ordinare");
  const ordinati = pendingItems.filter(i => i.status === "ordinato");
  
  return {
    toOrder: {
      count: daOrdinare.length,
      total: daOrdinare.reduce((sum, i) => sum + (i.purchase_price || 0) * (i.quantity || 1), 0),
    },
    ordered: {
      count: ordinati.length,
      total: ordinati.reduce((sum, i) => sum + (i.purchase_price || 0) * (i.quantity || 1), 0),
    },
  };
}, [pendingItems]);
```

### 5.2 Layout Area Dipendente

```typescript
// EmployeeLayout.tsx
export function EmployeeLayout() {
  const { user, role } = useAuth();
  
  // Verifica che l'utente sia un dipendente collegato
  const { data: employee } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Sidebar con navigazione limitata
  // - Dashboard
  // - Inserisci Ore
  // - I Miei Rapportini
  // - Profilo
}
```

### 5.3 Componente Calendario Ore

```typescript
// WorkLogCalendar.tsx - Calendario mensile con ore inserite
interface WorkLogCalendarProps {
  employeeId: string;
  month: Date;
  onDayClick: (date: Date) => void;
}

// Mostra:
// - Giorni con ore gia inserite (badge verde)
// - Giorni lavorativi senza ore (badge arancione)
// - Totale ore mese
// - Stato approvazione
```

---

## 6. Priorita Implementazione

### Fase 1 - Previsionale Migliorato (1-2 ore)
1. Aggiungere query costi articoli a CashFlowForecast
2. Creare sezione "Uscite Materiali Previste"
3. Integrare nel grafico e nelle statistiche

### Fase 2 - Database e Backend (1-2 ore)
1. Creare tabella `work_logs`
2. Aggiungere colonna `user_id` a `employees`
3. Creare edge function per associare dipendente a utente
4. Configurare RLS policies

### Fase 3 - Area Dipendente (2-3 ore)
1. Creare layout e pagine dipendente
2. Implementare calendario ore
3. Implementare form inserimento rapportino
4. Aggiungere rotte in App.tsx

### Fase 4 - Vista Admin Rapportini (1-2 ore)
1. Aggiungere tab Rapportini in pagina Dipendenti
2. Implementare approvazione/rifiuto
3. Integrare rapportini in dettaglio ordine

---

## 7. Benefici Attesi

| Funzionalita | Beneficio |
|--------------|-----------|
| Previsionale costi articoli | Visione completa delle uscite future |
| Timesheet dipendenti | Tracciamento accurato ore lavorate |
| Approvazione rapportini | Controllo qualita e verifica |
| Calcolo automatico costi | Nessun inserimento manuale ore |

---

## 8. Considerazioni UX

- **Dipendente**: Interfaccia semplice, focalizzata sull'inserimento ore
- **Admin**: Vista completa con filtri e approvazioni batch
- **Mobile-first**: Calendario e form ottimizzati per smartphone
- **Feedback immediato**: Toast per conferme, validazioni in tempo reale
