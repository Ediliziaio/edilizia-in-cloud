

## Piano: Fix area Marketing & Vendita + Accordion behavior

### Problema 1 — Items mancanti in "Marketing & Vendita"
Contatti CRM, Opportunità e Preventivi CRM sono attualmente in "Persone" ma l'utente li vuole in "Marketing & Vendita", subito dopo Dashboard.

**Fix in `src/lib/sidebarConfig.ts`:**
- Spostare questi 3 item da `area_persone` a `area_marketing`, inserendoli subito dopo "Dashboard"
- Ordine finale area_marketing: Dashboard, Contatti CRM, Opportunità, Preventivi CRM, Email Marketing, WhatsApp, Attività CRM, Calendario CRM, Sales OS, Reportistica

### Problema 2 — Accordion esclusivo (una sola area aperta alla volta)
Attualmente ogni `MacroAreaCollapsible` gestisce il proprio stato indipendentemente. L'utente vuole che aprendo un'area le altre si chiudano.

**Fix in `src/components/layouts/CompanyLayout.tsx`:**
- Aggiungere uno stato `openAreaId: string | null` nel componente parent che gestisce quale area è aperta
- Passare `open` e `onOpenChange` a `MacroAreaCollapsible` dall'esterno
- Quando l'utente apre un'area, chiudere tutte le altre (tranne auto-expand per route attiva)
- Persistere l'area aperta in localStorage con una singola chiave

### File modificati
| File | Modifica |
|------|----------|
| `src/lib/sidebarConfig.ts` | Spostare 3 item da area_persone a area_marketing |
| `src/components/layouts/CompanyLayout.tsx` | Accordion esclusivo con stato centralizzato |

