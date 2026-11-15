-- 20290325150000_costo_azzerato_non_paga_fattura.sql
--
-- 20290325130000 segna pagata la fattura ricevuta quando il suo costo diventa pagato. Ma un
-- costo azzerato da una nota di credito risulta «pagato» senza data né pagamento (2D S.r.l,
-- 15/11/2026: tre coppie fattura + nota): la fattura sarebbe diventata «Pagata il <oggi>», che
-- è falso. Si segna pagata solo se il costo ha un importo da pagare.

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
    if coalesce(new.amount, 0) > 0 then
      update public.fatture_ricevute
         set pagata_il = coalesce(new.paid_date, (now() at time zone 'Europe/Rome')::date),
             pagamento_segnato_da = coalesce(pagamento_segnato_da, auth.uid()),
             pagamento_segnato_at = coalesce(pagamento_segnato_at, now())
       where company_cost_id = new.id and company_id = new.company_id and pagata_il is null;
    end if;
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
