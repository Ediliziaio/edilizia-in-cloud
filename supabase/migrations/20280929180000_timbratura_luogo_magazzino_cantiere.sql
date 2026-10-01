-- Timbratura: la timbrata porta con sé il luogo (magazzino/ufficio oppure cantiere).
alter table public.campo_timbrature
  add column if not exists sede_id uuid references public.hr_sedi(id) on delete set null,
  add column if not exists riferimento_tipo text,
  add column if not exists riferimento_id uuid,
  add column if not exists posizione_esito text,
  add column if not exists distanza_mt numeric;

alter table public.campo_timbrature drop constraint if exists campo_timbrature_posizione_esito_check;
alter table public.campo_timbrature add constraint campo_timbrature_posizione_esito_check
  check (posizione_esito is null or posizione_esito = any (array[
    'dentro'::text, 'fuori'::text, 'senza_gps'::text,
    'riferimento_senza_coordinate'::text, 'nessun_riferimento'::text]));

create index if not exists idx_campo_timbrature_sede
  on public.campo_timbrature(sede_id) where sede_id is not null;

create or replace function public.mirror_campo_timbratura_su_hr()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profilo uuid;
  v_esistente uuid;
  v_nuova uuid;
begin
  if new.hr_timbratura_id is not null then
    return new;
  end if;

  v_profilo := public.hr_profilo_da_user(new.user_id, new.company_id);
  if v_profilo is null then
    return new;
  end if;

  select ht.id into v_esistente
    from hr_timbrature ht
   where ht.profilo_id = v_profilo
     and ht.tipo = new.tipo
     and ht."timestamp" between new.timestamp_evento - interval '2 minutes'
                            and new.timestamp_evento + interval '2 minutes'
   order by abs(extract(epoch from (ht."timestamp" - new.timestamp_evento)))
   limit 1;

  if v_esistente is not null then
    new.hr_timbratura_id := v_esistente;
    select ht.posizione_esito, ht.distanza_mt, ht.riferimento_tipo, ht.riferimento_id,
           coalesce(new.sede_id, ht.sede_id)
      into new.posizione_esito, new.distanza_mt, new.riferimento_tipo, new.riferimento_id,
           new.sede_id
      from hr_timbrature ht
     where ht.id = v_esistente;
    return new;
  end if;

  insert into hr_timbrature (company_id, profilo_id, tipo, "timestamp", lat, lng, fonte, note, order_id, sede_id)
  values (new.company_id, v_profilo, new.tipo, new.timestamp_evento,
          new.gps_lat, new.gps_lng, coalesce(new.fonte, 'app'), new.note, new.order_id, new.sede_id)
  returning id, posizione_esito, distanza_mt, riferimento_tipo, riferimento_id, sede_id
  into v_nuova, new.posizione_esito, new.distanza_mt, new.riferimento_tipo, new.riferimento_id, new.sede_id;

  new.hr_timbratura_id := v_nuova;
  return new;
end $$;

drop trigger if exists trg_mirror_campo_timbratura on public.campo_timbrature;
create trigger trg_mirror_campo_timbratura
  before insert on public.campo_timbrature
  for each row execute function public.mirror_campo_timbratura_su_hr();
