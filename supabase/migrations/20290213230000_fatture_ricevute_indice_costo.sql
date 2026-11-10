-- Indice sulle fatture ricevute per il costo a cui sono agganciate (10/11/2026).
--
-- `commessa_iva` (l'IVA della commessa) chiede, per ogni costo della commessa, se ha una fattura
-- ricevuta: `not exists (select 1 from fatture_ricevute where company_cost_id = …)`. Senza indice
-- ogni domanda rilegge tutta la tabella, e col permesso di chi chiede ricontrolla le regole riga
-- per riga. Sulla commessa più grande di un'impresa: 49 costi, 8,5 secondi su 8,7, oltre gli 8
-- che il database concede al browser. La scheda IVA della commessa rispondeva «errore» (9 volte
-- il 10/11, sempre a 8 secondi). Solo le righe agganciate a un costo: 2.102 su 19.172.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists idx_fatture_ricevute_company_cost
  on public.fatture_ricevute (company_cost_id)
  where company_cost_id is not null;
