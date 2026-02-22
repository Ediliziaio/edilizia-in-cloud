

# Fix Console Warning: MarketingOpportunities forwardRef

## Problema Identificato

**Console Warning**: "Function components cannot be given refs. Check the render method of `App`." puntando a `MarketingOpportunities`.

**Causa**: React Router (o un componente parent nel layout) tenta di passare una ref al componente di pagina `MarketingOpportunities`, che essendo un semplice function component non la accetta.

## Fix

### File: `src/pages/azienda/marketing/MarketingOpportunities.tsx`
- Wrappare il componente con `React.forwardRef` per accettare la ref
- Aggiungere `ref` al `div` root del componente
- Aggiungere `displayName`

## Cosa NON cambia
- Nessuna modifica funzionale
- Nessuna modifica al database
- Nessuna modifica ad altri file
- Solo eliminazione del warning in console
