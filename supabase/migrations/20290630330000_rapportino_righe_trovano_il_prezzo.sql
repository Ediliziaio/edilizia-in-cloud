-- Le righe dal rapportino trovano il prezzo: manodopera dal listino, materiali per nome
-- ─────────────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, dalla prova su Impresa Vulcano (docs/modello-avanzamento-rendiconto-sal-20261128.md
-- §12): le righe nascevano giuste ma senza prezzo, perché nessuno aveva fatto il legame col
-- listino. Qui `rendiconto_giornaliero_righe_da_rapportino` chiama le due funzioni della
-- 20290630310000:
--
--   * la manodopera senza voce scelta sulla commessa prende quella del committente — o la sola voce
--     generale di manodopera — e porta `appalto_tariffa_id`, perché la voce del committente spesso
--     non è collegata al listino generale;
--   * il materiale scritto nel rapportino si lega alla voce con lo **stesso** nome.
--
-- Il resto è identico alla versione di prima: presenze, autore del rapportino, straordinari del
-- contratto, mezzi, voci libere e viaggi.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.rendiconto_giornaliero_righe_da_rapportino(p_rapportino_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r record; v_ord record; v_righe jsonb := '[]'::jsonb; v_p record; v_emp record; v_magg numeric;
  v_voce uuid; v_unita text; v_qta numeric;
  v_pre jsonb; v_at uuid;
begin
  select cr.* into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return '[]'::jsonb; end if;
  select o.tariffa_manodopera_id, o.appalto_contratto_id, o.customer_id into v_ord from public.orders o where o.id = v_r.order_id;
  select c.maggiorazione_straordinario_pct into v_magg
    from public.appalto_contratti c
   where c.company_id = v_r.company_id
     and (c.id = v_ord.appalto_contratto_id
          or (v_ord.appalto_contratto_id is null and c.committente_id = v_ord.customer_id and c.attivo
              and c.valido_dal <= v_r.data_lavoro and (c.valido_al is null or c.valido_al >= v_r.data_lavoro)))
   order by (c.id = v_ord.appalto_contratto_id) desc, c.valido_dal desc limit 1;
  v_magg := coalesce(v_magg, 0);

  -- La voce di manodopera da usare quando nessuno l'ha scelta sulla commessa: il listino del
  -- committente, poi quello generale, e solo se la scelta è una sola (20290630310000).
  v_pre := private.voce_manodopera_predefinita(v_r.order_id, v_r.data_lavoro);

  for v_p in
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           case when p->>'subappaltatore_id' ~* '^[0-9a-f-]{36}$' then (p->>'subappaltatore_id')::uuid end as sub,
           coalesce(nullif(btrim(p->>'nome'), ''), 'Senza nome') as nome,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
      from jsonb_array_elements(case when jsonb_typeof(v_r.presenze) = 'array' then v_r.presenze else '[]'::jsonb end) p
  loop
    if v_p.ore <= 0 then continue; end if;
    v_voce := case when v_p.sub is not null
                   then (select s.tariffa_id from public.subappaltatori s where s.id = v_p.sub)
                   else v_ord.tariffa_manodopera_id end;
    v_at := null;
    if v_voce is null and v_pre is not null then
      v_voce := nullif(v_pre->>'listino_voce_id', '')::uuid;
      v_at := nullif(v_pre->>'appalto_tariffa_id', '')::uuid;
    end if;
    v_unita := case when v_at is not null
                    then coalesce(private.prezzo_tariffa_committente(v_r.order_id, v_at, v_r.data_lavoro)->>'unita', 'ora')
                    else private.unita_della_voce(v_r.order_id, v_voce, v_r.data_lavoro) end;
    v_qta := private.quantita_per_unita(v_p.ore, v_unita);
    v_righe := v_righe || jsonb_build_array(jsonb_build_object(
      'categoria', 'manodopera', 'descrizione', v_p.nome, 'unita', v_unita, 'quantita', v_qta,
      'employee_id', v_p.emp, 'subappaltatore_id', v_p.sub, 'listino_voce_id', v_voce,
      'appalto_tariffa_id', v_at,
      'note', private.nota_conversione(v_p.ore, v_unita, v_qta)));
  end loop;

  if jsonb_array_length(v_righe) = 0 and coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0) > 0 then
    select e.id, btrim(concat_ws(' ', e.first_name, e.last_name)) as nome into v_emp
      from public.employees e
     where e.user_id = v_r.user_id and e.company_id = v_r.company_id
     order by coalesce(e.is_active, true) desc, e.created_at limit 1;
    v_voce := v_ord.tariffa_manodopera_id;
    v_at := null;
    if v_voce is null and v_pre is not null then
      v_voce := nullif(v_pre->>'listino_voce_id', '')::uuid;
      v_at := nullif(v_pre->>'appalto_tariffa_id', '')::uuid;
    end if;
    v_unita := case when v_at is not null
                    then coalesce(private.prezzo_tariffa_committente(v_r.order_id, v_at, v_r.data_lavoro)->>'unita', 'ora')
                    else private.unita_della_voce(v_r.order_id, v_voce, v_r.data_lavoro) end;
    if v_unita <> 'ora' then
      v_qta := private.quantita_per_unita(coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0), v_unita);
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'categoria', 'manodopera', 'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
        'unita', v_unita, 'quantita', v_qta, 'employee_id', v_emp.id,
        'listino_voce_id', v_voce, 'appalto_tariffa_id', v_at,
        'note', private.nota_conversione(coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0), v_unita, v_qta)));
    elsif v_magg > 0 and coalesce(v_r.ore_straordinario, 0) > 0 then
      if coalesce(v_r.ore_lavorate, 0) > 0 then
        v_righe := v_righe || jsonb_build_array(jsonb_build_object(
          'categoria', 'manodopera',
          'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
          'unita', 'ora', 'quantita', v_r.ore_lavorate,
          'employee_id', v_emp.id, 'listino_voce_id', v_voce, 'appalto_tariffa_id', v_at));
      end if;
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'categoria', 'manodopera',
        'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino') || ' · straordinario',
        'unita', 'ora', 'quantita', v_r.ore_straordinario, 'maggiorazione_pct', v_magg,
        'employee_id', v_emp.id, 'listino_voce_id', v_voce, 'appalto_tariffa_id', v_at));
    else
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'categoria', 'manodopera',
        'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
        'unita', 'ora', 'quantita', coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0),
        'employee_id', v_emp.id, 'listino_voce_id', v_voce, 'appalto_tariffa_id', v_at));
    end if;
  end if;

  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'mezzo', 'descrizione', x.nome, 'unita', x.unita,
             'quantita', private.quantita_per_unita(x.ore, x.unita),
             'mezzo_id', x.mezzo_id, 'listino_voce_id', x.voce,
             'note', case when x.ore is null then 'Ore del mezzo non scritte nel rapportino: 1 da correggere'
                          else private.nota_conversione(x.ore, x.unita, private.quantita_per_unita(x.ore, x.unita)) end))
      from (
        select coalesce(nullif(btrim(m->>'nome'), ''), mz.nome, 'Mezzo') as nome,
               mz.id as mezzo_id, mz.tariffa_id as voce,
               private.unita_della_voce(v_r.order_id, mz.tariffa_id, v_r.data_lavoro) as unita,
               case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' and replace(m->>'ore', ',', '.')::numeric > 0
                    then replace(m->>'ore', ',', '.')::numeric end as ore
          from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
          left join public.mezzi mz on mz.id = case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then (m->>'mezzo_id')::uuid end
                                   and mz.company_id = v_r.company_id
      ) x), '[]'::jsonb);

  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', case when v.viaggio is not null then 'trasporto' else 'voce' end,
             'descrizione', v.descrizione, 'unita', v.unita, 'quantita', v.quantita,
             'listino_voce_id', v.tariffa_id,
             'viaggio', v.viaggio,
             'prezzo_unitario', v.vendita_unitaria,
             'prezzo_a_mano', coalesce(v.prezzo_a_mano, false) or (v.tariffa_id is null and coalesce(v.vendita_unitaria, 0) > 0))
           order by v.created_at)
      from public.rapportino_voci_libere v where v.rapportino_id = p_rapportino_id), '[]'::jsonb);

  -- I materiali: la voce con lo STESSO nome, prima nel listino del committente poi nel generale
  -- (20290630310000). Nome identico, non somigliante: un prezzo sbagliato su un documento che va
  -- al committente è peggio di un prezzo da scrivere.
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'materiale',
             'descrizione', x.nome,
             'unita', coalesce(nullif(x.vc->>'unita', ''), x.unita),
             'quantita', x.quantita,
             'listino_voce_id', nullif(x.vc->>'listino_voce_id', '')::uuid,
             'appalto_tariffa_id', nullif(x.vc->>'appalto_tariffa_id', '')::uuid))
      from (
        select coalesce(nullif(btrim(m->>'nome'), ''), 'Materiale') as nome,
               coalesce(nullif(btrim(m->>'unita'), ''), 'cad') as unita,
               case when m->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'quantita', ',', '.')::numeric else 1 end as quantita,
               private.voce_materiale_per_nome(v_r.order_id, nullif(btrim(m->>'nome'), ''), v_r.data_lavoro) as vc
          from jsonb_array_elements(case when jsonb_typeof(v_r.materiali_usati) = 'array' then v_r.materiali_usati else '[]'::jsonb end) m
         where coalesce(nullif(btrim(m->>'nome'), ''), '') <> ''
      ) x), '[]'::jsonb);

  select coalesce(jsonb_agg(x.v || jsonb_build_object('da_rapportino_id', p_rapportino_id) order by x.n), '[]'::jsonb) into v_righe
    from jsonb_array_elements(v_righe) with ordinality as x(v, n);
  return v_righe;
end;
$function$;
