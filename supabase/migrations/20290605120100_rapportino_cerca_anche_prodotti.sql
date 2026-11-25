-- Rapportino: «Cerca nel listino» trova anche i prodotti del listino prodotti (25/11/2026).
--
-- La ricerca delle voci del rapportino (dal quadro, per rapportino; dal popup dell'ufficio,
-- per commessa e giorno) guardava solo il listino voci (tariffe_aziendali). Un'impresa
-- aveva messo la guaina nel listino prodotti (article_families) e nel rapportino non c'era.
-- Ora, se chi chiama lo chiede (p_con_prodotti), dopo le voci arrivano anche i prodotti attivi:
--   prezzo = vendita del prodotto (prezzo base, o acquisto scontato col ricarico:
--            listino_vendita_effettiva); a griglia o a zero → «prezzo da definire»;
--   costo  = acquisto al netto degli sconti del fornitore; a zero → non noto.
-- Il prodotto non ha tariffa_id: nel rapportino diventa una voce col suo prezzo scritto,
-- che nessun ricalcolo dal listino voci sovrascrive. Lo distingue «articolo_id».
--
-- p_con_prodotti vale false di default: chi non lo manda (le scelte della voce dei mezzi,
-- delle ditte e delle ore in economia, che vogliono solo voci del listino voci, e le pagine
-- ancora in cache prima del deploy) riceve esattamente quello di prima.
-- Gli importi e i costi si tolgono come prima, a chi non può vederli.

-- ── I prodotti, per la ricerca ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.listino_prodotti_cerca(p_company_id uuid, p_testo text, p_limite integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  select coalesce(jsonb_agg(x.p order by x.ord, x.descr), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'articolo_id', f.id,
               'origine', 'prodotto',
               'codice', f.codice,
               'descrizione', f.nome,
               'dettaglio', f.descrizione,
               'categoria', coalesce(m.nome, 'Prodotto del listino'),
               'unita', u.unita,
               'unita_generale', u.unita,
               'unita_diverse', false,
               'prezzo', pv.prezzo,
               'prezzo_generale', pv.prezzo,
               'fonte', case when pv.prezzo is null then 'mancante' else 'generale' end,
               'costo_unitario', pc.costo
             ) as p,
             case when b.t <> '' and lower(coalesce(f.codice, '')) = lower(b.t) then 0
                  when b.t <> '' and lower(coalesce(f.codice, '')) like lower(b.t) || '%' then 1 else 2 end as ord,
             lower(f.nome) as descr
        from (select btrim(coalesce(p_testo, '')) as t) b
        join public.article_families f
          on f.company_id = p_company_id
         and f.deleted_at is null
         and coalesce(f.attivo, true)
        left join public.listino_macrocategorie m on m.id = f.macrocategoria_id
        cross join lateral (
          select coalesce(nullif(btrim(f.unit_of_measure), ''),
                          case when f.modalita_prezzo_base = 'mq' then 'mq' else 'pz' end) as unita
        ) u
        cross join lateral (
          select case
                   when f.modalita_prezzo_base in ('griglia', 'misura_libera') then null
                   else nullif(public.listino_vendita_effettiva(
                          f.prezzo_base_vendita, f.prezzo_base_acquisto, f.prezzo_base_mode,
                          f.sconto_fornitore_1, f.sconto_fornitore_2, f.markup_tipo, f.markup_valore), 0)
                 end as prezzo
        ) pv
        cross join lateral (
          select nullif(round(coalesce(f.prezzo_base_acquisto, 0)
                   * (1 - least(greatest(coalesce(f.sconto_fornitore_1, 0), 0), 100) / 100)
                   * (1 - least(greatest(coalesce(f.sconto_fornitore_2, 0), 0), 100) / 100), 4), 0) as costo
        ) pc
       where b.t = ''
          or f.codice ilike '%' || b.t || '%'
          or f.nome ilike '%' || b.t || '%'
          or f.descrizione ilike '%' || b.t || '%'
          or m.nome ilike '%' || b.t || '%'
       order by ord, lower(f.nome)
       limit greatest(1, least(coalesce(p_limite, 30), 100))
    ) x;
$$;

