
# Piano: Miglioramento Visivo Dashboard e Pulizia Codice

## 1. Analisi Attuale

La dashboard funziona correttamente ma ha alcune aree di miglioramento visivo e codice obsoleto da rimuovere.

### Problemi Identificati

| Tipo | Problema | File |
|------|----------|------|
| Codice inutile | `useMemo` importato ma mai usato | `CompanyDashboard.tsx` |
| Codice ridondante | `company = effectiveCompany` + `companyId = company?.id` | `CompanyDashboard.tsx` |
| Layout non bilanciato | Grid 2 colonne + 3 colonne creano sezioni asimmetriche | `CompanyDashboard.tsx` |
| Stat Cards | Manca sfondo colorato per le icone (presente in AdminDashboard) | `CompanyDashboard.tsx` |
| AdminDashboard | Usa pattern `useEffect`/`useState` obsoleto | `AdminDashboard.tsx` |

---

## 2. Miglioramenti Visivi Proposti

### 2.1 Stat Cards con Icone Colorate

Attualmente le stat cards hanno solo icone colorate. Aggiungeremo un background colorato come in AdminDashboard per maggiore impatto visivo:

**Prima:**
```
[Ordini Totali]     [Clienti]           [Ticket]           [Saldi]
      12                 8                  2              € 15.000
```

**Dopo:**
```
+------------------+  +------------------+  +------------------+  +------------------+
| Ordini Totali [bg]| | Clienti      [bg] | | Ticket      [bg] | | Saldi       [bg] |
| 12                | | 8                 | | 2                | | € 15.000        |
| +5% vs mese scorso| | 3 nuovi oggi      | | In attesa        | | da 5 ordini     |
+------------------+  +------------------+  +------------------+  +------------------+
```

### 2.2 Layout Grid Riorganizzato

Attuale struttura (confusa):
- Riga 1: 4 stat cards
- Riga 2: 2 colonne (Ordini Recenti, Cash Flow) + 1 colonna (Labor Costs)
- Riga 3: 3 colonne (Alert, Azioni Rapide, vuoto)

Nuova struttura (bilanciata):
- Riga 1: 4 stat cards (invariato)
- Riga 2: 3 colonne uguali (Ordini Recenti, Cash Flow, Costi Manodopera)
- Riga 3: 2 colonne (Alert Magazzino, Azioni Rapide)

### 2.3 Ordini Recenti con Link Cliccabili

Rendere ogni ordine cliccabile per andare direttamente al dettaglio, con hover effect.

### 2.4 Cash Flow Migliorato

Aggiungere indicatori di trend (freccia su/giu) e barra di progresso visiva.

---

## 3. Pulizia Codice

### 3.1 File `CompanyDashboard.tsx`

| Linea | Prima | Dopo |
|-------|-------|------|
| 1 | `import { useMemo } from "react"` | Rimuovere import inutilizzato |
| 37-39 | `company = effectiveCompany; companyId = company?.id` | `companyId = effectiveCompany?.id` |

### 3.2 File `AdminDashboard.tsx`

- Migrare da `useEffect` + `useState` a `useQuery` (coerente con CompanyDashboard)
- Aggiungere `staleTime: 5 * 60 * 1000`

---

## 4. Modifiche Dettagliate

### 4.1 Stat Cards Migliorate

```typescript
const statCards = [
  {
    title: "Ordini Totali",
    value: stats.totalOrders,
    icon: ClipboardList,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "Gestiti quest'anno",
  },
  {
    title: "Clienti",
    value: stats.totalCustomers,
    icon: Users,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Registrati in piattaforma",
  },
  {
    title: "Ticket Aperti",
    value: stats.openTickets,
    icon: HeadphonesIcon,
    color: stats.openTickets > 0 ? "text-orange-600" : "text-green-600",
    bgColor: stats.openTickets > 0 ? "bg-orange-100" : "bg-green-100",
    description: stats.openTickets > 0 ? "In attesa di risposta" : "Tutto risolto!",
  },
  {
    title: "Saldi da Incassare",
    value: formatCurrency(stats.pendingRevenue),
    icon: Euro,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    description: `Da ${pendingOrdersCount} ordini`,
  },
];
```

### 4.2 Rendering Card con Background Icona

```tsx
<Card key={stat.title} className="relative overflow-hidden">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">
      {stat.title}
    </CardTitle>
    <div className={`p-2 rounded-lg ${stat.bgColor}`}>
      <stat.icon className={`h-4 w-4 ${stat.color}`} />
    </div>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{stat.value}</div>
    <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
  </CardContent>
</Card>
```

### 4.3 Grid Layout Bilanciato

```tsx
{/* Riga principale: 3 colonne uguali */}
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  {/* Ordini Recenti */}
  <Card>...</Card>
  
  {/* Cash Flow Preview */}
  <Card>...</Card>
  
  {/* Labor Costs Stats */}
  <LaborCostsStats />
</div>

{/* Riga secondaria: 2 colonne */}
<div className="grid gap-6 md:grid-cols-2">
  {/* Alert Magazzino */}
  <Card>...</Card>
  
  {/* Azioni Rapide */}
  <Card>...</Card>
</div>
```

### 4.4 Ordini Recenti Cliccabili

```tsx
{recentOrders.map((order) => (
  <Link
    key={order.id}
    to={`/azienda/ordini/${order.id}`}
    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
  >
    ...
  </Link>
))}
```

---

## 5. File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/CompanyDashboard.tsx` | Rimozione import inutilizzato, semplificazione variabili, miglioramenti visivi |
| `src/pages/admin/AdminDashboard.tsx` | Migrazione a useQuery con staleTime |

---

## 6. Benefici

| Miglioramento | Impatto |
|---------------|---------|
| Icone con background | Design piu moderno e coerente con AdminDashboard |
| Layout bilanciato | Migliore utilizzo dello spazio, nessuna colonna vuota |
| Ordini cliccabili | UX migliorata, accesso rapido ai dettagli |
| Codice pulito | Meno codice ridondante, import corretti |
| AdminDashboard con useQuery | Performance migliorate, caching abilitato |

---

## Sezione Tecnica

### Import Finale CompanyDashboard

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardList, 
  Users, 
  HeadphonesIcon, 
  Plus, 
  Loader2, 
  Euro, 
  Package, 
  TrendingUp, 
  AlertTriangle 
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import { LaborCostsStats } from "@/components/dashboard/LaborCostsStats";
```

### Variabili Semplificate

```typescript
export default function CompanyDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  // Rimosso: const company = effectiveCompany;
```
