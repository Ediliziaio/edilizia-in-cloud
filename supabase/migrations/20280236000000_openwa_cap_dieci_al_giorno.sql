-- Cap allineati all'obiettivo: 10 messaggi a freddo al giorno per numero.
--
-- I default erano daily_cap=8 e weekly_cap=40. Con 10 al giorno il tetto
-- settimanale si esauriva in QUATTRO giorni e il numero restava fermo per il
-- resto della settimana: la media reale scendeva a ~5,7/giorno, cioe' quasi
-- la meta' dell'obiettivo, senza che niente lo segnalasse.
--
-- Nuovi default: 10/giorno e 60/settimana. 60 = 10 × 6 giorni, cosi' il tetto
-- settimanale fa da rete di sicurezza (copre un giorno di stop) invece di
-- essere il vero collo di bottiglia. Chi vuole spingere meno abbassa il
-- daily_cap sul singolo numero: e' li' che si governa il ritmo.
--
-- Il warm-up resta com'e' (base 3, +2/giorno): un numero nuovo parte da 3 e
-- arriva a 10 in quattro giorni. E' la difesa piu' importante contro il ban —
-- un numero appena collegato che spara 10 messaggi a sconosciuti e' il
-- profilo che WhatsApp riconosce meglio.
ALTER TABLE public.openwa_numbers
  ALTER COLUMN daily_cap SET DEFAULT 10,
  ALTER COLUMN weekly_cap SET DEFAULT 60;

-- Allinea i numeri gia' configurati che sono rimasti sui vecchi default,
-- senza toccare quelli tarati a mano.
UPDATE public.openwa_numbers SET daily_cap = 10 WHERE daily_cap = 8;
UPDATE public.openwa_numbers SET weekly_cap = 60 WHERE weekly_cap = 40;

COMMENT ON COLUMN public.openwa_numbers.daily_cap IS
  'Tetto giornaliero di invii per questo numero (default 10). E'' QUI che si governa il ritmo della campagna: il dispatcher non ha un limite proprio.';
COMMENT ON COLUMN public.openwa_numbers.weekly_cap IS
  'Tetto settimanale (default 60 = 10 x 6 giorni). Rete di sicurezza, non collo di bottiglia: se scende sotto daily_cap x 6 diventa lui a fermare gli invii.';
