-- Rapportini dall'ufficio completi come quelli del cantiere (31/10/2026).
--
-- Florin: «dall'ufficio devo poter fare il rapportino del cantiere: le fasi,
-- chi ha lavorato e le ore di ognuno, foto, note, mezzi usati, tutto come
-- quello che viene fatto in cantiere».
--
-- ufficio_crea_rapportini (20281031210000) accettava solo descrizione, fasi e
-- note, e scriveva ore 0. Ora ogni rapportino porta anche:
--   · presenze: [{employee_id | subappaltatore_id, nome, ore}] — lo stesso
--     formato del capocantiere. All'APPROVAZIONE fn_rapportino_costo_manodopera
--     le trasforma in ore e costo di ognuno (costo orario del dipendente), coi
--     controlli di sempre (campo_controlla_ore_persona: niente ore doppie). Le
--     ditte sono presenza registrata, senza costo orario.
--   · foto_urls: foto caricate nella cartella della commessa (campo-rapportini/
--     <azienda>/<commessa>/…); altri indirizzi non passano.
--   · materiali_usati: [{nome, quantita, unita, order_item_id}], come in cantiere.
--   · mezzi_usati (colonna nuova): [{mezzo_id, nome, ore}] — i mezzi e gli
--     attrezzi usati quel giorno. Il rapportino del cantiere segna dove restano
--     a fine giornata (campo_mezzi_fine_giornata); questo dice cosa si è usato.
--   · meteo (soleggiato, nuvoloso, pioggia, neve, vento).
-- Le fasi restano con l'avanzamento che l'ufficio dichiara (percentuale per
-- fase), applicato all'approvazione come per il cantiere.

set local lock_timeout = '3s';

alter table public.campo_rapportini
  add column if not exists mezzi_usati jsonb not null default '[]'::jsonb;

