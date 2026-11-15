-- Incassi della commessa: il SAL vale il netto del suo certificato (15/11/2026).
--
-- Il riquadro «SAL al cliente» degli Incassi (private.office_quadro_pagamenti_raw) dava a ogni SAL la differenza
-- dei cumulativi: lavori di questo SAL meno quelli del SAL prima. Col certificato di pagamento quello che si
-- incassa è un'altra cifra: tolti ritenuta, recupero dell'acconto e altre detrazioni (salCertificato.ts).
-- Esempio: lavori 28.000 €, acconto recuperato 5.600 €, ritenuta 1.400 € → si incassano 21.000 € + IVA, non
-- 28.000 € + IVA. Ora, se il SAL ha il certificato, vale il suo netto; senza, la differenza di sempre.
-- La funzione si modifica sul suo testo attuale (è lunga e cambiata da più sessioni): se il testo atteso non
-- c'è, la migrazione si ferma invece di indovinare.

set local lock_timeout = '3s';

do $quadro$
declare def text; nuova text;
begin
 def := pg_get_functiondef('private.office_quadro_pagamenti_raw(uuid)'::regprocedure);
 if def ~ 'sal_certificati sc' then return; end if;
 nuova := replace(def,
   'round(s.importo_totale - coalesce(p.precedente, 0), 2) AS importo_sal,',
   'round(coalesce(sc.netto, s.importo_totale - coalesce(p.precedente, 0)), 2) AS importo_sal,');
 nuova := replace(nuova,
   'round((s.importo_totale - coalesce(p.precedente, 0)) * (1 + o.iva / 100), 2) AS importo_sal_ivato,',
   'round(coalesce(sc.netto, s.importo_totale - coalesce(p.precedente, 0)) * (1 + o.iva / 100), 2) AS importo_sal_ivato,');
 nuova := replace(nuova,
   'LEFT JOIN public.order_installments r ON r.id = s.installment_id',
   'LEFT JOIN public.order_installments r ON r.id = s.installment_id
    LEFT JOIN public.sal_certificati sc ON sc.sal_id = s.id');
 if (select count(*) from regexp_matches(nuova, 'coalesce\(sc\.netto', 'g')) <> 2 or nuova !~ 'sal_certificati sc ON' then
  raise exception 'office_quadro_pagamenti_raw: testo cambiato, controllare a mano';
 end if;
 execute nuova;
end $quadro$;
