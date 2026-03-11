

# Piano: Rimuovere il grafico "Trend ultimi 7 giorni"

**File:** `src/components/cruscotto/TodayFocus.tsx`

Rimuovere:
1. L'import di `Area, AreaChart, ResponsiveContainer, Tooltip` da recharts (riga 11)
2. L'import di `useQuery` da tanstack (riga 8) e `supabase` (riga 9) e `useAuth` (riga 10) — solo se non usati altrove nel file. `useAuth` è usato alla riga 120, `supabase`/`useQuery` solo nel hook `useDailyTrend`.
3. L'intera funzione `useDailyTrend` (righe 58-104)
4. L'oggetto `sparkTooltipStyle` (righe 106-116)
5. La riga `const { data: dailyTrend } = useDailyTrend(companyId);` (riga 124) e le variabili `companyId` correlate
6. Il blocco JSX del grafico sparkline (righe 253-312)

Dopo la rimozione, gli import inutilizzati (`useQuery`, `supabase`, recharts) verranno rimossi. `useAuth` e `effectiveCompany` restano perché non servono più (il `companyId` era usato solo per `useDailyTrend`), quindi verranno rimossi anche quelli.

