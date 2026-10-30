-- Fatture ricevute: «l'ho pagata» con un clic.
--
-- Una fattura del fornitore aveva solo letta / contabilizzata: non diceva se era
-- stata pagata. Le rate fornitore (`rate_fornitori`, stato «pagata») esistono solo
-- per quelle contabilizzate, cioè collegate a un costo: per Dimora Torino 50 su 1.272.
--   1. `fatture_ricevute.pagata_il` (+ chi e quando l'ha segnato): vale per tutte.
--   2. `segna_fattura_ricevuta_pagata(id, pagata, data)`: scrive la data sulla fattura
--      e, se ha rate, porta le rate a «pagata» / «da_pagare» (le rate allineano il
--      costo e lo scadenzario coi loro trigger). SECURITY INVOKER: valgono le policy di
--      fatture_ricevute (documenti fornitore) e di rate_fornitori (puo_modificare_costo).
--   3. `fatture_ricevute_pagamento`: per ogni fattura la data di pagamento, anche
--      quando il pagamento è stato registrato sulle rate (scadenzario, tesoreria).
-- Le colonne nuove non sono dati fiscali: fiscalita_guard le lascia passare anche a
-- periodo chiuso (confronta solo tipo, numero, date, importi, IVA e stato).

alter table public.fatture_ricevute
  add column if not exists pagata_il date,
  add column if not exists pagamento_segnato_da uuid,
  add column if not exists pagamento_segnato_at timestamptz;

comment on column public.fatture_ricevute.pagata_il is
  'Giorno in cui la fattura del fornitore è stata pagata (segnato a mano). Null = da pagare, salvo rate tutte pagate.';

create or replace function public.segna_fattura_ricevuta_pagata(p_id uuid, p_pagata boolean, p_data date default null)
returns date
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_costo uuid;
  v_data date := case when p_pagata then coalesce(p_data, (now() at time zone 'Europe/Rome')::date) end;
begin
  if p_data is not null and (p_data > (now() at time zone 'Europe/Rome')::date + 1 or p_data < date '2000-01-01') then
    raise exception 'Data di pagamento non valida' using errcode = '22007';
  end if;

  update public.fatture_ricevute
     set pagata_il = v_data,
         pagamento_segnato_da = auth.uid(),
         pagamento_segnato_at = now()
   where id = p_id
  returning company_cost_id into v_costo;

  if not found then
    raise exception 'Fattura non trovata o senza permesso sui documenti dei fornitori' using errcode = '42501';
  end if;

  if v_costo is not null then
    if p_pagata then
      update public.rate_fornitori
         set stato = 'pagata', pagata_il = v_data
       where fattura_ricevuta_id = p_id and stato <> 'pagata';
    else
      update public.rate_fornitori
         set stato = 'da_pagare', pagata_il = null
       where fattura_ricevuta_id = p_id and stato = 'pagata';
    end if;
  end if;

  return v_data;
end;
$function$;

revoke all on function public.segna_fattura_ricevuta_pagata(uuid, boolean, date) from public, anon;
grant execute on function public.segna_fattura_ricevuta_pagata(uuid, boolean, date) to authenticated, service_role;

create or replace view public.fatture_ricevute_pagamento
with (security_invoker = true) as
select
  f.id,
  f.company_id,
  coalesce(f.pagata_il, case when r.n > 0 and r.aperte = 0 then r.ultima end) as pagata_il
from public.fatture_ricevute f
left join lateral (
  select count(*) as n,
         count(*) filter (where rf.stato <> 'pagata') as aperte,
         max(rf.pagata_il) as ultima
  from public.rate_fornitori rf
  where rf.fattura_ricevuta_id = f.id
) r on true;

comment on view public.fatture_ricevute_pagamento is
  'Quando è stata pagata ogni fattura ricevuta: segnata a mano o con tutte le rate pagate.';

revoke all on public.fatture_ricevute_pagamento from public, anon;
grant select on public.fatture_ricevute_pagamento to authenticated, service_role;
