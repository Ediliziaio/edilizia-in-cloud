-- Saldi dell'elenco fornitori. Legge importi e stati senza scrivere movimenti o rate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.fatture_ricevute_saldi(p_company_id uuid, p_anno integer default null)
returns table (
  id uuid, dovuto numeric, pagato numeric, residuo numeric, iva_split numeric,
  pagata_il date, data_saldo date, rate_pagate integer, rate_totali integer, stornata boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  -- Stessi accessi alla lista fornitori. Restituisce solo i saldi, senza movimenti, conti o IBAN.
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
    or not coalesce(
      (p_company_id = public.get_my_company_id() and public.puo_vedere_documenti_fornitore())
      or public.user_can_read_accountant_company(p_company_id)
      or public.e_super_admin_dentro(p_company_id), false
    ) then
    raise exception 'Non puoi consultare i pagamenti delle fatture ricevute.' using errcode = '42501';
  end if;
  if p_anno is not null and p_anno not between 1 and 9998 then
    raise exception 'Anno non valido.' using errcode = '22023';
  end if;

  return query
  with fatture as materialized (
    select f.id, f.company_cost_id, f.pagata_il, f.netto_a_pagare, f.totale_documento,
      f.imponibile_totale, f.iva_totale, f.ritenuta_importo, f.riepilogo_iva, f.piano_pagamento,
      (not public.e_nota_credito_ricevuta(f.tipo_documento)
        and not public.e_autofattura_ricevuta(f.tipo_documento)
        and f.stato not in ('rifiutata', 'scartata', 'annullata')) as pagabile
    from public.fatture_ricevute f
    where f.company_id = p_company_id
      and (p_anno is null or (f.data_fattura >= make_date(p_anno, 1, 1)
        and f.data_fattura < make_date(p_anno + 1, 1, 1)))
  ), costi as materialized (
    select c.id, c.is_paid, c.paid_date, c.annullato_il
    from public.company_costs c
    join (select distinct f.company_cost_id from fatture f where f.pagabile) f on f.company_cost_id = c.id
    where c.company_id = p_company_id
  ), intestazioni as (
    -- Il costo può essere condiviso con fatture di un altro anno.
    select f.company_cost_id, count(*) n
    from public.fatture_ricevute f join costi c on c.id = f.company_cost_id
    where f.company_id = p_company_id and f.stato not in ('rifiutata', 'scartata', 'annullata')
      and not public.e_nota_credito_ricevuta(f.tipo_documento) and not public.e_autofattura_ricevuta(f.tipo_documento)
    group by f.company_cost_id
  ), scadenze_costo as materialized (
    select s.id, s.cost_id, s.amount, s.paid_amount, s.status
    from public.scadenze s join costi c on c.id = s.cost_id
    where s.company_id = p_company_id and s.direction = 'uscita' and s.status <> 'annullata'
  ), scritture as (
    select p.cost_id, p.direction, p.amount
    from public.prima_nota_entries p join costi c on c.id = p.cost_id
    where p.company_id = p_company_id
    union all
    select s.cost_id, p.direction, p.amount
    from public.prima_nota_entries p join scadenze_costo s on s.id = p.scadenza_id
    where p.company_id = p_company_id and p.cost_id is null
  ), versamenti as (
    select s.cost_id, sum(case when s.direction = 'uscita' then s.amount else -s.amount end) saldo
    from scritture s group by s.cost_id
  ), anticipi as (
    select a.costo_id, sum(a.importo) saldo
    from private.anticipi_compensazioni_al(p_company_id, current_date) a join costi c on c.id = a.costo_id
    group by a.costo_id
  ), versamenti_scadenze as (
    select s.cost_id, sum(case when s.status = 'pagata' then greatest(s.amount, s.paid_amount)
      else s.paid_amount end) saldo
    from scadenze_costo s group by s.cost_id
  ), rate as (
    select r.fattura_ricevuta_id, count(*)::integer totali,
      count(*) filter (where r.stato = 'pagata')::integer pagate,
      count(*) filter (where r.stato = 'pagata' and r.importo is null) senza_importo,
      sum(r.importo) filter (where r.stato = 'pagata') pagato,
      max(r.pagata_il) filter (where r.stato = 'pagata') ultima
    from public.rate_fornitori r join fatture f on f.id = r.fattura_ricevuta_id
    where r.company_id = p_company_id and r.stato <> 'stornata'
    group by r.fattura_ricevuta_id
  ), storni as (
    select s.fattura_id, sum(s.importo) importo
    from public.note_credito_storni s join fatture f on f.id = s.fattura_id
    where s.company_id = p_company_id
    group by s.fattura_id
  ), importi as (
    select f.*, coalesce(r.totali, 0) totali, coalesce(r.pagate, 0) pagate, r.ultima,
      coalesce(r.senza_importo, 0) rate_senza_importo,
      coalesce(r.pagato, case when r.totali is null then piano.pagato end, 0) rate_pagato,
      coalesce(s.importo, 0) stornato, coalesce(iva.split, 0) split,
      c.is_paid as costo_pagato, c.paid_date as data_costo, c.annullato_il as costo_annullato,
      coalesce(i.n, 0) fatture_costo,
      -- Le rate e le scadenze possono registrare gli stessi versamenti della prima nota.
      greatest(coalesce(v.saldo, 0) + coalesce(a.saldo, 0), coalesce(sc.saldo, 0), 0) versato_costo,
      coalesce(f.totale_documento, f.imponibile_totale + f.iva_totale) lordo
    from fatture f
    left join costi c on c.id = f.company_cost_id
    left join intestazioni i on i.company_cost_id = c.id
    left join versamenti v on v.cost_id = c.id
    left join anticipi a on a.costo_id = c.id
    left join versamenti_scadenze sc on sc.cost_id = c.id
    left join rate r on r.fattura_ricevuta_id = f.id
    left join storni s on s.fattura_id = f.id
    left join lateral (
      select sum((x->>'imposta')::numeric) split
      from jsonb_array_elements(case when jsonb_typeof(f.riepilogo_iva) = 'array' then f.riepilogo_iva else '[]'::jsonb end) x
      where x->>'esigibilita' = 'S' and x->>'imposta' ~ '^[0-9]+(\.[0-9]+)?$'
    ) iva on true
    left join lateral (
      select sum((x->>'importo')::numeric) pagato
      from jsonb_array_elements(case when jsonb_typeof(f.piano_pagamento) = 'array' then f.piano_pagamento else '[]'::jsonb end) x
      where nullif(x->>'pagata_il', '') is not null and x->>'importo' ~ '^[0-9]+(\.[0-9]+)?$'
    ) piano on r.totali is null
  ), netti as (
    select t.*, case
      when not t.pagabile or t.costo_annullato is not null then null
      when t.split > 0 and t.lordo is not null then
        -- Alcuni documenti riportano già il totale al netto della sola IVA split.
        greatest(0, least(t.netto_a_pagare, t.lordo - coalesce(t.ritenuta_importo, 0) -
          case when abs(t.lordo - (t.imponibile_totale + t.iva_totale - t.split)) <= 0.01 then 0 else t.split end))
      when coalesce(t.netto_a_pagare, t.lordo) is not null then
        greatest(0, coalesce(t.netto_a_pagare, t.lordo - coalesce(t.ritenuta_importo, 0)))
    end netto
    from importi t
  ), saldi as (
    select n.*, case when n.netto is not null then greatest(0, round(n.netto - n.stornato, 2)) end debito,
      case when n.fatture_costo = 1 then greatest(n.rate_pagato, n.versato_costo)
        else greatest(0, n.rate_pagato) end versato,
      (n.pagata_il is not null or (n.fatture_costo = 1 and coalesce(n.costo_pagato, false))) segnato
    from netti n
  ), calcolati as (
    select s.*, case
      when not s.pagabile or s.costo_annullato is not null then null
      when s.segnato and s.debito is not null then greatest(s.versato, s.debito)
      -- Una quota del costo condiviso senza addebito alla singola fattura resta da verificare.
      when s.fatture_costo > 1 and (s.versato_costo > 0 or s.costo_pagato)
        and (s.debito is null or s.versato < s.debito) then null
      when s.rate_senza_importo > 0 then null
      else s.versato
    end effettivo
    from saldi s
  )
  select c.id, round(c.netto, 2), round(c.effettivo, 2),
    case when c.debito = 0 then 0::numeric
      when c.debito is not null and c.effettivo is not null then greatest(0, round(c.debito - c.effettivo, 2)) end,
    c.split, coalesce(c.pagata_il, case when c.totali > 0 and c.pagate = c.totali and c.effettivo >= c.debito then c.ultima end),
    case when c.fatture_costo = 1 and c.costo_pagato and c.effettivo >= c.debito then c.data_costo end,
    c.pagate, c.totali, coalesce(c.netto > 0 and c.stornato >= c.netto - 0.005, false)
  from calcolati c;
end $function$;

revoke all on function public.fatture_ricevute_saldi(uuid, integer) from public, anon, service_role;
grant execute on function public.fatture_ricevute_saldi(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
