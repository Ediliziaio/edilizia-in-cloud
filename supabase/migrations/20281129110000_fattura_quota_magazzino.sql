-- «A magazzino»: la terza destinazione di una fattura ricevuta.
--
-- Com'era. Una fattura di materiale si divideva solo fra commesse. La merce che
-- avanza e resta in magazzino non aveva una casella: o la si addebitava a una
-- commessa che non l'ha usata — e allora quando quella merce esce verso
-- un'altra commessa la stessa spesa viene contata DUE VOLTE, una dalla fattura
-- e una dallo scarico — oppure si lasciava un residuo, che però
-- `quotaNonRipartita` conta come spesa generale della struttura: anche lì il
-- costo finisce addosso a qualcuno che non c'entra.
--
-- Com'è adesso. La quota a magazzino si dichiara, si somma con le commesse e il
-- resto va alle spese generali:
--     commesse + magazzino + spese generali = imponibile della fattura
-- La quota a magazzino NON è costo di nessuna commessa e NON è spesa generale:
-- è valore fermo in giacenza. Diventa costo quando la merce esce, perché lo
-- scarico porta con sé il costo medio della scheda (vedi
-- 20281129100000_magazzino_costo_medio_ponderato). Così la spesa si conta una
-- volta sola, e sulla commessa che la usa davvero.
--
-- Perché una colonna e non una voce dentro `allocations`: ogni lettore delle
-- quote (il margine, l'esposizione, il quadro pagamenti, `quoteDelCosto`)
-- somma le righe di `allocations` dando per scontato che ognuna sia una
-- commessa. Una voce senza `order_id` lì dentro sarebbe una mina: prima o poi
-- qualcuno la somma al 100%. Una colonna a sé non si confonde con niente.

alter table public.company_costs
  add column if not exists quota_magazzino numeric,
  add column if not exists quota_magazzino_righe jsonb;

comment on column public.company_costs.quota_magazzino is
  'Parte dell''imponibile rimasta in magazzino: non è costo di nessuna commessa né spesa generale. Diventa costo quando la merce esce, col costo medio della scheda.';

-- Quando la fattura si divide voce per voce serve sapere QUALI voci sono andate
-- a magazzino, non solo quanto: altrimenti riaprendo il riquadro bisognerebbe
-- indovinarlo, e indovinare su dei soldi è il modo di spostarli per sbaglio.
comment on column public.company_costs.quota_magazzino_righe is
  'Numeri di linea della fattura (come nell''XML) mandati a magazzino, quando la ripartizione è stata fatta voce per voce.';

-- La ripartizione non può superare l'imponibile nemmeno contando il magazzino.
create or replace function public.costo_ripartizione_valida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tot numeric;
  v_mag numeric := greatest(coalesce(new.quota_magazzino, 0), 0);
  v_base numeric := abs(coalesce(new.amount, 0));
begin
  if new.quota_magazzino is not null and new.quota_magazzino < 0 then
    raise exception 'La quota a magazzino non può essere negativa.' using errcode = '22023';
  end if;
  if new.allocations is null or jsonb_typeof(new.allocations) <> 'array' or jsonb_array_length(new.allocations) = 0 then
    -- Senza ripartizione la sola quota a magazzino non può eccedere il costo.
    if v_mag > v_base + 0.01 then
      raise exception 'La quota a magazzino supera l''importo del costo.' using errcode = '22023';
    end if;
    return new;
  end if;
  if exists (select 1 from jsonb_array_elements(new.allocations) a
              left join public.orders o on o.id = nullif(a->>'order_id', '')::uuid
             where o.id is null or o.company_id <> new.company_id) then
    raise exception 'Un costo si ripartisce solo sulle commesse della propria azienda.' using errcode = '42501';
  end if;
  select coalesce(sum(nullif(a->>'pct', '')::numeric), 0) into v_tot from jsonb_array_elements(new.allocations) a;
  if v_tot > 100.01 then
    raise exception 'La ripartizione supera il 100%%.' using errcode = '22023';
  end if;
  if v_base > 0 and v_tot + (v_mag / v_base * 100) > 100.01 then
    raise exception 'Commesse e magazzino insieme superano l''importo del costo.' using errcode = '22023';
  end if;
  return new;
end
$$;

-- Il controllo scattava solo quando cambiavano `allocations` o `company_id`:
-- una modifica della sola quota a magazzino gli passava davanti senza verifiche.
drop trigger if exists costo_ripartizione_valida on public.company_costs;
create trigger costo_ripartizione_valida
  before insert or update of allocations, company_id, quota_magazzino, amount
  on public.company_costs
  for each row execute function public.costo_ripartizione_valida();

-- ───────────────────────────────────────────────────────────────────────────────
-- La RPC che il riquadro di ripartizione chiama
-- ───────────────────────────────────────────────────────────────────────────────
-- `p_magazzino` in coda con un valore di partenza. La versione a due argomenti
-- va eliminata, non lasciata accanto: con due funzioni dello stesso nome una
-- chiamata a due argomenti diventa ambigua e Postgres la rifiuta.
drop function if exists public.fattura_collega_commesse(uuid, jsonb);

create or replace function public.fattura_collega_commesse(
  p_fattura_id uuid,
  p_quote jsonb,
  p_magazzino numeric default 0,
  p_magazzino_righe jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  f record; v_costo record; v_cost_id uuid; v_base numeric; v_tot numeric; v_n int; v_ordini int; v_quote jsonb;
  v_mag numeric := greatest(coalesce(p_magazzino, 0), 0);
begin
  select id, company_id, stato, purchase_order_id, company_cost_id, numero_fattura, imponibile_totale, totale_documento
    into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not (f.company_id = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(f.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi delle commesse.' using errcode = '42501';
  end if;
  if f.stato = 'rifiutata' then raise exception 'La fattura è rifiutata: non è un costo.' using errcode = 'P0001'; end if;
  if f.purchase_order_id is not null or exists (select 1 from public.fattura_ricevuta_ordini q where q.fattura_id = f.id) then
    raise exception 'La fattura è collegata a un ordine d''acquisto: scollegala prima, la commessa viene da lì.' using errcode = 'P0001';
  end if;
  if p_quote is null or jsonb_typeof(p_quote) <> 'array' then raise exception 'Quote non valide.' using errcode = '22023'; end if;

  v_base := abs(coalesce(f.imponibile_totale, f.totale_documento, 0));
  v_n := jsonb_array_length(p_quote);
  if (v_n > 0 or v_mag > 0) and v_base = 0 then raise exception 'La fattura non ha un importo da ripartire.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q
              where coalesce(nullif(q->>'importo', '')::numeric, 0) <= 0 or nullif(q->>'order_id', '') is null) then
    raise exception 'Ogni commessa ha bisogno di un importo.' using errcode = '22023';
  end if;
  select count(distinct q->>'order_id'), coalesce(sum((q->>'importo')::numeric), 0) into v_ordini, v_tot from jsonb_array_elements(p_quote) q;
  if v_ordini <> v_n then raise exception 'Una commessa compare due volte.' using errcode = '22023'; end if;
  if v_tot + v_mag > v_base + 0.01 then
    raise exception 'Commesse e magazzino insieme superano l''imponibile della fattura.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q
              left join public.orders o on o.id = (q->>'order_id')::uuid and o.company_id = f.company_id and o.deleted_at is null
             where o.id is null) then
    raise exception 'Una commessa non è di questa azienda.' using errcode = '42501';
  end if;

  v_cost_id := f.company_cost_id;
  if v_cost_id is null then
    if v_n = 0 and v_mag = 0 then
      update public.fatture_ricevute set order_id_suggerito = null, updated_at = now() where id = f.id;
      return jsonb_build_object('fattura_id', f.id, 'esito', 'scollegata');
    end if;
    v_cost_id := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
  end if;
  select id, purchase_order_id, order_external_team_id into v_costo
    from public.company_costs where id = v_cost_id and company_id = f.company_id for update;
  if not found then raise exception 'Il costo di questa fattura non si trova.' using errcode = 'P0002'; end if;
  if v_costo.purchase_order_id is not null or v_costo.order_external_team_id is not null then
    raise exception 'Il costo viene da un ordine o da una ditta: si cambia da lì.' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'order_id', q->>'order_id',
           'pct', round((q->>'importo')::numeric / v_base * 100, 4),
           'importo', round((q->>'importo')::numeric, 2),
           'righe', case when jsonb_typeof(q->'righe') = 'array' and jsonb_array_length(q->'righe') > 0 then q->'righe' end)))
    into v_quote from jsonb_array_elements(p_quote) q;

  -- La scorciatoia «una sola commessa, tutta sua» non vale più se una parte
  -- resta in magazzino: lì `order_id` da solo manderebbe l'intero costo sulla
  -- commessa e la quota a magazzino sarebbe contata due volte.
  update public.company_costs
     set order_id = case when v_n = 1 and v_mag <= 0.01 and v_tot >= v_base - 0.01 then (p_quote->0->>'order_id')::uuid end,
         allocations = case when (v_n = 0) or (v_n = 1 and v_mag <= 0.01 and v_tot >= v_base - 0.01) then '[]'::jsonb else v_quote end,
         quota_magazzino = case when v_mag > 0 then round(v_mag, 2) end,
         quota_magazzino_righe = case
           when v_mag > 0 and jsonb_typeof(p_magazzino_righe) = 'array'
                and jsonb_array_length(p_magazzino_righe) > 0 then p_magazzino_righe end,
         updated_at = now()
   where id = v_cost_id;

  update public.fatture_ricevute
     set order_id_suggerito = case when v_n = 1 then (p_quote->0->>'order_id')::uuid end,
         aggancio_oda_manuale = true, updated_at = now()
   where id = f.id;

  return jsonb_build_object('fattura_id', f.id,
                            'esito', case when v_n = 0 and v_mag = 0 then 'scollegata' else 'collegata' end,
                            'company_cost_id', v_cost_id, 'quote', v_n,
                            'magazzino', round(v_mag, 2));
end
$$;

revoke all on function public.fattura_collega_commesse(uuid, jsonb, numeric, jsonb) from public, anon;
grant execute on function public.fattura_collega_commesse(uuid, jsonb, numeric, jsonb) to authenticated, service_role;