REVOKE ALL ON FUNCTION private.listino_prodotti_cerca(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.listino_prodotti_cerca(uuid, text, integer) TO service_role;

-- ── Ricerca per commessa e giorno (popup dell'ufficio) ──────────────────────
DROP FUNCTION IF EXISTS public.commessa_listino_cerca(uuid, date, text, integer);
CREATE OR REPLACE FUNCTION public.commessa_listino_cerca(
  p_order_id uuid, p_data date DEFAULT NULL::date, p_testo text DEFAULT ''::text,
  p_limite integer DEFAULT 30, p_con_prodotti boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_company uuid; v_rights jsonb; v_testo text := btrim(coalesce(p_testo, '')); v_out jsonb;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null then return '[]'::jsonb; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  v_rights := coalesce(private.office_order_rights(p_order_id), '{}'::jsonb);

  select coalesce(jsonb_agg(p order by ord, descr), '[]'::jsonb) into v_out
    from (
      select private.prezzo_voce_commessa_raw(p_order_id, t.id, p_data)
               || jsonb_build_object('categoria', coalesce(nullif(t.categoria_prodotto, ''), t.custom_field_values->>'_gruppo_lavorazione', t.tipo),
                                     'dettaglio', t.descrizione) as p,
             case when v_testo <> '' and lower(coalesce(t.codice, '')) = lower(v_testo) then 0
                  when v_testo <> '' and lower(coalesce(t.codice, '')) like lower(v_testo) || '%' then 1 else 2 end as ord,
             lower(t.nome) as descr
        from public.tariffe_aziendali t
       where t.company_id = v_company
         and coalesce(t.attivo, true)
         and (v_testo = ''
              or t.codice ilike '%' || v_testo || '%'
              or t.nome ilike '%' || v_testo || '%'
              or t.descrizione ilike '%' || v_testo || '%'
              or t.tipo ilike '%' || v_testo || '%'
              or t.categoria_prodotto ilike '%' || v_testo || '%'
              or (t.custom_field_values->>'_gruppo_lavorazione') ilike '%' || v_testo || '%'
              or t.unita ilike v_testo)
       order by ord, lower(t.nome)
       limit greatest(1, least(coalesce(p_limite, 30), 100))
    ) s;

  if coalesce(p_con_prodotti, false) then
    v_out := v_out || private.listino_prodotti_cerca(v_company, v_testo, p_limite);
  end if;

  if not coalesce((v_rights->>'amounts')::boolean, false) then
    select coalesce(jsonb_agg(x - 'prezzo' - 'prezzo_generale'), '[]'::jsonb) into v_out from jsonb_array_elements(v_out) x;
  end if;
  if not coalesce((v_rights->>'costs')::boolean, false) then
    select coalesce(jsonb_agg(x - 'costo_unitario'), '[]'::jsonb) into v_out from jsonb_array_elements(v_out) x;
  end if;
  return v_out;
end $function$;

REVOKE ALL ON FUNCTION public.commessa_listino_cerca(uuid, date, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_listino_cerca(uuid, date, text, integer, boolean) TO authenticated, service_role;

-- ── Ricerca per rapportino (quadro dei costi) ───────────────────────────────
DROP FUNCTION IF EXISTS public.rapportino_listino_cerca(uuid, text, integer);
CREATE OR REPLACE FUNCTION public.rapportino_listino_cerca(
  p_rapportino_id uuid, p_testo text DEFAULT ''::text, p_limite integer DEFAULT 30,
  p_con_prodotti boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare r record; v_rights jsonb; v_testo text := btrim(coalesce(p_testo, '')); v_out jsonb;
begin
  select cr.order_id, cr.company_id, cr.data_lavoro into r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return '[]'::jsonb; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(r.order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  v_rights := coalesce(private.office_order_rights(r.order_id), '{}'::jsonb);

  select coalesce(jsonb_agg(p order by ord, descr), '[]'::jsonb) into v_out
    from (
      select private.prezzo_voce_commessa_raw(r.order_id, t.id, r.data_lavoro)
               || jsonb_build_object('categoria', coalesce(nullif(t.categoria_prodotto, ''), t.custom_field_values->>'_gruppo_lavorazione', t.tipo),
                                     'dettaglio', t.descrizione) as p,
             case when v_testo <> '' and lower(coalesce(t.codice, '')) = lower(v_testo) then 0
                  when v_testo <> '' and lower(coalesce(t.codice, '')) like lower(v_testo) || '%' then 1 else 2 end as ord,
             lower(t.nome) as descr
        from public.tariffe_aziendali t
       where t.company_id = r.company_id
         and coalesce(t.attivo, true)
         and (v_testo = ''
              or t.codice ilike '%' || v_testo || '%'
              or t.nome ilike '%' || v_testo || '%'
              or t.descrizione ilike '%' || v_testo || '%'
              or t.tipo ilike '%' || v_testo || '%'
              or t.categoria_prodotto ilike '%' || v_testo || '%'
              or (t.custom_field_values->>'_gruppo_lavorazione') ilike '%' || v_testo || '%'
              or t.unita ilike v_testo)
       order by ord, lower(t.nome)
       limit greatest(1, least(coalesce(p_limite, 30), 100))
    ) s;

  if coalesce(p_con_prodotti, false) then
    v_out := v_out || private.listino_prodotti_cerca(r.company_id, v_testo, p_limite);
  end if;

  if not coalesce((v_rights->>'amounts')::boolean, false) then
    select coalesce(jsonb_agg(x - 'prezzo' - 'prezzo_generale'), '[]'::jsonb) into v_out from jsonb_array_elements(v_out) x;
  end if;
  if not coalesce((v_rights->>'costs')::boolean, false) then
    select coalesce(jsonb_agg(x - 'costo_unitario'), '[]'::jsonb) into v_out from jsonb_array_elements(v_out) x;
  end if;
  return v_out;
end $function$;

REVOKE ALL ON FUNCTION public.rapportino_listino_cerca(uuid, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapportino_listino_cerca(uuid, text, integer, boolean) TO authenticated, service_role;
