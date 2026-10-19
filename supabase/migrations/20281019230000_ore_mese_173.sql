-- Ore contrattuali del mese: 173 per le schede rimaste a 160 (19/10/2026).
-- 160 era il valore iniziale della colonna; nell'edilizia il mese contrattuale è 173 ore
-- (40 ore × 52 settimane / 12). Dal 19/10 i dipendenti nuovi partono già da 173.
-- Le schede con altri valori (168, 0…) restano come sono: sono scelte di chi le ha compilate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.employees set monthly_hours = 173 where monthly_hours = 160;
