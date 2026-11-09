-- Annullando un rapportino, fasi senza sottofasi e avanzamento commessa tornano dove erano.
-- Il popup lo prometteva, ma tornavano indietro solo ore, costi e sottofasi.
-- Si fotografa il valore prima dell'approvazione; se qualcuno l'ha cambiato dopo, non si tocca.
set local lock_timeout = '3s';
create table if not exists public.avanzamento_dal_rapportino (
  id uuid primary key default gen_random_uuid(),
  rapportino_id uuid not null references public.campo_rapportini(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  phase_id uuid references public.order_work_phases(id) on delete cascade,
  percentuale_prima numeric not null, status_prima text, completata_il_prima timestamptz, completata_da_prima uuid,
  percentuale_dopo numeric not null, created_at timestamptz not null default now());
create unique index if not exists avanzamento_dal_rapportino_uno on public.avanzamento_dal_rapportino (rapportino_id, (coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid)));
alter table public.avanzamento_dal_rapportino enable row level security;
revoke all on public.avanzamento_dal_rapportino from anon, authenticated;
do $$
declare v_def text; a1 text; a2 text; a3 text; a4 text; n2 text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname='campo_rapportino_avanzamento_approvato' and pronamespace='public'::regnamespace;
  if position('avanzamento_dal_rapportino' in v_def)>0 then return; end if;
  a1 := E'  v_gestite uuid[] := \'{}\';\nbegin';
  a2 := E'      perform public.sottofase_lavoro_dai_rapportini(v_toccate);\n    end if;\n    return new;\n  end if;\n  if not (new.stato = \'approvato\' and old.stato is distinct from \'approvato\') then';
  a3 := E'  if coalesce(jsonb_array_length(new.fasi_lavorate),0) = 0 then\n    update public.orders';
  a4 := E'      update public.order_work_phases\n         set percentuale=nuova,';
  if position(a1 in v_def)=0 or position(a2 in v_def)=0 or position(a3 in v_def)=0 or position(a4 in v_def)=0 then raise exception 'testo non riconosciuto'; end if;
  n2 := E'      perform public.sottofase_lavoro_dai_rapportini(v_toccate);\n    end if;\n'
  || $t$
    -- Fasi senza sottofasi: tornano dove erano, salvo che qualcuno le abbia cambiate dopo.
    if jsonb_typeof(old.fasi_lavorate) = 'array' then
      for r in
        select fp.id, fp.percentuale as attuale, av.percentuale_prima, av.status_prima, av.completata_il_prima, av.completata_da_prima, av.percentuale_dopo
          from public.order_work_phases fp
          left join public.avanzamento_dal_rapportino av on av.rapportino_id = old.id and av.phase_id = fp.id
         where fp.order_id = old.order_id
           and fp.id::text in (select e->>'phase_id' from jsonb_array_elements(old.fasi_lavorate) e)
           and not exists (select 1 from public.order_work_subphases s where s.phase_id = fp.id)
      loop
        v_dich := (select nullif(e->>'percentuale','')::numeric from jsonb_array_elements(old.fasi_lavorate) e where e->>'phase_id' = r.id::text limit 1);
        if r.attuale is distinct from coalesce(r.percentuale_dopo, round(v_dich)) then continue; end if;
        v_altre := coalesce((select max(nullif(e->>'percentuale','')::numeric)
          from public.campo_rapportini x, jsonb_array_elements(x.fasi_lavorate) e
         where x.order_id = old.order_id and x.id <> old.id and x.stato = 'approvato' and e->>'phase_id' = r.id::text), 0);
        v_target := greatest(coalesce(r.percentuale_prima, 0), round(v_altre));
        update public.order_work_phases
           set percentuale = v_target,
               status = case when v_target >= 100 then 'completata' when v_target > 0 then 'in_corso' else coalesce(r.status_prima, 'da_iniziare') end,
               completata_il = case when v_target >= 100 then completata_il else r.completata_il_prima end,
               completata_da = case when v_target >= 100 then completata_da else r.completata_da_prima end,
               updated_at = now()
         where id = r.id;
      end loop;
    end if;
    -- Rapportino senza fasi: l'avanzamento era sulla commessa.
    if coalesce(jsonb_array_length(old.fasi_lavorate), 0) = 0 then
      select o.percentuale_avanzamento as attuale, av.percentuale_prima, av.percentuale_dopo into r
        from public.orders o
        left join public.avanzamento_dal_rapportino av on av.rapportino_id = old.id and av.phase_id is null
       where o.id = old.order_id;
      if r.attuale is not distinct from coalesce(r.percentuale_dopo, old.percentuale_avanzamento) and coalesce(old.percentuale_avanzamento, 0) > 0 then
        v_altre := coalesce((select max(x.percentuale_avanzamento) from public.campo_rapportini x
           where x.order_id = old.order_id and x.id <> old.id and x.stato = 'approvato' and coalesce(jsonb_array_length(x.fasi_lavorate), 0) = 0), 0);
        update public.orders set percentuale_avanzamento = greatest(coalesce(r.percentuale_prima, 0), v_altre) where id = old.order_id;
      end if;
    end if;
$t$ || E'    return new;\n  end if;\n  if not (new.stato = \'approvato\' and old.stato is distinct from \'approvato\') then';
  v_def := replace(v_def, a2, n2);
  v_def := replace(v_def, a1, E'  v_gestite uuid[] := \'{}\';\n  r record;\n  v_dich numeric;\n  v_altre numeric;\n  v_target numeric;\nbegin');
  v_def := replace(v_def, a3, E'  if coalesce(jsonb_array_length(new.fasi_lavorate),0) = 0 then\n    insert into public.avanzamento_dal_rapportino (rapportino_id, order_id, percentuale_prima, percentuale_dopo)\n    select new.id, new.order_id, coalesce(o.percentuale_avanzamento,0), greatest(coalesce(o.percentuale_avanzamento,0),least(100,greatest(0,coalesce(new.percentuale_avanzamento,0))))\n      from public.orders o where o.id=new.order_id and o.company_id=new.company_id on conflict do nothing;\n    update public.orders');
  v_def := replace(v_def, a4, E'      insert into public.avanzamento_dal_rapportino (rapportino_id, order_id, phase_id, percentuale_prima, status_prima, completata_il_prima, completata_da_prima, percentuale_dopo)\n      values (new.id, new.order_id, f.id, coalesce(f.percentuale,0), f.status, f.completata_il, f.completata_da, nuova) on conflict do nothing;\n      update public.order_work_phases\n         set percentuale=nuova,');
  execute v_def;
end $$;
