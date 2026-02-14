

# Refactoring CompanyDetail.tsx + Rimozione sezione Ordini Super Admin

## Parte 1: Rimozione pagina "Ordini Globali" dal Super Admin

La voce "Ordini" nella sidebar admin e la pagina `GlobalOrders` verranno completamente rimosse.

**File coinvolti:**
- `src/components/layouts/AdminLayout.tsx` -- rimuovere la voce `{ title: "Ordini", url: "/admin/ordini", icon: ClipboardList }` dall'array `navItems` e l'import `ClipboardList`
- `src/App.tsx` -- rimuovere la route `<Route path="ordini" element={<GlobalOrders />} />` e l'import di `GlobalOrders`
- `src/pages/admin/GlobalOrders.tsx` -- eliminare il file

---

## Parte 2: Spezzare CompanyDetail.tsx in componenti modulari

Il file da 1907 righe verra suddiviso in **7 file** mantenendo lo stesso comportamento funzionale.

### Struttura file risultante

```text
src/pages/admin/CompanyDetail.tsx          (~200 righe) -- orchestratore con state, queries, mutations
src/components/admin/company/              -- nuova cartella
  CompanyDetailHeader.tsx                  (~50 righe)  -- header con logo, nome, badge stato, pulsante impersona
  CompanyDetailsTab.tsx                    (~250 righe) -- tab "Dettagli di base" (form + sidebar panoramica)
  CompanyTeamTab.tsx                       (~350 righe) -- tab "Team" (admin, staff, venditori, dipendenti)
  CompanySaaSTab.tsx                       (~150 righe) -- tab "SaaS" (limiti risorse + moduli + confronto piani)
  CompanySubscriptionTab.tsx               (~250 righe) -- tab "Abbonamento" (stato, fatturazione, storico)
  CompanyActivityTab.tsx                   (~200 righe) -- tab "Attivita" (KPI, ultimi ordini/ticket, azioni rapide)
```

### Come funziona

`CompanyDetail.tsx` resta il componente padre che:
- Gestisce tutto lo **state** (company, stats, form, dialogs)
- Contiene tutte le **queries** (useQuery per team, plan, logs, ecc.)
- Contiene tutte le **mutations** (updateStatus, changePlan, extendTrial, ecc.)
- Passa props ai sotto-componenti di ogni tab

Ogni componente tab riceve solo le props di cui ha bisogno e si occupa esclusivamente del rendering.

### Costanti condivise

Le costanti `ALL_MODULES`, `PERMISSION_LABELS`, `eventTypeLabels`, `eventTypeIcons`, `commissionTypeLabels`, `ticketStatusLabels` verranno spostate in un file dedicato `src/lib/adminConstants.ts` e importate dove servono.

### Dialoghi

I dialoghi (ChangePlan, StaffUser, Permissions, Salesperson, Employee, Password) restano in `CompanyDetail.tsx` perche dipendono dallo state centralizzato. Vengono renderizzati dopo i tab come oggi.

---

## Riepilogo modifiche

| Azione | File |
|--------|------|
| Eliminare | `src/pages/admin/GlobalOrders.tsx` |
| Creare | `src/lib/adminConstants.ts` |
| Creare | `src/components/admin/company/CompanyDetailHeader.tsx` |
| Creare | `src/components/admin/company/CompanyDetailsTab.tsx` |
| Creare | `src/components/admin/company/CompanyTeamTab.tsx` |
| Creare | `src/components/admin/company/CompanySaaSTab.tsx` |
| Creare | `src/components/admin/company/CompanySubscriptionTab.tsx` |
| Creare | `src/components/admin/company/CompanyActivityTab.tsx` |
| Modificare | `src/pages/admin/CompanyDetail.tsx` (da 1907 a ~200 righe) |
| Modificare | `src/components/layouts/AdminLayout.tsx` (rimuovere voce Ordini) |
| Modificare | `src/App.tsx` (rimuovere route e import GlobalOrders) |

Nessun cambiamento funzionale: stessa UI, stessi dati, stesse azioni. Solo riorganizzazione del codice e rimozione della sezione ordini.

