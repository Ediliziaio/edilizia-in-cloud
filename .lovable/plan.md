
# Piano: Rimozione Report IVA

## Panoramica

Rimuovere la pagina Report IVA e tutto il codice correlato, mantenendo invece il calcolo IVA per singolo ordine che già esiste in `OrderEconomics.tsx`.

---

## File da Eliminare

| File | Motivo |
|------|--------|
| `src/pages/azienda/VatReport.tsx` | Pagina del report IVA mensile non più necessaria |

---

## File da Modificare

### 1. `src/App.tsx`

Rimuovere:
- Import di `VatReport` (riga 42)
- Route `/azienda/report-iva` (riga 113)

### 2. `src/components/layouts/CompanyLayout.tsx`

Rimuovere:
- Import dell'icona `Receipt` (riga 16)
- Voce menu "Report IVA" dall'array `navItems` (riga 44)

---

## Cosa Rimane Attivo

Il calcolo IVA per singolo ordine continua a funzionare in `OrderEconomics.tsx`:
- Scorporo IVA su articoli acquistati
- Scorporo IVA su squadre esterne
- Riepilogo IVA (debito/credito/saldo) nel Conto Economico dell'ordine

Il file `vatUtils.ts` viene mantenuto perche usato da:
- `OrderEconomics.tsx`
- `OrderItemsList.tsx`
- `AssignExternalTeamDialog.tsx`

---

## Sezione Tecnica

### Modifica App.tsx

```diff
- import VatReport from "@/pages/azienda/VatReport";

  // Dentro le routes
- <Route path="report-iva" element={<VatReport />} />
```

### Modifica CompanyLayout.tsx

```diff
  import { 
    LayoutDashboard, 
    ClipboardList, 
-   Receipt,
    // ...altre icone
  } from "lucide-react";

  const navItems = [
    { title: "Dashboard", url: "/azienda", icon: LayoutDashboard },
    // ...
    { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp },
-   { title: "Report IVA", url: "/azienda/report-iva", icon: Receipt },
    { title: "Impostazioni", url: "/azienda/impostazioni", icon: Settings },
  ];
```

---

## Riepilogo Modifiche

| Operazione | File |
|------------|------|
| Eliminare | `src/pages/azienda/VatReport.tsx` |
| Modificare | `src/App.tsx` (rimuovere import e route) |
| Modificare | `src/components/layouts/CompanyLayout.tsx` (rimuovere voce menu e icona) |
