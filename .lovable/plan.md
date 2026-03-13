

## Analisi Bug: Sidebar apre area sbagliata per Automazioni

### Problema identificato
Quando navighi a `/azienda/marketing/automazioni` (che è in **area_automazioni**), la sidebar apre **area_marketing** invece. 

**Causa root**: `findActiveAreaId` itera le macro-aree in ordine e restituisce la **prima** corrispondenza. L'item "Dashboard" in `area_marketing` ha URL `/azienda/marketing`, e poiché `/azienda/marketing/automazioni`.startsWith(`/azienda/marketing/`) è `true`, matcha `area_marketing` prima di arrivare a `area_automazioni`.

Lo stesso bug colpisce anche "Agenti AI" (`/azienda/marketing/agente-ai`) e "Agenti AI Interni" (`/azienda/agente-interno`).

### Fix

**File: `src/components/layouts/CompanyLayout.tsx`** — Modificare `findActiveAreaId` per trovare il match **più specifico** (URL più lungo) invece del primo match:

```typescript
const findActiveAreaId = useCallback((path: string): string | null => {
  let bestAreaId: string | null = null;
  let bestUrlLength = 0;
  for (const area of macroAreas) {
    if (area.id === "area_cruscotto") continue;
    for (const item of area.items) {
      if (path === item.url || path.startsWith(item.url + "/")) {
        if (item.url.length > bestUrlLength) {
          bestUrlLength = item.url.length;
          bestAreaId = area.id;
        }
      }
    }
  }
  return bestAreaId;
}, []);
```

Questo assicura che `/azienda/marketing/automazioni` matchi l'item con URL più lungo (`/azienda/marketing/automazioni` in `area_automazioni`) anziché il generico `/azienda/marketing` in `area_marketing`.

### File modificati
| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Fix `findActiveAreaId` per match più specifico |

