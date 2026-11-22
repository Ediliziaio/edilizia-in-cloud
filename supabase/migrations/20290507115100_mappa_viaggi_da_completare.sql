create or replace function public.mappa_km_da_registrare(p_company uuid,p_giorno date,p_personale boolean)
returns table(id uuid,mezzo_id uuid,mezzo text,partenza timestamptz)
language sql stable security definer set search_path = '' as $$
 select v.id,v.mezzo_id,m.nome,v.partenza
 from public.mezzi_viaggi v join public.mezzi m on m.id=v.mezzo_id and m.company_id=v.company_id
 where v.company_id=p_company and m.contatore_unita='km' and v.stato in ('bozza','inviato','verificato')
   and v.partenza >= p_giorno::timestamp at time zone 'Europe/Rome'
   and v.partenza < (p_giorno+1)::timestamp at time zone 'Europe/Rome'
   and (public.mappa_calendario_accesso(p_company,'lavori') or public.mappa_calendario_accesso(p_company,'vendite')
     or public.mappa_calendario_accesso(p_company,'campo'))
   and (v.created_by=auth.uid() or (not p_personale and public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company)))
   and not coalesce(v.contatore_fine>=v.contatore_inizio,false)
   and not (
     v.contatore_inizio is null and v.contatore_fine is null and
     exists(select 1 from jsonb_array_elements(v.tratte) t
       having bool_and(case when jsonb_typeof(t->'km')='number' then
         coalesce(t->>'fonte'='dichiarati' and (t->>'km')::numeric>=0,false) else false end))
   )
 order by v.partenza,v.id
$$;
revoke all on function public.mappa_km_da_registrare(uuid,date,boolean) from public,anon;
grant execute on function public.mappa_km_da_registrare(uuid,date,boolean) to authenticated;
