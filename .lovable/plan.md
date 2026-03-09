

## Piano: Unire la sezione Fornitori operativa dentro Impostazioni/Fornitori

### Situazione attuale
- **`/azienda/fornitori`** (Suppliers.tsx) — Vista operativa con KPI (OdA, debiti, scadenze), lista card, e dettaglio fornitore con tab Anagrafica/OdA/Scadenze/Prima Nota/Statistiche. Nella sidebar sotto "Finanza".
- **`/azienda/impostazioni/fornitori`** (SuppliersConfig.tsx) — CRUD tabellare per gestire l'anagrafica fornitori (crea/modifica/elimina). Nella sidebar sotto "Impostazioni".

### Approccio
Unire le due viste in una sola pagina sotto Impostazioni, con tab di primo livello: **Anagrafica** (l'attuale SuppliersConfig) e **Operativo** (l'attuale vista da Suppliers.tsx). Rimuovere la voce "Fornitori" dalla sidebar Finanza e la route standalone.

### Modifiche

**1. `src/pages/azienda/settings/SettingsSuppliers.tsx`**
- Aggiungere un sistema Tabs di primo livello: "Anagrafica" (SuppliersConfig) e "Operativo" (contenuto da Suppliers.tsx).
- Importare le componenti operative (SuppliersList e SupplierDetail) da Suppliers.tsx, oppure importare direttamente il componente Suppliers con una prop `embedded`.

**2. `src/pages/azienda/Suppliers.tsx`**
- Esportare separatamente `SuppliersList` e `SupplierDetail` come named exports per il riutilizzo.
- Aggiungere prop `embedded?: boolean` per nascondere l'header standalone e adattare la navigazione (usare `/azienda/impostazioni/fornitori` invece di `/azienda/fornitori`).
- Gestire la navigazione al dettaglio internamente con stato locale (senza cambiare URL), oppure con query params, per rimanere dentro la pagina impostazioni.

**3. `src/lib/sidebarConfig.ts`**
- Rimuovere la riga `{ title: "Fornitori", url: "/azienda/fornitori", ... }` dalla sezione `gi_finanza`.

**4. `src/App.tsx`**
- Rimuovere le route `/azienda/fornitori` e `/azienda/fornitori/:id`.
- Rimuovere il lazy import di `Suppliers`.

### Integrazioni preservate
- **SupplierSelect** (usato in ordini acquisto): legge dalla tabella `suppliers` direttamente via query, non dipende dalla route. ✅ Nessun impatto.
- **useOperationalSuppliers** hook: usato internamente dal componente operativo, continua a funzionare identicamente. ✅
- **useSupplierDetail** hook: stesso discorso. ✅
- **Costi/Scadenze/Prima Nota**: riferiscono `supplier_id` a livello di DB, nessun legame con la route. ✅
- **Ordini Acquisto**: il `SupplierSelect` e i link ai fornitori negli OdA dovranno puntare alla nuova location se presenti (verificherò eventuali link diretti a `/azienda/fornitori/:id`).

### Gestione dettaglio fornitore
Il dettaglio fornitore (con OdA, Scadenze, Prima Nota, Statistiche) sarà gestito tramite **stato interno** nella pagina Impostazioni: quando si clicca su un fornitore nella vista operativa, si mostra il dettaglio inline senza cambiare route. Questo evita conflitti con il routing `/impostazioni/fornitori`.

