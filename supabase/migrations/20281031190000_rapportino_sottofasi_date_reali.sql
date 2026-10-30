-- Rapportino e sottofasi: le date reali (31/10/2026).
--
-- Due cose che non tornavano.
--   · Una sottofase spuntata in un rapportino diventava «fatta» quando il
--     rapportino veniva APPROVATO: fatta_il = il momento dell'approvazione.
--     Un rapportino del lunedì approvato il giovedì faceva sembrare la
--     sottofase finita tre giorni dopo, e così la fase (completata_il).
--   · Dal cantiere si poteva solo dire «finita»: non che ci si era lavorato.
--     Una sottofase di cinque giorni non aveva un inizio reale.
--
-- Cosa cambia.
--   · All'approvazione, fatta_il è il giorno del lavoro (data_lavoro, a
--     mezzogiorno in Italia) e fatta_da chi ha scritto il rapportino; la fase
--     chiusa da quelle sottofasi prende come chiusura l'ultima di esse.
--   · fasi_lavorate[].sottofasi_lavorate: le sottofasi su cui si è lavorato quel
--     giorno. All'approvazione, per queste e per le finite:
--     iniziata_il = il primo giorno di lavoro, giorni_lavorati + 1.
--
-- campo_rapportino_avanzamento_approvato si cambia sul posto (replace sul
-- testo della funzione), senza ricopiarla: se il testo atteso non c'è più la
-- migrazione si ferma invece di fare finta di niente.

set local lock_timeout = '3s';

alter table public.order_work_subphases
  add column if not exists iniziata_il date,
  add column if not exists giorni_lavorati integer not null default 0;

do $$
declare
  v_def text;
  v_nuova text;
  v_vecchio constant text := $vecchio$      if jsonb_typeof(v->'sottofasi_fatte')='array' then
        update public.order_work_subphases s set fatta=true
         where s.phase_id=f.id and not s.fatta
           and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'));
      end if;$vecchio$;
  v_nuovo constant text := $nuovo$      if jsonb_typeof(v->'sottofasi_fatte')='array' then
        with fatte as (
          update public.order_work_subphases s set fatta=true
           where s.phase_id=f.id and not s.fatta
             and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'))
          returning s.id
        ) select coalesce(array_agg(id), '{}') into v_fatte from fatte;
        -- Finita il giorno del lavoro, non quello dell'approvazione (31/10/2026).
        if new.data_lavoro is not null and cardinality(v_fatte) > 0 then
          update public.order_work_subphases
             set fatta_il = ((new.data_lavoro::timestamp + interval '12 hours') at time zone 'Europe/Rome'),
                 fatta_da = coalesce(new.user_id, fatta_da)
           where id = any(v_fatte);
          update public.order_work_phases fp
             set completata_il = (select max(s.fatta_il) from public.order_work_subphases s where s.phase_id = f.id)
           where fp.id = f.id and fp.status = 'completata'
             and fp.completata_il > (select max(s.fatta_il) from public.order_work_subphases s where s.phase_id = f.id);
        end if;
      end if;
      -- Le sottofasi su cui si è lavorato quel giorno (le finite comprese): primo giorno e giorni di lavoro.
      if new.data_lavoro is not null then
        update public.order_work_subphases s
           set iniziata_il = least(coalesce(s.iniziata_il, new.data_lavoro), new.data_lavoro),
               giorni_lavorati = s.giorni_lavorati + 1
         where s.phase_id = f.id
           and s.id::text in (
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_lavorate') = 'array' then v->'sottofasi_lavorate' else '[]'::jsonb end)
             union
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_fatte') = 'array' then v->'sottofasi_fatte' else '[]'::jsonb end));
      end if;$nuovo$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'campo_rapportino_avanzamento_approvato';
  if position('sottofasi_lavorate' in v_def) > 0 then
    return;  -- già fatto
  end if;
  if position(v_vecchio in v_def) = 0 or position('  nuova integer;' in v_def) = 0 then
    raise exception 'campo_rapportino_avanzamento_approvato è cambiata: va rivista a mano.';
  end if;
  v_nuova := replace(replace(v_def, v_vecchio, v_nuovo), '  nuova integer;', E'  nuova integer;\n  v_fatte uuid[];');
  execute v_nuova;
end $$;
