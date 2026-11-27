-- «Segnate pagate senza pagamento registrato»: la riapertura arriva anche alle rate col
-- costo non pagato, e si può scegliere riga per riga (27/11/2026, un'impresa cliente).
--
-- Cosa mancava dopo 20290616100000 e 20290619100000:
--
-- 1. `riapri_pagamenti_segnati` riapriva solo i costi `is_paid`: azzerando la bandierina,
--    `costo_allinea_rate_fornitori` riporta rate e fattura a «da pagare». Ma una fattura in
--    più rate può avere la PRIMA rata `pagata` e il costo ancora aperto (la seconda rata è
--    da pagare): lì `is_paid` è già false e non c'è niente da azzerare. Nell'azienda del caso
--    erano due fatture di due fornitori, rata del 31/10 segnata «pagata, stato
--    presunto» dall'import del 04/11. Per quelle si riporta la RATA a `da_pagare`: è la
--    strada che usa già l'interfaccia, e `rate_fornitori_prima_di_salvare` toglie
--    `pagata_il` e firma il cambio, `rate_fornitori_allinea_costo` riallinea il costo.
--    La fattura non si tocca a mano: con il costo aperto non risulta già pagata.
--
-- 2. Le «rate doppie» di quei due costi NON sono doppioni: l'XML ha due DettaglioPagamento
--    (RiBa 31/10 e 30/11, metà importo ciascuna; 2 × 1.263,42 = 2.526,84 e 2 × 3.500 =
--    7.000, cioè il netto a pagare). `rate_fornitori_una_per_numero` e `crea_rate_fornitore`
--    fanno il loro mestiere. Contate il 27/11 su tutte le aziende: un solo gruppo con stessa
--    fattura, scadenza e importo (una fattura con 2 × 272 € senza data), anche
--    quello scritto così nell'XML. Nessun difetto da correggere, nessuna rata da togliere.
--
-- 3. L'avviso aveva solo «Riapri» tutte. Ora l'elenco dice di quale rata si tratta
--    (`rata_id`) e la riapertura accetta `p_rate`: le rate scelte. `p_costi` resta com'era.
--    Chi chiama con (p_company) o (p_company, p_costi) ottiene lo stesso di prima, più le
--    rate col costo non pagato.
--
-- Resta fuori (segnalato): la riapertura automatica in riconciliazione
-- (`private.fornitore_registra_quota_banca`) copre ancora solo il caso col costo `is_paid`.

-- ---------------------------------------------------------------------------------------
-- Elenco: una riga per rata, con l'id della rata e il motivo.
-- Cambia il tipo restituito (colonne nuove in coda): si ricrea.
-- ---------------------------------------------------------------------------------------
drop function if exists public.pagamenti_segnati_da_sistemare(uuid);

create function public.pagamenti_segnati_da_sistemare(p_company uuid)
returns table(
  costo_id uuid, fattura_id uuid, numero_fattura text, fornitore text, scadenza date,
  importo numeric, residuo numeric, segnato_il timestamptz, da_persona boolean,
  rata_id uuid, rata_numero integer, costo_pagato boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select c.id, f.id, f.numero_fattura,
         coalesce(s.name, f.cedente_ragione_sociale),
         r.scadenza, r.importo,
         round(private.fornitore_residuo_rata(r), 2),
         coalesce(f.pagamento_segnato_at, r.stato_cambiato_il),
         coalesce(f.pagamento_segnato_da, r.stato_cambiato_da) is not null,
         r.id, r.numero, coalesce(c.is_paid, false)
    from public.rate_fornitori r
    join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     and c.annullato_il is null
    left join public.fatture_ricevute f on f.id = r.fattura_ricevuta_id and f.company_id = r.company_id
    left join public.suppliers s on s.id = coalesce(c.supplier_id, f.fornitore_id) and s.company_id = r.company_id
   where r.company_id = p_company
     and r.stato = 'pagata'
     and private.fornitore_residuo_rata(r) > 0.005
     and public.puo_gestire_scadenze(p_company)
   order by r.scadenza nulls last, f.numero_fattura, r.numero;
$function$;

revoke all on function public.pagamenti_segnati_da_sistemare(uuid) from public, anon;
grant execute on function public.pagamenti_segnati_da_sistemare(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- Riapertura: tutte, per costo (`p_costi`) o per rata (`p_rate`).
-- ---------------------------------------------------------------------------------------
drop function if exists public.riapri_pagamenti_segnati(uuid, uuid[]);

create or replace function public.riapri_pagamenti_segnati(
  p_company uuid,
  p_costi uuid[] default null,
  p_rate uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n_costi integer := 0;
  n_rate integer := 0;
  tutte boolean := p_costi is null and p_rate is null;
begin
  if auth.uid() is null then
    raise exception 'Serve un utente autenticato' using errcode = '42501';
  end if;
  if public.user_can_access_company(p_company) is not true
     or public.puo_gestire_scadenze(p_company) is not true then
    raise exception 'Non hai il permesso di gestire i pagamenti ai fornitori.' using errcode = '42501';
  end if;

  -- Costo segnato pagato: si tocca solo `is_paid`, e a riaprire rate e fattura ci pensa
  -- `costo_allinea_rate_fornitori`. Si riaprono soltanto i costi con un residuo scoperto:
  -- un costo pagato davvero non viene sfiorato, nemmeno se passato nell'elenco.
  with da_riaprire as (
    select distinct c.id
      from public.rate_fornitori r
      join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     where r.company_id = p_company
       and r.stato = 'pagata'
       and coalesce(c.is_paid, false)
       and c.annullato_il is null
       and private.fornitore_residuo_rata(r) > 0.005
       and (tutte or c.id = any (p_costi) or r.id = any (p_rate))
  ), riaperti as (
    update public.company_costs c
       set is_paid = false, paid_date = null
      from da_riaprire d
     where c.id = d.id and c.company_id = p_company
    returning c.id
  )
  select count(*) into n_costi from riaperti;

  -- Costo già aperto ma rata rimasta «pagata» (una rata di più, segnata da sola): la si
  -- riporta da pagare. `rate_fornitori_prima_di_salvare` toglie `pagata_il` e scrive chi
  -- l'ha fatto; `rate_fornitori_allinea_costo` riallinea scadenza e stato del costo.
  with da_riaprire as (
    select r.id
      from public.rate_fornitori r
      join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     where r.company_id = p_company
       and r.stato = 'pagata'
       and not coalesce(c.is_paid, false)
       and c.annullato_il is null
       and private.fornitore_residuo_rata(r) > 0.005
       and (tutte or c.id = any (p_costi) or r.id = any (p_rate))
  ), riaperte as (
    update public.rate_fornitori r
       set stato = 'da_pagare', pagata_il = null
      from da_riaprire d
     where r.id = d.id and r.company_id = p_company
    returning r.id
  )
  select count(*) into n_rate from riaperte;

  return n_costi + n_rate;
end
$function$;

revoke all on function public.riapri_pagamenti_segnati(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.riapri_pagamenti_segnati(uuid, uuid[], uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- L'azienda del caso: le due rate del 31/10 rimaste «pagate» col costo aperto.
-- Solo se sono ancora in quello stato; il resto lo fanno i trigger della rata.
-- ---------------------------------------------------------------------------------------
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.rate_fornitori r
   set stato = 'da_pagare',
       pagata_il = null,
       nota = 'Riaperta il 27/11/2026 dall''assistenza: segnata pagata dall''import del 04/11 senza pagamento registrato'
  from public.company_costs c
 where r.company_id = '7c87c209-7868-42d0-ad98-6c95ac6de196'
   and r.id in ('5b31e2f5-06a0-41ef-a4a8-1d1694c8f21a', 'b1060e0f-f902-48e0-9d3c-7b4f30461da6')
   and r.company_cost_id in ('8b84e08f-76b3-4acb-8f7b-333b2a47b154', 'b39b8804-7dd3-46f6-af1a-aad38b316f5d')
   and r.stato = 'pagata'
   and c.id = r.company_cost_id and c.company_id = r.company_id
   and not coalesce(c.is_paid, false)
   and private.fornitore_residuo_rata(r) > 0.005;
