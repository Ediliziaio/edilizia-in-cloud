

## Spostare "Dashboard" da Cruscotto a Cantieri & Lavori

### Modifica

In `src/lib/sidebarConfig.ts`:

1. **Rimuovere** `{ title: "Dashboard", url: "/azienda", icon: Home, permissionKey: "canViewDashboard" }` dall'array `items` di `area_cruscotto` (riga 95)
2. **Inserirla come primo elemento** nell'array `items` di `area_cantieri` (prima di "Ordini", riga 106)

Risultato:
- `area_cruscotto` avrà solo: Cruscotto Aziendale, Attività
- `area_cantieri` avrà: Dashboard, Ordini, Magazzino, Clienti, ...

