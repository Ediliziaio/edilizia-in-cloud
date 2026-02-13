
# Rimozione "Dipendenti" dalla Sidebar

## Cosa viene rimosso

La voce "Dipendenti" e ancora presente in due punti:

1. **Sidebar** (`src/components/layouts/CompanyLayout.tsx`, riga 53) - voce nel menu di navigazione
2. **Route** (`src/App.tsx`, riga 129) - rotta `/azienda/dipendenti`
3. **Import** (`src/App.tsx`, riga 47) - import del componente `Employees` (usato solo per quella rotta, dato che in Settings viene importato separatamente)

La gestione operai resta accessibile da **Impostazioni > Operai**.

## Modifiche

### 1. `src/components/layouts/CompanyLayout.tsx`
- Rimuovere la riga con `{ title: "Dipendenti", url: "/azienda/dipendenti", ... }` dall'array `allNavItems`
- Rimuovere l'import `HardHat` se non usato altrove (verificato: non e usato altrove nel file)

### 2. `src/App.tsx`
- Rimuovere la riga `<Route path="dipendenti" element={<Employees />} />`
- Rimuovere l'import `import Employees from "@/pages/azienda/Employees"` (riga 47)

### 3. Verifica `usePermissions.ts`
- Il permesso `canViewEmployees` resta nel sistema perche controlla anche il tab "Operai" nelle impostazioni, quindi non va rimosso

Nessuna modifica al database necessaria.
