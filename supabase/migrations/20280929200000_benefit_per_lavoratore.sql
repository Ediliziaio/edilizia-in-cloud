alter table public.hr_profili
  add column if not exists buono_pasto_abilitato boolean not null default false,
  add column if not exists rimborso_km_abilitato boolean not null default false;

comment on column public.hr_profili.buono_pasto_abilitato is
  'Il lavoratore ha diritto al buono pasto (opt-in, default no).';
comment on column public.hr_profili.rimborso_km_abilitato is
  'Il lavoratore ha diritto al rimborso km con mezzo proprio (opt-in, default no).';

create or replace function public.matura_buono_pasto_da_giornata()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_company uuid;
  v_abilitato boolean;
  v_attivo boolean; v_modalita text; v_valore numeric; v_soglia numeric;
begin
  select company_id, buono_pasto_abilitato
    into v_company, v_abilitato
    from public.hr_profili where id = new.profilo_id;
  if v_company is null then return new; end if;

  select buono_pasto_attivo, buono_pasto_modalita, buono_pasto_valore, buono_pasto_soglia_ore
    into v_attivo, v_modalita, v_valore, v_soglia
    from public.impostazioni_benefit(v_company);

  if not coalesce(v_attivo, true) or not coalesce(v_abilitato, false) or v_modalita = 'ricevuta' then
    delete from public.hr_buoni_pasto
     where profilo_id = new.profilo_id and giorno = new.data
       and tipo = 'fisso' and stato = 'maturato';
    return new;
  end if;

  if coalesce(new.ore_lavorate, 0) >= coalesce(v_soglia, 6.0) then
    if exists (select 1 from public.hr_buoni_pasto
                where profilo_id = new.profilo_id and giorno = new.data and tipo = 'fisso') then
      update public.hr_buoni_pasto
         set importo = v_valore, updated_at = now()
       where profilo_id = new.profilo_id and giorno = new.data
         and tipo = 'fisso' and stato = 'maturato';
    else
      insert into public.hr_buoni_pasto (company_id, profilo_id, giorno, tipo, importo, stato)
      values (v_company, new.profilo_id, new.data, 'fisso', v_valore, 'maturato');
    end if;
  else
    delete from public.hr_buoni_pasto
     where profilo_id = new.profilo_id and giorno = new.data
       and tipo = 'fisso' and stato = 'maturato';
  end if;
  return new;
end $$;
