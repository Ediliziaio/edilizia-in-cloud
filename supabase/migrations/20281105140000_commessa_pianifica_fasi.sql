-- Le fasi della commessa prendono i tempi dal cronoprogramma del preventivo firmato (31/10/2026).
--
-- Il preventivo (classico, computo o di un preventivatore edile) ha le fasi del
-- cantiere e quanto durano; quando diventava commessa, quei tempi si perdevano e
-- le fasi nascevano «senza date». Il gestionale calcola le date in giorni
-- lavorativi da un giorno d'inizio scelto da chi pianifica, e questa funzione le
-- scrive in una volta sola:
--   - una fase della commessa con lo stesso nome (senza maiuscole e spazi) prende
--     le date della fase del cronoprogramma;
--   - una fase del cronoprogramma che nella commessa non c'è viene aggiunta in fondo;
--   - una fase che ha già le sue date non si tocca, a meno di p_sovrascrivi;
--   - inizio e fine lavori della commessa si compilano se sono vuoti.
-- Tutto o niente; chi non può modificare la commessa riceve un errore.

create or replace function public.commessa_pianifica_fasi(
  p_order_id uuid,
  p_piano jsonb,
  p_sovrascrivi boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_voce jsonb;
  v_nome text;
  v_inizio date;
  v_fine date;
  v_fase record;
  v_base integer;
  v_datate integer := 0;
  v_aggiunte integer := 0;
  v_saltate integer := 0;
  v_min date;
  v_max date;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di pianificare questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_piano) is distinct from 'array' or jsonb_array_length(p_piano) = 0 then
    raise exception 'Il cronoprogramma non ha fasi da pianificare.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_piano) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;

  for v_voce in select value from jsonb_array_elements(p_piano) loop
    v_nome := left(btrim(coalesce(v_voce->>'nome', '')), 160);
    continue when v_nome = '';
    begin
      v_inizio := (v_voce->>'inizio')::date;
      v_fine := (v_voce->>'fine')::date;
    exception when others then
      raise exception 'Date non valide per la fase «%».', v_nome using errcode = '22023';
    end;
    if v_inizio is null or v_fine is null or v_fine < v_inizio then
      raise exception 'Date non valide per la fase «%».', v_nome using errcode = '22023';
    end if;
    v_min := least(coalesce(v_min, v_inizio), v_inizio);
    v_max := greatest(coalesce(v_max, v_fine), v_fine);

    select id, start_date, end_date into v_fase
      from public.order_work_phases
     where order_id = p_order_id
       and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(v_nome, '\s+', ' ', 'g'))
     order by position
     limit 1;

    if v_fase.id is null then
      insert into public.order_work_phases (company_id, order_id, name, position, start_date, end_date, notes)
      values (v_azienda, p_order_id, v_nome, v_base + v_aggiunte, v_inizio, v_fine, 'Dal cronoprogramma del preventivo');
      v_aggiunte := v_aggiunte + 1;
    elsif p_sovrascrivi or (v_fase.start_date is null and v_fase.end_date is null) then
      update public.order_work_phases set start_date = v_inizio, end_date = v_fine, updated_at = now()
       where id = v_fase.id;
      v_datate := v_datate + 1;
    else
      v_saltate := v_saltate + 1;
    end if;
  end loop;

  update public.orders
     set work_start_date = coalesce(work_start_date, v_min),
         work_end_date = coalesce(work_end_date, v_max)
   where id = p_order_id and company_id = v_azienda;

  return jsonb_build_object('datate', v_datate, 'aggiunte', v_aggiunte, 'saltate', v_saltate,
                            'inizio', v_min, 'fine', v_max);
end
$fn$;

revoke all on function public.commessa_pianifica_fasi(uuid, jsonb, boolean) from public, anon;
grant execute on function public.commessa_pianifica_fasi(uuid, jsonb, boolean) to authenticated;

comment on function public.commessa_pianifica_fasi(uuid, jsonb, boolean) is
  'Date delle fasi della commessa dal cronoprogramma del preventivo: [{nome, inizio, fine}]. Non tocca le fasi già pianificate se non con p_sovrascrivi.';
