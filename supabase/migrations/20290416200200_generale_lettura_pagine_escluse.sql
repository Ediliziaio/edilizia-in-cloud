-- Commessa generale dai documenti, lotto 1: il browser riconosce già sul testo nativo le pagine
-- con dati personali (documenti d'identità, autocertificazioni) e le registra «escluse».
-- ─── Creazione dal browser ─────────────────────────────────────────────────────
-- p_file:   [{id, nome, documento, percorso, mime, byte, pagine, strutturato}]
-- p_pagine: [{file_id, numero, stato, classe, testo, percorso, hash}] — stato fra in_coda, testo,
--           bianca, parser; la classe la decide il browser sul testo nativo.
create or replace function public.generale_lettura_crea(
  p_company uuid, p_tipo text, p_forma text, p_generale uuid,
  p_file jsonb, p_pagine jsonb, p_strutturati jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_p jsonb;
  v_f jsonb;
begin
  if auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company) is not true then
    raise exception 'Serve il permesso di modificare le commesse' using errcode = '42501';
  end if;
  if jsonb_typeof(p_file) <> 'array' or jsonb_array_length(p_file) = 0 or jsonb_array_length(p_file) > 30 then
    raise exception 'Carica da 1 a 30 file';
  end if;
  if jsonb_typeof(p_pagine) <> 'array' or jsonb_array_length(p_pagine) > 2000 then
    raise exception 'Troppe pagine: il massimo è 2.000 per lettura';
  end if;
  -- I file stanno nella cartella dell'azienda: niente percorsi di altri.
  for v_f in select * from jsonb_array_elements(p_file) loop
    if coalesce(v_f->>'percorso', '') !~ ('^' || p_company::text || '/generali-letture/[^.][^/]*/') then
      raise exception 'Percorso del file non valido';
    end if;
  end loop;
  if p_generale is not null and not exists (
    select 1 from public.orders o where o.id = p_generale and o.company_id = p_company and o.workflow_kind = 'generale'
  ) then
    raise exception 'Commessa generale non trovata';
  end if;

  insert into public.generale_letture (company_id, created_by, tipo, forma, generale_id, file, strutturati)
  values (p_company, auth.uid(), p_tipo, nullif(p_forma, ''), p_generale, p_file, coalesce(p_strutturati, '{}'::jsonb))
  returning id into v_id;

  for v_p in select * from jsonb_array_elements(p_pagine) loop
    if coalesce(v_p->>'stato', '') not in ('in_coda','testo','bianca','parser','esclusa') then
      raise exception 'Stato di pagina non valido';
    end if;
    if v_p->>'percorso' is not null and v_p->>'percorso' !~ ('^' || p_company::text || '/generali-letture/[^.][^/]*/') then
      raise exception 'Percorso della pagina non valido';
    end if;
    insert into public.generale_lettura_pagine (lettura_id, company_id, file_id, numero, stato, classe, testo, percorso, hash)
    values (v_id, p_company, v_p->>'file_id', (v_p->>'numero')::int, v_p->>'stato',
            left(v_p->>'classe', 80),
            -- Una pagina esclusa (dati personali) non porta il suo testo, anche se il browser lo manda.
            case when v_p->>'stato' = 'esclusa' then null else left(v_p->>'testo', 200000) end,
            v_p->>'percorso', left(v_p->>'hash', 80));
  end loop;

  update public.generale_letture set stima_eur = public.generale_lettura_stima(v_id) where id = v_id;
  return v_id;
end $$;
revoke all on function public.generale_lettura_crea(uuid, text, text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.generale_lettura_crea(uuid, text, text, uuid, jsonb, jsonb, jsonb) to authenticated;

