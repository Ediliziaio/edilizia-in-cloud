

# Piano: Rimuovere "Personale" dalla Sidebar

La sezione Personale e gia accessibile da Impostazioni (tab "Staff/Operai"), quindi la voce nel menu laterale e la rotta dedicata sono ridondanti. Rimuoveremo entrambe.

## Interventi

### 1. `src/components/layouts/CompanyLayout.tsx`
- Rimuovere la riga `{ title: "Personale", url: "/azienda/personale", icon: HardHat, ... }` dall'array `allNavItems`
- Rimuovere l'import di `HardHat` dalla lista icone (se non usato altrove)

### 2. `src/App.tsx`
- Rimuovere la rotta `<Route path="personale" element={<Employees />} />`
- Rimuovere l'import `import Employees from "@/pages/azienda/Employees"` (il componente e gia importato direttamente in `Settings.tsx`)

### Nessun file eliminato
Il file `src/pages/azienda/Employees.tsx` resta, perche viene usato dal tab "Staff" dentro le Impostazioni.

