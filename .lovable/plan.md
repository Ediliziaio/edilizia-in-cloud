

# Fix: Navigazione "Indietro" nel Builder Automazioni SuperAdmin

## Problema
`AutomationBuilder.tsx` ha **7 navigate() hardcoded** a `/azienda/marketing/automazioni`. Quando il SuperAdmin apre il builder da `/admin/marketing/automazioni/:id` e torna indietro, finisce nell'area azienda.

## Soluzione
Importare `useMarketingRoutePrefix` e sostituire tutti i path hardcoded con il prefisso dinamico.

## Modifiche

### `src/components/marketing/automations/AutomationBuilder.tsx`
1. Aggiungere `import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix"`
2. Nel componente: `const prefix = useMarketingRoutePrefix()`
3. Sostituire tutte le 7 occorrenze:
   - `navigate("/azienda/marketing/automazioni")` → `navigate(\`${prefix}/automazioni\`)`
   - `navigate(\`/azienda/marketing/automazioni/${data.id}\`, { replace: true })` → `navigate(\`${prefix}/automazioni/${data.id}\`, { replace: true })`

Nessun altro file da modificare.

