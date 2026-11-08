-- Il reclamo al fornitore parte dal compositore email e si ricorda (08/11/2026).
--
-- `email_fornitore` segue la stessa regola dell'ordine (`emailPerOrdini`): email per gli ordini,
-- referente ordini, email di contatto, email generale. Prima era solo l'email generale.
-- `reclamo_inviato_il`: lo scrive `arrivo_segna_reclamo` solo a email partita, così lo stesso
-- pezzo non viene reclamato due volte per sbaglio.
--
-- Nessuna riga esistente viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.arrivi_posizione add column if not exists reclamo_inviato_il timestamptz;

create or replace function public.arrivo_segna_reclamo(p_esiti uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  v_n integer;
begin
  if exists (
    select 1 from public.arrivi_posizione a
      left join public.order_items oi on oi.id = a.order_item_id
     where a.id = any(p_esiti)
       and (a.company_id is distinct from v_company or not public.arrivo_puo_riordinare(v_company, oi.order_id))) then
    raise exception 'Non puoi gestire questi reclami.' using errcode = '42501';
  end if;
  update public.arrivi_posizione set reclamo_inviato_il = now()
   where id = any(p_esiti) and reclamo_inviato_il is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.arrivo_segna_reclamo(uuid[]) from public, anon;
grant execute on function public.arrivo_segna_reclamo(uuid[]) to authenticated;

do $migrazione$
declare
  rec record;
  def text;
begin
  for rec in select * from (values
    ($o$'email_fornitore', case when v_ufficio then s.email end,$o$,
     $n$'email_fornitore', case when v_ufficio then coalesce(
        nullif(btrim(s.email_ordini), ''),
        (select nullif(btrim(r->>'email'), '')
           from jsonb_array_elements(case when jsonb_typeof(s.altri_referenti) = 'array' then s.altri_referenti else '[]'::jsonb end) r
          where r->>'ruolo' = 'ordini' and nullif(btrim(r->>'email'), '') is not null limit 1),
        nullif(btrim(s.contact_email), ''),
        nullif(btrim(s.email), '')) end,$n$),
    ($o$'creato_il', a.creato_il, 'chi',$o$,
     $n$'creato_il', a.creato_il, 'reclamo_inviato_il', a.reclamo_inviato_il, 'chi',$n$)
  ) as v(vecchio, nuovo) loop
    def := pg_get_functiondef('public.arrivo_elenco(uuid,uuid)'::regprocedure);
    if position(rec.nuovo in def) > 0 then
      continue;
    end if;
    if position(rec.vecchio in def) = 0 then
      raise exception 'Pezzo non trovato: %', left(rec.vecchio, 50);
    end if;
    execute replace(def, rec.vecchio, rec.nuovo);
  end loop;
end
$migrazione$;
