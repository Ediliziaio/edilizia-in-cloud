-- Rete di sicurezza notturna.
--
-- I trigger tengono le liste allineate riga per riga, ma durante un
-- caricamento di massa vanno disattivati (altrimenti ogni riga rivaluterebbe
-- tutte le regole). Questa passata rimette tutto in pari una volta al giorno,
-- così una lista non resta mai indietro senza che nessuno se ne accorga.
create or replace function public.sincronizza_tutte_le_liste()
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare r record; v_toccati integer := 0; s record;
begin
  for r in select id from marketing_contact_lists where regola is not null loop
    select * into s from public.sincronizza_lista(r.id);
    v_toccati := v_toccati + coalesce(s.aggiunti,0) + coalesce(s.rimossi,0);
  end loop;
  return v_toccati;
end $$;

revoke all on function public.sincronizza_tutte_le_liste() from public, anon, authenticated;

select cron.unschedule('liste-automatiche-nightly')
where exists (select 1 from cron.job where jobname = 'liste-automatiche-nightly');

select cron.schedule('liste-automatiche-nightly', '20 4 * * *', 'select public.sincronizza_tutte_le_liste();');
