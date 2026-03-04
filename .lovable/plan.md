

# Audit Batch: Ordini, Attività, Dipendenti, Magazzino

Rimangono circa 50 file con `useToast` da migrare a `sonner`. Propongo di procedere per batch funzionali. Questo batch copre le aree con logica di business critica.

---

## File da modificare (16 file)

### Ordini (6 file)
| File | Intervento |
|------|-----------|
| `OrderErrors.tsx` | sonner + maxLength su description/amount |
| `OrderCommissions.tsx` | sonner |
| `OrderLaborCosts.tsx` | sonner |
| `OrderDetail.tsx` | sonner |
| `CreateOrder.tsx` | sonner |
| `EditOrder.tsx` | sonner |

### Attività (2 file)
| File | Intervento |
|------|-----------|
| `TaskDialog.tsx` | sonner (`toast` da `@/hooks/use-toast`) + company_id su update/delete + maxLength su title/notes |
| `Tasks.tsx` (page) | sonner (se usa useToast) |

### Dipendenti (5 file)
| File | Intervento |
|------|-----------|
| `AssignEmployeeDialog.tsx` | sonner |
| `EmployeeAttachments.tsx` | sonner |
| `ExternalTeamAttachments.tsx` | sonner |
| `WorkLogsAdminTab.tsx` | sonner |
| `Employees.tsx` (page) | sonner |

### Magazzino (2 file)
| File | Intervento |
|------|-----------|
| `WarehouseStockTab.tsx` | sonner |
| `useWarehouseData.ts` | sonner |

---

## Dettagli sicurezza

### TaskDialog: update/delete senza `company_id`
- Riga 248: `.eq("id", task.id)` senza company_id
- Riga 271: `.eq("id", task.id)` senza company_id
- **Fix**: Aggiungere `.eq("company_id", companyId!)` a entrambe

### TaskDialog: manca `maxLength`
- Title input (riga 296): nessun limite → `maxLength={200}`
- Notes textarea (riga 301): nessun limite → `maxLength={1000}`

### OrderErrors: manca `maxLength`
- Description textarea (riga 318-323): nessun limite → `maxLength={500}`

---

## Pattern migrazione sonner

Ogni file segue lo stesso pattern:
```
// PRIMA
import { useToast } from "@/hooks/use-toast";
const { toast } = useToast();
toast({ title: "Successo", description: "..." });
toast({ title: "Errore", description: "...", variant: "destructive" });

// DOPO
import { toast } from "sonner";
toast.success("Successo", { description: "..." });
toast.error("Errore", { description: "..." });
```

