
# Piano: Audit Completo e Stabilizzazione Progetto

## 1. ANALISI COMPLETATA

Dopo un'analisi approfondita del codebase (file, routing, componenti, database, console, rendering live), il progetto risulta complessivamente solido e ben strutturato. Di seguito le aree di intervento identificate.

---

## 2. PROBLEMI TROVATI E FIX PROPOSTI

### 2.1 Rotta mancante: Pagina Dipendenti/Personale
**Gravita: ALTA** - La pagina `src/pages/azienda/Employees.tsx` esiste ed e completamente implementata (377 righe), ma:
- Non ha una rotta in `App.tsx`
- Non ha una voce nel menu di navigazione in `CompanyLayout.tsx`

Nonostante il permesso `canViewEmployees` esista nel sistema, la pagina non e raggiungibile. Questo significa che la gestione dipendenti e squadre esterne e inaccessibile.

**Fix:**
- Aggiungere import e rotta `/azienda/personale` in `App.tsx`
- Aggiungere voce "Personale" nella navigazione di `CompanyLayout.tsx` con icona `HardHat`, permesso `canViewEmployees` e modulo `employees`

### 2.2 TODO tecnici nei hooks di dati
**Gravita: BASSA** - Due commenti TODO nei file:
- `src/hooks/useCashFlowData.ts` riga 50: `.limit(1000)` con nota "TODO filtro data rolling 3 anni"
- `src/hooks/useMarginData.ts` riga 61: `.limit(500)` con nota "TODO filtro data rolling 24 mesi"

I limiti attuali sono funzionali ma potrebbero causare dati incompleti per aziende con molti ordini. Per ora si documentano, non sono bloccanti.

### 2.3 Codice legacy nell'OrderItemsList
**Gravita: TRASCURABILE** - I campi `unit_price`, `discount_percent`, `standard_cost` nell'interfaccia `OrderItem` sono marcati come "Legacy fields kept for backwards compat" e vengono azzerati a ogni salvataggio. Non rompono nulla ma aggiungono complessita inutile. Si possono lasciare per ora per compatibilita con eventuali ordini storici.

---

## 3. VERIFICHE UX COMPLETATE

### Pagina Dettaglio Ordine (verificata live)
- Caricamento corretto e fluido
- Sezione "Articoli dell'Ordine" sempre visibile con pulsante "Aggiungi"
- Sezione "Errori / Perdite" con pulsante "Aggiungi" funzionante
- Dialog creazione errore: tutti i campi compilabili (Tipo, Categoria, Importo, Descrizione, Data)
- Validazione corretta (campi obbligatori segnalati)
- Loading states presenti su tutti i pulsanti di salvataggio
- Nessun vicolo cieco o schermata vuota
- Feedback toast su azioni CRUD

### Console browser
- Nessun errore applicativo
- Solo warning di sistema Lovable (postMessage cross-origin) - irrilevanti

### Architettura generale verificata
- ErrorBoundary correttamente avvolge tutte le sezioni critiche
- Pattern "Alert + Retry" coerente in tutte le pagine admin
- AuthContext robusto con gestione sessione e impersonazione
- Permessi granulari funzionanti per company_staff
- QueryClient configurato con retry, staleTime e error handling globale

---

## 4. ELENCO INTERVENTI

### File da modificare

| File | Intervento |
|------|-----------|
| `src/App.tsx` | Aggiungere import `Employees` e rotta `/azienda/personale` |
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere voce "Personale" nel menu con icona `HardHat` e permesso `canViewEmployees` |

### Nessun file da rimuovere
Il codebase non contiene componenti orfani o file morti significativi. Tutti i componenti, hooks e utility sono referenziati e utilizzati.

### Nessun bug runtime trovato
Console pulita, nessun errore o warning applicativo.

---

## 5. DETTAGLI TECNICI

### Modifica `App.tsx`
```typescript
// Aggiungere import
import Employees from "@/pages/azienda/Employees";

// Aggiungere rotta nel blocco Company Admin Routes
<Route path="personale" element={<Employees />} />
```

### Modifica `CompanyLayout.tsx`
```typescript
// Aggiungere import icona (gia presente HardHat? No, aggiungere)
import { HardHat } from "lucide-react";

// Aggiungere nel array allNavItems, dopo "Clienti"
{ title: "Personale", url: "/azienda/personale", icon: HardHat, permissionKey: "canViewEmployees", moduleKey: "employees" },
```

### Verifica `useSubscriptionLimits`
Controllare che il modulo `employees` sia supportato nel hook, altrimenti usare un moduleKey esistente o rimuovere il vincolo modulo.

---

## 6. RIEPILOGO FINALE

- **Codice rimosso**: Nessuno (codebase gia pulito)
- **Bug corretti**: 1 (rotta mancante Dipendenti)
- **Miglioramenti UX**: 1 (menu navigazione completo con accesso a Personale)
- **Test console**: Pulita, nessun errore applicativo
- **Stato**: PRONTO PER IMPLEMENTAZIONE dopo approvazione
