

# Audit Tecnico — Report AS-IS e Piano Interventi

## A) Stato Attuale delle Modifiche Recenti

Le ultime modifiche hanno introdotto: drag-and-drop documenti, filtri clienti, colonna data inserimento, assegnazione venditore inline, e fix P0/P1. L'audit si concentra sulle aree critiche residue.

---

## Bug e Problemi Identificati

### P0 — Nessuno (risolti nell'iterazione precedente)

### P1 — Console Warning: SalespersonSelect forwardRef

Il componente `SalespersonSelect` usato in `CompanyCustomerDetail.tsx` (riga 301) genera un warning React:
> "Function components cannot be given refs"

**Causa**: `SalespersonSelect` non usa `React.forwardRef`, ma viene passato come child in contesti che tentano di assegnare un ref.
**Fix**: wrappare `SalespersonSelect` con `React.forwardRef`.

### P1 — Sicurezza: update/delete profilo senza filtro company_id

In `CompanyCustomerDetail.tsx`:
- **Riga 116**: `update().eq("id", id!)` — manca `.eq("company_id", effectiveCompany.id)` come defense-in-depth
- **Riga 147**: `delete().eq("id", id!)` — stesso problema

In `CustomersList.tsx`:
- **Riga 153**: `assignSalespersonMutation` update senza filtro `company_id`

RLS copre questo lato server, ma il principio defense-in-depth richiede il filtro esplicito (come da memory `data-integrity/input-validation-standard`).

### P1 — Cast `as any` per salesperson_id

`CompanyCustomerDetail.tsx` riga 90: `(customer as any).salesperson_id`. Il campo esiste nel select esplicito (riga 55) ma il tipo auto-generato non lo include ancora. Necessario type assertion locale tipizzata.

### P2 — SalespersonSelect onChange signature mismatch

In `CompanyCustomerDetail.tsx` riga 303: `onChange={(val) => setSalespersonId(val)}` — il componente `SalespersonSelect` si aspetta `(value: string, salesperson: Salesperson | null) => void` ma qui si passa solo il primo argomento. Funziona ma e un tipo incompatibile.

---

## Multi-Tenancy Checklist

| Operazione | Tenant-scoped | Note |
|------------|:---:|------|
| Fetch clienti (CustomersList) | Si | `.eq("company_id", effectiveCompany.id)` |
| Fetch dettaglio (CompanyCustomerDetail) | Parziale | fetch OK, update/delete mancano company_id |
| Assign venditore inline | No | Solo `.eq("id", customerId)` |
| Fetch ordini cliente | Si | `.eq("company_id", effectiveCompany!.id)` |
| Fetch salespeople | Si | `.eq("company_id", effectiveCompany!.id)` |

---

## Piano Interventi

### 1. Fix P1: forwardRef su SalespersonSelect
- Wrappare il componente con `React.forwardRef` per eliminare il warning console

### 2. Fix P1: defense-in-depth company_id
- `CompanyCustomerDetail.tsx`: aggiungere `.eq("company_id", effectiveCompany!.id)` a update (riga 116) e delete (riga 147)
- `CustomersList.tsx`: aggiungere `.eq("company_id", effectiveCompany!.id)` alla mutation assignSalesperson (riga 153-154)

### 3. Fix P1: type safety salesperson_id
- Creare un tipo locale esteso in `CompanyCustomerDetail.tsx` per evitare `as any`

### 4. Fix P2: onChange signature
- Allineare la callback onChange in `CompanyCustomerDetail.tsx` alla firma corretta del componente

### File Modificati

| File | Modifica |
|------|----------|
| `SalespersonSelect.tsx` | `React.forwardRef` |
| `CompanyCustomerDetail.tsx` | company_id su update/delete, tipo locale, onChange fix |
| `CustomersList.tsx` | company_id su assign mutation |

### Risultato Atteso
- Console pulita (zero warning)
- Defense-in-depth completo su tutte le mutazioni
- Type safety senza cast `as any`
- Nessuna regressione funzionale