create or replace function public.ufficio_crea_rapportini(p_order_id uuid, p_rapportini jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c uuid;
  assegnata uuid;
  r jsonb;
  x jsonb;
  v_autore uuid;
  v_giorno date;
  v_fasi jsonb;
  v_presenze jsonb;
  v_foto jsonb;
  v_materiali jsonb;
  v_mezzi jsonb;
  v_ore numeric;
  v_prefisso text;
  n integer := 0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select company_id, assigned_to into c, assegnata from public.orders where id = p_order_id and deleted_at is null;
  if c is null then
    raise exception 'Commessa non trovata.' using errcode = 'P0002';
  end if;
  perform public.assert_company_access(c);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_giornale_lavori', c) is not true
     or public.check_staff_visibility(auth.uid(), assegnata) is not true then
    raise exception 'Non hai il permesso di scrivere rapportini su questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rapportini) is distinct from 'array' or jsonb_array_length(p_rapportini) = 0 or jsonb_array_length(p_rapportini) > 31 then
    raise exception 'Da 1 a 31 rapportini alla volta.' using errcode = '22023';
  end if;
  v_prefisso := '/campo-rapportini/' || c::text || '/' || p_order_id::text || '/';

  for r in select value from jsonb_array_elements(p_rapportini) loop
    v_giorno := nullif(r->>'data_lavoro', '')::date;
    if v_giorno is null or v_giorno > (now() at time zone 'Europe/Rome')::date then
      raise exception 'Ogni rapportino ha una data, non nel futuro.' using errcode = '22023';
    end if;
    if btrim(coalesce(r->>'descrizione', '')) = '' then
      raise exception 'Scrivi cosa si è fatto il %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    v_autore := coalesce(nullif(r->>'autore', '')::uuid, auth.uid());
    if v_autore <> auth.uid() and not exists (
      select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_autore
    ) then
      raise exception 'La persona scelta non lavora su questa commessa con l''app.' using errcode = '42501';
    end if;

    v_fasi := coalesce(r->'fasi_lavorate', '[]'::jsonb);
    if jsonb_typeof(v_fasi) <> 'array' or exists (
      select 1 from jsonb_array_elements(v_fasi) e
       where not exists (select 1 from public.order_work_phases f where f.id::text = e->>'phase_id' and f.order_id = p_order_id)
    ) then
      raise exception 'Una fase del rapportino del % non è di questa commessa.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    -- Chi ha lavorato e quante ore: dipendenti e ditte dell'azienda, ore da 0 a 24.
    v_presenze := coalesce(r->'presenze', '[]'::jsonb);
    if jsonb_typeof(v_presenze) <> 'array' or jsonb_array_length(v_presenze) > 60 then
      raise exception 'Presenze non valide il %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    for x in select value from jsonb_array_elements(v_presenze) loop
      begin
        v_ore := (x->>'ore')::numeric;
      exception when others then
        v_ore := null;
      end;
      if v_ore is null or v_ore < 0 or v_ore > 24 then
        raise exception 'Le ore di % il % vanno da 0 a 24.', coalesce(x->>'nome', 'una persona'), to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
      end if;
      if nullif(x->>'employee_id', '') is not null then
        if not exists (select 1 from public.employees e where e.id::text = x->>'employee_id' and e.company_id = c) then
          raise exception 'Una persona del % non è della tua azienda.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '42501';
        end if;
      elsif nullif(x->>'subappaltatore_id', '') is not null then
        if not exists (select 1 from public.subappaltatori s where s.id::text = x->>'subappaltatore_id' and s.company_id = c) then
          raise exception 'Una ditta del % non è della tua azienda.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '42501';
        end if;
      else
        raise exception 'Ogni presenza è una persona o una ditta.' using errcode = '22023';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(v_presenze) e where e->>'employee_id' is not null)
       <> (select count(distinct e->>'employee_id') from jsonb_array_elements(v_presenze) e where e->>'employee_id' is not null) then
      raise exception 'Una persona è due volte nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    -- Foto: solo quelle caricate nella cartella di questa commessa.
    v_foto := coalesce(r->'foto_urls', '[]'::jsonb);
    if jsonb_typeof(v_foto) <> 'array' or jsonb_array_length(v_foto) > 30 or exists (
      select 1 from jsonb_array_elements_text(v_foto) u where position(v_prefisso in u) = 0
    ) then
      raise exception 'Foto non valide nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    v_materiali := coalesce(r->'materiali_usati', '[]'::jsonb);
    if jsonb_typeof(v_materiali) <> 'array' or jsonb_array_length(v_materiali) > 100 or exists (
      select 1 from jsonb_array_elements(v_materiali) m
       where btrim(coalesce(m->>'nome', '')) = ''
          or (m->>'quantita') !~ '^[0-9]+(\.[0-9]+)?$' or (m->>'quantita')::numeric <= 0
          or (nullif(m->>'order_item_id', '') is not null
              and not exists (select 1 from public.order_items i where i.id::text = m->>'order_item_id' and i.order_id = p_order_id))
    ) then
      raise exception 'Materiali non validi nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    v_mezzi := coalesce(r->'mezzi_usati', '[]'::jsonb);
    if jsonb_typeof(v_mezzi) <> 'array' or jsonb_array_length(v_mezzi) > 50 or exists (
      select 1 from jsonb_array_elements(v_mezzi) m
       where not exists (select 1 from public.mezzi z where z.id::text = m->>'mezzo_id' and z.company_id = c and z.deleted_at is null)
          or (nullif(m->>'ore', '') is not null and ((m->>'ore') !~ '^[0-9]+(\.[0-9]+)?$' or (m->>'ore')::numeric > 24))
    ) then
      raise exception 'Mezzi non validi nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    begin
      insert into public.campo_rapportini (company_id, order_id, user_id, role_type, data_lavoro, descrizione_lavori,
                                           ore_lavorate, fasi_lavorate, note, stato, ufficio_created_by,
                                           presenze, foto_urls, materiali_usati, mezzi_usati, meteo)
      values (c, p_order_id, v_autore, 'employee', v_giorno, left(btrim(r->>'descrizione'), 4000),
              0, v_fasi, nullif(left(btrim(coalesce(r->>'note', '')), 4000), ''), 'inviato', auth.uid(),
              case when jsonb_array_length(v_presenze) > 0 then v_presenze else null end,
              array(select jsonb_array_elements_text(v_foto)),
              case when jsonb_array_length(v_materiali) > 0 then v_materiali else null end,
              v_mezzi,
              -- Gli stessi cinque valori del cantiere (campo_rapportini_meteo_check); altro = non detto.
              case when r->>'meteo' in ('soleggiato', 'nuvoloso', 'pioggia', 'neve', 'vento') then r->>'meteo' end);
    exception when unique_violation then
      raise exception 'Il % c''è già un rapportino di questa persona: correggi quello invece di crearne un altro.', to_char(v_giorno, 'DD/MM/YYYY')
        using errcode = '23505';
    end;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ufficio_crea_rapportini(uuid, jsonb) from public, anon;
grant execute on function public.ufficio_crea_rapportini(uuid, jsonb) to authenticated;
