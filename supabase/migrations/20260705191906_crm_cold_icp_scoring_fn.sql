-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create or replace function public.crm_recompute_cold_icp(p_company uuid default '00000000-0000-0000-0000-000000000001')
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  with s as (
    select id, least(100,
      (case when fatturato >= 5000000 then 40 when fatturato >= 1000000 then 33
            when fatturato >= 500000 then 26 when fatturato >= 250000 then 20
            when fatturato >= 100000 then 14 when fatturato > 0 then 8 else 4 end)
      + (case when dipendenti like '5000%' or dipendenti like '1000-%' or dipendenti like '500-%' then 20
              when dipendenti like '250-%' then 18 when dipendenti like '100-%' then 16
              when dipendenti like '50-%' then 13 when dipendenti like '20-%' then 10
              when dipendenti like '10-%' then 7 when dipendenti like '0-%' then 4 else 2 end)
      + (case when email is not null then 15 else 0 end) + (case when phone is not null then 10 else 0 end)
      + (case when tags @> array['costruzioni'] or tags @> array['impianti_ristrutturazione'] then 15
              when tags @> array['serramenti'] or tags @> array['carpenteria_metallica'] then 12
              when tags @> array['materiali_edili'] then 8 else 6 end)
    ) as sc
    from marketing_contacts
    where company_id = p_company and source_channel = 'cold_import' and deleted_at is null
  )
  update marketing_contacts m
     set icp_score = s.sc,
         icp_tier = case when s.sc >= 70 then 'A' when s.sc >= 50 then 'B' when s.sc >= 30 then 'C' else 'D' end,
         last_score_update = now()
  from s where m.id = s.id;
  get diagnostics n = row_count;
  return n;
end $$;
