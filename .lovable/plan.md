

# Piano: Filtro Squadra/Dipendente nel Calendario + Spostamento Dipendenti in Impostazioni

## Panoramica

Due modifiche principali:
1. Aggiungere un filtro per operaio/dipendente nel Calendario
2. Spostare la sezione "Dipendenti" dalla sidebar a un nuovo tab "Operai" nelle Impostazioni

---

## 1. Filtro per Squadra/Dipendente nel Calendario

### Calendar.tsx

- Aggiungere uno stato `employeeFilter` (default `"all"`)
- Creare una query per recuperare i dipendenti della company (`employees` table)
- Aggiungere un terzo `Select` nella barra filtri con label "Tutti gli operai" e lista dei dipendenti attivi
- Nel filtro `scheduledOrders`, se `employeeFilter !== "all"`, verificare che l'ordine abbia in `assigned_employees` un dipendente con l'id selezionato
- Aggiornare `hasActiveFilters` per includere `employeeFilter`
- Aggiornare `resetFilters` per resettare anche `employeeFilter`

### types/calendar.ts

- Aggiungere campo `employee_id` opzionale nell'interfaccia `assigned_employees` per permettere il match con il filtro:

```text
assigned_employees?: Array<{
  employee: {
    id: string;       // <-- nuovo
    first_name: string;
    last_name: string;
  };
}>;
```

### Calendar.tsx - Query aggiornata

Aggiungere `id` nella select dei dipendenti:

```text
order_employees(employee:employees(id, first_name, last_name))
```

---

## 2. Spostare "Dipendenti" in Impostazioni come tab "Operai"

### Rimozione dalla Sidebar

**CompanyLayout.tsx**: Rimuovere la voce "Dipendenti" dall'array `allNavItems` (riga 52).

### Rimozione dalla Route

**App.tsx**: Rimuovere la route `<Route path="dipendenti" element={<Employees />} />` e il relativo import.

### Aggiunta tab "Operai" nelle Impostazioni

**Settings.tsx**:
- Importare il componente `Employees` (lazy o diretto) da `@/pages/azienda/Employees`
- Aggiungere un nuovo tab "operai" con icona `HardHat` visibile solo per admin (come Utenti e Venditori)
- Il contenuto del tab renderizza il componente `Employees` esistente direttamente, senza wrapper aggiuntivi
- Aggiornare il grid delle tab da `grid-cols-6` a `grid-cols-7` per admin

### Rinominare label

- Nel tab delle Impostazioni: label "Operai" con icona `HardHat`
- Nel componente `Employees.tsx`: cambiare il titolo da "Gestione Personale" a "Gestione Operai" e il sottotitolo da "Dipendenti interni e squadre esterne" a "Operai interni e squadre esterne"
- Nei sub-tab interni di Employees: rinominare "Dipendenti" in "Operai"

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/types/calendar.ts` | Aggiungere `id` al tipo employee in `assigned_employees` |
| `src/pages/azienda/Calendar.tsx` | Aggiungere filtro dipendente + query employees + logica filtro |
| `src/components/layouts/CompanyLayout.tsx` | Rimuovere voce "Dipendenti" dalla sidebar |
| `src/App.tsx` | Rimuovere route `/azienda/dipendenti` e import |
| `src/pages/azienda/Settings.tsx` | Aggiungere tab "Operai" con componente Employees |
| `src/pages/azienda/Employees.tsx` | Rinominare titoli: "Gestione Operai", tab "Operai" |

---

## Dettagli tecnici

### Calendar.tsx - Nuovo filtro

```text
const [employeeFilter, setEmployeeFilter] = useState<string>("all");

// Query dipendenti
const { data: employees = [] } = useQuery({
  queryKey: ["employees-filter", effectiveCompany?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", effectiveCompany!.id)
      .eq("is_active", true)
      .order("last_name");
    return data || [];
  },
  enabled: !!effectiveCompany?.id,
});

// Nel filtro scheduledOrders, aggiungere:
if (employeeFilter !== "all") {
  const hasEmployee = order.assigned_employees?.some(
    ae => ae.employee.id === employeeFilter
  );
  if (!hasEmployee) return false;
}

// Select UI
<Select value={employeeFilter} onValueChange={setEmployeeFilter}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Tutti gli operai" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Tutti gli operai</SelectItem>
    {employees.map(emp => (
      <SelectItem key={emp.id} value={emp.id}>
        {emp.last_name} {emp.first_name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Settings.tsx - Nuovo tab

```text
import { HardHat } from "lucide-react";
import Employees from "@/pages/azienda/Employees";

// Nel TabsList (solo admin):
<TabsTrigger value="operai" className="flex items-center gap-2">
  <HardHat className="h-4 w-4" />
  <span className="hidden sm:inline">Operai</span>
</TabsTrigger>

// Nel TabsContent (solo admin):
<TabsContent value="operai" className="mt-6">
  <Employees />
</TabsContent>
```

### CompanyLayout.tsx - Rimozione

Rimuovere dalla riga 52:
```text
{ title: "Dipendenti", url: "/azienda/dipendenti", icon: HardHat, permissionKey: "canViewEmployees", moduleKey: "employees" },
```

E rimuovere l'import `HardHat` se non piu usato.

