-- Correggere un rapportino, e sapere sempre chi ha cambiato cosa.
--   Lo storico lo scrive un trigger: vale da ufficio, cantiere, WhatsApp e Silvio.
--   «Correggi» su un approvato toglie ore, costi, fasi e righe vecchie e rimette le
--   nuove in un colpo solo. Se e' gia' in un rendiconto confermato o in una pagina
--   firmata del giornale, si ferma e dice perche'.
set local lock_timeout = '3s';
create table if not exists public.rapportino_modifiche (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rapportino_id uuid not null references public.campo_rapportini(id) on delete cascade,
  fatta_da uuid,
  fatta_da_nome text,
  fatta_il timestamptz not null default now(),
  motivo text,
  prima jsonb not null,
  dopo jsonb not null
);
create index if not exists rapportino_modifiche_rapportino on public.rapportino_modifiche (rapportino_id, fatta_il desc);
alter table public.rapportino_modifiche enable row level security;
revoke all on public.rapportino_modifiche from anon;
drop policy if exists rapportino_modifiche_lettura on public.rapportino_modifiche;
-- permesso rapportino_modifiche: chi vede la commessa e puo' modificarla.
create policy rapportino_modifiche_lettura on public.rapportino_modifiche for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id) and public.puo_vedere_commessa(order_id));

create or replace function public.rapportino_storico_trg() returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_prima jsonb := '{}'; v_dopo jsonb := '{}'; k text;
  v_old jsonb := to_jsonb(old); v_new jsonb := to_jsonb(new); v_nome text;
begin
  if old.stato = 'bozza' then return null; end if;
  foreach k in array array['descrizione_lavori','note','meteo','ore_lavorate','ore_straordinario','presenze','fasi_lavorate','materiali_usati','mezzi_usati','percentuale_avanzamento','campi_extra','foto_urls','data_lavoro'] loop
    if v_old->k is distinct from v_new->k then
      v_prima := v_prima || jsonb_build_object(k, v_old->k);
      v_dopo := v_dopo || jsonb_build_object(k, v_new->k);
    end if;
  end loop;
  if v_dopo = '{}'::jsonb then return null; end if;
  select btrim(concat_ws(' ', p.first_name, p.last_name)) into v_nome from public.profiles p where p.id = auth.uid();
  insert into public.rapportino_modifiche (company_id, order_id, rapportino_id, fatta_da, fatta_da_nome, motivo, prima, dopo)
  values (new.company_id, new.order_id, new.id, auth.uid(), v_nome, nullif(current_setting('app.motivo_modifica', true), ''), v_prima, v_dopo);
  return null;
end; $$;
revoke all on function public.rapportino_storico_trg() from public, anon, authenticated;
drop trigger if exists trg_rapportino_storico on public.campo_rapportini;
create trigger trg_rapportino_storico after update on public.campo_rapportini for each row execute function public.rapportino_storico_trg();

create or replace function public.rapportino_correggi(p_id uuid, p_updated_at timestamptz, p_campi jsonb, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r public.campo_rapportini;
  v_assegnato uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_era_approvato boolean;
begin
  select * into r from public.campo_rapportini where id = p_id for update;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Rapportino non disponibile.' using errcode = '42501';
  end if;
  perform public.assert_company_access(r.company_id);
  select assigned_to into v_assegnato from public.orders where id = r.order_id and deleted_at is null;
  if not found or public.has_permission_for_company(auth.uid(), 'can_edit_orders', r.company_id) is not true
     or public.check_staff_visibility(auth.uid(), v_assegnato) is not true
     or public.campo_e_ufficio(r.company_id) is not true
     or (r.user_id = auth.uid() and not coalesce(public.e_amministratore_di(r.company_id), false)) then
    raise exception 'Non puoi correggere questo rapportino.' using errcode = '42501';
  end if;
  if r.annullato_at is not null then raise exception 'Rapportino annullato: scrivine uno nuovo.' using errcode = '23514'; end if;
  if r.updated_at is distinct from p_updated_at then
    raise exception 'Il rapportino è cambiato: riaprilo prima di correggerlo.' using errcode = 'PT409';
  end if;
  v_era_approvato := coalesce(r.approvato, false);
  if v_era_approvato then
    if v_motivo is null then raise exception 'Scrivi il motivo della correzione.' using errcode = '22023'; end if;
    if exists (select 1 from public.appalto_rendiconto_righe a
                where a.stato <> 'bozza'
                  and (a.rapportino_id = p_id or a.voce_libera_id in (select v.id from public.rapportino_voci_libere v where v.rapportino_id = p_id))) then
      raise exception 'Non si può correggere: è già in un rendiconto confermato.' using errcode = '23514';
    end if;
    if exists (select 1 from public.giornale_lavori g where g.order_id = r.order_id and g.stato = 'firmata' and p_id = any(g.source_rapportini_ids)) then
      raise exception 'Non si può correggere: è in una pagina firmata del giornale. Scrivi un''annotazione sul giornale.' using errcode = '23514';
    end if;
  end if;
  perform set_config('app.motivo_modifica', coalesce(v_motivo, ''), true);

  if v_era_approvato then
    update public.campo_rapportini set stato = 'inviato', approvato = false where id = p_id;
    delete from public.avanzamento_dal_rapportino where rapportino_id = p_id;
  end if;

  update public.campo_rapportini set
    descrizione_lavori = case when p_campi ? 'descrizione_lavori' then p_campi->>'descrizione_lavori' else descrizione_lavori end,
    note = case when p_campi ? 'note' then p_campi->>'note' else note end,
    ore_lavorate = case when p_campi ? 'ore_lavorate' then (p_campi->>'ore_lavorate')::numeric else ore_lavorate end,
    ore_straordinario = case when p_campi ? 'ore_straordinario' then (p_campi->>'ore_straordinario')::numeric else ore_straordinario end,
    presenze = case when p_campi ? 'presenze' then p_campi->'presenze' else presenze end,
    fasi_lavorate = case when p_campi ? 'fasi_lavorate' then p_campi->'fasi_lavorate' else fasi_lavorate end,
    materiali_usati = case when p_campi ? 'materiali_usati' then p_campi->'materiali_usati' else materiali_usati end,
    mezzi_usati = case when p_campi ? 'mezzi_usati' then p_campi->'mezzi_usati' else mezzi_usati end,
    pdf_url = null
  where id = p_id;

  if v_era_approvato then
    update public.campo_rapportini
       set stato = 'approvato', approvato = true, approvato_da = r.approvato_da, approvato_at = r.approvato_at
     where id = p_id;
  end if;
  perform set_config('app.motivo_modifica', '', true);
end; $$;
revoke all on function public.rapportino_correggi(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.rapportino_correggi(uuid, timestamptz, jsonb, text) to authenticated;
