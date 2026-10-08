-- Modelli di fasi per azienda (07/10/2026).
--
-- «Scegli le fasi» offriva otto modelli scritti nel codice, uguali per tutte le
-- aziende, che creavano solo i nomi delle fasi. Ora ogni azienda ha i SUOI
-- modelli, con le sottofasi, e li cambia, li toglie e ne aggiunge nelle
-- Impostazioni. Gli otto di partenza non sono più fissi: la prima volta che
-- l'azienda apre la pagina dei modelli diventano suoi (inizializza_modelli_fasi),
-- e da lì sono modelli come gli altri: modificabili ed eliminabili.
--
-- Cosa c'è.
--   · work_phase_templates → work_phase_template_phases → work_phase_template_subphases:
--     il modello è un albero. Le tabelle sono CHIUSE in scrittura: si scrivono
--     solo con le RPC qui sotto, che salvano tutto l'albero o niente (stesso
--     schema di campo_regole_azienda). Si leggono con la RLS.
--   · company_fasi_settings: una riga per azienda. Per ora, se i modelli di partenza
--     sono già stati portati tra i suoi; poi vi si aggiungono le regole dell'azienda.
--   · salva_modello_fasi, elimina_modello_fasi, salva_commessa_come_modello,
--     inizializza_modelli_fasi: permesso can_edit_settings_orders nell'azienda passata.
--   · aggiungi_fasi_commessa: crea fasi E sottofasi in una commessa in un colpo
--     solo (permesso can_edit_orders nell'azienda della COMMESSA).
--
-- Additiva: tabelle e funzioni nuove, nessun dato esistente cambia. Dipende dalla
-- migrazione delle sottofasi (order_work_subphases).

set local lock_timeout = '3s';

create table if not exists public.work_phase_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  hint text check (hint is null or length(hint) <= 200),
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_phase_templates_nome_uk on public.work_phase_templates (company_id, lower(btrim(name)));
create index if not exists work_phase_templates_azienda_idx on public.work_phase_templates (company_id, position);

create table if not exists public.work_phase_template_phases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.work_phase_templates(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0
);
create index if not exists work_phase_template_phases_modello_idx on public.work_phase_template_phases (template_id, position);
create index if not exists work_phase_template_phases_azienda_idx on public.work_phase_template_phases (company_id);

create table if not exists public.work_phase_template_subphases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_phase_id uuid not null references public.work_phase_template_phases(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0,
  peso integer not null default 1 check (peso between 1 and 100)
);
create index if not exists work_phase_template_subphases_fase_idx on public.work_phase_template_subphases (template_phase_id, position);
create index if not exists work_phase_template_subphases_azienda_idx on public.work_phase_template_subphases (company_id);

create table if not exists public.company_fasi_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  modelli_inizializzati boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: solo lettura per i client; si scrive con le RPC
-- ---------------------------------------------------------------------------
alter table public.work_phase_templates enable row level security;
alter table public.work_phase_template_phases enable row level security;
alter table public.work_phase_template_subphases enable row level security;
alter table public.company_fasi_settings enable row level security;

revoke all on public.work_phase_templates, public.work_phase_template_phases,
              public.work_phase_template_subphases, public.company_fasi_settings from anon, authenticated;
grant select on public.work_phase_templates, public.work_phase_template_phases,
                public.work_phase_template_subphases, public.company_fasi_settings to authenticated;

drop policy if exists modelli_fasi_lettura on public.work_phase_templates;
create policy modelli_fasi_lettura on public.work_phase_templates for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists modelli_fasi_fasi_lettura on public.work_phase_template_phases;
create policy modelli_fasi_fasi_lettura on public.work_phase_template_phases for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists modelli_fasi_sottofasi_lettura on public.work_phase_template_subphases;
create policy modelli_fasi_sottofasi_lettura on public.work_phase_template_subphases for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists fasi_impostazioni_lettura on public.company_fasi_settings;
create policy fasi_impostazioni_lettura on public.company_fasi_settings for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists blocco_utente_bloccato on public.work_phase_templates;
create policy blocco_utente_bloccato on public.work_phase_templates as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.work_phase_template_phases;
create policy blocco_utente_bloccato on public.work_phase_template_phases as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.work_phase_template_subphases;
create policy blocco_utente_bloccato on public.work_phase_template_subphases as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.company_fasi_settings;
create policy blocco_utente_bloccato on public.company_fasi_settings as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ---------------------------------------------------------------------------
-- salva_modello_fasi: crea o riscrive tutto l'albero di un modello
--   p_modello = { id?, nome, descrizione?, fasi: [ { nome, sottofasi: [ { nome, peso } ] } ] }
-- ---------------------------------------------------------------------------
create or replace function public.salva_modello_fasi(p_company_id uuid, p_modello jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_modello->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_modello->>'nome', ''));
  v_desc text := nullif(btrim(coalesce(p_modello->>'descrizione', '')), '');
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_pos integer := 0;
  v_pos_sotto integer;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  if v_nome = '' or length(v_nome) > 80 then
    raise exception 'Dai un nome al modello (massimo 80 caratteri).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_modello->'fasi') is distinct from 'array' or jsonb_array_length(p_modello->'fasi') = 0 then
    raise exception 'Un modello ha almeno una fase.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_modello->'fasi') > 60 then
    raise exception 'Troppe fasi: al massimo 60.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.work_phase_templates (company_id, name, hint, position)
    values (p_company_id, v_nome, v_desc,
            coalesce((select max(position) + 1 from public.work_phase_templates where company_id = p_company_id), 0))
    returning id into v_id;
  else
    update public.work_phase_templates
       set name = v_nome, hint = v_desc, updated_at = now()
     where id = v_id and company_id = p_company_id;
    if not found then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    -- Si riscrive tutto l'albero: i modelli sono piccoli e nessuno ne tiene l'id delle fasi.
    delete from public.work_phase_template_phases where template_id = v_id;
  end if;

  for v_fase in select value from jsonb_array_elements(p_modello->'fasi') loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.work_phase_template_phases (company_id, template_id, name, position)
    values (p_company_id, v_id, left(btrim(v_fase->>'nome'), 160), v_pos)
    returning id into v_fase_id;
    v_pos := v_pos + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.work_phase_template_subphases (company_id, template_phase_id, name, position, peso)
        values (p_company_id, v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_pos = 0 then
    raise exception 'Un modello ha almeno una fase con un nome.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create or replace function public.elimina_modello_fasi(p_company_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  delete from public.work_phase_templates where id = p_id and company_id = p_company_id;
end;
$$;

-- Le fasi (e sottofasi) di una commessa diventano un modello dell'azienda.
create or replace function public.salva_commessa_come_modello(p_order_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fasi jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di salvare questo modello.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'nome', f.name,
             'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', s.name, 'peso', s.peso) order by s.position, s.created_at)
                                      from public.order_work_subphases s where s.phase_id = f.id), '[]'::jsonb))
           order by f.position, f.created_at), '[]'::jsonb)
    into v_fasi
    from public.order_work_phases f
   where f.order_id = p_order_id;

  return public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', p_nome, 'descrizione', null, 'fasi', v_fasi));
