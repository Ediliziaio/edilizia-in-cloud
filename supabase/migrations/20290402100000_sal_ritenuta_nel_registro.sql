-- La ritenuta di garanzia dei SAL della commessa entra nel registro delle ritenute (15/11/2026).
--
-- Il certificato di pagamento di un SAL (sal_certificati) toglie la ritenuta dal netto da fatturare,
-- ma fino a oggi non la scriveva da nessuna parte: nel registro «Ritenute a garanzia» comparivano solo
-- quelle dei subappaltatori e dei SAL di contratto della generale. Così nessuno ricordava di farsela
-- restituire al collaudo. Ora, quando un SAL con certificato esce dalla bozza (o il certificato di un
-- SAL già emesso cambia), la sua parte di ritenuta va nel registro come ritenuta «attiva»
-- (trattenuta dal committente all'impresa).
--
-- La ritenuta del certificato è cumulativa («a tutto oggi»): nel registro va la parte di questo SAL,
-- cioè la sua meno quella del certificato emesso prima. Una riga per SAL (sal_record_id).
--
-- Il registro è una scrittura fiscale (private.fiscalita_guard): la può fare solo un amministratore.
-- Se emette un utente d'ufficio il SAL si emette lo stesso e la ritenuta resta fuori dal registro:
-- un errore qui non deve mai fermare un verbale.

alter table public.ritenute_garanzia
  add column if not exists sal_record_id uuid references public.sal_records(id) on delete set null;

create unique index if not exists ritenute_garanzia_sal_record_unico
  on public.ritenute_garanzia (sal_record_id) where sal_record_id is not null;

comment on column public.ritenute_garanzia.sal_record_id is
  'Il verbale SAL della commessa (sal_records) da cui viene la ritenuta attiva. sal_id è dei SAL dei subappaltatori. 15/11/2026.';

create or replace function public.sal_ritenuta_nel_registro(p_sal uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  c record;
  v_prima numeric := 0;
  v_quota numeric;
  v_esistente record;
  v_svincolo date;
  v_id uuid;
begin
  select r.id, r.company_id, r.order_id, r.numero_sal, r.stato into s from public.sal_records r where r.id = p_sal;
  if s.id is null or s.stato = 'bozza' then return null; end if;
  if coalesce(auth.role(), '') <> 'service_role' and public.e_amministratore_di(s.company_id) is distinct from true then
    raise exception 'Solo un amministratore scrive nel registro delle ritenute.' using errcode = '42501';
  end if;
  select * into c from public.sal_certificati where sal_id = p_sal;
  if c.sal_id is null then return null; end if;

  -- La ritenuta del certificato emesso prima di questo: la differenza è la parte di questo SAL.
  select coalesce(sc.ritenuta, 0) into v_prima
    from public.sal_records r join public.sal_certificati sc on sc.sal_id = r.id
   where r.order_id = s.order_id and r.numero_sal < s.numero_sal and r.stato <> 'bozza'
   order by r.numero_sal desc limit 1;
  v_quota := round(coalesce(c.ritenuta, 0) - coalesce(v_prima, 0), 2);

  select id, importo, stato into v_esistente from public.ritenute_garanzia where sal_record_id = p_sal;
  if v_esistente.id is not null then
    if v_esistente.stato = 'trattenuta' and v_quota > 0 and v_esistente.importo <> v_quota then
      update public.ritenute_garanzia
         set importo = v_quota, percentuale_applicata = c.ritenuta_pct,
             note = format('Ritenuta di garanzia del SAL n. %s, certificato rettificato il %s', s.numero_sal, to_char(current_date, 'DD/MM/YYYY'))
       where id = v_esistente.id;
    end if;
    return v_esistente.id;
  end if;
  if v_quota <= 0 then return null; end if;

  -- Svincolo «dopo N mesi dalla fine lavori», se il contratto lo dice; al collaudo resta da fissare.
  select case when o.ritenuta_garanzia->>'svincolo' = 'mesi' and o.work_end_date is not null
              then (o.work_end_date + make_interval(months => coalesce(nullif(o.ritenuta_garanzia->>'mesi', '')::int, 12)))::date
         end
    into v_svincolo from public.orders o where o.id = s.order_id;

  insert into public.ritenute_garanzia (company_id, order_id, sal_record_id, direzione, controparte, importo, percentuale_applicata, stato, data_svincolo_prevista, note)
  select s.company_id, s.order_id, p_sal, 'attiva', o.client_name, v_quota, c.ritenuta_pct, 'trattenuta', v_svincolo,
         format('Ritenuta di garanzia del SAL n. %s della commessa %s', s.numero_sal, coalesce(o.order_code, ''))
    from public.orders o where o.id = s.order_id
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.sal_ritenuta_nel_registro(uuid) from public, anon;
grant execute on function public.sal_ritenuta_nel_registro(uuid) to authenticated, service_role;

comment on function public.sal_ritenuta_nel_registro(uuid) is
  'Scrive nel registro ritenute la parte di ritenuta di un SAL emesso col certificato. Solo amministratori (fiscalita_guard). 15/11/2026.';

-- Il trigger: chiamato quando il SAL esce dalla bozza o il certificato cambia. Non ferma mai il verbale.
create or replace function public.trg_sal_ritenuta_nel_registro()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sal uuid;
begin
  if tg_table_name = 'sal_records' then
    if old.stato is distinct from 'bozza' or new.stato = 'bozza' then
      return new;
    end if;
    v_sal := new.id;
  else
    v_sal := new.sal_id;
  end if;
  begin
    perform public.sal_ritenuta_nel_registro(v_sal);
  exception when others then
    -- Utente non amministratore (registro fiscale) o periodo chiuso: il SAL va avanti, la ritenuta no.
    raise notice 'Ritenuta del SAL % non registrata: %', v_sal, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.trg_sal_ritenuta_nel_registro() from public, anon, authenticated;

drop trigger if exists trg_sal_ritenuta_nel_registro on public.sal_records;
create trigger trg_sal_ritenuta_nel_registro
  after update of stato on public.sal_records
  for each row execute function public.trg_sal_ritenuta_nel_registro();

drop trigger if exists trg_sal_certificato_ritenuta_nel_registro on public.sal_certificati;
create trigger trg_sal_certificato_ritenuta_nel_registro
  after insert or update of ritenuta, ritenuta_pct on public.sal_certificati
  for each row execute function public.trg_sal_ritenuta_nel_registro();
