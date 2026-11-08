-- I lavori che l'azienda fa (07/11/2026): il «profilo lavori».
--
-- Un'azienda che fa solo serramenti non deve vedersi proporre modelli di
-- fotovoltaico o di nuova costruzione. I moduli attivi non bastano a saperlo:
-- li dà il piano, e quasi tutte le aziende li hanno tutti. Quindi l'azienda lo
-- dice: company_fasi_settings.tipi_lavoro. NULL = non l'ha ancora detto, e
-- l'app parte dal settore dell'azienda (companies.sector).
--
-- I valori ammessi sono quelli di src/lib/orders/tipiLavoro.ts.
-- Idempotente: ADD COLUMN IF NOT EXISTS e CREATE OR REPLACE.

alter table public.company_fasi_settings
  add column if not exists tipi_lavoro text[];

comment on column public.company_fasi_settings.tipi_lavoro is
  'I tipi di lavoro che l''azienda fa (serramenti, bagno, ...): filtrano modelli e proposte alla nascita di una commessa. NULL = dedotti dal settore.';

create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_modello uuid;
  v_controlli text[];
  v_ammessi constant text[] := array['indirizzo', 'date', 'fasi', 'chi', 'pagamenti'];
  v_tipi_ammessi constant text[] := array['serramenti', 'bagno', 'ristrutturazione', 'nuova_costruzione',
    'fotovoltaico', 'tetto', 'cappotto', 'impianti', 'pavimenti', 'pittura', 'piscine', 'manutenzione'];
  v_tipi text[];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;
  if p_valori ? 'chi_spunta' then
    if (p_valori->>'chi_spunta') not in ('tutti', 'chi_la_fa', 'capi') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set chi_spunta = p_valori->>'chi_spunta', updated_at = now()
     where company_id = p_company_id;
  end if;
  if p_valori ? 'peso_media' then
    if (p_valori->>'peso_media') not in ('uguale', 'durata', 'venduto') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set peso_media = p_valori->>'peso_media', updated_at = now()
     where company_id = p_company_id;
    perform public.recompute_order_progress(o.order_id)
      from (select distinct order_id from public.order_work_phases where company_id = p_company_id) o;
  end if;
  if p_valori ? 'modello_fasi_predefinito' then
    v_modello := nullif(p_valori->>'modello_fasi_predefinito', '')::uuid;
    if v_modello is not null
       and not exists (select 1 from public.work_phase_templates t where t.id = v_modello and t.company_id = p_company_id) then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    update public.company_fasi_settings
       set modello_fasi_predefinito = v_modello, updated_at = now()
     where company_id = p_company_id;
  end if;
  if p_valori ? 'controlli_avvio' then
    if jsonb_typeof(p_valori->'controlli_avvio') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements_text(p_valori->'controlli_avvio') x where x <> all (v_ammessi)) then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    select coalesce(array_agg(c order by array_position(v_ammessi, c)), '{}'::text[])
      into v_controlli
      from (select distinct x as c from jsonb_array_elements_text(p_valori->'controlli_avvio') x) s;
    update public.company_fasi_settings
       set controlli_avvio = v_controlli, updated_at = now()
     where company_id = p_company_id;
  end if;
  -- I lavori che l'azienda fa: un elenco dei tipi ammessi, oppure null per tornare al settore.
  if p_valori ? 'tipi_lavoro' then
    if jsonb_typeof(p_valori->'tipi_lavoro') = 'null' then
      v_tipi := null;
    elsif jsonb_typeof(p_valori->'tipi_lavoro') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements_text(p_valori->'tipi_lavoro') x where x <> all (v_tipi_ammessi)) then
      raise exception 'Tipo di lavoro non valido.' using errcode = '22023';
    else
      select coalesce(array_agg(t order by array_position(v_tipi_ammessi, t)), '{}'::text[])
        into v_tipi
        from (select distinct x as t from jsonb_array_elements_text(p_valori->'tipi_lavoro') x) s;
    end if;
    update public.company_fasi_settings
       set tipi_lavoro = v_tipi, updated_at = now()
     where company_id = p_company_id;
  end if;
end;
$function$;

revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated, service_role;
