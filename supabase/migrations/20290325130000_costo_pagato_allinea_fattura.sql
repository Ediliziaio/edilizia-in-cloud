-- 20290325130000_costo_pagato_allinea_fattura.sql
--
-- Pagando un costo dalla commessa (Cantiere → Pagamenti, Economia → Costi, «Segna pagati»), il
-- costo diventava pagato ma la sua fattura ricevuta restava «Non saldata» nell'elenco delle
-- ricevute, che legge fatture_ricevute.pagata_il. Nell'altro verso andava già bene:
-- segna_fattura_ricevuta_pagata paga anche il costo. Trovato il 15/11/2026 provando il flusso
-- completo su URBAN VISION (Cherubini), in una transazione annullata.
--
-- costo_allinea_rate_fornitori (trigger AFTER UPDATE OF is_paid su company_costs) allineava
-- già le rate: ora allinea anche la fattura. Solo pagata_il e chi l'ha segnata: la guardia
-- fatture_ricevute_solo_fatturazione lascia passare chi non ha il permesso «Fatturazione»,
-- perché i dati fiscali non cambiano. Nessun ciclo: segna_fattura_ricevuta_pagata scrive prima
-- la fattura, e qui si tocca solo se la data manca (o c'è ancora, per lo storno).

create or replace function public.costo_allinea_rate_fornitori()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if current_setting('rate_fornitori.da_rata', true) = 'on' then
    return null;
  end if;
  if new.is_paid is not distinct from old.is_paid then
    return null;
  end if;

  if coalesce(new.is_paid, false) then
    update public.rate_fornitori
       set stato = 'pagata', pagata_il = coalesce(new.paid_date, pagata_il)
     where company_cost_id = new.id and stato not in ('pagata', 'stornata');
    update public.fatture_ricevute
       set pagata_il = coalesce(new.paid_date, (now() at time zone 'Europe/Rome')::date),
           pagamento_segnato_da = coalesce(pagamento_segnato_da, auth.uid()),
           pagamento_segnato_at = coalesce(pagamento_segnato_at, now())
     where company_cost_id = new.id and company_id = new.company_id and pagata_il is null;
  else
    update public.rate_fornitori
       set stato = 'da_pagare', pagata_il = null
     where company_cost_id = new.id and stato = 'pagata';
    update public.fatture_ricevute
       set pagata_il = null
     where company_cost_id = new.id and company_id = new.company_id and pagata_il is not null;
  end if;
  return null;
end
$function$;
