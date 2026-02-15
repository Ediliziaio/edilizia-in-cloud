

# Fix Costi Dipendenti: da una tantum a mensile (stipendio)

## Problema attuale

Nella sezione Costi, i dipendenti (es. Alessandro Natale) appaiono come costi una tantum derivati dagli ordini (ore x tariffa oraria = ~300 EUR). Ma il costo reale di un dipendente e il suo **stipendio lordo mensile** (es. 2.000 EUR/mese), non l'assegnazione al singolo ordine.

Inoltre, vengono mostrati solo i dipendenti assegnati a ordini, non tutti quelli dell'azienda.

## Soluzione

### 1. Nuova query: tutti i dipendenti attivi dell'azienda

Aggiungere una query che carica tutti i dipendenti attivi dalla tabella `employees` (non da `order_employees`), con il loro stipendio lordo.

### 2. Trasformazione in costi mensili ricorrenti

Ogni dipendente attivo diventa un costo con:
- **Nome**: "Nome Cognome (stipendio)"
- **Importo**: `gross_salary`
- **Tipo**: Fisso
- **Ricorrenza**: Mensile
- **Categoria**: "Personale"
- **Origine**: Automatica (da ordine, non modificabile)

### 3. Rimuovere i costi per-ordine dei dipendenti

La trasformazione `employeeAsVariableCosts` (basata su `order_employees`) verra rimossa dalla sezione Costi. I costi per-ordine restano visibili nella scheda Manodopera del singolo ordine, ma nella vista Costi conta solo lo stipendio mensile.

### 4. Squadre esterne: restano una tantum

Nessun cambiamento per le squadre esterne -- continuano a essere costi una tantum derivati dagli ordini.

---

## Dettaglio tecnico

### File: `src/components/forecast/CompanyCostsManager.tsx`

**A. Sostituire la query `order-employee-costs`** con una nuova query su `employees`:

```typescript
const { data: activeEmployees = [] } = useQuery({
  queryKey: ["active-employees-costs", companyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name, gross_salary, is_active")
      .eq("company_id", companyId!)
      .eq("is_active", true)
      .order("last_name");
    if (error) throw error;
    return data || [];
  },
  enabled: !!companyId,
});
```

**B. Sostituire `employeeAsVariableCosts`** con una trasformazione che genera un costo mensile per ogni dipendente attivo, replicando la stessa logica dei costi ricorrenti (una riga per ogni mese per i prossimi 12 mesi, oppure un'unica riga "monthly"):

```typescript
const employeeAsFixedCosts: UnifiedCost[] = useMemo(() => {
  return activeEmployees.map((emp) => ({
    id: `employee-salary-${emp.id}`,
    name: `${emp.first_name} ${emp.last_name} (stipendio)`,
    cost_type: "fixed",
    amount: Number(emp.gross_salary) || 0,
    category: "Personale",
    recurrence: "monthly",
    due_date: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    is_paid: false,  // gestito manualmente
    paid_date: null,
    notes: null,
    order_id: null,
    order: null,
    isFromOrder: true, // per renderlo non editabile
    supplierName: null,
  }));
}, [activeEmployees]);
```

**C. Aggiornare `allOrderDerivedCosts`**: sostituire `employeeAsVariableCosts` con `employeeAsFixedCosts`.

**D. Aggiornare le mutation di pagamento**: il prefisso cambia da `emp-cost-` a `employee-salary-`. Il pagamento verra registrato nella tabella `company_costs` con un inserimento automatico (o tramite un meccanismo dedicato) anziche aggiornare `order_employees`.

**E. Rimuovere** la query `order-employee-costs` e la relativa mutation `markEmployeeCostPaidMutation`/`markEmployeeCostUnpaidMutation` poiche non servono piu in questa vista.

---

## Riepilogo

| Voce | Prima | Dopo |
|------|-------|------|
| Dipendenti nei Costi | Una tantum da ordine (ore x tariffa) | Mensile (stipendio lordo) |
| Dipendenti visibili | Solo quelli assegnati a ordini | Tutti quelli attivi |
| Squadre esterne | Una tantum da ordine | Invariato |
| Categoria | "Manodopera" | "Personale" |
| Tipo costo | Variabile | Fisso |

