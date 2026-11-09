-- Le voci libere (trasporto, nolo, smaltimento) si scrivono insieme al rapportino dell'ufficio: o tutto o niente.
-- I prezzi li mette solo chi vede i costi, come dal popup.
set local lock_timeout = '3s';
do $$
declare
  v text;
  a1 constant text := E'  n integer := 0;\nbegin';
  a2 constant text := E'v_campi);\n    exception when unique_violation then';
  a3 constant text := E'    n := n + 1;\n  end loop;';
begin
  select pg_get_functiondef(oid) into v from pg_proc where pronamespace = 'public'::regnamespace and proname = 'ufficio_crea_rapportini';
  if position('voci_libere' in v) > 0 then return; end if;
  if position(a1 in v) = 0 or position(a2 in v) = 0 or position(a3 in v) = 0 then raise exception 'testo non riconosciuto'; end if;
  v := replace(v, a1, E'  n integer := 0;\n  v_id uuid;\n  v_voci jsonb;\nbegin');
  v := replace(v, a2, E'v_campi)\n      returning id into v_id;\n    exception when unique_violation then');
  v := replace(v, a3, $t$    v_voci := coalesce(r->'voci_libere', '[]'::jsonb);
    if jsonb_typeof(v_voci) <> 'array' or jsonb_array_length(v_voci) > 50 then
      raise exception 'Voci non valide nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    if jsonb_array_length(v_voci) > 0 then
      if public.has_permission_for_company(auth.uid(), 'can_view_costs', c) is not true then
        raise exception 'Le voci con i prezzi le scrive chi può vedere i costi.' using errcode = '42501';
      end if;
      if exists (select 1 from jsonb_array_elements(v_voci) e
                  where btrim(coalesce(e->>'descrizione', '')) = ''
                     or coalesce(e->>'quantita', '') !~ '^[0-9]+([.][0-9]+)?$' or (e->>'quantita')::numeric <= 0
                     or (nullif(e->>'costo_unitario', '') is not null and (e->>'costo_unitario') !~ '^[0-9]+([.][0-9]+)?$')
                     or (nullif(e->>'vendita_unitaria', '') is not null and (e->>'vendita_unitaria') !~ '^[0-9]+([.][0-9]+)?$')) then
        raise exception 'Controlla le voci del rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
      end if;
      insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, costo_unitario, vendita_unitaria)
      select v_id, left(btrim(e->>'descrizione'), 500), (e->>'quantita')::numeric, coalesce(nullif(btrim(e->>'unita'), ''), 'cad'),
             nullif(e->>'costo_unitario', '')::numeric, nullif(e->>'vendita_unitaria', '')::numeric
        from jsonb_array_elements(v_voci) e;
    end if;
$t$ || a3);
  execute v;
end $$;
