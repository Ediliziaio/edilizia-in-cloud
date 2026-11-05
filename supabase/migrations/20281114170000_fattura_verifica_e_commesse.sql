-- Fatture ricevute: la verifica è una scelta di chi controlla, non la contabilità. Si può mettere e togliere; finché
-- nessuno ha scelto vale quello che valeva prima (contabilizzata = verificata), così le fatture vecchie non cambiano.
alter table public.fatture_ricevute
  add column if not exists verifica_manuale text,
  add column if not exists verifica_da uuid references auth.users(id) on delete set null,
  add column if not exists verifica_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fatture_ricevute_verifica_manuale_check') then
    alter table public.fatture_ricevute add constraint fatture_ricevute_verifica_manuale_check
      check (verifica_manuale is null or verifica_manuale in ('verificata', 'da_verificare'));
  end if;
end $$;

create or replace function public.fattura_segna_verifica(p_fattura_id uuid, p_verificata boolean)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare f record;
begin
  select id, company_id into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not (f.company_id = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(f.company_id) then
    raise exception 'Il tuo ruolo non permette di verificare le fatture.' using errcode = '42501';
  end if;
  update public.fatture_ricevute
     set verifica_manuale = case when p_verificata then 'verificata' else 'da_verificare' end,
         verifica_da = auth.uid(), verifica_at = now()
   where id = p_fattura_id;
  return jsonb_build_object('fattura_id', p_fattura_id, 'verificata', p_verificata);
end $$;
revoke all on function public.fattura_segna_verifica(uuid, boolean) from public, anon;
grant execute on function public.fattura_segna_verifica(uuid, boolean) to authenticated;

-- Una fattura su una commessa, su più commesse, o su nessuna, senza passare da un ordine d'acquisto.
-- p_quote: [{order_id, importo (imponibile), righe: [numero_linea]}]. Una sola commessa con tutto l'importo va su
-- order_id; altrimenti su allocations, che margine, esposizione e pagamenti già leggono ({order_id, pct}).
create or replace function public.fattura_collega_commesse(p_fattura_id uuid, p_quote jsonb)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare
  f record; v_costo record; v_cost_id uuid; v_base numeric; v_tot numeric; v_n int; v_ordini int; v_quote jsonb;
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
  if v_n > 0 and v_base = 0 then raise exception 'La fattura non ha un importo da ripartire.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q
              where coalesce(nullif(q->>'importo', '')::numeric, 0) <= 0 or nullif(q->>'order_id', '') is null) then
    raise exception 'Ogni commessa ha bisogno di un importo.' using errcode = '22023';
  end if;
  select count(distinct q->>'order_id'), coalesce(sum((q->>'importo')::numeric), 0) into v_ordini, v_tot from jsonb_array_elements(p_quote) q;
  if v_ordini <> v_n then raise exception 'Una commessa compare due volte.' using errcode = '22023'; end if;
  if v_tot > v_base + 0.01 then raise exception 'Le quote superano l''imponibile della fattura.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q
              left join public.orders o on o.id = (q->>'order_id')::uuid and o.company_id = f.company_id and o.deleted_at is null
             where o.id is null) then
    raise exception 'Una commessa non è di questa azienda.' using errcode = '42501';
  end if;

  v_cost_id := f.company_cost_id;
  if v_cost_id is null then
    if v_n = 0 then
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

  update public.company_costs
     set order_id = case when v_n = 1 and v_tot >= v_base - 0.01 then (p_quote->0->>'order_id')::uuid end,
         allocations = case when v_n = 0 or (v_n = 1 and v_tot >= v_base - 0.01) then '[]'::jsonb else v_quote end,
         updated_at = now()
   where id = v_cost_id;

  update public.fatture_ricevute
     set order_id_suggerito = case when v_n = 1 then (p_quote->0->>'order_id')::uuid end,
         aggancio_oda_manuale = true, updated_at = now()
   where id = f.id;

  return jsonb_build_object('fattura_id', f.id, 'esito', case when v_n = 0 then 'scollegata' else 'collegata' end,
                            'company_cost_id', v_cost_id, 'quote', v_n);
end $$;
revoke all on function public.fattura_collega_commesse(uuid, jsonb) from public, anon;
grant execute on function public.fattura_collega_commesse(uuid, jsonb) to authenticated;

-- Tipi dei fornitori: chi manda fatture senza partita IVA né codice fiscale spariva dall'elenco, e la pagina diceva
-- «tutti i fornitori hanno un tipo». Senza codice ci si riconosce dal nome.
create or replace function public.cedenti_fatture_ricevute(p_company_id uuid)
 returns table(chiave text, piva text, cf text, nome text, fatture bigint, imponibile numeric, ultima date, fornitore_id uuid, fornitore_nome text, fornitore_tipo text, fornitore_categoria text, subappaltatore_id uuid, reverse_charge_edile boolean, categorie text[])
 language sql
 stable
 set search_path to ''
as $function$
  with f as (
    select r.*,
           coalesce(nullif(public.partner_tax_key(r.cedente_piva), ''), nullif(public.partner_tax_key(r.cedente_cf), ''),
                    'nome:' || nullif(lower(regexp_replace(btrim(r.cedente_ragione_sociale), '\s+', ' ', 'g')), '')) as k
      from public.fatture_ricevute r
     where r.company_id = p_company_id
  ), g as (
    select f.k,
           max(f.cedente_piva) as piva,
           max(f.cedente_cf) as cf,
           (array_agg(f.cedente_ragione_sociale order by f.data_fattura desc nulls last))[1] as nome,
           count(*) as fatture,
           coalesce(sum(case when f.tipo_documento = 'TD04' then -abs(f.imponibile_totale) else f.imponibile_totale end), 0) as imponibile,
           max(f.data_fattura) as ultima,
           (array_agg(f.fornitore_id) filter (where f.fornitore_id is not null))[1] as fornitore_id,
           bool_or(exists (
             select 1 from jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) x
              where upper(replace(x ->> 'natura_iva', '.', '_')) in ('N6_3', 'N6_7')
           )) as reverse_charge_edile,
           array_remove(array_agg(distinct f.categoria_ai), null) as categorie
      from f
     where f.k is not null
     group by f.k
  )
  select g.k, g.piva, g.cf, g.nome, g.fatture, g.imponibile, g.ultima,
         coalesce(g.fornitore_id, public.fornitore_cedente(p_company_id, g.piva, g.cf)) as fornitore_id,
         s.name, s.tipo, s.product_category,
         (select sa.id from public.subappaltatori sa
           where sa.company_id = p_company_id and public.partner_tax_key(sa.piva) = g.k
           order by sa.is_active desc nulls last limit 1),
         g.reverse_charge_edile, g.categorie
    from g
    left join public.suppliers s
      on s.id = coalesce(g.fornitore_id, public.fornitore_cedente(p_company_id, g.piva, g.cf))
   order by g.imponibile desc nulls last;
$function$;