end;
$$;

-- I modelli di partenza (quelli che il client ha nel codice) diventano modelli dell'azienda.
--   p_modelli = [ { nome, descrizione?, fasi: [ { nome, sottofasi: [] } ] } ]
-- La prima volta li porta tutti; poi non fa più niente, a meno che si chieda di
-- rimettere quelli che mancano (p_solo_mancanti): per nome, senza toccare gli altri.
create or replace function public.inizializza_modelli_fasi(p_company_id uuid, p_modelli jsonb, p_solo_mancanti boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gia boolean;
  v_modello jsonb;
  v_nome text;
  v_aggiunti integer := 0;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_modelli) is distinct from 'array' or jsonb_array_length(p_modelli) > 40 then
    raise exception 'Elenco di modelli non valido.' using errcode = '22023';
  end if;

  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;
  -- Il blocco serializza due amministratori che aprono la pagina insieme: il secondo trova già fatto.
  select modelli_inizializzati into v_gia from public.company_fasi_settings where company_id = p_company_id for update;
  if v_gia and not p_solo_mancanti then
    return 0;
  end if;

  for v_modello in select value from jsonb_array_elements(p_modelli) loop
    v_nome := btrim(coalesce(v_modello->>'nome', ''));
    continue when v_nome = '';
    continue when exists (select 1 from public.work_phase_templates t
                           where t.company_id = p_company_id and lower(btrim(t.name)) = lower(v_nome));
    begin
      perform public.salva_modello_fasi(p_company_id, v_modello - 'id');
      v_aggiunti := v_aggiunti + 1;
    exception when unique_violation then null;
    end;
  end loop;

  update public.company_fasi_settings set modelli_inizializzati = true, updated_at = now() where company_id = p_company_id;
  return v_aggiunti;
end;
$$;

-- Fasi e sottofasi in una commessa, in un colpo solo.
--   p_fasi = [ { nome, sottofasi: [ { nome, peso } ] } ]
create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_base integer;
  v_aggiunte integer := 0;
  v_pos_sotto integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da aggiungere.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;

  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.order_work_phases (company_id, order_id, name, position)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.order_work_subphases (phase_id, name, position, peso)
        values (v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_aggiunte = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$$;

revoke all on function public.salva_modello_fasi(uuid, jsonb) from public, anon;
grant execute on function public.salva_modello_fasi(uuid, jsonb) to authenticated;
revoke all on function public.elimina_modello_fasi(uuid, uuid) from public, anon;
grant execute on function public.elimina_modello_fasi(uuid, uuid) to authenticated;
revoke all on function public.salva_commessa_come_modello(uuid, text) from public, anon;
grant execute on function public.salva_commessa_come_modello(uuid, text) to authenticated;
revoke all on function public.inizializza_modelli_fasi(uuid, jsonb, boolean) from public, anon;
grant execute on function public.inizializza_modelli_fasi(uuid, jsonb, boolean) to authenticated;
revoke all on function public.aggiungi_fasi_commessa(uuid, jsonb) from public, anon;
grant execute on function public.aggiungi_fasi_commessa(uuid, jsonb) to authenticated;
