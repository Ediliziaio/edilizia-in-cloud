

# Rimuovere Quick Actions dal Cruscotto Aziendale

## Intervento

Rimuovere i tre bottoni "Nuovo Ordine", "Nuovo Lead", "Registra Costo" dalla parte superiore del Cruscotto.

## File da modificare

**`src/pages/azienda/CruscottoAziendale.tsx`**
- Rimuovere import di `QuickActions`
- Rimuovere il componente `<QuickActions />` dal JSX (riga 56)
- Semplificare il wrapper header da flex-row a semplice div

Il file `src/components/cruscotto/QuickActions.tsx` viene mantenuto nel codebase nel caso servisse in futuro altrove.

